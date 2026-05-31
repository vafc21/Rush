# Rush

A multiplayer, **fake-money** casino battle royale. Players drop into a lobby with a virtual bankroll, play Stake-style mini-games against the house and each other for a fixed time, and whoever has the highest balance when the clock runs out wins.

No real money is ever involved. It's a game about competing for a high score, styled to look like an online casino.

---

## How it works

- **Battle royale lobbies** — Everyone starts with the same play-money balance ($1,000). A round lasts 3, 7, or 15 minutes. Highest balance at the buzzer wins.
- **Two ways to play:**
  - **Find Match** — public matchmaking. You're grouped with other humans (or filled out with CPUs) into a 4 / 8 / 16-player lobby that starts automatically.
  - **Create Lobby** — a private room. Share the code with friends, add CPUs with **+ Add CPU**, and **Kick** / **Ban** as the host. Starts when you do.
- **Bust & rebuy** — Drop below $1 and you're "busted," but the **Last Chance** zone (Wheel / Mines / Flappy) gives you a shot to climb back in.
- **CPUs** — Bots with distinct personalities (cautious / balanced / chaotic) that bet, react with emojis, and shift the leaderboard in real time.

## Game catalog

| Single-action | Multi-step | Real-time | Last Chance |
|---|---|---|---|
| Dice, Limbo, Plinko, Keno, Roulette, Wheel, Slots, Baccarat, Diamonds | Mines, Dragon Tower, Hilo, Blackjack | Crash | Wheel, Mines, Flappy |

- **Auto-bet** is available on the single-action games plus Mines (pre-select tiles), and Crash uses auto-cash-out as its equivalent.
- All outcomes are decided **server-side** with `crypto.randomInt` — the client only animates the result it's given.

## Tech stack

- **Next.js 15.5** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** (CSS `@theme`, no JS config)
- **Supabase** (Postgres) for persistence; atomic balance changes via Postgres RPC functions
- **Pusher Channels** for real-time lobby events (private channel per lobby, reference-counted subscriptions)
- **Custom JWT auth** (`jose`) with guest and registered accounts; passwords hashed with `bcryptjs`
- **Vitest** (unit/integration) + **Playwright** (e2e)

---

## Getting started

### Prerequisites

- Node.js 18.18+ (Next.js 15 requirement)
- A [Supabase](https://supabase.com) project
- A [Pusher Channels](https://pusher.com/channels) app

### 1. Install

```bash
npm install
```

### 2. Environment variables

Create `.env.local` in the project root:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>

# JWT — used to sign the rush_session cookie. Must be >= 32 chars.
JWT_SECRET=<random 32+ character string>

# Pusher Channels
PUSHER_APP_ID=<app id>
NEXT_PUBLIC_PUSHER_KEY=<key>
PUSHER_SECRET=<secret>
NEXT_PUBLIC_PUSHER_CLUSTER=<cluster, e.g. us2>
```

`.env.local` is gitignored — never commit it.

### 3. Apply database migrations

Run the SQL files in `supabase/migrations/` against your Supabase project **in order** (the Supabase SQL editor works fine):

```
20260529_000_initial.sql          # core tables (lobbies, players, bets, ...)
20260529_001_balance_fns.sql      # deduct_balance / credit_balance RPCs
20260530_000_matchmaking_queue.sql
20260531_000_more_games.sql
20260531_001_table_games.sql
20260601_000_custom_lobbies.sql   # no size cap + lobby_bans
```

### 4. Run

```bash
npm run dev
```

Open <http://localhost:3000>.

> **Local dev note:** the gameplay loop (Crash rounds, bot activity, end-of-round, matchmaking) is normally advanced by Vercel cron jobs. Locally there's no cron, so the client polls the same endpoints every few seconds while a relevant page is open — so everything works without any extra setup.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run test` | Run Vitest once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright e2e tests |

## Project structure

```
src/
  app/
    api/            # route handlers — auth, lobbies, games, cron
    lobby/[id]/     # the in-game lobby page
    play/           # the hub (find match / create / join)
    ...
  components/       # game UIs (CrashGame, PlinkoGame, ...) + shared UI
  lib/
    auth/           # JWT + session cookie helpers
    games/          # pure game math + payout tables (server-authoritative)
    lobby/          # codes, nicknames, host/ban helpers
    realtime/       # Pusher client/server + typed events
    db/             # Supabase client
supabase/migrations/  # SQL schema, applied in filename order
```

## Architecture highlights

- **Server-authoritative RNG.** Every game's outcome is computed in an API route with `crypto.randomInt`. The UI receives the result and plays an animation toward it — it can't influence or predict the roll.
- **Atomic balances.** Deducting a bet and crediting a payout go through Postgres RPC functions so concurrent bets can't corrupt a balance.
- **Real-time via Pusher.** Each lobby has a private channel. Balance updates, joins/leaves, reactions, and Crash round events are broadcast to everyone. Subscriptions are reference-counted so switching game tabs doesn't tear down the shared feed.
- **Cron + client-poller hybrid.** `vercel.json` schedules `end-rounds`, `crash-tick`, and `matchmake` every minute in production. The same endpoints are pinged client-side while pages are open, so the game is playable even where cron isn't running (local dev, or hosts without per-minute cron).

---

## Deployment (Vercel)

1. Push to GitHub and import the repo at [vercel.com/new](https://vercel.com/new). Next.js is auto-detected and `vercel.json` registers the cron jobs.
2. Add the 8 environment variables above in **Project Settings → Environment Variables**.
3. Deploy.

> On Vercel's free **Hobby** plan, the every-minute crons are throttled to roughly once per day. Live gameplay still works via the client pollers; the crons are only a background backstop for cleaning up abandoned lobbies. True per-minute cron is a Pro-plan feature.

---

## Disclaimer

Rush is a game that **simulates** a casino for entertainment and competition. There is no real currency, no deposits, no withdrawals, and nothing of monetary value can be won or lost.
