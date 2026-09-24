# Contributing to PassThePhone

Thanks for helping improve PassThePhone.

## Ground rules

PassThePhone is a live multiplayer product, so changes should preserve three things above everything else:

1. **Room state must stay consistent** across devices.
2. **No existing Project Hub app may be touched** outside the registered `pass_the_phone` scope.
3. **The main game loop must remain fast and understandable** on mobile.

Before changing anything related to Supabase, read:

- [AGENTS.md](./AGENTS.md)
- [SUPABASE_HUB_RULES.md](./SUPABASE_HUB_RULES.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Testing](./docs/TESTING.md)

## Local development

```bash
git clone https://github.com/Rishikeshsanin/PassThePhone.git
cd PassThePhone
npm install
npm run dev
```

The app is available at `http://localhost:3000`.

## Quality checks

Before opening a pull request, run:

```bash
npm run typecheck
npm run build
```

The multiplayer smoke test is designed for CI / an environment with the required public Supabase values:

```bash
node scripts/api-smoke.mjs
```

It verifies the critical multiplayer path including room creation, joining, mid-game Heat changes, choices, chat, results, and replay.

## Pull request expectations

A good PR should:

- explain **what changed and why**;
- mention any gameplay or state-management impact;
- include screenshots for visible UI changes;
- avoid unrelated refactors;
- preserve mobile responsiveness;
- preserve reduced-motion behavior;
- preserve Project Hub isolation;
- keep secrets out of commits, logs, screenshots, and issue bodies.

Use the repository pull request template.

## Question catalogue changes

When adding prompts:

- keep wording concise and natural;
- avoid near-duplicates;
- assign the correct category and Heat;
- keep `18+` mature but non-explicit;
- avoid discriminatory, hateful, or unsafe prompts;
- preserve the no-repeat guarantees of the current session engine.

## Security issues

Do **not** open a public issue for vulnerabilities or exposed credentials. See [SECURITY.md](./SECURITY.md).
