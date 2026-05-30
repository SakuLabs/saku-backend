# AI Agent — Schedule & Task Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app AI agent that lets a user chat in natural language to create, list, reschedule, and delete their own schedules and tasks.

**Architecture:** New NestJS module `src/modules/agent/`. A self-owned agent loop (`AgentService`) sends conversation history + tool definitions to an OpenAI-compatible LLM (MiMo) via a thin `LlmClient`, executes any returned tool calls against existing schedule/task use-cases and repositories (scoped to the authenticated user), feeds results back, and repeats until the LLM returns a text reply. Conversations persist in two new Prisma tables.

**Tech Stack:** NestJS 11, Prisma 7 (pg driver adapter), class-validator, Jest + ts-jest (unit `*.spec.ts`, integration `*.int.spec.ts` via Testcontainers), native `fetch` for the LLM HTTP call (no SDK dependency).

**Design spec:** `docs/superpowers/specs/2026-05-30-ai-agent-schedule-assistant-design.md`

**v1 decisions (locked):** owner-only for `update_schedule`/`delete_schedule`; include `GET /agent/conversations`; writes auto-execute; no streaming.

---

## File Structure

**Create:**
- `src/modules/agent/agent.module.ts` — module wiring
- `src/modules/agent/presentation/agent.controller.ts` — `POST /agent/chat`, `GET /agent/conversations`
- `src/modules/agent/presentation/dto/chat.dto.ts` — request DTO
- `src/modules/agent/application/agent.service.ts` — the agent loop
- `src/modules/agent/application/tools/tool-registry.ts` — definitions + dispatch
- `src/modules/agent/application/tools/schedule.tools.ts` — schedule tool handlers
- `src/modules/agent/application/tools/task.tools.ts` — task tool handlers
- `src/modules/agent/infrastructure/llm/llm.client.ts` — OpenAI-compatible client + shared LLM types
- `src/modules/agent/infrastructure/persistence/prisma-conversation.repository.ts`
- `src/modules/agent/domain/conversation.repository.interface.ts` — repo interface + message types
- Test files colocated (`*.spec.ts`) plus `test/integration/prisma-conversation.repository.int.spec.ts`

**Modify:**
- `prisma/schema.prisma` — add `AgentConversation`, `AgentMessage`, `User.agentConversations`
- `src/modules/schedule/schedule.module.ts` — export `CreateScheduleUseCase`
- `src/modules/task/task.module.ts` — export `CreateTaskUseCase`
- `src/app.module.ts` — import `AgentModule`

---

## Task 1: Prisma models + migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the two models and the User back-relation**

In `prisma/schema.prisma`, inside `model User { ... }`, add this line after the `schedules Schedule[]` line:

```prisma
  // AI agent
  agentConversations AgentConversation[]
```

Then append these two models at the end of the file:

```prisma
model AgentConversation {
  id        String         @id @default(uuid())
  userId    String
  title     String?
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt

  user      User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages  AgentMessage[]

  @@index([userId])
}

model AgentMessage {
  id             String   @id @default(uuid())
  conversationId String
  role           String   // "user" | "assistant" | "tool"
  content        String?
  toolCalls      Json?
  toolCallId     String?
  createdAt      DateTime @default(now())

  conversation AgentConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId])
}
```

- [ ] **Step 2: Create the migration and regenerate the client**

Run:
```bash
npx prisma migrate dev --name add_agent_tables
npx prisma generate
```
Expected: a new folder under `prisma/migrations/` named `*_add_agent_tables`, and the Prisma client regenerated under `src/generated/prisma/` with `agentConversation` and `agentMessage` delegates available.

- [ ] **Step 3: Verify the project still compiles**

Run:
```bash
npx tsc --noEmit
```
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/generated/prisma
git commit -m "feat(agent): add AgentConversation and AgentMessage prisma models"
```

---

## Task 2: Export existing use-cases for reuse

**Files:**
- Modify: `src/modules/schedule/schedule.module.ts`
- Modify: `src/modules/task/task.module.ts`

- [ ] **Step 1: Export `CreateScheduleUseCase`**

In `src/modules/schedule/schedule.module.ts`, change the `exports` array from:

```ts
  exports: ['IScheduleRepository'],
```
to:
```ts
  exports: ['IScheduleRepository', CreateScheduleUseCase],
```

- [ ] **Step 2: Export `CreateTaskUseCase`**

In `src/modules/task/task.module.ts`, change the `exports` array from:

```ts
  exports: ['ITaskRepository'],
```
to:
```ts
  exports: ['ITaskRepository', CreateTaskUseCase],
```

- [ ] **Step 3: Verify compile**

Run:
```bash
npx tsc --noEmit
```
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/modules/schedule/schedule.module.ts src/modules/task/task.module.ts
git commit -m "feat(agent): export schedule/task create use-cases for reuse"
```

---

## Task 3: LLM client (OpenAI-compatible) + shared types

**Files:**
- Create: `src/modules/agent/infrastructure/llm/llm.client.ts`
- Test: `src/modules/agent/infrastructure/llm/llm.client.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/modules/agent/infrastructure/llm/llm.client.spec.ts`:

```ts
import { BadGatewayException } from '@nestjs/common';
import { LlmClient, LlmMessage, LlmToolDef } from './llm.client';

describe('LlmClient', () => {
  const ORIGINAL_ENV = process.env;
  let client: LlmClient;

  const messages: LlmMessage[] = [{ role: 'user', content: 'hi' }];
  const tools: LlmToolDef[] = [];

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      LLM_BASE_URL: 'https://mimo.test/v1',
      LLM_API_KEY: 'key-123',
      LLM_MODEL: 'mimo-1',
    };
    client = new LlmClient();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  it('posts to the chat completions endpoint and returns the assistant message', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'hello' } }],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await client.chat(messages, tools);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://mimo.test/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers['Authorization']).toBe('Bearer key-123');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('mimo-1');
    expect(body.messages).toEqual(messages);
    expect(body.tool_choice).toBe('auto');
    expect(result.content).toBe('hello');
  });

  it('returns tool_calls when present', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'list_tasks', arguments: '{}' },
                },
              ],
            },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const result = await client.chat(messages, tools);
    expect(result.tool_calls?.[0].function.name).toBe('list_tasks');
  });

  it('throws BadGatewayException on non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    }) as unknown as typeof fetch;

    await expect(client.chat(messages, tools)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('throws BadGatewayException when fetch rejects (network/timeout)', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('aborted')) as unknown as typeof fetch;

    await expect(client.chat(messages, tools)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx jest src/modules/agent/infrastructure/llm/llm.client.spec.ts
```
Expected: FAIL — cannot find module `./llm.client`.

- [ ] **Step 3: Implement the client**

Create `src/modules/agent/infrastructure/llm/llm.client.ts`:

