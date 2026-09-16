# PassThePhone

**Pick someone. Pass the turn. Find out what your friends really think.**

PassThePhone is a real-time multiplayer party game for 3–15 friends. One person receives a question, publicly chooses the friend who fits best, and that selected friend immediately gets the next turn. The chain keeps moving until the host ends the session.

## Why it is different

Most social party apps either collect anonymous votes or make everyone answer at once. PassThePhone makes every choice attributable and turns the selection itself into the turn-passing mechanic:

`Rishi → Rahul → Aryan → Karthik → ...`

Every device sees the reveal at the same time, which creates the actual entertainment: arguments, reactions, inside jokes and unexpected wholesome moments.

## Core features

- 3–15 player realtime rooms
- Short room codes + QR joining
- 20 / 30 / 40 / Unlimited session modes
- No question repeats inside one session
- Category mixing: Classic, Funny, Wholesome, Personal, Dark, 18+, Fantasy and Popular
- **Heat 1–5**: the host can turn question intensity up or down while the game is running
- Public animated choice reveals
- Live chat
- Host controls for heat, categories, skip and end-game
- Final data-driven awards and receipts
- Anonymous auth: no signup screen
- Mobile-first responsive UI

## Stack

- Next.js + TypeScript
- Tailwind CSS
- Supabase Postgres + Realtime + Anonymous Auth
- Vercel
- LiveKit-ready environment hooks for the voice/video phase

## Architecture

```text
Browser clients
   │
   ├── Anonymous Supabase session
   ├── Realtime room/player subscriptions
   ├── Realtime choice reveals
   └── Realtime chat
   │
Supabase
   ├── rooms
   ├── players
   ├── choices
   └── chat_messages
```

The actual question catalogue ships with the application and is selected using a category-aware, Heat-aware scoring engine. Game state stays in a dedicated Supabase project so PassThePhone cannot touch data belonging to any other app.

## Local setup

1. Create a **dedicated** Supabase project for PassThePhone.
2. Enable Anonymous Sign-Ins in Supabase Auth.
3. Run `supabase/migrations/001_initial.sql` in that project only.
4. Copy `.env.example` to `.env.local` and fill:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

5. Install and run:

```bash
npm install
npm run dev
```

## Product rules

- Max 15 players per room.
- A question never repeats in the same session.
- Fixed sessions recommend 30 questions, but the host can keep playing after the nominal limit.
- Unlimited mode ends only when the host ends it.
- Heat changes intensity within the current category instead of blindly making every question offensive.
- Wholesome Heat means deeper/more personal; Dark/Comedy Heat means bolder.

## Safety / privacy

Rooms are temporary social sessions. No permanent profiles are required. Supabase RLS isolates room access, anonymous auth gives each browser a stable temporary identity, and the database is intentionally separate from every other project.

## Roadmap

- [x] Product architecture
- [x] Premium responsive UI
- [x] Room create/join flow
- [x] Lobby + QR
- [x] Realtime room model
- [x] Pass-the-turn game loop
- [x] Heat/category/session controls
- [x] Live chat
- [x] Session awards engine
- [ ] Expand curated question catalogue to 500+
- [ ] Voice/video rooms via dedicated LiveKit project
- [ ] Floating live reactions
- [ ] PWA install flow
- [ ] Shareable final receipt card
- [ ] Multi-device QA + reconnect hardening

---

Built as a real consumer party product, not a static portfolio demo.
