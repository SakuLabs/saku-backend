<h1 align="center">🎒 Saku Backend</h1>

<p align="center">
  <em>Campus task, schedule, chat, and social backend.</em><br/>
  NestJS · Bun · Prisma · PostgreSQL · Socket.IO · JWT · Scalar
</p>

<p align="center">
  <img alt="NestJS" src="https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white">
  <img alt="Bun" src="https://img.shields.io/badge/Bun-1.3-000?logo=bun&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white">
  <img alt="Prisma" src="https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white">
  <img alt="Postgres" src="https://img.shields.io/badge/Postgres-16-336791?logo=postgresql&logoColor=white">
  <img alt="Deploy" src="https://img.shields.io/badge/deploy-Railway-0B0D0E?logo=railway&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/license-UNLICENSED-lightgrey">
</p>

---

## Features

- **Auth** — JWT-based register/login, central `JwtAuthModule` with env-driven secret + expiry
- **Tasks** — CRUD + status (TODO/IN_PROGRESS/DONE/EXPIRED) + progress with domain rules, cron reminder
- **Schedules** — Personal + group schedules with conflict detection
- **Chat** — Socket.IO gateway: group rooms, DM rooms (friends-only), typing, friend-request push
- **Social** — Friends, friend requests (with auto-accept on reverse), groups, group invites, admin/moderator roles
- **API Docs** — Scalar UI at `/docs` (basic-auth gated, available in all envs)
- **AI agent (`/agent/chat`)** — natural-language schedule & task management via an OpenAI-compatible LLM. Configure `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` (see `.env.example`).

## Tech Stack

- **Framework** — NestJS 11
- **Runtime** — Bun
- **Language** — TypeScript (strict null checks)
- **Database** — PostgreSQL via Prisma 7 + `@prisma/adapter-pg`
- **Auth** — `@nestjs/jwt` + `bcrypt`
- **Realtime** — Socket.IO via `@nestjs/websockets`
- **API Docs** — `@nestjs/swagger` for spec gen + `@scalar/nestjs-api-reference` for UI
- **Uploads** — `multer` + `cloudinary` (avatars)
- **Tests** — Jest + `jest-mock-extended` + `@testcontainers/postgresql` + `supertest`

## Environment Variables

Copy `.env.example` to `.env`.

| Var | Required | Purpose |
|---|---|---|
| `PORT` | no | Server port (default 3001) |
| `NODE_ENV` | no | `development` / `production` / `test` |
| `DATABASE_URL` | yes | Postgres connection string |
| `JWT_SECRET` | yes | JWT signing secret (set in prod) |
| `JWT_EXPIRES_IN` | no | Token lifetime, default `24h` |
| `DOCS_USER` | yes | Basic-auth user for `/docs` + `/docs/json` |
| `DOCS_PASS` | yes | Basic-auth password for `/docs` |
| `CLOUDINARY_CLOUD_NAME` | for avatars | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | for avatars | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | for avatars | Cloudinary API secret |
| `AGENT_ENABLED` | no | Master switch for the AI agent. Must be `true` to enable `POST /agent/chat`; otherwise it returns 503 and spends no tokens (default off) |
| `LLM_BASE_URL` | for AI agent | OpenAI-compatible base URL (e.g. MiMo) |
| `LLM_API_KEY` | for AI agent | API key for the LLM provider |
| `LLM_MODEL` | for AI agent | Model name/ID to use |
| `LLM_TIMEOUT_MS` | no | Request timeout in ms (default 30000) |
| `AGENT_PROMPT_FILE` | no | Path to the agent system-prompt template (default `prompts/agent-system.md`) |

`/docs` returns 503 if `DOCS_USER`/`DOCS_PASS` unset (fail-closed).

## Installation

```bash
bun install
bunx prisma generate
bunx prisma migrate dev
bunx prisma db seed   # optional
```

## Running

```bash
bun run start:dev       # watch mode
bun run build && bun run start:prod
```

## API Docs (Scalar)

Once running:
- UI: `http://localhost:3001/docs`  (basic auth — uses `DOCS_USER`/`DOCS_PASS`)
- Raw OpenAPI JSON: `http://localhost:3001/docs/json`

## Testing

```bash
bun run test            # 273 unit specs (mocked Prisma)
bun run test:cov        # unit + coverage (80% per-file gate on covered files)
bun run test:integration  # 13 repo integration tests (Testcontainers + real Postgres)
bun run test:e2e        # 12 HTTP e2e tests (full AppModule + supertest)
```

Integration + e2e require Docker.

## CI

`.github/workflows/ci.yml`:
- `quality` — lint, typecheck, build, unit tests + coverage threshold, against Postgres service
- `integration` — Testcontainers integration + e2e (depends on `quality`)
- `docker` — image build on push to `main` (depends on `quality`)

## Deployment

### Railway

