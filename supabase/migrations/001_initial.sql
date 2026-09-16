-- PassThePhone isolated schema
-- Run only inside the dedicated PassThePhone Supabase project.

create extension if not exists pgcrypto;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_user_id uuid not null,
  status text not null default 'lobby' check (status in ('lobby','active','ended')),
  categories text[] not null default array['classic']::text[],
  heat int not null default 2 check (heat between 1 and 5),
  session_length text not null default '30' check (session_length in ('20','30','40','unlimited')),
  question_limit int null check (question_limit is null or question_limit in (20,30,40)),
  allow_self boolean not null default true,
  chat_enabled boolean not null default true,
  round_number int not null default 0,
  current_turn_player_id uuid null,
  current_question jsonb null,
  question_history text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null,
  name text not null check (char_length(name) between 1 and 24),
  color text not null,
  join_order int not null,
  connected boolean not null default true,
  created_at timestamptz not null default now(),
  unique(room_id, user_id)
);
create unique index players_room_name_unique on public.players(room_id, lower(name));
create index players_room_idx on public.players(room_id);

alter table public.rooms add constraint rooms_current_turn_player_fkey foreign key (current_turn_player_id) references public.players(id) on delete set null;

create table public.choices (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_number int not null,
  question_id text not null,
  question_text text not null,
  category text not null,
  intensity int not null check (intensity between 1 and 5),
  chooser_player_id uuid not null references public.players(id) on delete cascade,
  chosen_player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(room_id, round_number)
);
create index choices_room_idx on public.choices(room_id, round_number);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);
create index chat_room_created_idx on public.chat_messages(room_id, created_at);

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.choices enable row level security;
alter table public.chat_messages enable row level security;

create or replace function public.is_room_member(p_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.players p where p.room_id = p_room_id and p.user_id = auth.uid());
$$;

create policy "rooms create own" on public.rooms for insert to authenticated with check (host_user_id = auth.uid());
create policy "rooms read lobby or member" on public.rooms for select to authenticated using (status = 'lobby' or public.is_room_member(id));
create policy "rooms host update" on public.rooms for update to authenticated using (host_user_id = auth.uid()) with check (host_user_id = auth.uid());

create policy "players join lobby" on public.players for insert to authenticated with check (
  user_id = auth.uid()
  and exists(select 1 from public.rooms r where r.id = room_id and r.status = 'lobby')
  and (select count(*) from public.players p where p.room_id = room_id) < 15
);
create policy "players read room" on public.players for select to authenticated using (
  public.is_room_member(room_id)
  or exists(select 1 from public.rooms r where r.id = room_id and r.status = 'lobby')
);
create policy "players update self" on public.players for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "host removes lobby players" on public.players for delete to authenticated using (
  exists(select 1 from public.rooms r where r.id = room_id and r.host_user_id = auth.uid() and r.status = 'lobby')
);

create policy "choices read room" on public.choices for select to authenticated using (public.is_room_member(room_id));
create policy "chat read room" on public.chat_messages for select to authenticated using (public.is_room_member(room_id));
create policy "chat insert as self" on public.chat_messages for insert to authenticated with check (
  public.is_room_member(room_id)
  and exists(select 1 from public.players p where p.id = player_id and p.room_id = room_id and p.user_id = auth.uid())
);

create or replace function public.make_choice(
  p_room_id uuid,
  p_chosen_player_id uuid,
  p_next_question jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
  v_chooser public.players;
  v_question jsonb;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if v_room.id is null or v_room.status <> 'active' then raise exception 'Room is not active'; end if;
  select * into v_chooser from public.players where id = v_room.current_turn_player_id and room_id = p_room_id;
  if v_chooser.user_id <> auth.uid() then raise exception 'Not your turn'; end if;
  if not exists(select 1 from public.players where id = p_chosen_player_id and room_id = p_room_id) then raise exception 'Invalid player'; end if;
  v_question := v_room.current_question;
  if coalesce((v_question->>'allowSelf')::boolean, true) = false and p_chosen_player_id = v_chooser.id then raise exception 'Self choice is not allowed'; end if;

  insert into public.choices(room_id, round_number, question_id, question_text, category, intensity, chooser_player_id, chosen_player_id)
  values (
    p_room_id,
    v_room.round_number,
    v_question->>'id',
    v_question->>'text',
    v_question->>'category',
    coalesce((v_question->>'intensity')::int, 1),
    v_chooser.id,
    p_chosen_player_id
  );

  update public.rooms
  set current_turn_player_id = p_chosen_player_id,
      round_number = round_number + 1,
      current_question = p_next_question,
      question_history = case when p_next_question is null then question_history else array_append(question_history, p_next_question->>'id') end,
      updated_at = now()
  where id = p_room_id;
end;
$$;

grant execute on function public.make_choice(uuid, uuid, jsonb) to authenticated;

-- Enable realtime publication for the game tables.
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.choices;
alter publication supabase_realtime add table public.chat_messages;
