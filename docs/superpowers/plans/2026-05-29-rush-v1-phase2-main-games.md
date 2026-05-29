# Rush v1 — Phase 2: Main Games + Matchmaking + Reactions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the P1 multiplayer slice with the two remaining main casino games (Crash + Mines), a tabbed game interface, public matchmaking, and emoji reactions. By the end of this phase Rush is feature-complete for the v1 casino loop — only P3 polish (registered accounts, smart bot AI personalities, Last Chance Mines, Flappy) remains.

**Architecture:** Same stack as P1 (Next.js + Supabase + Pusher). The big new piece is **Crash**, the shared real-time multiplier game. It uses a pre-roll + client-side animation pattern: every ~30s a Vercel cron generates the next round's crash multiplier upfront, broadcasts `{round_id, start_at_unix_ms, crash_at}`, and every connected client animates the rocket locally using a deterministic formula. Cashouts post the current multiplier; the server validates the timing.

**Tech additions:**
- New table: `matchmaking_queue` (player + size + duration + queued_at)
- New columns on `lobbies`: nothing new — `type='public'` already supported
- New cron entry: `/api/cron/crash-tick` (every minute, generates new Crash rounds for active lobbies)
- New cron entry: `/api/cron/matchmake` (every minute, resolves queue → lobby creation)
- New Pusher events: `reaction`, `crash_round_start`, `crash_cashout`, `mines_reveal`

**Already shipped in P1 polish (not duplicated here):**
- End-of-round line chart + leaderboard
- Last Chance Wheel
- Bot activity loop
- $200 max bet cap
- Logo nav + Leave button + Back-to-Hub
- Round-end cron fallback for local dev

**Deferred to P3:**
- Registered accounts + `/profile` stats page
- Smart bot AI (personality archetypes, tilting, locked-in behavior, reactions)
- Last Chance Mines + Flappy
- Friend invites
- Auto-bet
- Sound effects

---

## File Structure (new files only)

```
supabase/migrations/
  20260530_000_matchmaking_queue.sql      -- queue table

src/lib/games/
  mines.ts                                -- mines math + RNG
  crash.ts                                -- crash payout + multiplier curve

src/app/api/
  games/mines/start/route.ts              -- POST: open a mines game
  games/mines/reveal/route.ts             -- POST: click a tile
  games/mines/cashout/route.ts            -- POST: cash out
  games/crash/bet/route.ts                -- POST: place a Crash bet (during betting window)
  games/crash/cashout/route.ts            -- POST: cash out current round
  lobbies/matchmake/route.ts              -- POST: enter the queue
  cron/crash-tick/route.ts                -- new Crash round per active lobby with Crash players
  cron/matchmake/route.ts                 -- resolve queues into lobbies

src/components/
  MinesGame.tsx                           -- 5×5 grid + reveal/cashout
  CrashGame.tsx                           -- rocket + multiplier + bet/cashout
  GameTabs.tsx                            -- shared tab switcher for Crash/Dice/Mines
  ReactionsBar.tsx                        -- 4 emoji buttons
  ReactionsLayer.tsx                      -- floating emojis
```

---

## Task 1: Mines payout math + RNG + tests

**Files:** `src/lib/games/mines.ts`, `tests/lib/games/mines.test.ts`

Multiplier formula (from spec, RTP 0.99):

```
m(K) for K safe tiles clicked with M mines on 25 tiles:
  m(K) = 0.99 × ∏(i=0..K-1) (25 - i) / (25 - M - i)
```

Module exports:
- `MINES_TILES = 25`
- `MIN_MINES = 1`, `MAX_MINES = 24`
- `placeMines(count: number): number[]` — returns sorted array of `count` distinct tile indices in `[0, 24]`
- `minesMultiplier(minesCount: number, clicksRevealed: number): number`
- `precomputeMinesTable(): number[][]` — `table[minesCount][clicksRevealed] = multiplier`

Tests cover:
- 1k random `placeMines(M)` calls produce arrays of length M with distinct values in `[0,24]` for several values of M
- `minesMultiplier` matches formula for spot values: (M=3, K=5) ≈ 1.97x, (M=1, K=1) ≈ 1.03x, (M=24, K=1) ≈ 24.75x
- Throws on out-of-range inputs

