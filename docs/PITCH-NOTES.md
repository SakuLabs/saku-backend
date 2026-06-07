# SAKU Deck — Catatan Pitch (Pitch Knowledge Notes)

Catatan mendalam per-slide buat presentasi `SAKU.pptx` dengan pede. Tiap slide ada: isi slide-nya apa, background knowledge di baliknya, talking points, dan kemungkinan Q&A beserta jawaban yang sudah disiapkan.

---

## Slide 1 — Title: "SAKU — Architecture & System Design"

**Isi slide:** SAKU · Plan / Strategy / Productivity · Academic Task Management Dashboard.

**Saku itu apa (elevator pitch 15 detik):**
> "Saku itu dashboard manajemen tugas akademik — tasks, schedules, plus AI assistant yang bisa ngatur dua-duanya lewat chat. Dibangun sebagai modular monolith pakai NestJS dan Next.js."

**Background yang harus kamu hafal di luar kepala:**
- **Tiga app dalam satu monorepo:** `saku-backend` (NestJS REST API + WebSocket), `saku-frontend` (Next.js 16 App Router), `saku-landing` (landing page).
- **Fitur inti:** task management (state machine: start/complete/reset dengan precondition checks), scheduling (conflict detection, aturan durasi), realtime chat (presence, notifications, unread counts), dan LLM agent yang bisa manipulasi tasks/schedules lewat tool calls.
- **Stack satu kalimat:** NestJS 11 + Prisma + JWT auth di backend; Next.js + custom hooks (tanpa Redux) di frontend.

**Tips:** slide ini cuma 10 detik. Sebut nama, fungsinya apa, lanjut.

---

## Slide 2 — Team: "Who Built Saku?"

**Isi slide:** Theola Aristo P.N (Coffee Engineer), Greshen Chin (Task Overthinker), Mario Terano (Schedule Destroyer), Clay Daryan Stanly (Professional Deadline Extender), Marchello (Productivity Guru). "Five students. Countless deadlines. One collective panic attack. So we built Saku."

**Catatan delivery:**
- Title becandanya works — bacain dengan muka datar, biarin audiens ketawa, jangan dijelasin.
- Narrative hook-nya genuine: **kalian bikin tool yang kalian butuhin sendiri**. "Kami sendiri target user-nya" itu argumen produk yang beneran kuat — sebut sekali, dengan serius, setelah ketawanya reda.
- Maksimal 30 detik. Slide tim langsung mati kalau tiap anggota dapet biografi.

---

## Slide 3 — "How Saku Is Built: Modular Monolith with Domain-Driven Modules"

**Isi slide:** Domain-driven module boundaries · Loose coupling through dependency injection · Clear module boundaries for future scaling.

Ini slide yang paling banyak bakal dapet pertanyaan. Kuasai section ini paling dalam.

### Klaimnya, secara presisi

- **Monolith** = satu deployable unit: satu proses NestJS, satu database, satu connection pool. Antar-module ngobrol in-process lewat dependency injection — nggak pernah lewat network.
- **Modular** = codebase dipecah jadi 9 NestJS feature modules di `src/modules/`: `agent`, `task`, `schedule`, `auth`, `chat`, `user`, `social`, `health`, `dev`. Semuanya didaftarkan di `app.module.ts`.
- **Domain-driven modules** = module dipecah berdasarkan *business domain* (task, schedule, agent, chat), bukan berdasarkan technical role (nggak ada folder `controllers/`, `services/` di level atas). Itu persis yang diklaim frasa ini — nggak lebih, nggak kurang.

### Nuansa yang sebaiknya kamu sebut duluan kalau didesak

Ada dua gaya internal yang sengaja dibiarkan coexist:
- **Layered / Clean Architecture** di 3 domain kompleks — `agent`, `task`, `schedule` masing-masing punya `presentation/ → application/ → domain/ ← infrastructure/`. Dependency rule menunjuk ke dalam; infrastructure *mengimplementasi* interface milik domain (dependency inversion).
- **Flat (standard NestJS)** di module simpel — `auth`, `chat`, `user`, `social`: controller → service → Prisma. Ini layout default hasil `nest g resource`.

Alasannya: **layering baru worth it kalau module-nya numpuk invariants** (aturan bisnis yang harus selalu berlaku). Task punya state machine; schedule punya aturan konflik; agent meng-orchestrate LLM. Auth cuma nerbitin JWT — empat layer di situ cuma jadi seremoni.

### Penjelasan tiap bullet

