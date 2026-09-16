# PassThePhone

**Pick someone. Pass the turn. Find out what your friends really think.**

PassThePhone is a real-time multiplayer party game for **3–15 friends**. One person receives a question, publicly chooses the friend who fits best, and that selected friend normally receives the next turn. The chain keeps moving until the selected session length is complete or the host ends an Unlimited game.

## Why it is different

Most social party games either collect anonymous votes or make everyone answer at once. PassThePhone makes every choice attributable and turns the selection itself into the turn-passing mechanic:

`Rishi → Rahul → Aryan → Karthik → ...`

Every device sees the reveal, which creates the actual entertainment: arguments, reactions, inside jokes and unexpectedly wholesome moments.

## Core features

- 3–15 player real-time rooms
- Short room codes + QR joining
- **20 / 30 / 40 / Unlimited** session modes
- No question repeats inside one session
- 315 curated V1 prompts
- Category mixing: Classic, Funny, Wholesome, Personal, Dark, 18+, Fantasy and Popular
- **Heat 1–5**: the host can turn question intensity up or down while the game is running
- Category changes during an active game
- Public animated choice reveals
- Anti-ping-pong turn balancing for large groups
- Live chat + floating emoji reactions
- Host controls for Heat, categories, skip and end-game
- Final data-driven awards, strongest-chain stats and receipts
- No account/signup flow
- Room/session recovery after refresh
- Mobile-first responsive UI with reduced-motion support

## Stack

- Next.js 15 + React 19 + TypeScript
- Tailwind CSS
- Supabase Postgres + Realtime + Edge Functions
- Vercel
- LiveKit-ready roadmap for optional voice/video rooms

## Architecture

```text
Browser clients
   │
   ├── room-scoped opaque session token
   ├── secure PassThePhone Edge API
   ├── Realtime broadcast for low-latency refresh/reactions
   └── polling fallback for resilience
   │
Supabase Project Hub
   │
   └── pass_the_phone schema (App #12)
        ├── rooms
        ├── players
        ├── choices
        └── chat_messages
```

PassThePhone intentionally uses the existing shared **Project Hub** instead of consuming a dedicated Supabase project. Its application data is isolated to `pass_the_phone.*` and registered `pass_the_phone`-prefixed resources.

The browser never receives direct table privileges. The Edge API validates an opaque per-player room token and performs scoped server-side operations against the private `pass_the_phone` schema. No other application schema is part of the game runtime.

The question catalogue ships with the application and is selected by a category-aware, Heat-aware scoring engine. Used question IDs are stored with the room so prompts cannot repeat during the same session, including skipped prompts.

## Game modes

| Mode | Behavior |
| --- | --- |
| 20 | Quick session; results after question 20 |
| 30 | Recommended/default session |
| 40 | Longer group session |
| Unlimited | Keeps serving unused prompts until the host ends the game or the available pool is exhausted |

## Heat

Heat is category-aware rather than a generic “make it offensive” switch.

- **Funny:** playful → embarrassing → chaotic
- **Personal:** casual → revealing → more personal
- **Dark:** mild dark humor → bolder hypothetical humor
- **Wholesome:** light positivity → deeper friendship questions
- **18+:** mature dating/relationship questions; still non-explicit
- **Fantasy:** light hypotheticals → higher-stakes fictional scenarios

## Project Hub safety

Read these before changing Supabase resources:

- `AGENTS.md`
- `SUPABASE_HUB_RULES.md`

The required preflight is:

```sql
select hub.assert_app_scope('pass_the_phone', 'pass_the_phone');
```

Do not create ordinary PassThePhone tables in `public`, do not modify another app schema, and do not change project-wide configuration as a shortcut.

## Local setup

```bash
npm install
npm run dev
```

Browser-safe Supabase values are provided through `src/lib/supabase-public.ts`; environment variables can override them:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Privileged database credentials are never exposed to the browser. Deployed Edge Functions use Supabase-provided server runtime secrets.

## Verification

The CI pipeline runs:

```bash
npm run typecheck
npm run build
node scripts/api-smoke.mjs
```

The live smoke test creates an isolated temporary PassThePhone room and verifies the critical path:

`create → join 3 players → configure → start → choose → next question → chat → end → awards → replay`

Test rooms expire automatically.

## Safety & privacy

- No permanent user profiles are required.
- Room credentials are random and room-scoped; only their SHA-256 hashes are stored.
- Rooms are temporary and expire after inactivity.
- Direct browser access to PassThePhone tables is denied.
- RLS remains enabled as defense in depth.
- Database writes are restricted to the registered `pass_the_phone` schema.

## Roadmap

- [x] Product architecture
- [x] Premium responsive UI
- [x] Shared Project Hub isolation
- [x] Secure room create/join flow
- [x] Lobby + QR
- [x] Pass-the-turn game loop
- [x] 20 / 30 / 40 / Unlimited sessions
- [x] Heat + multi-category controls
- [x] 315-question curated catalogue
- [x] Live chat + reactions
- [x] Awards + receipts
- [x] Replay flow
- [x] Build/typecheck CI
- [x] Live backend smoke-test harness
- [ ] Optional voice/video rooms
- [ ] PWA install flow
- [ ] Exportable visual receipt card
- [ ] Expand the curated catalogue further based on real play feedback

---

Built as a real consumer party product, not a static portfolio demo.
