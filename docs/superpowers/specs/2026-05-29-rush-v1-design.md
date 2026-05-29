# Rush — v1 Design

**Date:** 2026-05-29
**Status:** Approved — ready for implementation planning

## What Rush Is

Rush is a competitive web-based "fake-money casino" for teens. Players join a lobby, each start with **$1,000 of play money**, and gamble for a fixed round duration. Whoever has the most money at the end wins. The visual aesthetic matches Stake.com — dark navy UI, polished animations, the whole "real online casino" feel — but the actual product is a multiplayer competitive game, not gambling. **No real money is involved at any point.**

The signature moment of every round is the **end-of-round line chart**: every player's balance over the round drawn as a line on the same graph, with YOUR line highlighted bright green and the leader highlighted gold. It's the climax that determines bragging rights.

## In Scope for v1

- **3 main casino games**: Crash (shared across the lobby), Dice (solo), Mines (solo)
- **3 Last Chance mini-games** for busted players: Last Chance Mines, Last Chance Wheel, Flappy
- **Battle Royale lobby mode** (1v1 and 2v2 explicitly deferred to v2+)
- **Private lobbies** with 6-digit join codes
- **Public matchmaking** with smart bot-fill
- **Silent bots** — players are never told whether they're playing humans or bots
- **Host-picked lobby size** (4 / 8 / 16) and **duration** (3 / 7 / 15 minutes)
- **Guest play** (no account) and **lightweight registered accounts** (username + password only — no email)
- **Reactions** (4 emojis: 🔥 😱 💀 🚀); no text chat
- **End-of-round graph + leaderboard**
- **Responsive web** (desktop + mobile, same codebase)

## Explicitly Out of Scope for v1

- 1v1 and 2v2 modes
- Other casino games (Plinko, Limbo, Roulette, Blackjack, slots, Hilo, Keno, Wheel-as-a-main-game, Baccarat, Video Poker, Dragon Tower, Tower, Cases, etc.)
- Text chat
- Sound effects
- "Provably fair" cryptographic randomness verification (real Stake's signature feature — adds real complexity, doesn't matter without real money)
- Auto-bet
- Email-based password reset
- Friends, friend invites, social graph
- Native mobile apps
- Profile customization beyond a nickname
- Visual regression tests, load tests, multi-browser realtime sync tests

## Architecture

Three pieces:

```
┌─────────────────┐         ┌───────────────────────┐         ┌────────────────┐
│  Browser        │  HTTP   │  Next.js on Vercel    │   SQL   │  Supabase      │
│  (React + TW)   │ ──────▶ │  (API routes + SSR)   │ ──────▶ │  (Postgres)    │
│                 │ ◀────── │                       │ ◀────── │                │
└────────┬────────┘         └──────────┬────────────┘         └────────────────┘
         │                             │
         │  WebSocket subscribe        │  HTTP publish
         │                             ▼
         │                  ┌────────────────────┐
         └─────────────────▶│   Pusher Channels  │
                            │  (broadcast bus)   │
                            └────────────────────┘
```

- **Frontend**: Next.js 15 (App Router, React) + Tailwind CSS
- **Backend**: Next.js API routes — no separate server process
- **Database**: Supabase Postgres
- **Auth**: Custom (bcrypt + signed JWT cookie) — Supabase Auth not used because we don't want email and want full control over the guest flow
- **Realtime**: Pusher Channels (private channels per lobby, authenticated by JWT)
- **Hosting**: Vercel for the Next.js app; Supabase managed; Pusher managed
- **Cost at launch**: $0/month (all free tiers)

### Why this stack

- Cheapest possible path to playable. We can reach "my friends are playing it" without a credit card.
- One language end-to-end (TypeScript) on a stack with abundant documentation.
- If Rush succeeds and outgrows Pusher's free tier (100 concurrent connections), we migrate the realtime layer to a dedicated WebSocket server without rewriting the frontend.

### The shared Crash game — how it works without per-tick server traffic

The trickiest piece of the realtime architecture is the shared Crash game: every player in the lobby has to see the same rocket at the same multiplier. We do **not** stream per-frame updates over Pusher. Instead:

1. A Vercel cron job calls `/api/crash/new-round` every ~30 seconds (per active lobby with active Crash bets).
2. That endpoint generates the round's **crash multiplier upfront** using `crash = max(1, 99/(rand*100))` and writes it to the `crash_rounds` table with a `start_at` timestamp 5 seconds in the future (giving clients a betting window).
3. The endpoint publishes `{round_id, start_at_unix_ms, crash_at_multiplier}` to the lobby's Pusher channel.
4. Every client receives this and animates the rocket **locally** using `multiplier(t) = 1.0024 ^ ((t - start_at) seconds)`. They're all watching the same predetermined story.
5. When a player clicks Cash Out, the browser POSTs the multiplier value at the moment of the click. The server validates that `elapsed_time ≤ crash_at_time` and pays out `bet × multiplier`.

The only network traffic during a Crash round is the round-start message and per-player cashout calls. Cheap, cheat-resistant (server validates the timing), and feels live.

## Data Model

Five tables. All money values stored as **integer cents** to avoid floating-point bugs.

```sql
users                          -- registered accounts only
  id              uuid pk
  username        varchar(24) unique
  password_hash   text
  created_at      timestamptz

lobbies
  id                      uuid pk
  code                    varchar(6) unique  -- 6-digit join code; null for public
  type                    enum 'private' | 'public'
  host_user_id            uuid fk users      -- null if public
  size                    int                -- 4, 8, or 16
  duration_seconds        int                -- 180, 420, or 900
  status                  enum 'waiting' | 'starting' | 'active' | 'ended'
  starting_balance_cents  int default 100000 -- $1000
  created_at              timestamptz
  started_at              timestamptz
  ended_at                timestamptz

lobby_players                  -- one row per seat (humans, guests, and bots)
  id              uuid pk
  lobby_id        uuid fk lobbies
  user_id         uuid fk users   -- null = guest or bot
  nickname        varchar(24)
  is_bot          bool default false
  is_busted       bool default false
  balance_cents   int             -- current balance (denormalized for read speed)
  final_rank      int             -- set when lobby ends
  joined_at       timestamptz

bets                           -- one row per bet ever placed (the source of truth)
  id                uuid pk
  lobby_id          uuid fk
  lobby_player_id   uuid fk     -- links to a seat, not a user (so guests count)
  game              enum 'crash' | 'dice' | 'mines'
                       | 'last_chance_mines' | 'last_chance_wheel' | 'flappy'
  bet_amount_cents  int
  payout_cents      int         -- 0 on loss
  details           jsonb       -- game-specific: dice prediction, mines path, cashout x, etc.
  placed_at         timestamptz

crash_rounds                   -- the shared Crash game's predetermined outcomes
  id                  uuid pk
  lobby_id            uuid fk
  round_number        int
  crash_multiplier    numeric(8,2)   -- e.g. 3.47x
  start_at            timestamptz    -- when clients begin animating
  crashed_at          timestamptz
```

### Notable schema decisions

- **Reactions are NOT stored.** Pusher broadcasts and forgets — they have no value after the moment.
- **Stats are computed on demand from `bets`** (no denormalized totals column). Cheap at v1 scale, eliminates a class of consistency bugs.
- **Lobbies are never deleted** — they fuel the user's "Past Games" history. 500 MB of Supabase storage holds enormous history at v1 scale.
- **Guests live in `lobby_players` with `user_id = NULL`.** Their data persists for that lobby but doesn't carry forward to a future account (they have no account to attach it to). Acceptable tradeoff for v1.
- **Bots are also `lobby_players` with `is_bot = true`.** From every other table's perspective they're indistinguishable from humans. This is by design — see "Silent bots" below.

## Lobby Lifecycle

Four states:

```
WAITING ──▶ STARTING ──▶ ACTIVE ──▶ ENDED
  │           │            │          │
  │           │            │          └─ end-of-round graph + leaderboard (10s) → cleanup
  │           │            └─ round timer counting down, betting open
  │           └─ 5-second countdown overlay
  └─ filling with players (humans + bots)
```

### Private lobby flow

1. Host clicks "Create" → modal asks for size (4/8/16) and duration (3/7/15 min)
2. Server generates a unique 6-digit code, creates the lobby in `WAITING`
3. Host shares the code; friends visit `/play`, enter code, get seated
4. Host clicks "Start Match" anytime (even if not full)
5. **Empty seats are filled with silent bots on start** — no UI indication
6. → `STARTING` (5-sec visible countdown overlay) → `ACTIVE`