## Task 2: Mines bet handler + endpoints + tests

**Files:** `src/app/api/games/mines/{start,reveal,cashout}/route.ts`, `src/app/api/games/mines/_handler.ts`, `tests/api/games-mines.test.ts`

Game state stored on a single `bets` row's `details` JSON throughout the game:
```ts
details = {
  mines: number,
  mine_positions: number[],   // sorted
  revealed: number[],         // sorted, tiles the player clicked safely
  status: 'active' | 'cashed_out' | 'exploded'
}
```

Endpoints:
- `POST /api/games/mines/start` `{ lobbyId, betCents, minesCount }`
  - Validate bet (min/max — reuse `limits.ts` constants), validate minesCount in [1,24]
  - Atomically deduct balance (reuse `deduct_balance` RPC)
  - Insert `bets` row with `game='mines'`, `bet_amount_cents`, `payout_cents=0`, `details={ mines, mine_positions, revealed: [], status: 'active' }`
  - Return `{ betId, minesCount }` — never reveal `mine_positions` to client
- `POST /api/games/mines/reveal` `{ betId, tileIndex }`
  - Look up bet; reject if not yours, not active, or tile already revealed/in mines
  - If `mine_positions.includes(tileIndex)`: status='exploded', payout stays 0, return `{ exploded: true, minePositions, multiplier: 0 }`. Publish `balance_update` (no change but UI may want to recompute bust status).
  - Otherwise: push tile to `revealed`, compute `m = minesMultiplier(mines, revealed.length)`, update `details`, return `{ exploded: false, revealed, multiplier: m }`
- `POST /api/games/mines/cashout` `{ betId }`
  - Look up bet; reject if not yours or not active
  - Compute payout = `bet_amount × minesMultiplier(mines, revealed.length)`
  - Credit balance via `credit_balance` RPC
  - Update bet: `payout_cents = payout`, `details.status = 'cashed_out'`
  - Publish `balance_update`
  - Return `{ payoutCents, newBalanceCents, multiplier }`

Integration tests (against real Supabase):
- start → reveal safe (forced) → reveal mine → exploded
- start → reveal safe × 3 → cashout → balance matches expected formula

## Task 3: Mines UI component

**Files:** `src/components/MinesGame.tsx`

- 5×5 grid (CSS grid with `grid-cols-5`)
- Pre-game: bet input (reuses limits + Max button pattern from DiceGame), mines count slider (1-24)
- Active game: tiles are buttons; clicked safe = green check icon, clicked mine = red bomb icon, unrevealed = panel color with hover effect
- Side panel: current multiplier (animated count-up), potential payout, Cash Out button (disabled until first click)
- On explode: animate all mines revealing (stagger reveal with `setTimeout` waterfall), show "Boom" overlay briefly
- On cashout: green burst, return to pre-game state

## Task 4: Game tabs

**Files:** `src/components/GameTabs.tsx`, modify `src/app/lobby/[id]/page.tsx`

Replace the conditional `<DiceGame />` with `<GameTabs lobbyId={id} balanceCents={…} />`. Tabs: Crash | Dice | Mines. State for active tab held in component. Tabs are large, easily tappable on mobile (44px+ tap target). Active tab gets accent bottom-border + brighter text.

The busted-player code path stays: when `self.is_busted`, render `<LastChanceWheel />` instead of `<GameTabs />`.

## Task 5: Reactions — typed event + UI bar + floating layer + bot reactions

**Files:**
- `src/lib/realtime/events.ts` (add `reaction` event type — already in the union? confirm)
- `src/app/api/lobbies/[id]/react/route.ts` (POST: publish reaction)
- `src/components/ReactionsBar.tsx` (4 buttons: 🔥 😱 💀 🚀)
- `src/components/ReactionsLayer.tsx` (absolute-positioned overlay, listens for `reaction` events, animates emojis floating up + fading out over ~2s)
- Modify `src/app/api/lobbies/[id]/bot-tick/route.ts` to also have a small chance (~10%) of publishing a random reaction from a random bot