```ts
import { BadGatewayException, Injectable, Logger } from '@nestjs/common';

export interface LlmToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LlmToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: LlmToolCall[];
  tool_call_id?: string;
}

export interface LlmResponseMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: LlmToolCall[];
}

interface ChatCompletionResponse {
  choices: { message: LlmResponseMessage }[];
}

@Injectable()
export class LlmClient {
  private readonly logger = new Logger(LlmClient.name);

  private get baseUrl(): string {
    return process.env.LLM_BASE_URL ?? '';
  }
  private get apiKey(): string {
    return process.env.LLM_API_KEY ?? '';
  }
  private get model(): string {
    return process.env.LLM_MODEL ?? '';
  }
  private get timeoutMs(): number {
    return Number(process.env.LLM_TIMEOUT_MS ?? '30000');
  }

  async chat(
    messages: LlmMessage[],
    tools: LlmToolDef[],
  ): Promise<LlmResponseMessage> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          tools,
          tool_choice: 'auto',
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text();
        this.logger.error(`LLM responded ${res.status}: ${detail}`);
        throw new BadGatewayException('Asisten AI sedang tidak tersedia');
      }

      const data = (await res.json()) as ChatCompletionResponse;
      const message = data.choices?.[0]?.message;
      if (!message) {
        throw new BadGatewayException('Respons asisten AI tidak valid');
      }
      return message;
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      this.logger.error(`LLM request failed: ${String(err)}`);
      throw new BadGatewayException('Gagal menghubungi asisten AI');
    } finally {
      clearTimeout(timer);
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx jest src/modules/agent/infrastructure/llm/llm.client.spec.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/agent/infrastructure/llm
git commit -m "feat(agent): add OpenAI-compatible LLM client"
```

---

## Task 4: Conversation repository interface + types

**Files:**
- Create: `src/modules/agent/domain/conversation.repository.interface.ts`

This task introduces shared types only (no behavior), so it has no standalone test; it is exercised by Tasks 5 and 8.

- [ ] **Step 1: Create the interface and message types**

Create `src/modules/agent/domain/conversation.repository.interface.ts`:

```ts
import { LlmToolCall } from '../infrastructure/llm/llm.client';

export type ConversationRole = 'user' | 'assistant' | 'tool';

export interface ConversationMessage {
  role: ConversationRole;
  content: string | null;
  toolCalls?: LlmToolCall[];
  toolCallId?: string;
}

export interface ConversationSummary {
  id: string;
  userId: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IConversationRepository {
  create(userId: string, title?: string): Promise<ConversationSummary>;
  findById(id: string): Promise<ConversationSummary | null>;
  listByUser(userId: string): Promise<ConversationSummary[]>;
  getMessages(conversationId: string): Promise<ConversationMessage[]>;
  appendMessages(
    conversationId: string,
    messages: ConversationMessage[],
  ): Promise<void>;
}
```

- [ ] **Step 2: Verify compile**

Run:
```bash
npx tsc --noEmit
```
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/agent/domain/conversation.repository.interface.ts
git commit -m "feat(agent): add conversation repository interface and message types"
```

---

## Task 5: Prisma conversation repository

**Files:**
- Create: `src/modules/agent/infrastructure/persistence/prisma-conversation.repository.ts`
- Test: `src/modules/agent/infrastructure/persistence/prisma-conversation.repository.spec.ts`
- Test: `test/integration/prisma-conversation.repository.int.spec.ts`

- [ ] **Step 1: Write the failing unit test (prisma mocked)**

Create `src/modules/agent/infrastructure/persistence/prisma-conversation.repository.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaConversationRepository } from './prisma-conversation.repository';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  createPrismaMock,
  MockPrisma,
} from '../../../../../test/utils/prisma-mock';

