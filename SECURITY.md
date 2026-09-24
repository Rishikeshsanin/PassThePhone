# Security Policy

PassThePhone is a room-scoped multiplayer application with a shared Supabase Project Hub backend.

## Supported version

Security fixes are applied to the current `main` branch and production deployment.

## Reporting a vulnerability

Please do **not** open a public GitHub issue containing:

- API keys or secrets;
- room tokens or credentials;
- private database information;
- screenshots exposing credentials;
- exploitable security details before a fix is available.

Use a private contact channel with the repository owner instead.

## Security model

PassThePhone intentionally follows these rules:

- browser clients do not receive privileged database credentials;
- player sessions use opaque room-scoped tokens;
- stored room credentials are hashed;
- direct browser table access is not the normal write path;
- RLS remains enabled as defense in depth;
- game writes are restricted to the registered `pass_the_phone` schema;
- LiveKit API secrets remain server-side;
- LiveKit participant tokens are minted only after validating a PassThePhone room session;
- no other Project Hub application schema is part of the runtime.

## Project Hub boundary

Any Supabase work must pass:

```sql
select hub.assert_app_scope('pass_the_phone', 'pass_the_phone');
```

Never solve a PassThePhone problem by changing another app schema or project-wide setting.

See [SUPABASE_HUB_RULES.md](./SUPABASE_HUB_RULES.md) for the complete boundary.