Reaction event payload: `{ type: 'reaction', lobbyPlayerId, emoji }`. UI ignores `lobbyPlayerId` for now (P3 may show the sender nickname); just queues the emoji into the floating layer.

## Task 6: Public matchmaking queue

**Files:**
- `supabase/migrations/20260530_000_matchmaking_queue.sql`
- `src/app/api/lobbies/matchmake/route.ts`
- `src/app/api/cron/matchmake/route.ts`
- Modify `src/app/play/page.tsx`: add "Find Match" button alongside Create / Join

Schema:
```sql
create table matchmaking_queue (
  id              uuid primary key default gen_random_uuid(),
  session_kind    text not null,            -- 'guest' or 'user'
  session_id      text not null,            -- guestId or userId
  nickname        varchar(24) not null,
  size            int not null check (size in (4, 8, 16)),
  duration_seconds int not null check (duration_seconds in (180, 420, 900)),
  queued_at       timestamptz not null default now()
);
create index matchmaking_queue_key_idx on matchmaking_queue(size, duration_seconds, queued_at);
```

Endpoint `POST /api/lobbies/matchmake { size, durationSeconds }`:
- Validate
- Upsert this player's row (using session_kind + session_id as the dedup key)
- Return `{ queued: true }`

Hub UI: clicking Find Match → POST to matchmake → page shows "Searching for opponents…" with a polling check every 2s for an assigned lobby. Polling endpoint `GET /api/lobbies/matchmake/status` checks if any of this session's lobby_players rows have been created in the last minute that the session didn't explicitly create — if so, redirect to `/lobby/[id]`.

Cron `GET /api/cron/matchmake` (every minute on Vercel; locally triggered by hub UI poll if needed):
1. Find all `(size, duration)` keys in queue
2. For each key with 2+ humans: pull the oldest N (up to size) humans, create a new lobby, seat them as `lobby_players` rows
3. For each key with 1 human queued > 15s: create a lobby filled with bots (`is_bot=true`) — silent bot fallback per spec
4. Delete the served rows from `matchmaking_queue`
5. For each newly-created lobby, fire `/api/lobbies/[id]/start` to kick it off

Local dev: the hub UI polls `/api/cron/matchmake` directly during the search loop so we don't need to wait a minute.

## Task 7: Crash — math + RNG + tests

**Files:** `src/lib/games/crash.ts`, `tests/lib/games/crash.test.ts`

Per spec:
- Pre-roll: `crash_at = max(1, 99 / (rand × 100))` (with `rand` in [0,1))
- Client animation: `multiplier(t) = 1.0024^(seconds_elapsed)` — t in seconds since `start_at`

Exports:
- `rollCrashPoint(): number` — server-side, returns next crash multiplier
- `multiplierAtElapsed(seconds: number): number` — pure function used by clients
- `secondsToReachMultiplier(m: number): number` — inverse, used by server validation

Tests:
- 100k samples of `rollCrashPoint()` deliver ~99% RTP (`sum(min(m, target)) / N ≈ 0.99 × target` for various target multipliers)
- Distribution checks: ~50% of rolls under 2.0x, ~10% above 10.0x
- `multiplierAtElapsed(secondsToReachMultiplier(3.47))` ≈ 3.47

## Task 8: Crash — round generation cron + state

**Files:**
- `src/app/api/cron/crash-tick/route.ts`
- Modify `vercel.json` to add the cron

Logic:
- For each `lobbies.status='active'` lobby:
  - Find the most recent `crash_rounds` row for the lobby
  - If none, or it has `crashed_at` set (i.e. is finished) and its `start_at + 30s` is in the past:
    - Generate `crash_at = rollCrashPoint()`
    - Insert `crash_rounds` row with `start_at = now + 5s` (giving a betting window)
    - Publish `crash_round_start { roundId, startAtMs: epoch ms, crashAt }`
  - If current round's `start_at` is in the past and elapsed time exceeds the crash time, mark `crashed_at = now()` (so the next tick can generate the next round)