describe('PrismaConversationRepository', () => {
  let repo: PrismaConversationRepository;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaConversationRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    repo = module.get(PrismaConversationRepository);
  });

  it('create returns a conversation summary', async () => {
    prisma.agentConversation.create.mockResolvedValue({
      id: 'c1',
      userId: 'u1',
      title: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    } as never);

    const result = await repo.create('u1');
    expect(result.id).toBe('c1');
    expect(result.userId).toBe('u1');
    expect(prisma.agentConversation.create).toHaveBeenCalledWith({
      data: { userId: 'u1', title: undefined },
    });
  });

  it('getMessages maps rows to ConversationMessage', async () => {
    prisma.agentMessage.findMany.mockResolvedValue([
      {
        id: 'm1',
        conversationId: 'c1',
        role: 'user',
        content: 'hi',
        toolCalls: null,
        toolCallId: null,
        createdAt: new Date(),
      },
      {
        id: 'm2',
        conversationId: 'c1',
        role: 'assistant',
        content: null,
        toolCalls: [
          { id: 'call_1', type: 'function', function: { name: 'list_tasks', arguments: '{}' } },
        ],
        toolCallId: null,
        createdAt: new Date(),
      },
    ] as never);

    const msgs = await repo.getMessages('c1');
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual({ role: 'user', content: 'hi', toolCalls: undefined, toolCallId: undefined });
    expect(msgs[1].toolCalls?.[0].function.name).toBe('list_tasks');
  });

  it('appendMessages writes rows and bumps updatedAt', async () => {
    await repo.appendMessages('c1', [
      { role: 'user', content: 'hi' },
      { role: 'tool', content: '{}', toolCallId: 'call_1' },
    ]);

    expect(prisma.agentMessage.createMany).toHaveBeenCalledWith({
      data: [
        { conversationId: 'c1', role: 'user', content: 'hi', toolCalls: undefined, toolCallId: undefined },
        { conversationId: 'c1', role: 'tool', content: '{}', toolCalls: undefined, toolCallId: 'call_1' },
      ],
    });
    expect(prisma.agentConversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: {},
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx jest src/modules/agent/infrastructure/persistence/prisma-conversation.repository.spec.ts
```
Expected: FAIL — cannot find module `./prisma-conversation.repository`.

- [ ] **Step 3: Implement the repository**

Create `src/modules/agent/infrastructure/persistence/prisma-conversation.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  ConversationMessage,
  ConversationRole,
  ConversationSummary,
  IConversationRepository,
} from '../../domain/conversation.repository.interface';
import { LlmToolCall } from '../llm/llm.client';

interface ConversationRow {
  id: string;
  userId: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MessageRow {
  role: string;
  content: string | null;
  toolCalls: unknown;
  toolCallId: string | null;
}

@Injectable()
export class PrismaConversationRepository implements IConversationRepository {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, title?: string): Promise<ConversationSummary> {
    const row = await this.prisma.agentConversation.create({
      data: { userId, title },
    });
    return this.toSummary(row as ConversationRow);
  }

  async findById(id: string): Promise<ConversationSummary | null> {
    const row = await this.prisma.agentConversation.findUnique({
      where: { id },
    });
    return row ? this.toSummary(row as ConversationRow) : null;
  }

  async listByUser(userId: string): Promise<ConversationSummary[]> {
    const rows = await this.prisma.agentConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => this.toSummary(r as ConversationRow));
  }

  async getMessages(conversationId: string): Promise<ConversationMessage[]> {
    const rows = await this.prisma.agentMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toMessage(r as MessageRow));
  }

  async appendMessages(
    conversationId: string,
    messages: ConversationMessage[],
  ): Promise<void> {
    if (messages.length === 0) return;
    await this.prisma.agentMessage.createMany({
      data: messages.map((m) => ({
        conversationId,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls as never,
        toolCallId: m.toolCallId,
      })),
    });
    // Touch the parent so @updatedAt advances (empty data still triggers it).
    await this.prisma.agentConversation.update({
      where: { id: conversationId },
      data: {},
    });
  }

  private toSummary(row: ConversationRow): ConversationSummary {
    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toMessage(row: MessageRow): ConversationMessage {
    return {
      role: row.role as ConversationRole,
      content: row.content,
      toolCalls: (row.toolCalls as LlmToolCall[] | null) ?? undefined,
      toolCallId: row.toolCallId ?? undefined,
    };
  }
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run:
```bash
npx jest src/modules/agent/infrastructure/persistence/prisma-conversation.repository.spec.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Write the integration test (Testcontainers)**

Create `test/integration/prisma-conversation.repository.int.spec.ts`:

```ts
import { PrismaConversationRepository } from '../../src/modules/agent/infrastructure/persistence/prisma-conversation.repository';
import {
  bootPostgres,
  teardownPostgres,
  IntegrationContext,
} from './postgres-container';

describe('PrismaConversationRepository (integration)', () => {
  let ctx: IntegrationContext;
  let repo: PrismaConversationRepository;
  let userId: string;

  beforeAll(async () => {
    ctx = await bootPostgres();
    repo = new PrismaConversationRepository(ctx.prisma);
  }, 120_000);

  afterAll(async () => {
    if (ctx) await teardownPostgres(ctx);
  }, 30_000);

  beforeEach(async () => {
    await ctx.prisma.agentMessage.deleteMany();
    await ctx.prisma.agentConversation.deleteMany();
    await ctx.prisma.user.deleteMany();

    const u = await ctx.prisma.user.create({
      data: {
        email: `u-${Date.now()}@x.com`,
        password: 'x',
        name: 'Alice',
        userCode: `SU${Date.now()}`,
      },
    });
    userId = u.id;
  });

  it('creates a conversation, appends messages, and reads them back in order', async () => {
    const conv = await repo.create(userId, 'My day');
    expect(conv.id).toBeDefined();

    await repo.appendMessages(conv.id, [
      { role: 'user', content: 'book a meeting tomorrow' },
      {
        role: 'assistant',
        content: null,
        toolCalls: [
          { id: 'call_1', type: 'function', function: { name: 'create_schedule', arguments: '{}' } },
        ],
      },
      { role: 'tool', content: '{"ok":true}', toolCallId: 'call_1' },
    ]);

    const msgs = await repo.getMessages(conv.id);
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'tool']);
    expect(msgs[1].toolCalls?.[0].function.name).toBe('create_schedule');
    expect(msgs[2].toolCallId).toBe('call_1');

    const list = await repo.listByUser(userId);
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('My day');
  });

  it('findById returns null for unknown id', async () => {
    expect(await repo.findById('does-not-exist')).toBeNull();
  });
});
```

- [ ] **Step 6: Run the integration test**

Run:
```bash
npx jest --config ./test/jest-integration.json --runInBand test/integration/prisma-conversation.repository.int.spec.ts
```
Expected: PASS (2 tests). (Requires Docker for Testcontainers.)

- [ ] **Step 7: Commit**

```bash
git add src/modules/agent/infrastructure/persistence test/integration/prisma-conversation.repository.int.spec.ts
git commit -m "feat(agent): add prisma conversation repository with tests"
```

---

## Task 6: Schedule tool handlers

**Files:**
- Create: `src/modules/agent/application/tools/schedule.tools.ts`
- Test: `src/modules/agent/application/tools/schedule.tools.spec.ts`

Each handler is a method receiving parsed args and `{ userId }`. Ownership is enforced owner-only for update/delete.

- [ ] **Step 1: Write the failing test**

Create `src/modules/agent/application/tools/schedule.tools.spec.ts`:

```ts
import { ForbiddenException } from '@nestjs/common';
import { ScheduleTools } from './schedule.tools';
import { CreateScheduleUseCase } from '../../../schedule/application/use-cases/create-schedule.use-case';
import type { IScheduleRepository } from '../../../schedule/domain/schedule.repository.interface';
import {
  Schedule,
  ScheduleColor,
  ScheduleImportance,
  ScheduleType,
} from '../../../schedule/domain/schedule.entity';

const makeSchedule = (userId = 'user-1', id = 'sch-1') =>
  new Schedule(
    id,
    'Math class',
    new Date('2026-01-01T10:00:00Z'),
    new Date('2026-01-01T11:00:00Z'),
    ScheduleType.EVENT,
    ScheduleColor.PURPLE,
    ScheduleImportance.NORMAL,
    0,
    'desc',
    userId,
  );

