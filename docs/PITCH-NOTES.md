# SAKU Deck — Pitch Knowledge Notes

Per-slide deep notes for presenting `SAKU.pptx` confidently. Each slide has: what's on it, the background knowledge behind it, talking points, and likely Q&A with prepared answers.

---

## Slide 1 — Title: "SAKU — Architecture & System Design"

**On slide:** SAKU · Plan / Strategy / Productivity · Academic Task Management Dashboard.

**What Saku is (your 15-second elevator pitch):**
> "Saku is an academic task management dashboard — tasks, schedules, and an AI assistant that can manage both for you through chat. Built as a modular monolith with NestJS and Next.js."

**Background you should know cold:**
- **Three apps in the monorepo:** `saku-backend` (NestJS REST API + WebSocket), `saku-frontend` (Next.js 16 App Router), `saku-landing` (landing page).
- **Core features:** task management (state machine: start/complete/reset with precondition checks), scheduling (conflict detection, duration rules), realtime chat (presence, notifications, unread counts), and an LLM agent that manipulates tasks/schedules via tool calls.
- **Stack one-liner:** NestJS 11 + Prisma + JWT auth on the backend; Next.js + custom hooks (no Redux) on the frontend.

**Tip:** this slide is 10 seconds. Name, what it does, move on.

---

## Slide 2 — Team: "Who Built Saku?"

**On slide:** Theola Aristo P.N (Coffee Engineer), Greshen Chin (Task Overthinker), Mario Terano (Schedule Destroyer), Clay Daryan Stanly (Professional Deadline Extender), Marchello (Productivity Guru). "Five students. Countless deadlines. One collective panic attack. So we built Saku."

**Delivery notes:**
- The joke titles work — read them with a straight face, let the audience laugh, don't explain them.
- The narrative hook is genuine: **you built the tool you needed**. "We are the target user" is a legitimately strong product argument — mention it once, seriously, after the laughs.
- Keep under 30 seconds. Team slides die when each member gets a biography.

---

## Slide 3 — "How Saku Is Built: Modular Monolith with Domain-Driven Modules"

**On slide:** Domain-driven module boundaries · Loose coupling through dependency injection · Clear module boundaries for future scaling.

This is the slide you'll get the most questions on. Know this section best.

### The claim, precisely

- **Monolith** = one deployable unit: a single NestJS process, one database, one connection pool. Modules talk in-process through dependency injection — never over a network.
- **Modular** = the codebase is split into 9 NestJS feature modules under `src/modules/`: `agent`, `task`, `schedule`, `auth`, `chat`, `user`, `social`, `health`, `dev`. Each registered in `app.module.ts`.
- **Domain-driven modules** = modules are split by *business domain* (task, schedule, agent, chat), not by technical role (no top-level `controllers/`, `services/` folders). That is exactly what the phrase claims — no more, no less.

### The nuance you should volunteer if pressed

Two internal styles coexist, deliberately:
- **Layered / Clean Architecture** in the 3 complex domains — `agent`, `task`, `schedule` each have `presentation/ → application/ → domain/ ← infrastructure/`. Dependency rule points inward; infrastructure *implements* domain interfaces (dependency inversion).
- **Flat (standard NestJS)** in the simple modules — `auth`, `chat`, `user`, `social`: controller → service → Prisma. This is what `nest g resource` scaffolds.

The rationale: **layering pays off where modules accumulate invariants** (business rules that must always hold). Task has a state machine; schedule has conflict rules; agent orchestrates an LLM. Auth just issues JWTs — four layers there would be ceremony.

### Explaining each bullet

1. **"Domain-driven module boundaries"** — each module owns its domain's data access, logic, and endpoints. You can find everything about scheduling in one folder.
2. **"Loose coupling through dependency injection"** — modules depend on abstractions. Concrete example: `{ provide: 'ITaskRepository', useClass: PrismaTaskRepository }` in `task.module.ts`. The use-cases never import Prisma.
3. **"Clear module boundaries for future scaling"** — two senses of scaling:
   - *Runtime:* the API is stateless (JWT), so you can run N instances behind a load balancer today.
   - *Organizational:* if one domain ever needs independent deployment, the module boundary is the extraction seam — its repository interfaces become the service's API surface.