### Public matchmaking flow

1. Player clicks "Find Match" → picks size + duration
2. Joins a queue keyed by `(size, duration)` — 9 separate queues total (3 sizes × 3 durations)
3. As soon as **2+ humans are queued for the same key**, server seats them in a fresh lobby and starts a **10-second fill window**
4. Additional humans drop in during the window if the queue grows
5. At 10 sec, **bots fill remaining seats** → `STARTING` → `ACTIVE`

### Pure-bot fallback (silent)

- If a player has been queueing alone for 15 seconds with no humans joining, the server **silently** seats them in a freshly created lobby filled with bots and starts the match.
- **No "play vs bots?" prompt.** From the player's perspective they queued and got matched. They never know if their opponents were human.

### Active round behavior

- The round timer is visible at the top of every screen.
- Players freely switch between Crash, Dice, and Mines tabs and play simultaneously with other players.
- The live leaderboard updates in real time via Pusher.
- Crash runs its own ~30-second round loop in the background regardless of which tab anyone's on. Players who aren't on the Crash tab just see balance updates if they had a bet placed.
- Bots tick every 5–15 seconds, placing bets based on a personality archetype (cautious / balanced / chaotic).

### End-of-round behavior

- All betting locks the moment the round timer hits zero.
- End-of-round overlay animates for ~10 seconds: line chart draws left-to-right showing every player's balance over the round, then settles with final standings displayed.
- YOUR line is bold green (#00E701). The winning player's line is bold gold (#FFB800). All other lines are thin gray.
- A "Rematch" button spawns a new lobby with the same group + settings.

### Lobby edge cases

- **Player disconnects mid-round** → seat stays at current balance; reconnect resumes seamlessly. Pending Crash bets auto-resolve at crash time (no manual cashout = loss; pre-set auto-cashout fires).
- **Host quits a private lobby before start** → oldest remaining human becomes host. If only bots remain, lobby is killed.
- **Host quits mid-round** → nothing happens. Round runs to its natural end.
- **All humans bust** → round still runs to the end. Busted players go to Last Chance zone; bots keep playing.
- **Lobby code collision on creation** → retry with new code (up to 3 times). 1 in ~1M with 6-digit space.

## Silent Bots

Bots are designed to be **completely indistinguishable from humans** in the UI. No "🤖" icons, no labels, no distinguishing styling, no visible markers in the leaderboard.

### What makes them feel human

- **Procedurally generated nicknames** drawn from the same generator humans see (e.g., `moondancer`, `vortex`, `j4ckpot`, `ren`)
- **Same avatar color palette** as humans
- **Personality archetypes** drive behavior:
  - **Cautious** — small bets, cashes out Crash early, low mine counts, plays Dice with high roll-under thresholds. Rare bust, modest gains.
  - **Balanced** — medium bets, medium-risk choices. Most common archetype. Reasonable bust rate (~30%).
  - **Chaotic** — large bets, late Crash cashouts, high mine counts. High variance — sometimes wins big, often busts.
- **Variable timing** — actions happen at random 3–20 sec intervals, not on a fixed clock. Includes occasional "thinking pauses" and "locked in" stretches of 30–60 sec doing nothing.
- **Imperfect, human-style behavior** — bots sometimes "tilt" after a big loss (chase with bigger bets), sometimes "lock in" after a big win (stop playing for a stretch).
- **Reactions** — bots occasionally send a 🔥 / 😱 / 💀 / 🚀 reaction during big lobby moments (their own big win, watching Crash hit 10x+, the round ending).
- **Realistic bust distribution** — across the bot personalities present in any lobby, a believable mix of winners and losers emerges.

### Ethical disclosure

This design mildly deceives players about whether their opponents are human. For a teen game with no real money, this is well within the norm for how single-player games handle NPCs and produces a much better experience than "no humans available, sorry." This is a deliberate product choice, not an oversight.

## Game Mechanics

All randomness is generated **server-side** using Node's `crypto.randomInt` (or `crypto.randomBytes` for floating-point ranges). Clients never roll their own dice. Each game runs at **~99% RTP** (Stake's standard 1% house edge). Over a 7-minute round, that means cautious play roughly preserves balance and the meaningful swings come from risk choices, not arithmetic decay.

