# AI Agent — schedule & task assistant (design)

Date: 2026-05-30
Status: approved (brainstorm)

## Goal

Let a user chat in natural language to manage their own schedules and tasks.
The backend hosts its own simple **agent system**: an orchestration loop that
the backend owns, with an OpenAI-compatible LLM (MiMo) as the reasoning engine.
The LLM decides which backend tools to call; the backend executes them
(auto-execute) scoped to the authenticated user, then reports what it did.

No external agent service (earlier "Hermes" idea dropped). The only outbound
dependency is the MiMo LLM HTTP endpoint.

## Non-goals (v1)

- Streaming / SSE responses (request/response only).
- Task status/progress update and task delete tools (excluded from scope).
- Confirmation step before writes (writes auto-execute).
- Group-schedule editing flows beyond what existing use-cases already allow.

## Architecture

New module `src/modules/agent/`, following the existing DDD layout
(presentation / application / infrastructure / domain) used by `schedule` and
`task`.

```
src/modules/agent/
├─ agent.module.ts
├─ presentation/
│  ├─ agent.controller.ts          POST /agent/chat   (JwtAuthGuard)
│  └─ dto/chat.dto.ts              { conversationId?: string; content: string }
├─ application/
│  ├─ agent.service.ts             the agent loop (orchestration)
│  └─ tools/
│     ├─ tool-registry.ts          OpenAI tool JSON-schemas + dispatch table
│     ├─ schedule.tools.ts         create/list/conflicts/update/delete handlers
│     └─ task.tools.ts             create/list handlers
├─ infrastructure/
│  ├─ llm/llm.client.ts            OpenAI-compatible fetch client -> MiMo
│  └─ persistence/
│     └─ prisma-conversation.repository.ts
└─ domain/
   ├─ conversation.entity.ts
   └─ conversation.repository.interface.ts   (IConversationRepository)
```

The human-chat module (`src/modules/chat/`) is untouched. This is a separate
AI-chat surface.

### Reuse of existing code

Tool handlers delegate to existing application logic rather than re-implementing
business rules:

- `CreateScheduleUseCase`, `CreateTaskUseCase` — currently **not exported** from
  `ScheduleModule` / `TaskModule`. They must be added to those modules' `exports`
  so `AgentModule` can inject them.
- `IScheduleRepository`, `ITaskRepository` — already exported; inject for
  list/update/delete/conflict handlers.
- Domain entities `Schedule`, `Task` and their validation are reused as-is.

## Data model (Prisma)

Two new models in `prisma/schema.prisma`, plus a migration.

```prisma
model AgentConversation {
  id        String         @id @default(uuid())
  userId    String
  title     String?
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt
  messages  AgentMessage[]
  user      User           @relation(fields: [userId], references: [id])

  @@index([userId])
}

model AgentMessage {
  id             String            @id @default(uuid())
  conversationId String
  role           String            // "user" | "assistant" | "tool"
  content        String?
  toolCalls      Json?             // assistant tool_calls payload
  toolCallId     String?           // for role="tool" results
  createdAt      DateTime          @default(now())
  conversation   AgentConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId])
}
```

A matching `agentConversations AgentConversation[]` back-relation is added to the
`User` model.

`role` and message shape mirror the OpenAI chat message format so history maps
directly back into the next LLM request.

## Agent loop (`agent.service.ts`)

```
POST /agent/chat { conversationId?, content }

1. userId = JWT sub (guard rejects if missing).
2. Load conversation (verify it belongs to userId) or create a new one.
3. Build messages[]:
     [ systemPrompt,
       ...persisted history (mapped to OpenAI roles),
       { role: "user", content } ]
4. resp = LlmClient.chat(messages, TOOLS)
5. If resp.message has tool_calls:
       for each tool_call:
         result = toolRegistry.dispatch(name, args, { userId })
         append { role: "tool", toolCallId, content: JSON(result) }
       append assistant message (with tool_calls)
       goto 4   (re-call LLM with tool results)
   Else (assistant text reply):
       persist user msg + all assistant/tool msgs to the conversation
       return { conversationId, reply: text, actions: [...executed tools] }
6. Iteration cap = 5. On exceeding, stop and return the last assistant text
   (or a graceful "couldn't complete" message) and log it.
```

The loop, the tool registry, and the system prompt together *are* the agent.
Self-contained in NestJS; MiMo only answers "what to say / which tool to call".

### System prompt (intent)

