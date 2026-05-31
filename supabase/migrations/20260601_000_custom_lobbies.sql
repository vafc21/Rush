-- Custom lobbies: no size cap + bans table
-- ─────────────────────────────────────────────────────────────────────
-- The original schema enforced lobbies.size IN (4, 8, 16) for matchmaking
-- buckets. Custom (private) lobbies now create with no size cap — the
-- host adds CPUs and friends as desired up to a generous upper limit.
-- Keep size NOT NULL but loosen the check to (size between 2 and 32).

alter table lobbies drop constraint if exists lobbies_size_check;
alter table lobbies add constraint lobbies_size_check check (size between 2 and 32);

-- Per-lobby ban list. A ban is keyed by (session_kind, session_id):
--   session_kind='user',  session_id=<user uuid>       — registered account
--   session_kind='guest', session_id=<lowercased nick> — a guest by nickname
-- (best-effort for guests; trivially circumvented by changing nickname,
--  but enough to deter casual abuse).
create table lobby_bans (
  id            uuid primary key default gen_random_uuid(),
  lobby_id      uuid not null references lobbies(id) on delete cascade,
  session_kind  text not null,
  session_id    text not null,
  banned_at     timestamptz not null default now(),
  unique (lobby_id, session_kind, session_id)
);

create index lobby_bans_lobby_idx on lobby_bans(lobby_id);

grant all on lobby_bans to service_role;