### 🚀 Crash (shared, ~30-second rounds)

- **Betting window** (5 seconds) opens; players on the Crash tab can place a bet and optionally set an auto-cashout multiplier.
- Server pre-rolls the crash point: `crash = max(1, 99 / (rand * 100))`. Distribution: ~50% of rounds crash before 2x, ~10% above 10x, very rarely above 100x.
- Server publishes `{crash_at: 3.47, start_at_unix_ms: ...}` to the lobby's Pusher channel.
- Clients animate locally from `start_at` using `multiplier(t) = 1.0024 ^ (seconds_elapsed)`.
- Player clicks **Cash Out** → browser POSTs the current multiplier → server validates `elapsed_time ≤ crash_at_time` and pays `bet × multiplier`.
- Player who doesn't cash out before the crash → loses the entire bet.
- After crash → 3-second aftermath ("Rocket exploded at 3.47x") → next round begins.

### 🎲 Dice (solo, instant)

- Player picks **roll under X** where X ∈ [2, 98]. Multiplier = `99 / X`.
  - Under 50 → 1.98x (safe)
  - Under 10 → 9.9x (risky)
  - Under 2 → 49.5x (degen)
- Player picks bet amount, clicks Roll → server rolls a number in `[0, 99.99)`, brief dice spinner animation (~1.5s), result displayed.
- Win = `bet × multiplier`, lose = `-bet`. Total interaction takes ~2 seconds.

### 💣 Mines (solo)

- 5×5 grid (25 tiles). Player picks bet amount + mines count (1–24) before starting.
- Server places mines randomly upfront and stores the layout in `bets.details`.
- Player clicks tiles one at a time. Safe tile → multiplier grows by `(25 - mines - i) / (25 - mines - i - 1)` (precomputed table). Mine → entire bet is lost and the board reveals.
- **Cash Out** button becomes live after the first click — locks in current multiplier × bet.
- Math example: 3 mines, click 5 safe tiles → ~2.65x multiplier.

### Last Chance zone (unlocked only when busted)

A separate screen, only accessible when `is_busted = true`. Player can still see the live lobby leaderboard. Three rebuy paths offered side-by-side:

**💣💣 Last Chance Mines**
- A 5×5 grid with 24 mines and 1 safe tile.
- One click per attempt. Hit the safe tile → **$500 instant rebuy** and `is_busted` cleared.
- 5 seconds per attempt. Unlimited attempts during the round.
- 4% chance per attempt.

**🎡 Last Chance Wheel**
- 50-segment wheel, 1 gold segment = **$500 rebuy**.
- Click Spin → 3-second spin animation → result.
- 20-second cooldown between spins.
- 2% per spin. Across a typical 5-minute remaining post-bust period, ~10–15 attempts → ~20–25% chance of comeback.

**🐦 Flappy**
- Side-scrolling Flappy Bird clone. Tap/click to flap. Gravity pulls bird down.
- Each pipe passed banks **$0.01 × current_multiplier**.
- Multiplier doubles every 10 pipes: `1× (pipes 0–9) → 2× (10–19) → 4× (20–29) → 8× (30–39) → ...`
- Hit a pipe or floor → run ends, accumulated banked amount transfers to the player's lobby balance. `is_busted` cleared if balance ≥ $1.
- No bet to place; this is pure skill.
- A skilled player banks $0.10–$2.00 per run — enough to grind back to the $1 minimum bet and re-enter the main casino games.

### Universal rules

