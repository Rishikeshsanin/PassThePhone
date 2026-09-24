# Testing

PassThePhone uses a small but high-value verification stack focused on multiplayer correctness.

## CI quality gates

The main workflow runs:

```bash
npm install --no-audit --no-fund
npm run typecheck
npm run build
node scripts/api-smoke.mjs
```

A change should not be merged if typecheck, production build, or the multiplayer smoke test fails.

## Multiplayer smoke test

`scripts/api-smoke.mjs` exercises the deployed PassThePhone backend with a temporary isolated room.

The covered path includes:

1. create a host room;
2. join multiple players;
3. configure the room;
4. start the game;
5. increase Heat while the current question is active;
6. verify the current question and round are unchanged;
7. submit a public choice;
8. verify next-turn progression;
9. verify the new Heat persists;
10. lower Heat again;
11. verify existing choices and progress remain intact;
12. send chat;
13. end the game;
14. verify results / awards;
15. replay.

Temporary CI rooms expire automatically.

## Manual release checklist

For visible / realtime releases, test on at least two devices:

- create + join with room code;
- QR join;
- lobby player list;
- start game;
- select a player;
- public A → B reveal;
- turn passes to the selected player;
- host Heat up/down mid-game;
- host category changes;
- skip;
- chat;
- reactions;
- refresh one device and recover;
- voice call;
- video call;
- end game;
- awards / receipts;
- share receipt;
- replay.

## Browser/media caveat

Automated tests can validate LiveKit credentials and token issuance, but they cannot prove a physical microphone, camera, speaker, or local browser permission is working. Real-device media testing is still required.