Cron schedule: `* * * * *` (every minute). Locally: have the CrashGame component fire `/api/cron/crash-tick` on mount + when it sees an old expired round.

## Task 9: Crash bet + cashout endpoints

**Files:** `src/app/api/games/crash/bet/route.ts`, `src/app/api/games/crash/cashout/route.ts`

**Bet** `POST /api/games/crash/bet { roundId, betCents, autoCashoutAt? }`:
- Look up `crash_rounds[roundId]`. Reject if `now >= start_at` (betting window closed).
- Validate bet using shared limits.
- Atomic deduct via `deduct_balance` RPC.
- Insert `bets` row with `game='crash'`, `details={ roundId, autoCashoutAt: autoCashoutAt ?? null }`, `payout_cents=0`.
- Return `{ betId }`.

**Cashout** `POST /api/games/crash/cashout { betId, multiplier }`:
- Look up bet. Reject if not yours, not active (already cashed/lost), or wrong game.
- Look up the round. Compute `expectedSeconds = secondsToReachMultiplier(multiplier)`. Validate `now - start_at <= secondsToReachMultiplier(crash_at) - 0.05` (50ms grace) — i.e. the round hasn't crashed by the time you cashed.
- If valid: `payoutCents = bet_amount_cents × multiplier`, credit balance, update bet's `payout_cents` and `details.cashedOutAt`, publish `balance_update` and `crash_cashout { lobbyPlayerId, multiplier, payout }`.
- If invalid (too late): no payout, bet stays at 0 payout.

The lobby-page's existing balance_update + Pusher subscription handle UI updates.

## Task 10: Crash UI

**Files:** `src/components/CrashGame.tsx`

States:
- **Betting window** (during 5s before start): show bet input + Max + optional auto-cashout multiplier picker + Bet button. Countdown ticker.
- **Live round** (animating): SVG of rocket + curve, big multiplier counter ticking up using `multiplierAtElapsed`, your bet shown alongside if you have one, Cash Out button enabled if you do.
- **Crashed** (3s aftermath): "Rocket crashed at 3.47x" + losers list briefly.

Multiplier counter cycles ~30fps from `multiplierAtElapsed(t)`. Rocket path is drawn as a polyline accumulating points as the round progresses.

UI subscribes to `crash_round_start` to enter a new round and reset state; `crash_cashout` to show floating cashout notifications for other players ("moondancer cashed at 2.4x"); `balance_update` is already wired at the page level.

## Task 11: Bot Crash betting

Modify `src/app/api/lobbies/[id]/bot-tick/route.ts` to ~25% of the time place a Crash bet for the random bot if there's a current Crash round in betting window: pick a random small bet (1-10% of balance, capped at $200) and a random `autoCashoutAt` in [1.2x, 4.0x]. The existing `placeBet` plumbing handles balance.

## Task 12: Manual end-to-end verification

Two-browser test:
- Open lobby in two browsers
- Both should see the same Crash round (rocket animation synced)
- Bet on Crash in one, cashout, confirm leaderboard updates in the other
- Switch between tabs (Crash / Dice / Mines) while a Crash round is running — verify the bet still resolves
- React from one — confirm the floating emoji appears in the other
- Public matchmaking: in two browsers, both click Find Match with same settings, verify they get seated in the same lobby

---

## Self-Review Notes

**Coverage check:** Every P2 spec item from the design has a task above:
- Crash (shared) → Tasks 7–10
- Mines (solo) → Tasks 1–3
- Game switching → Task 4
- Public matchmaking → Task 6
- Reactions → Task 5
- Bot activity for Crash → Task 11
- Manual verification → Task 12

**Risks:**
- Crash timing precision under network jitter — mitigated by the 50ms grace window + server-authoritative validation
- Matchmaking thundering herd if many players queue simultaneously — at v1 scale this won't matter; revisit if real users find each other
- Mines game state stored in a `bets.details` JSON instead of a dedicated table — fine for v1; could move to a `mines_sessions` table if we want richer querying later

**Order of implementation:** Mines → GameTabs → Reactions → Matchmaking → Crash. Crash last because it's the highest complexity; the patterns established by Mines + Tabs make it tractable.
