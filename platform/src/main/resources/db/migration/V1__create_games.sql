create table games (
    id varchar(32) primary key,
    version bigint not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    last_accessed_at timestamp with time zone not null,
    lifecycle varchar(32) not null,
    selected_rule_configuration_id varchar(64) not null,
    selected_starting_side varchar(32) not null,
    selected_board_size integer not null,
    snapshot_json text not null,
    undo_snapshots_json text not null
);
