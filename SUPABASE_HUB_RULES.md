# Supabase Project Hub Rules — PassThePhone

App slug/schema: `pass_the_phone`

This application shares a Supabase project with independent applications.

## Core boundary

This app may normally modify only:

```text
pass_the_phone.*
```

It must not modify another application's objects.

## Mandatory first checks

```sql
select * from hub.read_me_first;

select
  app_number,
  slug,
  display_name,
  schema_name,
  status,
  safety_contract_version,
  safety_contract_acknowledged_at
from hub.apps
where slug = 'pass_the_phone';

select hub.assert_app_scope('pass_the_phone', 'pass_the_phone');
```

If any check fails: STOP.

## Database rules

- use fully-qualified names
- one app = one schema
- never create PassThePhone app tables in `public`
- enable RLS on every user-facing table
- do not create cross-app foreign keys
- keep migrations app-prefixed
- keep all app data and functions inside `pass_the_phone` unless an explicitly registered app-prefixed resource is required
- do not modify another app's Realtime configuration or publication membership

## Authentication

PassThePhone intentionally has no account/signup system. Player identity is room-scoped and should use opaque per-session credentials/tokens managed by the PassThePhone backend.

Do not modify `auth.users` or Project Hub Auth configuration for this app.

## Storage

PassThePhone V1 does not require Supabase Storage. If storage is added later, use only `pass_the_phone-` prefixed buckets after explicit registration.

## Functions

Use app-prefixed Edge Function names such as:

```text
pass_the_phone-game-api
```

Database functions must live inside `pass_the_phone`.

## Secrets

Never expose or commit:
- service-role key
- secret key
- database password
- project-level privileged credentials

The frontend may use only the Project Hub Supabase URL plus a publishable/anon key where needed. Privileged data access must remain server-side and strictly scoped to `pass_the_phone.*` after validating the app boundary.

## Realtime

Realtime may be used only for PassThePhone room/game/chat events. Do not change project-wide Realtime settings or another application's publication entries. If direct table subscriptions would weaken isolation, use an app-prefixed Edge Function and room-scoped broadcast/polling instead.

## High-risk operations

Ask the user before:
- project-wide Auth changes
- project-wide Realtime configuration changes
- key rotation
- extensions
- billing/compute/region changes
- project pause/delete
- any cross-app operation

## Destructive operations

Before DROP/DELETE/TRUNCATE:
- verify exact schema/object
- verify it belongs to `pass_the_phone`
- verify data-loss impact
- verify no cross-app dependency

If uncertain: STOP.