Deployed on [Railway](https://railway.app). Container reads `PORT` from the platform; just push to `main` and Railway rebuilds via Dockerfile.

**Set env vars in the Railway project dashboard:**

```
DATABASE_URL=<railway postgres plugin URL>
JWT_SECRET=<long random string>
JWT_EXPIRES_IN=24h
DOCS_USER=<docs user>
DOCS_PASS=<strong password>
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

Attach the **Postgres plugin**; Railway auto-injects `DATABASE_URL`. Run migrations on first deploy:

```bash
railway run bunx prisma migrate deploy
```

### Local Docker

```bash
docker build -t saku-backend .
docker run -p 3001:3001 \
  -e PORT=3001 \
  -e DATABASE_URL=... -e JWT_SECRET=... \
  -e DOCS_USER=admin -e DOCS_PASS=changeme \
  saku-backend
```

## Project Structure

```
src/
├── common/
│   ├── decorators/    # @CurrentUser
│   ├── guards/        # JwtAuthGuard
│   ├── jwt/           # Global JwtAuthModule
│   └── types/         # JwtPayload
├── modules/
│   ├── auth/          # flat: controller, service
│   ├── user/          # flat: controller
│   ├── social/        # flat: controller (friends, groups, invites)
│   ├── chat/          # controller + service + Socket.IO gateway
│   ├── task/          # DDD: domain | application | infrastructure | presentation
│   └── schedule/      # DDD: domain | application | infrastructure | presentation
├── prisma/            # PrismaService (pg pool + PrismaPg adapter)
└── main.ts            # bootstrap, CORS, ValidationPipe, Scalar mount
prisma/
├── schema.prisma
├── migrations/
└── seed.ts
test/
├── integration/       # Testcontainers + real repo tests
├── e2e/               # supertest + full AppModule
└── utils/             # prisma-mock helper
```

## API Endpoints (selected)

### Auth (`/auth`)
- `POST /auth/register` — `{ email, password, name }`
- `POST /auth/login` — `{ email, password }`

### Users (`/users`) — bearer required
- `GET  /users/me`
- `PATCH /users/me` — `{ name?, bio?, avatarUrl? }`
- `POST /users/me/avatar` — multipart, Cloudinary upload

### Tasks (`/tasks`) — bearer required
- `GET  /tasks`
- `POST /tasks` — `{ title, priority, description?, startDate?, deadline?, dueDate?, progress? }`
- `PATCH /tasks/:id/status` — `{ status: 'IN_PROGRESS' | 'DONE' }`
- `PATCH /tasks/:id/progress` — `{ progress: 0..100 }`
- `DELETE /tasks/:id`

### Schedules (`/schedules`) — bearer required
- `GET  /schedules`
- `POST /schedules`
- `POST /schedules/conflicts` — overlap check
- `PATCH /schedules/:id`
- `DELETE /schedules/:id`

### Social (`/social`) — bearer required
- `GET  /social/friends` · `POST /social/friends/search` · `POST /social/friends/search-name` · `POST /social/friends/search-id`
- `POST /social/friends/request` · `GET /social/friends/requests` · `GET /social/friends/requests/sent`
- `POST /social/friends/requests/:id/accept` · `POST /social/friends/requests/:id/reject`
- `DELETE /social/friends/:friendId`
- `GET /social/groups` · `POST /social/groups` · `PATCH /social/groups/:groupId`
- `POST /social/groups/:groupId/members` · `POST /social/groups/:groupId/members/:memberId/{remove,promote,demote}`
- `POST /social/groups/:groupId/invites` · `GET /social/groups/invites`
- `POST /social/groups/invites/:id/{accept,reject}`
- `POST /social/groups/:groupId/transfer-admin`
- `GET /social/users/:id/profile?groupId=...`

### Agent (`/agent`) — bearer required
- `POST /agent/chat` — body `{ content, conversationId? }` → `{ conversationId, reply }` — natural-language schedule & task management. Pass the returned `conversationId` back to continue the same thread. **Gated by `AGENT_ENABLED=true`** — returns 503 (no tokens spent) when disabled.
- `GET  /agent/conversations` — list the user's conversations
- `GET  /agent/conversations/:id/messages` — full message history of one conversation (owner-only)

The agent runs its own loop over an OpenAI-compatible LLM (MiMo): it sends the conversation + tool definitions, executes any tool calls (create/list/update/delete schedule, check_conflicts, create/list task) scoped to the authenticated user, feeds results back, and repeats up to 5 iterations before replying. Tool names are never exposed in the response.

The agent's system prompt is a template at `prompts/agent-system.md` (override the path with `AGENT_PROMPT_FILE`). It controls reply language, tone, and Markdown formatting. Edit the file to retune behaviour, then restart — it loads once at startup. `{{now}}` is substituted with the current ISO datetime per request; if the file is missing/empty a built-in default is used.

### Chat (`/chat`) — bearer required
- `GET  /chat/group/:groupId` — group history (member-only)
- `GET  /chat/dm/:userId` — DM history (friends-only)
- `POST /chat/messages` — `{ content, groupId? | directMessageUserId? }`

### Chat WebSocket (Socket.IO, root namespace)
Auth: send JWT via `auth.token` or `Authorization: Bearer ...` on handshake. Events:
- `joinGroup` `{ groupId }`
- `joinDM` `{ userId }`
- `sendGroupMessage` `{ groupId, content }`
- `sendDM` `{ recipientId, content }`
- `send_message` `{ type: 'dm'|'group', groupId?, recipientId?, content }`
- `typing` `{ isTyping, groupId? | directMessageUserId? }`
- `friendRequest` `{ recipientId }`
- Server emits: `receive_message`, `typing`, `friendRequest`

## License

UNLICENSED (private)
