alter table games
    add column public_state_json text not null default '{}';

alter table games
    add column private_state_json text not null default '[]';

update games
set public_state_json = snapshot_json,
    private_state_json = undo_snapshots_json;

alter table games
    drop column selected_rule_configuration_id;

alter table games
    drop column selected_starting_side;

alter table games
    drop column selected_board_size;

alter table games
    drop column dragons_player_user_id;

alter table games
    drop column ravens_player_user_id;

alter table games
    drop column dragons_bot_id;

alter table games
    drop column ravens_bot_id;

alter table games
    drop column snapshot_json;

alter table games
    drop column undo_snapshots_json;