describe('ScheduleTools', () => {
  let tools: ScheduleTools;
  let createUseCase: { execute: jest.Mock };
  let repo: jest.Mocked<IScheduleRepository>;

  beforeEach(() => {
    createUseCase = { execute: jest.fn() };
    repo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      findInTimeRange: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IScheduleRepository>;
    tools = new ScheduleTools(
      createUseCase as unknown as CreateScheduleUseCase,
      repo,
    );
  });

  it('exposes definitions for all five schedule tools', () => {
    const names = tools.definitions().map((d) => d.function.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'create_schedule',
        'list_schedules',
        'check_conflicts',
        'update_schedule',
        'delete_schedule',
      ]),
    );
  });

  it('create_schedule delegates to the use-case with userId', async () => {
    createUseCase.execute.mockResolvedValue(makeSchedule());
    const result = await tools.createSchedule(
      { title: 'Math class', startTime: '2026-01-01T10:00:00Z', endTime: '2026-01-01T11:00:00Z' },
      { userId: 'user-1' },
    );
    expect(createUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Math class' }),
      'user-1',
    );
    expect((result as Schedule).title).toBe('Math class');
  });

  it('list_schedules with range uses findInTimeRange scoped to user', async () => {
    repo.findInTimeRange.mockResolvedValue([makeSchedule()]);
    await tools.listSchedules(
      { start: '2026-01-01T00:00:00Z', end: '2026-01-02T00:00:00Z' },
      { userId: 'user-1' },
    );
    expect(repo.findInTimeRange).toHaveBeenCalledWith(
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
      'user-1',
    );
  });

  it('list_schedules without range uses findByUserId', async () => {
    repo.findByUserId.mockResolvedValue([]);
    await tools.listSchedules({}, { userId: 'user-1' });
    expect(repo.findByUserId).toHaveBeenCalledWith('user-1');
  });

  it('check_conflicts returns hasConflict flag', async () => {
    repo.findInTimeRange.mockResolvedValue([makeSchedule()]);
    const result = (await tools.checkConflicts(
      { startTime: '2026-01-01T10:00:00Z', endTime: '2026-01-01T11:00:00Z' },
      { userId: 'user-1' },
    )) as { hasConflict: boolean };
    expect(result.hasConflict).toBe(true);
  });

  it('update_schedule rejects when the schedule belongs to another user', async () => {
    repo.findById.mockResolvedValue(makeSchedule('other-user'));
    await expect(
      tools.updateSchedule({ id: 'sch-1', title: 'New title' }, { userId: 'user-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('update_schedule saves merged fields for the owner', async () => {
    repo.findById.mockResolvedValue(makeSchedule('user-1'));
    repo.save.mockImplementation((s) => Promise.resolve(s));
    const result = (await tools.updateSchedule(
      { id: 'sch-1', title: 'New title' },
      { userId: 'user-1' },
    )) as Schedule;
    expect(result.title).toBe('New title');
    expect(repo.save).toHaveBeenCalled();
  });

  it('delete_schedule rejects when not the owner', async () => {
    repo.findById.mockResolvedValue(makeSchedule('other-user'));
    await expect(
      tools.deleteSchedule({ id: 'sch-1' }, { userId: 'user-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('delete_schedule deletes for the owner', async () => {
    repo.findById.mockResolvedValue(makeSchedule('user-1'));
    const result = (await tools.deleteSchedule(
      { id: 'sch-1' },
      { userId: 'user-1' },
    )) as { deleted: boolean };
    expect(repo.delete).toHaveBeenCalledWith('sch-1');
    expect(result.deleted).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx jest src/modules/agent/application/tools/schedule.tools.spec.ts
```
Expected: FAIL — cannot find module `./schedule.tools`.

- [ ] **Step 3: Implement the schedule tools**

Create `src/modules/agent/application/tools/schedule.tools.ts`:

```ts
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateScheduleUseCase } from '../../../schedule/application/use-cases/create-schedule.use-case';
import type { IScheduleRepository } from '../../../schedule/domain/schedule.repository.interface';
import {
  Schedule,
  ScheduleColor,
  ScheduleImportance,
  ScheduleType,
} from '../../../schedule/domain/schedule.entity';
import { CreateScheduleDto } from '../../../schedule/presentation/dto/create-schedule.dto';
import { LlmToolDef } from '../../infrastructure/llm/llm.client';

export interface ToolContext {
  userId: string;
}

type Args = Record<string, unknown>;

@Injectable()
export class ScheduleTools {
  constructor(
    private readonly createScheduleUseCase: CreateScheduleUseCase,
    @Inject('IScheduleRepository')
    private readonly scheduleRepo: IScheduleRepository,
  ) {}

  definitions(): LlmToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'create_schedule',
          description:
            "Create a new schedule/appointment in the user's calendar.",
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              startTime: { type: 'string', description: 'ISO 8601 datetime' },
              endTime: { type: 'string', description: 'ISO 8601 datetime' },
              description: { type: 'string' },
              type: { type: 'string', enum: ['EVENT', 'MEETING', 'TASK_REMINDER'] },
              color: { type: 'string', enum: ['purple', 'blue', 'green', 'orange', 'red'] },
              importance: { type: 'string', enum: ['LOW', 'NORMAL', 'HIGH'] },
            },
            required: ['title', 'startTime', 'endTime'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_schedules',
          description:
            "List the user's schedules, optionally within a time range.",
          parameters: {
            type: 'object',
            properties: {
              start: { type: 'string', description: 'ISO 8601 datetime' },
              end: { type: 'string', description: 'ISO 8601 datetime' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'check_conflicts',
          description:
            'Check whether a proposed time range conflicts with existing schedules.',
          parameters: {
            type: 'object',
            properties: {
              startTime: { type: 'string', description: 'ISO 8601 datetime' },
              endTime: { type: 'string', description: 'ISO 8601 datetime' },
            },
            required: ['startTime', 'endTime'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_schedule',
          description:
            'Update an existing schedule the user owns (reschedule, rename, change progress).',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              startTime: { type: 'string', description: 'ISO 8601 datetime' },
              endTime: { type: 'string', description: 'ISO 8601 datetime' },
              description: { type: 'string' },
              type: { type: 'string', enum: ['EVENT', 'MEETING', 'TASK_REMINDER'] },
              color: { type: 'string', enum: ['purple', 'blue', 'green', 'orange', 'red'] },
              importance: { type: 'string', enum: ['LOW', 'NORMAL', 'HIGH'] },
              progress: { type: 'number' },
            },
            required: ['id'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'delete_schedule',
          description: 'Delete a schedule the user owns.',
          parameters: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
        },
      },
    ];
  }

  async createSchedule(args: Args, ctx: ToolContext): Promise<unknown> {
    const dto: CreateScheduleDto = {
      title: String(args.title),
      startTime: String(args.startTime),
      endTime: String(args.endTime),
      description: args.description as string | undefined,
      type: args.type as ScheduleType | undefined,
      color: args.color as ScheduleColor | undefined,
      importance: args.importance as ScheduleImportance | undefined,
    };
    return this.createScheduleUseCase.execute(dto, ctx.userId);
  }

  async listSchedules(args: Args, ctx: ToolContext): Promise<unknown> {
    if (args.start && args.end) {
      return this.scheduleRepo.findInTimeRange(
        new Date(String(args.start)),
        new Date(String(args.end)),
        ctx.userId,
      );
    }
    return this.scheduleRepo.findByUserId(ctx.userId);
  }

  async checkConflicts(args: Args, ctx: ToolContext): Promise<unknown> {
    const conflicts = await this.scheduleRepo.findInTimeRange(
      new Date(String(args.startTime)),
      new Date(String(args.endTime)),
      ctx.userId,
    );
    return { hasConflict: conflicts.length > 0, conflicts };
  }

  async updateSchedule(args: Args, ctx: ToolContext): Promise<unknown> {
    const existing = await this.loadOwned(String(args.id), ctx.userId);
    const updated = new Schedule(
      existing.id,
      (args.title as string) ?? existing.title,
      args.startTime ? new Date(String(args.startTime)) : existing.startTime,
      args.endTime ? new Date(String(args.endTime)) : existing.endTime,
      (args.type as ScheduleType) ?? existing.type,
      (args.color as ScheduleColor) ?? existing.color,
      (args.importance as ScheduleImportance) ?? existing.importance,
      typeof args.progress === 'number' ? args.progress : existing.progress,
      (args.description as string) ?? existing.description,
      existing.userId,
      existing.groupId,
    );
    return this.scheduleRepo.save(updated);
  }

  async deleteSchedule(args: Args, ctx: ToolContext): Promise<unknown> {
    const existing = await this.loadOwned(String(args.id), ctx.userId);
    await this.scheduleRepo.delete(existing.id);
    return { deleted: true, id: existing.id };
  }

  private async loadOwned(id: string, userId: string): Promise<Schedule> {
    const existing = await this.scheduleRepo.findById(id);
    if (!existing) {
      throw new NotFoundException('Schedule tidak ditemukan');
    }
    if (existing.userId !== userId) {
      throw new ForbiddenException('Tidak memiliki akses ke schedule ini');
    }
    return existing;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx jest src/modules/agent/application/tools/schedule.tools.spec.ts
```
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/agent/application/tools/schedule.tools.ts src/modules/agent/application/tools/schedule.tools.spec.ts
git commit -m "feat(agent): add schedule tool handlers with ownership checks"
```

---

## Task 7: Task tool handlers

**Files:**
- Create: `src/modules/agent/application/tools/task.tools.ts`
- Test: `src/modules/agent/application/tools/task.tools.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/modules/agent/application/tools/task.tools.spec.ts`:

```ts
import { TaskTools } from './task.tools';
import { CreateTaskUseCase } from '../../../task/application/use-cases/create-task.use-case';
import type { ITaskRepository } from '../../../task/domain/task.repository.interface';
import { Task, TaskStatus } from '../../../task/domain/task.entity';
import { TaskPriority } from '../../../task/presentation/dto/create-task.dto';

const makeTask = () =>
  new Task(
    't-1',
    'Write report',
    'desc',
    new Date('2026-01-01T00:00:00Z'),
    new Date('2026-12-01T00:00:00Z'),
    2,
    0,
    TaskStatus.TODO,
    new Date('2026-01-01T00:00:00Z'),
  );

describe('TaskTools', () => {
  let tools: TaskTools;
  let createUseCase: { execute: jest.Mock };
  let repo: jest.Mocked<ITaskRepository>;

  beforeEach(() => {
    createUseCase = { execute: jest.fn() };
    repo = {
      save: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<ITaskRepository>;
    tools = new TaskTools(createUseCase as unknown as CreateTaskUseCase, repo);
  });

  it('exposes definitions for create_task and list_tasks', () => {
    const names = tools.definitions().map((d) => d.function.name);
    expect(names).toEqual(expect.arrayContaining(['create_task', 'list_tasks']));
  });

  it('create_task defaults priority to MEDIUM and forwards deadline', async () => {
    createUseCase.execute.mockResolvedValue(makeTask());
    await tools.createTask(
      { title: 'Write report', deadline: '2026-12-01T00:00:00Z' },
      { userId: 'user-1' },
    );
    expect(createUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Write report',
        priority: TaskPriority.MEDIUM,
        deadline: '2026-12-01T00:00:00Z',
        deadlineOrDueDate: '2026-12-01T00:00:00Z',
      }),
      'user-1',
    );
  });

  it('create_task passes through an explicit priority', async () => {
    createUseCase.execute.mockResolvedValue(makeTask());
    await tools.createTask(
      { title: 'Write report', priority: 'HIGH' },
      { userId: 'user-1' },
    );
    expect(createUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ priority: TaskPriority.HIGH }),
      'user-1',
    );
  });

  it('list_tasks returns only the user rows', async () => {
    repo.findAll.mockResolvedValue([makeTask()]);
    const result = (await tools.listTasks({}, { userId: 'user-1' })) as Task[];
    expect(repo.findAll).toHaveBeenCalledWith('user-1');
    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx jest src/modules/agent/application/tools/task.tools.spec.ts
```
Expected: FAIL — cannot find module `./task.tools`.

- [ ] **Step 3: Implement the task tools**

Create `src/modules/agent/application/tools/task.tools.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { CreateTaskUseCase } from '../../../task/application/use-cases/create-task.use-case';
import type { ITaskRepository } from '../../../task/domain/task.repository.interface';
import {
  CreateTaskDto,
  TaskPriority,
} from '../../../task/presentation/dto/create-task.dto';
import { LlmToolDef } from '../../infrastructure/llm/llm.client';
import { ToolContext } from './schedule.tools';

type Args = Record<string, unknown>;

@Injectable()
export class TaskTools {
  constructor(
    private readonly createTaskUseCase: CreateTaskUseCase,
    @Inject('ITaskRepository') private readonly taskRepo: ITaskRepository,
  ) {}

  definitions(): LlmToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'create_task',
          description: 'Create a to-do task for the user.',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              startDate: { type: 'string', description: 'ISO 8601 datetime' },
              deadline: { type: 'string', description: 'ISO 8601 datetime' },
              priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
              progress: { type: 'number' },
            },
            required: ['title'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_tasks',
          description: "List the user's tasks.",
          parameters: { type: 'object', properties: {} },
        },
      },
    ];
  }

  async createTask(args: Args, ctx: ToolContext): Promise<unknown> {
    const deadline = args.deadline as string | undefined;
    const priority =
      (args.priority as TaskPriority | undefined) ?? TaskPriority.MEDIUM;
    const dto: CreateTaskDto = {
      title: String(args.title),
      description: args.description as string | undefined,
      startDate: args.startDate as string | undefined,
      deadline,
      // The DTO's @Transform only runs through the validation pipe; set it
      // explicitly here because we call the use-case directly.
      deadlineOrDueDate: deadline,
      priority,
      progress: typeof args.progress === 'number' ? args.progress : undefined,
    };
    return this.createTaskUseCase.execute(dto, ctx.userId);
  }

  async listTasks(_args: Args, ctx: ToolContext): Promise<unknown> {
    return this.taskRepo.findAll(ctx.userId);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx jest src/modules/agent/application/tools/task.tools.spec.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/agent/application/tools/task.tools.ts src/modules/agent/application/tools/task.tools.spec.ts
git commit -m "feat(agent): add task tool handlers"
```

---

## Task 8: Tool registry

**Files:**
- Create: `src/modules/agent/application/tools/tool-registry.ts`
- Test: `src/modules/agent/application/tools/tool-registry.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/modules/agent/application/tools/tool-registry.spec.ts`:

```ts
import { ToolRegistry } from './tool-registry';
import { ScheduleTools } from './schedule.tools';
import { TaskTools } from './task.tools';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let scheduleTools: jest.Mocked<Partial<ScheduleTools>>;
  let taskTools: jest.Mocked<Partial<TaskTools>>;

  beforeEach(() => {
    scheduleTools = {
      definitions: jest.fn().mockReturnValue([
        { type: 'function', function: { name: 'create_schedule', description: '', parameters: {} } },
      ]),
      createSchedule: jest.fn().mockResolvedValue({ ok: 'sched' }),
    };
    taskTools = {
      definitions: jest.fn().mockReturnValue([
        { type: 'function', function: { name: 'list_tasks', description: '', parameters: {} } },
      ]),
      listTasks: jest.fn().mockResolvedValue([]),
    };
    registry = new ToolRegistry(
      scheduleTools as unknown as ScheduleTools,
      taskTools as unknown as TaskTools,
    );
  });

  it('aggregates definitions from all tool groups', () => {
    const names = registry.definitions().map((d) => d.function.name);
    expect(names).toEqual(['create_schedule', 'list_tasks']);
  });

  it('dispatches by name, parsing JSON arguments, with the user context', async () => {
    const result = await registry.dispatch(
      'create_schedule',
      '{"title":"x"}',
      { userId: 'user-1' },
    );
    expect(scheduleTools.createSchedule).toHaveBeenCalledWith(
      { title: 'x' },
      { userId: 'user-1' },
    );
    expect(result).toEqual({ ok: 'sched' });
  });

  it('throws on an unknown tool name', async () => {
    await expect(
      registry.dispatch('nope', '{}', { userId: 'user-1' }),
    ).rejects.toThrow('Unknown tool: nope');
  });

  it('throws on malformed JSON arguments', async () => {
    await expect(
      registry.dispatch('create_schedule', '{not json', { userId: 'user-1' }),
    ).rejects.toThrow(/arguments/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx jest src/modules/agent/application/tools/tool-registry.spec.ts
```
Expected: FAIL — cannot find module `./tool-registry`.

- [ ] **Step 3: Implement the registry**

Create `src/modules/agent/application/tools/tool-registry.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { LlmToolDef } from '../../infrastructure/llm/llm.client';
import { ScheduleTools, ToolContext } from './schedule.tools';
import { TaskTools } from './task.tools';

type Handler = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<unknown>;

@Injectable()
export class ToolRegistry {
  private readonly handlers: Record<string, Handler>;

  constructor(
    private readonly scheduleTools: ScheduleTools,
    private readonly taskTools: TaskTools,
  ) {
    this.handlers = {
      create_schedule: (a, c) => this.scheduleTools.createSchedule(a, c),
      list_schedules: (a, c) => this.scheduleTools.listSchedules(a, c),
      check_conflicts: (a, c) => this.scheduleTools.checkConflicts(a, c),
      update_schedule: (a, c) => this.scheduleTools.updateSchedule(a, c),
      delete_schedule: (a, c) => this.scheduleTools.deleteSchedule(a, c),
      create_task: (a, c) => this.taskTools.createTask(a, c),
      list_tasks: (a, c) => this.taskTools.listTasks(a, c),
    };
  }

  definitions(): LlmToolDef[] {
    return [
      ...this.scheduleTools.definitions(),
      ...this.taskTools.definitions(),
    ];
  }

  async dispatch(
    name: string,
    argumentsJson: string,
    ctx: ToolContext,
  ): Promise<unknown> {
    const handler = this.handlers[name];
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }
    let args: Record<string, unknown>;
    try {
      args = argumentsJson ? JSON.parse(argumentsJson) : {};
    } catch {
      throw new Error(`Invalid tool arguments for ${name}`);
    }
    return handler(args, ctx);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx jest src/modules/agent/application/tools/tool-registry.spec.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/agent/application/tools/tool-registry.ts src/modules/agent/application/tools/tool-registry.spec.ts
git commit -m "feat(agent): add tool registry with name dispatch"
```

---

## Task 9: Agent service (the loop)

**Files:**
- Create: `src/modules/agent/application/agent.service.ts`
- Test: `src/modules/agent/application/agent.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/modules/agent/application/agent.service.spec.ts`:

```ts
import { AgentService } from './agent.service';
import { LlmClient, LlmResponseMessage } from '../infrastructure/llm/llm.client';
import { ToolRegistry } from './tools/tool-registry';
import {
  ConversationMessage,
  IConversationRepository,
} from '../domain/conversation.repository.interface';

describe('AgentService', () => {
  let service: AgentService;
  let llm: { chat: jest.Mock };
  let registry: { definitions: jest.Mock; dispatch: jest.Mock };
  let convRepo: jest.Mocked<IConversationRepository>;

  const summary = (id: string, userId: string) => ({
    id,
    userId,
    title: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    llm = { chat: jest.fn() };
    registry = { definitions: jest.fn().mockReturnValue([]), dispatch: jest.fn() };
    convRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      listByUser: jest.fn(),
      getMessages: jest.fn().mockResolvedValue([] as ConversationMessage[]),
      appendMessages: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IConversationRepository>;

    service = new AgentService(
      llm as unknown as LlmClient,
      registry as unknown as ToolRegistry,
      convRepo,
    );
  });

  it('creates a conversation when none is given and returns the text reply', async () => {
    convRepo.create.mockResolvedValue(summary('c1', 'user-1'));
    const reply: LlmResponseMessage = { role: 'assistant', content: 'Done!' };
    llm.chat.mockResolvedValue(reply);

    const result = await service.chat('user-1', 'hello');

    expect(convRepo.create).toHaveBeenCalledWith('user-1');
    expect(result.conversationId).toBe('c1');
    expect(result.reply).toBe('Done!');
    expect(result.actions).toEqual([]);
    expect(convRepo.appendMessages).toHaveBeenCalledTimes(1);
  });

  it('rejects a conversation owned by another user', async () => {
    convRepo.findById.mockResolvedValue(summary('c1', 'other-user'));
    await expect(service.chat('user-1', 'hi', 'c1')).rejects.toThrow();
  });

  it('executes a tool call then returns the follow-up text reply', async () => {
    convRepo.create.mockResolvedValue(summary('c1', 'user-1'));
    const toolTurn: LlmResponseMessage = {
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'list_tasks', arguments: '{}' } },
      ],
    };
    const textTurn: LlmResponseMessage = { role: 'assistant', content: 'You have 2 tasks.' };
    llm.chat.mockResolvedValueOnce(toolTurn).mockResolvedValueOnce(textTurn);
    registry.dispatch.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);

    const result = await service.chat('user-1', 'how many tasks?');

    expect(registry.dispatch).toHaveBeenCalledWith('list_tasks', '{}', { userId: 'user-1' });
    expect(result.reply).toBe('You have 2 tasks.');
    expect(result.actions).toEqual([{ tool: 'list_tasks', ok: true }]);
  });

  it('feeds a tool error back to the model instead of throwing', async () => {
    convRepo.create.mockResolvedValue(summary('c1', 'user-1'));
    const toolTurn: LlmResponseMessage = {
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'delete_schedule', arguments: '{"id":"x"}' } },
      ],
    };
    const textTurn: LlmResponseMessage = { role: 'assistant', content: 'That schedule is not yours.' };
    llm.chat.mockResolvedValueOnce(toolTurn).mockResolvedValueOnce(textTurn);
    registry.dispatch.mockRejectedValue(new Error('Tidak memiliki akses ke schedule ini'));

    const result = await service.chat('user-1', 'delete it');

    expect(result.reply).toBe('That schedule is not yours.');
    expect(result.actions).toEqual([{ tool: 'delete_schedule', ok: false }]);
  });

  it('stops after the iteration cap and returns a fallback message', async () => {
    convRepo.create.mockResolvedValue(summary('c1', 'user-1'));
    const toolTurn: LlmResponseMessage = {
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'call_x', type: 'function', function: { name: 'list_tasks', arguments: '{}' } },
      ],
    };
    llm.chat.mockResolvedValue(toolTurn); // always asks for a tool -> never settles
    registry.dispatch.mockResolvedValue([]);

    const result = await service.chat('user-1', 'loop');

    expect(llm.chat).toHaveBeenCalledTimes(5);
    expect(result.reply).toMatch(/tidak dapat menyelesaikan/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx jest src/modules/agent/application/agent.service.spec.ts
```
Expected: FAIL — cannot find module `./agent.service`.

- [ ] **Step 3: Implement the agent service**

Create `src/modules/agent/application/agent.service.ts`:

```ts
import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  LlmClient,
  LlmMessage,
} from '../infrastructure/llm/llm.client';
import {
  ConversationMessage,
  IConversationRepository,
} from '../domain/conversation.repository.interface';
import { ToolRegistry } from './tools/tool-registry';

const MAX_ITERATIONS = 5;

export interface AgentChatResult {
  conversationId: string;
  reply: string;
  actions: { tool: string; ok: boolean }[];
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly llm: LlmClient,
    private readonly toolRegistry: ToolRegistry,
    @Inject('IConversationRepository')
    private readonly conversationRepo: IConversationRepository,
  ) {}

  async chat(
    userId: string,
    content: string,
    conversationId?: string,
  ): Promise<AgentChatResult> {
    const conversation = conversationId
      ? await this.requireOwnedConversation(conversationId, userId)
      : await this.conversationRepo.create(userId);

    const history = await this.conversationRepo.getMessages(conversation.id);

    const llmMessages: LlmMessage[] = [
      { role: 'system', content: this.systemPrompt() },
      ...history.map((m) => this.toLlmMessage(m)),
      { role: 'user', content },
    ];

    // Buffer of new messages to persist at the end of the turn.
    const toPersist: ConversationMessage[] = [{ role: 'user', content }];
    const actions: { tool: string; ok: boolean }[] = [];

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await this.llm.chat(
        llmMessages,
        this.toolRegistry.definitions(),
      );

      const assistantMsg: ConversationMessage = {
        role: 'assistant',
        content: response.content,
        toolCalls: response.tool_calls,
      };
      llmMessages.push(this.toLlmMessage(assistantMsg));
      toPersist.push(assistantMsg);

      if (!response.tool_calls || response.tool_calls.length === 0) {
        await this.conversationRepo.appendMessages(conversation.id, toPersist);
        return {
          conversationId: conversation.id,
          reply: response.content ?? '',
          actions,
        };
      }

      for (const call of response.tool_calls) {
        let resultContent: string;
        let ok = true;
        try {
          const result = await this.toolRegistry.dispatch(
            call.function.name,
            call.function.arguments,
            { userId },
          );
          resultContent = JSON.stringify(result);
        } catch (err) {
          ok = false;
          resultContent = JSON.stringify({
            error: err instanceof Error ? err.message : 'Tool gagal dijalankan',
          });
          this.logger.warn(`Tool ${call.function.name} failed: ${resultContent}`);
        }
        actions.push({ tool: call.function.name, ok });

        const toolMsg: ConversationMessage = {
          role: 'tool',
          content: resultContent,
          toolCallId: call.id,
        };
        llmMessages.push(this.toLlmMessage(toolMsg));
        toPersist.push(toolMsg);
      }
    }

    // Iteration cap reached without a settled text reply.
    const fallback =
      'Maaf, saya tidak dapat menyelesaikan permintaan itu sekarang.';
    toPersist.push({ role: 'assistant', content: fallback });
    await this.conversationRepo.appendMessages(conversation.id, toPersist);
    return { conversationId: conversation.id, reply: fallback, actions };
  }

  private async requireOwnedConversation(id: string, userId: string) {
    const conversation = await this.conversationRepo.findById(id);
    if (!conversation || conversation.userId !== userId) {
      throw new ForbiddenException('Percakapan tidak ditemukan');
    }
    return conversation;
  }

  private toLlmMessage(m: ConversationMessage): LlmMessage {
    return {
      role: m.role,
      content: m.content,
      tool_calls: m.toolCalls,
      tool_call_id: m.toolCallId,
    };
  }

  private systemPrompt(): string {
    const now = new Date().toISOString();
    return [
      'You are a scheduling assistant inside the Saku app.',
      'You help the authenticated user manage their own schedules and tasks.',
      `The current date and time is ${now}.`,
      'Use the provided tools to read or change data; never invent IDs.',
      'Before creating a schedule that might overlap, use check_conflicts.',
      'After acting, confirm what you did in clear, friendly Bahasa Indonesia.',
    ].join(' ');
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx jest src/modules/agent/application/agent.service.spec.ts
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/agent/application/agent.service.ts src/modules/agent/application/agent.service.spec.ts
git commit -m "feat(agent): add agent loop service with tool execution and iteration cap"
```

---

## Task 10: Controller, DTO, and module wiring

**Files:**
- Create: `src/modules/agent/presentation/dto/chat.dto.ts`
- Create: `src/modules/agent/presentation/agent.controller.ts`
- Create: `src/modules/agent/agent.module.ts`
- Test: `src/modules/agent/presentation/agent.controller.spec.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Create the request DTO**

Create `src/modules/agent/presentation/dto/chat.dto.ts`:

```ts
import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class ChatDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsString()
  conversationId?: string;
}
```

- [ ] **Step 2: Write the failing controller test**

Create `src/modules/agent/presentation/agent.controller.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from '../application/agent.service';
import type { IConversationRepository } from '../domain/conversation.repository.interface';

describe('AgentController', () => {
  let controller: AgentController;
  let service: { chat: jest.Mock };
  let convRepo: jest.Mocked<IConversationRepository>;

  beforeEach(() => {
    service = { chat: jest.fn() };
    convRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      listByUser: jest.fn(),
      getMessages: jest.fn(),
      appendMessages: jest.fn(),
    } as unknown as jest.Mocked<IConversationRepository>;
    controller = new AgentController(
      service as unknown as AgentService,
      convRepo,
    );
  });

  it('rejects unauthenticated chat requests', async () => {
    await expect(
      controller.chat({ content: 'hi' }, null),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forwards chat to the service with the user id', async () => {
    service.chat.mockResolvedValue({ conversationId: 'c1', reply: 'ok', actions: [] });
    const result = await controller.chat(
      { content: 'hi', conversationId: 'c1' },
      { sub: 'user-1' } as never,
    );
    expect(service.chat).toHaveBeenCalledWith('user-1', 'hi', 'c1');
    expect(result.reply).toBe('ok');
  });

  it('lists conversations for the authenticated user', async () => {
    convRepo.listByUser.mockResolvedValue([]);
    await controller.list({ sub: 'user-1' } as never);
    expect(convRepo.listByUser).toHaveBeenCalledWith('user-1');
  });

  it('rejects unauthenticated list requests', async () => {
    await expect(controller.list(null)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:
```bash
npx jest src/modules/agent/presentation/agent.controller.spec.ts
```
Expected: FAIL — cannot find module `./agent.controller`.

- [ ] **Step 4: Implement the controller**

Create `src/modules/agent/presentation/agent.controller.ts`:

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/user.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload';
import { AgentService } from '../application/agent.service';
import type { IConversationRepository } from '../domain/conversation.repository.interface';
import { ChatDto } from './dto/chat.dto';

@ApiTags('Agent')
@ApiBearerAuth()
@Controller('agent')
@UseGuards(JwtAuthGuard)
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    @Inject('IConversationRepository')
    private readonly conversationRepo: IConversationRepository,
  ) {}

  @Post('chat')
  @ApiOperation({ summary: 'Chat with the AI scheduling assistant' })
  @ApiResponse({ status: 201, description: 'Assistant replied' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 502, description: 'AI assistant unavailable' })
  async chat(
    @Body() body: ChatDto,
    @CurrentUser() user: JwtPayload | null,
  ) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    return this.agentService.chat(user.sub, body.content, body.conversationId);
  }

  @Get('conversations')
  @ApiOperation({ summary: "List the user's agent conversations" })
  @ApiResponse({ status: 200, description: 'Conversations retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async list(@CurrentUser() user: JwtPayload | null) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    return this.conversationRepo.listByUser(user.sub);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
npx jest src/modules/agent/presentation/agent.controller.spec.ts
```
Expected: PASS (4 tests).

- [ ] **Step 6: Create the module**

Create `src/modules/agent/agent.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ScheduleModule } from '../schedule/schedule.module';
import { TaskModule } from '../task/task.module';
import { AgentController } from './presentation/agent.controller';
import { AgentService } from './application/agent.service';
import { ToolRegistry } from './application/tools/tool-registry';
import { ScheduleTools } from './application/tools/schedule.tools';
import { TaskTools } from './application/tools/task.tools';
import { LlmClient } from './infrastructure/llm/llm.client';
import { PrismaConversationRepository } from './infrastructure/persistence/prisma-conversation.repository';

@Module({
  imports: [PrismaModule, ScheduleModule, TaskModule],
  controllers: [AgentController],
  providers: [
    AgentService,
    ToolRegistry,
    ScheduleTools,
    TaskTools,
    LlmClient,
    {
      provide: 'IConversationRepository',
      useClass: PrismaConversationRepository,
    },
  ],
})
export class AgentModule {}
```

- [ ] **Step 7: Register the module in the app**

In `src/app.module.ts`, add the import near the other module imports:

```ts
import { AgentModule } from './modules/agent/agent.module';
```

and add `AgentModule` to the `imports` array (after `UserModule`):

```ts
    UserModule,
    AgentModule,
```

- [ ] **Step 8: Verify the whole project compiles and the module boots**

Run:
```bash
npx tsc --noEmit
npx jest src/modules/agent
```
Expected: no type errors; all agent unit tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/modules/agent/presentation src/modules/agent/agent.module.ts src/app.module.ts
git commit -m "feat(agent): wire agent controller, module, and app registration"
```

---

## Task 11: Full suite + env documentation

**Files:**
- Modify: `.env.example` (create if absent)
- Modify: `README.md`

- [ ] **Step 1: Document the new env vars**

Append to `.env.example` (create the file if it does not exist):

```
# AI agent (OpenAI-compatible LLM, e.g. MiMo)
LLM_BASE_URL=https://your-mimo-host/v1
LLM_API_KEY=
LLM_MODEL=
LLM_TIMEOUT_MS=30000
```

- [ ] **Step 2: Add a short README note**

In `README.md`, add a bullet under the features/setup section:

```markdown
- **AI agent (`/agent/chat`)** — natural-language schedule & task management via an OpenAI-compatible LLM. Configure `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` (see `.env.example`).
```

- [ ] **Step 3: Run the full unit suite**

Run:
```bash
npm test
```
Expected: all unit tests pass (existing suite + new agent tests).

- [ ] **Step 4: Run the integration suite**

Run:
```bash
npm run test:integration
```
Expected: all integration tests pass, including `prisma-conversation.repository.int.spec.ts`. (Requires Docker.)

- [ ] **Step 5: Lint**

Run:
```bash
npm run lint
```
Expected: no lint errors.

- [ ] **Step 6: Commit**

```bash
git add .env.example README.md
git commit -m "docs(agent): document LLM env vars and agent endpoint"
```

---

## Self-Review notes (for the implementer)

- **Spec coverage:** module layout (Task 10), 2 Prisma tables (Task 1), agent loop with cap 5 (Task 9), all 7 v1 tools (Tasks 6–8), owner-only update/delete (Task 6), `GET /agent/conversations` (Task 10), OpenAI-compatible LLM client + env (Tasks 3, 11), error handling — LLM 502 (Task 3), tool-error fed back (Task 9), history persistence (Task 5).
- **Type consistency:** `ToolContext` is defined once in `schedule.tools.ts` and reused by `task.tools.ts`, `tool-registry.ts`, and `agent.service.ts`. `ConversationMessage`/`LlmMessage`/`LlmToolCall` are the only message shapes used across the loop and persistence.
- **`create_task` note:** the use-case reads `deadlineOrDueDate` (a field normally populated by the DTO `@Transform`, which only runs through the validation pipe). Because tools call the use-case directly, `task.tools.ts` sets `deadlineOrDueDate` explicitly — covered by its test.
- **`updatedAt` touch:** `appendMessages` issues `agentConversation.update({ data: {} })` so Prisma's `@updatedAt` advances; the unit test asserts this call.
