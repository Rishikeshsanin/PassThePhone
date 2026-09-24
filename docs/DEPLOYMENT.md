# Deployment

PassThePhone uses Vercel for the Next.js application, Supabase Project Hub for multiplayer state, and LiveKit Cloud for optional voice/video.

## Production URL

https://passthephone-puce.vercel.app

## Vercel

The Vercel project is linked to the GitHub repository.

Required production environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...

LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

Keep `LIVEKIT_API_SECRET` server-side. Never prefix it with `NEXT_PUBLIC_`.

## Supabase

PassThePhone does not consume a dedicated Supabase project. It is registered inside the shared Project Hub as App #12 and is isolated to:

```text
pass_the_phone.*
```

Before any database change:

```sql
select hub.assert_app_scope('pass_the_phone', 'pass_the_phone');
```

Do not place ordinary app tables in `public` and do not modify another app's schema.

## LiveKit

The Next.js route `/api/livekit-token` validates the PassThePhone room session before minting a short-lived participant token.

A safe GET health check reports only booleans:

```json
{
  "configured": true,
  "credentialsValid": true,
  "urlValid": true
}
```

It never returns secrets.

## Release sequence

1. open a PR;
2. wait for CI;
3. merge only when typecheck, build, and multiplayer smoke test pass;
4. allow Vercel to deploy `main`;
5. verify the production URL;
6. inspect runtime errors;
7. run the manual two-device release checklist in [TESTING.md](./TESTING.md).

## Rollback

If a release has a production-only regression, use Vercel's previous successful production deployment as the rollback target, then fix forward through GitHub.

Database changes should be additive and scoped. Avoid destructive migrations for normal feature releases.