1. **"Domain-driven module boundaries"** — tiap module memiliki data access, logic, dan endpoints domain-nya sendiri. Semua tentang scheduling ada di satu folder.
2. **"Loose coupling through dependency injection"** — module bergantung ke abstraksi. Contoh konkret: `{ provide: 'ITaskRepository', useClass: PrismaTaskRepository }` di `task.module.ts`. Use-case nggak pernah import Prisma.
3. **"Clear module boundaries for future scaling"** — scaling dalam dua arti:
   - *Runtime:* API-nya stateless (JWT), jadi bisa jalanin N instance di belakang load balancer hari ini juga.
   - *Organisasional:* kalau suatu saat ada domain yang butuh deployment terpisah, batas module-nya jadi extraction seam — repository interface-nya jadi API surface service barunya.

### Kemungkinan Q&A

**Q: Kenapa nggak microservices?**
> "Lima mahasiswa, satu produk, satu database. Microservices ngasih independent deployment dan team autonomy, tapi bayarnya network failures, distributed transactions, dan ops overhead — biaya yang langsung kami tanggung sekarang untuk benefit yang belum kami butuhkan. Modular monolith ngasih boundaries tanpa distribusi. Kalau nanti ada module yang perlu scale sendiri, seam-nya sudah ada."

**Q: Cara scaling-nya gimana?**
> "Horizontal — REST API-nya stateless dengan JWT, jadi beberapa instance di belakang load balancer langsung jalan. Satu caveat: WebSocket — scaling chat gateway lintas instance butuh sticky sessions atau Redis pub/sub adapter biar message yang di-publish di satu instance nyampe ke client yang connect di instance lain."

(Nyebut caveat ini tanpa ditanya nilainya lebih tinggi dari slide-nya sendiri.)

**Q: Kenapa NestJS?**
> "Module system + DI container-nya bikin 'modular monolith' itu enforceable, bukan sekadar niat — plus guards/interceptors buat cross-cutting concerns dan TypeScript first-class."

**Q: Ini Clean Architecture / DDD bukan?**
> "Tiga domain kompleks pakai clean architecture secara internal — domain entities, repository interfaces, infrastructure yang mengimplementasinya. Kami nggak klaim full DDD (nggak ada formal bounded contexts atau aggregates), tapi pembagian module-nya domain-driven."

**Q (nyerang): Ada pelanggaran arsitektur nggak?**
> Akui aja: "Ada dua yang kami tahu, terdokumentasi di architecture doc biar nggak ditiru: satu domain interface meng-import type dari infrastructure — pelanggaran dependency inversion yang akan kami perbaiki dengan mindahin type-nya ke domain — dan satu controller inject Prisma langsung. Mendokumentasikan pelanggaran lebih baik daripada pura-pura nggak ada."

---

## Slide 4 — "PrismaService as a Singleton" — *One instance. Shared everywhere.*

**Isi slide:** Singleton pattern (creational), PrismaService.

### Mekanismenya

- `PrismaService` (`src/prisma/prisma.service.ts`) extends `PrismaClient` dan tinggal di module ber-`@Global()`.
- Provider NestJS itu **singleton-scoped by default**: DI container membangun satu instance per application lifecycle dan ngasih instance yang *sama* ke semua consumer — `AgentService`, `ChatService`, semua Prisma repository.
- Lifecycle hooks: `OnModuleInit` connect ke database saat startup, `OnModuleDestroy` disconnect saat shutdown — connection management yang bersih.

### Kenapa penting (the "so what")

> "Tiap instance PrismaClient megang connection pool database-nya sendiri. Kalau tiap service bikin client sendiri, pool-nya berlipat dan connection limit database bisa habis. Satu shared instance = satu pool = pemakaian koneksi yang predictable."

### Poin canggihnya (sebut duluan)

Ini **DI-managed singleton, bukan GoF singleton klasik**:
- GoF singleton: private constructor + static `getInstance()` — class-nya *memaksakan* keunikannya sendiri. Kekurangan: hidden global state, susah di-mock pas testing.
- Di sini: class-nya `@Injectable()` biasa; *container* yang menjamin keunikan. Test bisa substitusi mock dengan override provider. Jaminan sama, tanpa biaya testability.

### Kemungkinan Q&A

**Q: Bukannya singleton itu anti-pattern?**
> "Versi GoF yang static sering iya, karena hidden global state. Container-managed singleton menghindari itu: dependency-nya eksplisit di constructor dan bisa di-swap pas test. *Intent* pattern-nya — tepat satu instance — justru persis yang dibutuhkan connection pool."

**Q: Gimana dengan request-scoped providers?**
> "NestJS support, tapi request scope bikin instance per-request — justru salah untuk connection pool, dan ada performance cost. Singleton di sini pilihan yang disengaja."

---

## Slide 5 — "ChatGateway as an Observer" — *Publish once. Notify everyone.*

**Isi slide:** Observer pattern (behavioral), ChatGateway.

### Mekanismenya

