-- Rush v1 initial schema. See docs/superpowers/specs/2026-05-29-rush-v1-design.md

create extension if not exists "pgcrypto";

create type lobby_type as enum ('private', 'public');
create type lobby_status as enum ('waiting', 'starting', 'active', 'ended');
create type game_type as enum (
  'crash', 'dice', 'mines',
  'last_chance_mines', 'last_chance_wheel', 'flappy'
);

create table users (
  id              uuid primary key default gen_random_uuid(),
  username        varchar(24) not null unique,
  password_hash   text not null,
  created_at      timestamptz not null default now()
);

create table lobbies (
  id                      uuid primary key default gen_random_uuid(),
  code                    varchar(6) unique,
  type                    lobby_type not null,
  host_user_id            uuid references users(id),
  size                    int not null check (size in (4, 8, 16)),
  duration_seconds        int not null check (duration_seconds in (180, 420, 900)),
  status                  lobby_status not null default 'waiting',
  starting_balance_cents  int not null default 100000,
  created_at              timestamptz not null default now(),
  started_at              timestamptz,
  ended_at                timestamptz
);

create index lobbies_status_idx on lobbies(status);

create table lobby_players (
  id              uuid primary key default gen_random_uuid(),
  lobby_id        uuid not null references lobbies(id) on delete cascade,
  user_id         uuid references users(id),
  nickname        varchar(24) not null,
  is_bot          boolean not null default false,
  is_busted       boolean not null default false,
  balance_cents   int not null,
  final_rank      int,
  joined_at       timestamptz not null default now()
);

create index lobby_players_lobby_idx on lobby_players(lobby_id);

create table bets (
  id                uuid primary key default gen_random_uuid(),
  lobby_id          uuid not null references lobbies(id) on delete cascade,
  lobby_player_id   uuid not null references lobby_players(id) on delete cascade,
  game              game_type not null,
  bet_amount_cents  int not null,
  payout_cents      int not null default 0,
  details           jsonb not null default '{}'::jsonb,
  placed_at         timestamptz not null default now()
);

create index bets_lobby_idx on bets(lobby_id);
create index bets_player_idx on bets(lobby_player_id);

create table crash_rounds (
  id                  uuid primary key default gen_random_uuid(),
  lobby_id            uuid not null references lobbies(id) on delete cascade,
  round_number        int not null,
  crash_multiplier    numeric(8,2) not null,
  start_at            timestamptz not null,
  crashed_at          timestamptz,
  unique (lobby_id, round_number)
);