- **Minimum bet on main games**: $1.00.
- **No minimum on Last Chance** (Flappy/Wheel/Mines don't cost anything to attempt).
- **Maximum bet**: 100% of current balance. Yes, you can go all-in.
- **Bet amounts round to the nearest $0.50** — no fractional cents in bets.
- **Game switching is free and instant** — players can flip between tabs anytime during the round.
- **Crash bets persist across tab switches** — if you bet on Crash then switch to Dice, your Crash bet still resolves. If you don't return to cash out before the crash, you lose. Auto-cashout fires regardless of which tab is open.

## Frontend Structure

### Pages (Next.js App Router)

```
/                          Landing — "Play as Guest" / "Sign In" / "Create Account"
/play                      Main hub — Create Lobby / Join by Code / Find Match
/lobby/[id]                The game (handles all 4 lobby states)
/sign-in                   Username + password
/sign-up                   Username + password (no email)
/profile                   Stats — registered users only
```

### Key components

```
<TopBar>                        logo · balance · round timer · settings/leave
<LobbyWaitingRoom>              shown during WAITING — player list, code, "Start" button (host)
<LobbyStartingOverlay>          full-screen 5-second countdown
<GameTabs>                      Crash / Dice / Mines (or Last Chance variants when busted)
  <CrashGame>                   shared rocket + cashout button
  <DiceGame>                    slider + roll button
  <MinesGame>                   5×5 grid + cashout
  <LastChanceMines>             1 click, 25 tiles
  <LastChanceWheel>             spin button + cooldown timer
  <FlappyGame>                  canvas-based, tap to flap
<LeaderboardPanel>              live sorted list (right side on desktop, drawer on mobile)
<ReactionsBar>                  4 emoji buttons (🔥 😱 💀 🚀)
<ReactionsLayer>                floating emojis that drift up and fade out
<EndOfRoundOverlay>             animated line chart + final standings, 10 sec
<JoinByCodeModal>               6-digit code input
<CreateLobbyModal>              size + duration pickers
```

### Visual design

- **Background**: `#0F212E` (deep navy, same as Stake)
- **Cards / panels**: `#1A2C38`
- **Primary win/money signal**: `#00E701` (bright green)
- **Rush brand accent**: `#FFB800` (gold) — used for logo, status chips, lobby UI accents
- **Body text**: `#FFFFFF`; secondary text: `#B1BAD3`; muted: `#7B8BA8`
- **Logo**: small diamond mark with a green-to-gold gradient, "RUSH" wordmark in bold uppercase

## Authentication

### Guest flow

1. Player clicks "Play as Guest" on landing → modal asks for a nickname.
2. Server creates a **guest session**: signed JWT cookie containing `{ guestId: uuid, nickname }`. No DB row created.
3. When the guest joins a lobby, a `lobby_players` row is created with `user_id = null, nickname = their choice`. The JWT links their browser to that row.
4. Cookie persists across tabs but vanishes when browser data clears. No password recovery, by design.

### Registered user flow

1. Sign up: POST `/api/auth/signup` with `{ username, password }` → bcrypt hash password → insert into `users` → set JWT cookie `{ userId, username }`.
2. Sign in: POST `/api/auth/signin` → look up by username → bcrypt compare → set JWT cookie.
3. When they join a lobby, `lobby_players.user_id` gets set to their user ID. Their bets accumulate on their profile.
4. JWT in an `httpOnly` cookie, signed with `JWT_SECRET` env var. 30-day expiry.

### Lobby authentication

- Joining any lobby requires a valid session (guest or registered). Anonymous visitors with no cookie are redirected to landing.
- Pusher private channels for `lobby:{id}` are authorized server-side via `/api/pusher/auth` — that endpoint checks the JWT has a matching `lobby_players` row in this lobby. Prevents random users from spying on lobbies they're not in.

### Profile page (registered users only)

- Reads from the `bets` table at query time and aggregates:
  - Total games played (distinct lobbies)
  - Win rate (% of lobbies finished in 1st place)
  - Biggest single-bet win (in fake dollars)
  - Biggest end-of-lobby balance
  - Lifetime net profit/loss (sum of payouts − bets, in fake dollars)
- All aggregations are computed at query time. No denormalized stats columns to keep in sync.

## Realtime Wiring

### Pusher channels

- **`lobby:{lobbyId}`** — broadcast channel, every player in the lobby subscribes. Events:
  - `player_joined` — new player seated
  - `player_left` — player abandoned the lobby
  - `lobby_starting` — 5-sec countdown begun
  - `lobby_active` — round started, with server time
  - `balance_update` — `{lobbyPlayerId, newBalanceCents}`
  - `player_busted` — `{lobbyPlayerId}`
  - `reaction` — `{lobbyPlayerId, emoji}`
  - `crash_round_start` — `{roundId, startAtMs, crashAt}`
  - `crash_cashout` — `{lobbyPlayerId, multiplier, payout}` (so leaderboard can flash)
  - `lobby_ended` — `{finalRanks}`
- **`user:{lobbyPlayerId}`** — private channel per seat for solo-game results that shouldn't broadcast (Dice rolls, Mines clicks). Server publishes results here; client uses them to drive the per-game UI.

### Snapshot endpoint

- `GET /api/lobby/[id]/snapshot` returns the full current state of a lobby (players + balances + lobby status + current Crash round) — used by clients to recover after a Pusher disconnect or to populate state on initial page load.

## Error Handling

| Failure mode | Behavior |
|---|---|
| **Pusher disconnect** | SDK auto-reconnects. On reconnect, client calls snapshot endpoint to resync. "Reconnecting…" banner shown. |
| **API 500 on a bet** | Toast: "Couldn't place bet, try again." Balance unchanged. Server logs to Vercel logs. |
| **Race: simultaneous bets exceeding balance** | Atomic SQL: `UPDATE … SET balance = balance - $X WHERE balance >= $X RETURNING …` — only one wins. Other returns "insufficient balance." |
| **Player disconnects mid-round** | Seat preserved at current balance. Pending Crash bets auto-resolve at crash time (no cashout = loss; pre-set auto-cashout fires). |
| **Vercel cron misses a Crash tick** | Lazy fallback: first player to load the Crash tab triggers a "kickstart" API check; if no active round, server generates one immediately. |
| **Crash animation desync** | Server sends `start_at_unix_ms` + `crash_at`. Client animates from its own clock. On a Pusher reconnect, snapshot endpoint corrects state. |
| **Pusher free quota exceeded** | New connections fall back to 2-second polling for balance updates. Reactions and live Crash ticks stop working but the game remains playable. |
| **Supabase down** | All routes return 503 with "Service unavailable, please refresh." |
| **Bot AI exception** | Caught and logged; the offending bot just pauses one tick. Lobby unaffected. |
| **Stale lobby** | Hourly cron sweeps `WAITING > 30 min` and `ACTIVE > 2 × duration_seconds` lobbies, marks them `ended`. |
| **Lobby code collision** | Retry with a new code up to 3 times. With 1M possible codes the chance is vanishingly small. |

## Testing Strategy

Targeted, not exhaustive. ~40 tests total covering the three categories where bugs are insidious.

### 1. Game math — unit tests (Jest)

- **Crash distribution**: simulate 100,000 rounds, verify RTP ≈ 99%, verify percentile distribution (~50% < 2x, ~10% > 10x).
- **Dice**: verify payout multiplier formula across all roll-under values 2–98.
- **Mines**: verify multiplier table per `(mines_count, tiles_clicked)` matches expected geometric formula.
- **Last Chance Mines**: verify exactly ~4% win rate over 10,000 trials.
- **Wheel**: verify exactly ~2% win rate over 10,000 trials.
- **Flappy**: verify multiplier doubles correctly every 10 pipes.

### 2. Balance accounting — integration tests (Jest + Supabase test instance)

- Place a bet → balance decreases by exact amount.
- Win → balance increases by exact payout.
- Double-spend race → atomic update prevents over-spending.
- Bust → `is_busted` flag set; Last Chance unlocks.
- Last Chance rebuy → balance set to exactly $500, `is_busted` cleared.

### 3. Lobby state machine — integration tests

- Create → host starts → STARTING → ACTIVE → timer hits 0 → ENDED with final ranks computed correctly.
- Bots fill empty seats on start.
- Public matchmaking: 2 players queue → seated together → bots fill the rest after 10s.
- Disconnect mid-round → seat preserved → reconnect resumes.
- Stale-lobby cron sweeps correctly.

### 4. End-to-end smoke test — Playwright

- One scripted flow: open landing → create guest → create lobby → play one Dice round → end of round → see graph.

### Explicitly not tested in v1

- Visual regression of animations
- Multi-browser Pusher realtime sync (validated manually)
- Load testing

## Open Items for the Implementation Plan

These are decisions to make during the writing-plans phase, not now:

- Exact Vercel cron schedule for crash rounds (one cron for all lobbies vs. one per lobby vs. on-demand kickstart)
- Whether to store bot personality archetype on the `lobby_players` row or in a separate config table
- Specific Tailwind theme config / shadcn component picks (mostly cosmetic — the colors are decided)
- Migration strategy (Supabase migrations CLI vs. raw SQL files)
- Sequencing — what gets built first (likely: auth → lobby creation → single game (Dice) → multi-game → realtime sync → Crash → bots → Last Chance → end-of-round graph)
