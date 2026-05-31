-- Custom lobbies: no size cap + bans table
-- ─────────────────────────────────────────────────────────────────────
-- The original schema enforced lobbies.size IN (4, 8, 16) for matchmaking
-- buckets. Custom (private) lobbies now create with no size cap — the
-- host adds CPUs and friends as desired up to a generous upper limit.
-- Keep size NOT NULL but loosen the check to (size between 2 and 32).

alter table lobbies drop constraint if exists lobbies_size_check;
alter table lobbies add constraint lobbies_size_check check (size between 2 and 32);

-- Per-lobby ban list. Banned identifiers prevent re-joining the same
-- lobby code. Stored as a free-form text key so we can ban either:
--   user:<uuid>      — a registered account
--   nick:<lowercase> — a guest by nickname (best-effort; trivially
--                      circumvented by changing nickname, but enough to
--                      deter casual abuse)
create table lobby_bans (
  id          uuid primary key default gen_random_uuid(),
  lobby_id    uuid not null references lobbies(id) on delete cascade,
  identifier  text not null,
  banned_at   timestamptz not null default now(),
  unique (lobby_id, identifier)
);

create index lobby_bans_lobby_idx on lobby_bans(lobby_id);
