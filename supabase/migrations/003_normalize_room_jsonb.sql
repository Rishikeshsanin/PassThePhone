-- PassThePhone / Project Hub JSONB boundary hardening.
-- Some server drivers can serialize a JS object into a JSONB scalar string when a
-- parameter is cast directly to jsonb. Normalize those values inside the app schema
-- so room state always exposes real JSON objects.
select hub.assert_app_scope('pass_the_phone', 'pass_the_phone');

create or replace function pass_the_phone.normalize_room_jsonb()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pass_the_phone
as $$
begin
  if new.current_question is not null and jsonb_typeof(new.current_question) = 'string' then
    new.current_question := (new.current_question #>> '{}')::jsonb;
  end if;

  if new.final_results is not null and jsonb_typeof(new.final_results) = 'string' then
    new.final_results := (new.final_results #>> '{}')::jsonb;
  end if;

  return new;
end;
$$;

revoke all on function pass_the_phone.normalize_room_jsonb() from public, anon, authenticated;

drop trigger if exists pass_the_phone_normalize_room_jsonb on pass_the_phone.rooms;
create trigger pass_the_phone_normalize_room_jsonb
before insert or update of current_question, final_results
on pass_the_phone.rooms
for each row
execute function pass_the_phone.normalize_room_jsonb();

-- Repair only PassThePhone rows already written before the trigger existed.
update pass_the_phone.rooms
set current_question = (current_question #>> '{}')::jsonb
where current_question is not null
  and jsonb_typeof(current_question) = 'string';

update pass_the_phone.rooms
set final_results = (final_results #>> '{}')::jsonb
where final_results is not null
  and jsonb_typeof(final_results) = 'string';
