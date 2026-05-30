-- Public matchmaking queue. One row per session waiting for a public lobby.
-- The matchmake cron polls this table once a minute (and on-demand from
-- /play) and resolves entries into lobbies grouped by (size, duration).

create table matchmaking_queue (
  id                uuid primary key default gen_random_uuid(),
  session_kind      text not null check (session_kind in ('guest', 'user')),
  session_id        text not null,
  nickname          varchar(24) not null,
  size              int not null check (size in (4, 8, 16)),
  duration_seconds  int not null check (duration_seconds in (180, 420, 900)),
  queued_at         timestamptz not null default now(),
  -- Set when the matchmaker has assigned this entry to a lobby. Used by
  -- the polling endpoint to return the assignment.
  assigned_lobby_id uuid references lobbies(id) on delete set null
);

-- Dedup: a single session can only have one queue entry at a time.
create unique index matchmaking_queue_session_idx
  on matchmaking_queue(session_kind, session_id)
  where assigned_lobby_id is null;

-- Lookup index used by the matchmake cron when grouping unassigned entries
create index matchmaking_queue_key_idx
  on matchmaking_queue(size, duration_seconds, queued_at)
  where assigned_lobby_id is null;

-- Grant access to service_role so PostgREST + supabase-js can talk to it
grant all on matchmaking_queue to service_role;
