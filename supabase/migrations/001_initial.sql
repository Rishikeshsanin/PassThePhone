-- PassThePhone / Project Hub onboarding migration.
-- Scope: ONLY the registered pass_the_phone schema.
select hub.assert_app_scope('pass_the_phone', 'pass_the_phone');

create schema if not exists pass_the_phone;
comment on schema pass_the_phone is 'Project Hub App #12: PassThePhone realtime social party game.';

-- Keep app data private from browser/Data API roles. The app-prefixed Edge Function
-- is the trusted boundary and validates opaque room-session tokens server-side.
revoke all on schema pass_the_phone from public, anon, authenticated;

create table pass_the_phone.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{5}$'),
  host_player_id uuid,
  status text not null default 'lobby' check (status in ('lobby','active','ended')),
  categories text[] not null default array['classic']::text[]
    check (
      cardinality(categories) between 1 and 8
      and categories <@ array['classic','funny','wholesome','personal','dark','adult','fantasy','popular']::text[]
    ),
  heat smallint not null default 2 check (heat between 1 and 5),
  session_length text not null default '30' check (session_length in ('20','30','40','unlimited')),
  question_limit integer check (question_limit is null or question_limit in (20,30,40)),
  allow_self boolean not null default true,
  chat_enabled boolean not null default true,
  round_number integer not null default 0 check (round_number >= 0),
  current_turn_player_id uuid,
  current_question jsonb,
  question_history text[] not null default '{}',
  custom_questions jsonb not null default '[]'::jsonb,
  final_results jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '6 hours')
);

create table pass_the_phone.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references pass_the_phone.rooms(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  name_key text not null,
  color text not null,
  initial text not null,
  session_token_hash text not null unique,
  is_host boolean not null default false,
  join_order integer not null check (join_order between 1 and 15),
  kicked boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table pass_the_phone.rooms
  add constraint pass_the_phone_rooms_host_player_fk
  foreign key (host_player_id) references pass_the_phone.players(id) on delete set null;

alter table pass_the_phone.rooms
  add constraint pass_the_phone_rooms_current_turn_player_fk
  foreign key (current_turn_player_id) references pass_the_phone.players(id) on delete set null;

create table pass_the_phone.choices (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references pass_the_phone.rooms(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  question_id text not null,
  question_text text not null,
  category text not null,
  intensity smallint not null check (intensity between 1 and 5),
  award_category text,
  chooser_player_id uuid not null references pass_the_phone.players(id) on delete cascade,
  chosen_player_id uuid not null references pass_the_phone.players(id) on delete cascade,
  next_turn_player_id uuid not null references pass_the_phone.players(id) on delete cascade,
  turn_shuffled boolean not null default false,
  created_at timestamptz not null default now(),
  unique(room_id, round_number)
);

create table pass_the_phone.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references pass_the_phone.rooms(id) on delete cascade,
  player_id uuid not null references pass_the_phone.players(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);

create index idx_pass_the_phone_rooms_expiry on pass_the_phone.rooms(expires_at);
create index idx_pass_the_phone_players_room on pass_the_phone.players(room_id);
create index idx_pass_the_phone_players_room_seen on pass_the_phone.players(room_id, last_seen_at desc);
create unique index idx_pass_the_phone_players_active_name_unique
  on pass_the_phone.players(room_id, name_key) where kicked = false;
create unique index idx_pass_the_phone_players_active_slot_unique
  on pass_the_phone.players(room_id, join_order) where kicked = false;
create index idx_pass_the_phone_choices_room on pass_the_phone.choices(room_id, round_number desc);
create index idx_pass_the_phone_choices_chosen on pass_the_phone.choices(room_id, chosen_player_id);
create index idx_pass_the_phone_chat_room_created on pass_the_phone.chat_messages(room_id, created_at desc);

alter table pass_the_phone.rooms enable row level security;
alter table pass_the_phone.players enable row level security;
alter table pass_the_phone.choices enable row level security;
alter table pass_the_phone.chat_messages enable row level security;

-- No browser policies by design. All gameplay state is mediated by the app Edge Function.
revoke all on all tables in schema pass_the_phone from public, anon, authenticated;
revoke all on all sequences in schema pass_the_phone from public, anon, authenticated;
alter default privileges in schema pass_the_phone revoke all on tables from public, anon, authenticated;
alter default privileges in schema pass_the_phone revoke all on sequences from public, anon, authenticated;

create or replace function pass_the_phone.expire_rooms()
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, pass_the_phone
as $$
declare
  deleted_count integer;
begin
  delete from pass_the_phone.rooms where expires_at < now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function pass_the_phone.expire_rooms() from public, anon, authenticated;

comment on table pass_the_phone.rooms is 'Temporary PassThePhone game rooms. Room activity extends expiry.';
comment on table pass_the_phone.players is 'Room-scoped players authenticated by opaque session tokens held only by each browser.';
comment on table pass_the_phone.choices is 'Public-in-room selection history used for reveals and final receipts.';
comment on table pass_the_phone.chat_messages is 'Temporary room chat; visible only through the PassThePhone game API.';
comment on function pass_the_phone.expire_rooms() is 'Deletes only expired rows inside the PassThePhone app schema.';