### Likely Q&A

**Q: Why not microservices?**
> "Five students, one product, one database. Microservices buy you independent deployment and team autonomy at the cost of network failures, distributed transactions, and ops overhead — costs we'd pay immediately for benefits we don't need yet. The modular monolith gives us the boundaries without the distribution. If a module ever needs to scale independently, the seams already exist."

**Q: How do you scale it?**
> "Horizontally — the REST API is stateless with JWT, so multiple instances behind a load balancer work today. The one caveat is WebSockets: scaling the chat gateway across instances needs sticky sessions or a Redis pub/sub adapter so a message published on one instance reaches clients connected to another."

(Knowing that caveat unprompted is worth more than the slide itself.)

**Q: Why NestJS?**
> "It gives us the module system and DI container that make 'modular monolith' enforceable rather than aspirational — plus guards/interceptors for cross-cutting concerns and first-class TypeScript."

**Q: Is it Clean Architecture / DDD?**
> "The three complex domains use clean architecture internally — domain entities, repository interfaces, infrastructure implementing them. We don't claim full DDD (no formal bounded contexts or aggregates), but the module split is domain-driven."

**Q (hostile): Any architecture violations?**
> Own it: "Two known ones, documented in our architecture doc so they don't get copied: one domain interface imports a type from infrastructure — a dependency-inversion violation we plan to fix by moving the type into domain — and one controller injects Prisma directly. Documenting violations beats pretending they don't exist."

---

## Slide 4 — "PrismaService as a Singleton" — *One instance. Shared everywhere.*

**On slide:** Singleton pattern (creational), PrismaService.

### The mechanics

- `PrismaService` (`src/prisma/prisma.service.ts`) extends `PrismaClient` and lives in a `@Global()` module.
- NestJS providers are **singleton-scoped by default**: the DI container constructs one instance per application lifecycle and hands the *same* instance to every consumer — `AgentService`, `ChatService`, every Prisma repository.
- Lifecycle hooks: `OnModuleInit` connects to the database on startup, `OnModuleDestroy` disconnects on shutdown — clean connection management.

### Why it matters (the "so what")

> "Each PrismaClient instance maintains its own database connection pool. If every service newed up its own client, we'd multiply pools and exhaust the database's connection limit. One shared instance = one pool = predictable connection usage."

### The sophisticated point (volunteer this)

This is a **DI-managed singleton, not the classic GoF singleton**:
- GoF singleton: private constructor + static `getInstance()` — the class *enforces* its own uniqueness. Downsides: hidden global state, hard to mock in tests.
- Here: the class is an ordinary `@Injectable()`; the *container* guarantees uniqueness. Tests can substitute a mock by overriding the provider. Same guarantee, none of the testability cost.

### Likely Q&A

**Q: Isn't singleton an anti-pattern?**
> "The GoF static version often is, because of hidden global state. Container-managed singletons avoid that: the dependency is explicit in the constructor and swappable in tests. The pattern's *intent* — exactly one instance — is exactly right for a connection pool."

**Q: What about request-scoped providers?**
> "NestJS supports them, but request scope would create per-request instances — precisely wrong for a connection pool, and it has performance costs. Singleton is the deliberate choice here."

---

## Slide 5 — "ChatGateway as an Observer" — *Publish once. Notify everyone.*

**On slide:** Observer pattern (behavioral), ChatGateway.

### The mechanics

