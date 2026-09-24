# Changelog

All notable PassThePhone changes are documented here.

## Unreleased

### Added
- clearer host-facing Live Heat controls during active games;
- room-wide feedback when Heat moves up or down;
- regression coverage proving mid-game Heat changes preserve current question and existing session data.

## 0.1.0 — Production V1

### Product
- 3–15 player realtime rooms;
- QR / room-code joining;
- 20, 30, 40, and Unlimited sessions;
- 315 curated prompts across multiple categories;
- Heat 1–5;
- live category changes;
- attributable public choice reveals;
- anti-ping-pong turn balancing;
- live chat and reactions;
- host skip / end controls;
- awards, receipts, replay, and refresh recovery;
- installable PWA shell;
- shareable visual receipt cards;
- optional LiveKit voice/video rooms.

### Platform
- Next.js + React + TypeScript frontend;
- isolated `pass_the_phone` Project Hub schema;
- Supabase Realtime + Edge Functions;
- LiveKit server-side token flow;
- Vercel deployment;
- CI typecheck, production build, and multiplayer smoke testing.
