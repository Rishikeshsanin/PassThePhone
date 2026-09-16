-- PassThePhone / Project Hub FK index hardening.
select hub.assert_app_scope('pass_the_phone', 'pass_the_phone');

create index if not exists idx_pass_the_phone_rooms_host_player
  on pass_the_phone.rooms(host_player_id);
create index if not exists idx_pass_the_phone_rooms_current_turn_player
  on pass_the_phone.rooms(current_turn_player_id);
create index if not exists idx_pass_the_phone_choices_chooser
  on pass_the_phone.choices(chooser_player_id);
create index if not exists idx_pass_the_phone_choices_chosen_player
  on pass_the_phone.choices(chosen_player_id);
create index if not exists idx_pass_the_phone_choices_next_turn
  on pass_the_phone.choices(next_turn_player_id);
create index if not exists idx_pass_the_phone_chat_player
  on pass_the_phone.chat_messages(player_id);