- `ChatGateway` (`src/modules/chat/chat.gateway.ts`) is a WebSocket gateway implementing `OnGatewayConnection` / `OnGatewayDisconnect`.
- **Subscribe:** a client connects over WebSocket and joins its user room. Multiple devices of the same user join the same room (laptop + phone both get notified).
- **Publish:** the gateway emits events — `server.to(room).emit('message')` — to every socket subscribed to that room.
- Events flowing through it: chat messages, presence sync, notifications, unread counts.

### Mapping to the pattern

| Observer concept | In Saku |
|---|---|
| Subject (publisher) | `ChatGateway` with `@WebSocketServer()` |
| Observers (subscribers) | Connected client sockets, grouped by room |
| Subscribe | Connect + join room |
| Notify | `server.to(room).emit(event, payload)` |

The decoupling is the point: **the sender doesn't know who receives**. A message is published once; the gateway notifies every current subscriber. Adding a third device or a new event type changes nothing about senders.

### Observer vs Pub-Sub nuance (if a pedant asks)

> "Strictly: classic Observer has subjects holding direct references to observers; pub-sub adds a broker between them. Socket rooms act as that broker layer, so this is pub-sub — which is the distributed flavor of Observer. Same intent: decouple publisher from subscribers."

### Likely Q&A

**Q: Why WebSockets instead of polling?**
> "Push beats poll for chat: lower latency (no poll interval), lower load (no empty polls), and presence is basically free — the connection itself is the 'online' signal."

**Q: How does it scale?**
> "Single instance: fine as is. Multiple instances: you need a Redis adapter so an emit on instance A reaches a socket connected to instance B, plus sticky sessions for the handshake. Known path, not yet needed."

---

## Slide 6 — "LlmClient as an Adapter" — *Typed application API. External provider API. The adapter translates between them.*

**On slide:** Adapter pattern (structural), LlmClient.

### The mechanics

`LlmClient` (`src/modules/agent/infrastructure/llm/llm.client.ts`) sits between two incompatible interfaces:

- **Application side:** a typed TypeScript method — `chat(messages: LlmMessage[], tools: LlmToolDef[]): Promise<LlmResponseMessage>`.
- **Provider side:** raw HTTP — `POST /chat/completions` with an OpenAI-compatible JSON body, bearer auth, streaming flags, `choices[0].message` unwrapping.

The adapter owns all translation:
- Shapes the request (model, messages, tools, `tool_choice: 'auto'`)
- Unwraps the response (`choices[0].message`, validates it exists)
- Maps transport failures to domain-appropriate errors (`BadGatewayException` with a user-facing message)
- Handles timeouts via `AbortController`

**The payoff:** the rest of the app never touches the wire format. `AgentService` calls a typed method; if the provider changes, only the adapter changes. It lives in the `infrastructure/` layer — exactly where clean architecture says external-world translation belongs.

### Bonus knowledge — the Proxy next door (great Q&A ammo)