Short instruction: assistant manages the user's schedules and tasks; current
date/time is injected; always operate on the authenticated user's data; prefer
`check_conflicts` before creating overlapping schedules; confirm back in natural
language what was done. (Exact wording finalized in implementation.)

## Tools (v1)

All handlers receive an injected `userId` from the authenticated request. The
LLM never supplies or overrides `userId`.

| Tool | Args (LLM-supplied) | Delegates to | Notes |
|---|---|---|---|
| `create_schedule` | title, startTime, endTime, type?, color?, importance?, description? | `CreateScheduleUseCase.execute(dto, userId)` | domain validation applies |
| `list_schedules` | start?, end? | `scheduleRepo.findInTimeRange(start,end,userId)` or `findByUserId(userId)` | time-range or all |
| `check_conflicts` | startTime, endTime | `scheduleRepo.findInTimeRange` + `{hasConflict, conflicts}` | mirrors existing controller logic |
| `update_schedule` | id, + any updatable field | `scheduleRepo.findById` → **ownership check** → rebuild `Schedule` → `save` | |
| `delete_schedule` | id | `findById` → **ownership check** → `scheduleRepo.delete(id)` | |
| `create_task` | title, description, startDate, deadline, priority?, progress? | `CreateTaskUseCase.execute(dto, userId)` | domain validation applies |
| `list_tasks` | — | `taskRepo.findAll(userId)` | |

### Security (critical)

- Every handler scopes to the authenticated `userId`.
- `update_schedule` / `delete_schedule`: load the resource by id, then verify
  `schedule.userId === userId` (and group-permission path only if we choose to
  mirror the controller's group logic — v1 may restrict to owner-only for
  simplicity; decided in plan). Reject otherwise. **Never** trust an LLM-supplied
  id without an ownership check.
- `list_*` only ever returns the caller's own rows.

## LLM client (`llm.client.ts`)

OpenAI-compatible Chat Completions client using `fetch` (no SDK dependency).

- `POST {LLM_BASE_URL}/chat/completions`
- Body: `{ model, messages, tools, tool_choice: "auto" }`
- Auth: `Authorization: Bearer {LLM_API_KEY}`
- Returns parsed `choices[0].message` (text and/or `tool_calls`).
- Timeout via `AbortController`.

Env config:

```
LLM_BASE_URL   # MiMo OpenAI-compatible base, e.g. https://.../v1
LLM_API_KEY
LLM_MODEL      # e.g. the MiMo model id
LLM_TIMEOUT_MS # optional, default 30000
```

Provider-agnostic: any OpenAI-compatible endpoint works by changing env.

## Error handling

- LLM unreachable / timeout / non-2xx → throw `BadGatewayException` (502) with a
  user-friendly message; original error logged.
- Tool handler throws (validation error, ownership denied, not found) → catch in
  the loop, append the error text as the `tool` result message so the LLM can
  recover or explain to the user. Ownership/auth failures are surfaced as a
  refusal, not a stack trace.
- Iteration cap (5) prevents infinite tool-call loops.
- Malformed tool arguments from the LLM → validation error returned to the LLM as
  a tool result so it can retry.

## Testing

Match existing Jest + Testcontainers conventions.

- **Tool handlers** (unit, mocked use-cases/repos): happy path for each tool;
  `update_schedule`/`delete_schedule` ownership-denied cases; `list_*` returns
  only own rows.
- **Agent loop** (unit, mocked `LlmClient`): text-only reply; single tool call;
  multi-tool sequence; tool-error fed back; iteration-cap reached.
- **LlmClient** (unit, mocked `fetch`): request shape, response parsing, timeout
  → 502.
- **Conversation repository** (integration, Testcontainers): create/load/append,
  ownership scoping.
- Optional e2e: `POST /agent/chat` with a stubbed LLM endpoint.

## Wiring

- Add `AgentModule` to `app.module.ts` imports.
- `AgentModule` imports `PrismaModule`, `ScheduleModule`, `TaskModule`.
- Export `CreateScheduleUseCase` from `ScheduleModule`, `CreateTaskUseCase` from
  `TaskModule`.

## Open decisions deferred to the plan

- Owner-only vs. group-permission editing for `update_schedule`/`delete_schedule`
  (v1 leans owner-only for simplicity).
- Exact system-prompt wording.
- Whether to add a `GET /agent/conversations` history endpoint in v1 (likely yes,
  small).