- `ChatGateway` (`src/modules/chat/chat.gateway.ts`) adalah WebSocket gateway yang implement `OnGatewayConnection` / `OnGatewayDisconnect`.
- **Subscribe:** client connect lewat WebSocket dan join user room-nya. Beberapa device dari user yang sama join room yang sama (laptop + HP dua-duanya dapet notif).
- **Publish:** gateway emit event — `server.to(room).emit('message')` — ke semua socket yang subscribe ke room itu.
- Event yang lewat: chat messages, presence sync, notifications, unread counts.

### Pemetaan ke pattern-nya

| Konsep Observer | Di Saku |
|---|---|
| Subject (publisher) | `ChatGateway` dengan `@WebSocketServer()` |
| Observers (subscribers) | Client sockets yang connect, dikelompokkan per room |
| Subscribe | Connect + join room |
| Notify | `server.to(room).emit(event, payload)` |

Decoupling-nya itu intinya: **pengirim nggak tahu siapa yang nerima**. Message di-publish sekali; gateway notify semua subscriber saat itu. Nambah device ketiga atau event type baru nggak mengubah apa pun di sisi pengirim.

### Nuansa Observer vs Pub-Sub (kalau ada yang pedantic)

> "Secara strict: Observer klasik itu subject pegang referensi langsung ke observers; pub-sub naruh broker di antaranya. Socket rooms berperan sebagai layer broker itu, jadi ini pub-sub — versi terdistribusinya Observer. Intent-nya sama: decouple publisher dari subscribers."

### Kemungkinan Q&A

**Q: Kenapa WebSocket, bukan polling?**
> "Push menang dari poll untuk chat: latency lebih rendah (nggak nunggu interval poll), load lebih rendah (nggak ada poll kosong), dan presence dapet gratis — koneksinya sendiri itu sinyal 'online'."

**Q: Scaling-nya gimana?**
> "Single instance: aman apa adanya. Multi-instance: butuh Redis adapter biar emit di instance A nyampe ke socket yang connect di instance B, plus sticky sessions buat handshake. Jalurnya sudah diketahui, belum dibutuhkan."

---

## Slide 6 — "LlmClient as an Adapter" — *Typed application API. External provider API. The adapter translates between them.*

**Isi slide:** Adapter pattern (structural), LlmClient.

### Mekanismenya

`LlmClient` (`src/modules/agent/infrastructure/llm/llm.client.ts`) duduk di antara dua interface yang nggak kompatibel:

- **Sisi aplikasi:** method TypeScript yang typed — `chat(messages: LlmMessage[], tools: LlmToolDef[]): Promise<LlmResponseMessage>`.
- **Sisi provider:** HTTP mentah — `POST /chat/completions` dengan JSON body OpenAI-compatible, bearer auth, streaming flags, unwrap `choices[0].message`.

Adapter yang memiliki semua translasinya:
- Membentuk request (model, messages, tools, `tool_choice: 'auto'`)
- Unwrap response (`choices[0].message`, validasi ada/nggaknya)
- Map kegagalan transport ke error yang sesuai domain (`BadGatewayException` dengan pesan user-facing)
- Handle timeout via `AbortController`

**Payoff-nya:** seluruh app nggak pernah nyentuh wire format. `AgentService` manggil typed method; kalau provider ganti, yang berubah cuma adapter-nya. Letaknya di layer `infrastructure/` — persis tempat clean architecture bilang translasi dunia-luar harus berada.

### Bonus knowledge — Proxy di sebelahnya (amunisi Q&A bagus)

Ada **pattern kedua yang berbeda** di subsystem yang sama: `LlmProxyController` (`src/modules/dev/`) adalah **protection proxy** — endpoint dev-only supaya teman setim bisa jalanin agent secara lokal *tanpa megang API key asli*:
- Meng-expose interface `/chat/completions` yang **sama** dengan provider (tanpa translasi — itu yang bikin dia proxy, bukan adapter)
- Nambah access control: shared proxy token (timing-safe comparison), 404 total di production
- Nambah accounting: budget token bulanan, metering pemakaian per request
- `LlmClient` otomatis switch ke proxy ini kalau `LLM_PROXY_URL` di-set

### Taksonomi pattern (hafal mati — pertanyaan ujian klasik)

| Pattern | Interface masuk vs keluar | Tugas |
|---|---|---|
| **Adapter** | *Beda* | Translasi antara interface yang nggak kompatibel |
| **Proxy** | *Sama* | Kontrol akses (auth, metering, caching) |
| **Facade** | *Lebih simpel* | Satu pintu masuk yang menyembunyikan banyak subsystem |

> "LlmClient mengkonversi interface → Adapter. LlmProxyController mempertahankan interface dan nambah kontrol → Proxy. Kami nggak punya Facade di subsystem ini — itu berarti satu class yang menyembunyikan beberapa subsystem di balik API yang disederhanakan."

### Kemungkinan Q&A