There's a **second, different pattern** in the same subsystem: `LlmProxyController` (`src/modules/dev/`) is a **protection proxy** — a dev-only endpoint so teammates can run the agent locally *without holding the real API key*:
- Exposes the **same** `/chat/completions` interface as the provider (no translation — that's what makes it proxy, not adapter)
- Adds access control: shared proxy token (timing-safe comparison), 404s entirely in production
- Adds accounting: monthly token budget, usage metering per request
- `LlmClient` switches to it automatically when `LLM_PROXY_URL` is set

### The pattern taxonomy (know this cold — classic exam question)

| Pattern | Interface in vs out | Job |
|---|---|---|
| **Adapter** | *Different* | Translate between incompatible interfaces |
| **Proxy** | *Same* | Control access (auth, metering, caching) |
| **Facade** | *Simpler* | One entry point hiding multiple subsystems |

> "LlmClient converts interfaces → Adapter. LlmProxyController keeps the interface and adds control → Proxy. We have no Facade in this subsystem — that would be one class hiding several subsystems behind a simplified API."

### Likely Q&A

**Q: What happens when the LLM is down?**
> "The adapter maps any failure — timeout, non-200, malformed response — to a `BadGatewayException` with a user-friendly message. The agent feature degrades; tasks and schedules keep working because the adapter contains the failure at the infrastructure boundary."

**Q: Could you swap LLM providers?**
> "If the new provider is OpenAI-compatible, it's an env-var change. If not, we change one file — the adapter. Nothing above infrastructure knows the wire format."

---

## Slide 7 — Closing: "Saku is done. Our assignments are not."

**On slide:** "Thanks for listening. Now we have to survive finals :) Open source, btw."

**Delivery notes:**
- "Open source, btw" — have the GitHub org ready to say out loud or show: **github.com/SakuLabs**.
- If there's time, the strongest closer is one sentence of synthesis: *"One process, nine domain modules, and the patterns — singleton, observer, adapter — are just the named joints holding it together."*

---

## Appendix A — Patterns in the codebase NOT on slides (Q&A ammo)

If someone asks "any other patterns?", you have seven more, all with file evidence:

| Pattern | Category | Where | One-liner |
|---|---|---|---|
| **Repository** | Structural/architectural | `modules/*/domain/*.repository.interface.ts` + Prisma impls in `infrastructure/` | Domain defines the contract, infrastructure implements it — the dependency inversion at the heart of the clean modules |
| **Dependency Injection / IoC** | Creational | injection tokens in `task.module.ts`, `agent.module.ts`, `schedule.module.ts` | `{ provide: 'ITaskRepository', useClass: PrismaTaskRepository }` — swap implementations in one line |
| **Proxy** | Structural | `modules/dev/llm-proxy.controller.ts` | Protection proxy: same interface as the LLM provider + token auth + usage budget |
| **Registry** | Behavioral | `modules/agent/application/tools/tool-registry.ts` | Name → handler map; LLM tool calls dispatched by string lookup |
| **Strategy** | Behavioral | `task.tools.ts`, `schedule.tools.ts` | Interchangeable tool providers plugged into the registry (implicit/duck-typed contract) |
| **Chain of Responsibility** | Behavioral | global `LoggingInterceptor` + `@UseGuards(JwtAuthGuard)` | Request → guard → interceptor → handler; any link can short-circuit (401) |
| **Decorator** | Structural | `common/decorators/user.decorator.ts` + NestJS decorators | `@CurrentUser()` injects the authenticated user into handlers without the handler knowing about HTTP/JWT |

Plus: `task.entity.ts` / `schedule.entity.ts` are **rich domain entities** — state transitions guard their own preconditions, so business rules live in the domain, not in services.

## Appendix B — Numbers and facts to have ready

- **9 backend modules**; 3 layered (agent, task, schedule), rest flat
- **10 design patterns** identified with file:line evidence (see `saku-backend/docs/ARCHITECTURE.md`)
- **4 layers** in clean modules: presentation → application → domain ← infrastructure
- **1 process, 1 database, 1 connection pool** — the monolith claim in numbers
- **2 known layering violations**, documented deliberately
- Full architecture doc with mermaid diagrams: `saku-backend/docs/ARCHITECTURE.md`

## Appendix C — Glossary one-liners (say these without thinking)

- **Modular monolith** — one deployable, internally split into modules with enforced boundaries.
- **Clean architecture** — layers with the dependency rule: dependencies point inward, domain depends on nothing, infrastructure implements domain interfaces.
- **Layered vs clean** — both have layers; clean inverts the data-access dependency via interfaces. Classic layered lets business logic depend on the DB layer; clean forbids it.
- **Dependency inversion (the D in SOLID)** — high-level code depends on abstractions, and low-level code implements them — not the other way.
- **Singleton** — exactly one instance; here container-managed, not GoF-static.
- **Observer/pub-sub** — publisher emits once, broker (socket rooms) notifies all subscribers; sender doesn't know receivers.
- **Adapter** — translates between incompatible interfaces (typed method ↔ HTTP wire format).
- **Proxy** — same interface, added control (auth, metering).
