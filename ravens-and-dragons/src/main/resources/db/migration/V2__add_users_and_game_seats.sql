create table users (
    id varchar(64) primary key,
    display_name varchar(128) not null,
    username varchar(64),
    email varchar(256),
    password_hash varchar(255),
    auth_type varchar(32) not null,
    created_at timestamp with time zone not null
);

create unique index users_username_unique_idx
    on users (username);

create unique index users_email_unique_idx
    on users (email);

create table user_identities (
    id varchar(64) primary key,
    user_id varchar(64) not null references users (id) on delete cascade,
    provider varchar(64) not null,
    provider_subject varchar(255) not null,
    created_at timestamp with time zone not null
);

create unique index user_identities_provider_subject_unique_idx
    on user_identities (provider, provider_subject);

alter table games
    add column dragons_player_user_id varchar(64);

alter table games
    add column ravens_player_user_id varchar(64);

alter table games
    add column created_by_user_id varchar(64);