**Q: Kalau LLM-nya down gimana?**
> "Adapter map semua kegagalan — timeout, non-200, response rusak — ke `BadGatewayException` dengan pesan ramah user. Fitur agent degrade; tasks dan schedules tetap jalan karena adapter menahan kegagalannya di boundary infrastructure."

**Q: Bisa ganti LLM provider?**
> "Kalau provider barunya OpenAI-compatible, cukup ganti env var. Kalau nggak, ganti satu file — adapter-nya. Di atas infrastructure nggak ada yang tahu wire format."

---

## Slide 7 — Closing: "Saku is done. Our assignments are not."

**Isi slide:** "Thanks for listening. Now we have to survive finals :) Open source, btw."

**Catatan delivery:**
- "Open source, btw" — siapkan GitHub org buat disebut atau ditunjukin: **github.com/SakuLabs**.
- Kalau masih ada waktu, closer terkuat itu satu kalimat sintesis: *"Satu proses, sembilan domain module, dan pattern-pattern tadi — singleton, observer, adapter — cuma sendi-sendi bernama yang nyatuin semuanya."*

---

## Appendix A — Pattern di codebase yang NGGAK ada di slide (amunisi Q&A)

Kalau ada yang nanya "ada pattern lain?", kamu punya tujuh lagi, semua dengan bukti file:

| Pattern | Kategori | Lokasi | Satu kalimat |
|---|---|---|---|
| **Repository** | Structural/architectural | `modules/*/domain/*.repository.interface.ts` + impl Prisma di `infrastructure/` | Domain mendefinisikan kontrak, infrastructure mengimplementasi — dependency inversion di jantung module yang clean |
| **Dependency Injection / IoC** | Creational | injection tokens di `task.module.ts`, `agent.module.ts`, `schedule.module.ts` | `{ provide: 'ITaskRepository', useClass: PrismaTaskRepository }` — ganti implementasi cukup satu baris |
| **Proxy** | Structural | `modules/dev/llm-proxy.controller.ts` | Protection proxy: interface sama dengan LLM provider + token auth + budget pemakaian |
| **Registry** | Behavioral | `modules/agent/application/tools/tool-registry.ts` | Map nama → handler; tool call dari LLM di-dispatch lewat string lookup |
| **Strategy** | Behavioral | `task.tools.ts`, `schedule.tools.ts` | Tool provider yang interchangeable, dicolok ke registry (kontrak implisit/duck-typed) |
| **Chain of Responsibility** | Behavioral | global `LoggingInterceptor` + `@UseGuards(JwtAuthGuard)` | Request → guard → interceptor → handler; tiap mata rantai bisa short-circuit (401) |
| **Decorator** | Structural | `common/decorators/user.decorator.ts` + decorator NestJS | `@CurrentUser()` meng-inject authenticated user ke handler tanpa handler tahu soal HTTP/JWT |

Plus: `task.entity.ts` / `schedule.entity.ts` itu **rich domain entities** — state transition menjaga precondition-nya sendiri, jadi aturan bisnis hidup di domain, bukan di service.

## Appendix B — Angka dan fakta yang harus siap

- **9 backend modules**; 3 layered (agent, task, schedule), sisanya flat
- **10 design patterns** teridentifikasi dengan bukti file:line (lihat `saku-backend/docs/ARCHITECTURE.md`)
- **4 layers** di module clean: presentation → application → domain ← infrastructure
- **1 proses, 1 database, 1 connection pool** — klaim monolith dalam angka
- **2 pelanggaran layering** yang diketahui, sengaja didokumentasikan
- Dokumen arsitektur lengkap dengan mermaid diagrams: `saku-backend/docs/ARCHITECTURE.md`

## Appendix C — Glosarium satu kalimat (harus keluar tanpa mikir)

- **Modular monolith** — satu deployable, di dalamnya dipecah jadi module dengan boundary yang ditegakkan.
- **Clean architecture** — layer dengan dependency rule: dependency menunjuk ke dalam, domain nggak bergantung ke apa pun, infrastructure mengimplementasi interface domain.
- **Layered vs clean** — dua-duanya punya layer; clean membalik dependency data-access lewat interface. Layered klasik membiarkan business logic bergantung ke layer DB; clean melarangnya.
- **Dependency inversion (D di SOLID)** — kode high-level bergantung ke abstraksi, dan kode low-level yang mengimplementasinya — bukan sebaliknya.
- **Singleton** — tepat satu instance; di sini container-managed, bukan GoF-static.
- **Observer/pub-sub** — publisher emit sekali, broker (socket rooms) notify semua subscriber; pengirim nggak tahu penerimanya.
- **Adapter** — translasi antara interface yang nggak kompatibel (typed method ↔ HTTP wire format).
- **Proxy** — interface sama, ditambah kontrol (auth, metering).
