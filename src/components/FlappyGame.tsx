"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { pts } from "@/lib/format";

/**
 * Tiny Flappy Bird-style skill game. Tap (or hit space) to flap, dodge
 * pipes, each pipe passed banks 0.20 pts × current multiplier, multiplier
 * doubles every 10 pipes (1× / 2× / 4× / 8× / ...). Dying ends the run
 * and POSTs the pipe count to the server, which credits the player.
 *
 * The server returns the player's new lobby balance, which we hand back
 * to the parent via `onBanked` so the balance updates instantly — without
 * waiting for the realtime `balance_update` echo to make the round trip.
 */

const W = 360;
const H = 480;
// Physics constants are tuned for a 60Hz screen. They were originally applied
// once per animation frame; the loop now scales them by `dt`, the elapsed
// time since the previous frame measured in 60Hz-frame units (1.0 = 1/60s),
// so the game plays at the same speed on 60Hz, 120Hz and 144Hz displays.
const GRAVITY = 0.45; // velocity gained per 60Hz frame
const FLAP_V = -7.5; // instantaneous velocity set on flap (px / 60Hz-frame)
const PIPE_W = 60;
const PIPE_GAP = 130;
const PIPE_SPACING = 200;
const PIPE_SPEED = 2.5; // px scrolled per 60Hz frame
// One reference timestep (60 fps), in milliseconds, and the largest `dt` we
// allow. Clamping prevents a huge physics jump after the tab was backgrounded
// (rAF pauses while hidden, so the first frame back can report a large gap).
const FRAME_MS = 1000 / 60;
const MAX_DT = 2; // ≈ 1/30s worth of motion in a single step
const BIRD_X = 80;
const BIRD_R = 12;
const GROUND_H = 26; // decorative ground band; death floor stays at y = H

const PIPES_PER_DOUBLING = 10;
const BASE_CENTS_PER_PIPE = 20;

type Pipe = {
  x: number;
  topH: number;
  passed: boolean;
};

type Phase = "ready" | "playing" | "dead";

function bankedFor(pipes: number): number {
  let cents = 0;
  for (let i = 0; i < pipes; i++) {
    const tier = Math.floor(i / PIPES_PER_DOUBLING);
    cents += BASE_CENTS_PER_PIPE * Math.pow(2, tier);
  }
  return cents;
}

function multiplierAt(pipes: number): number {
  return Math.pow(2, Math.floor(pipes / PIPES_PER_DOUBLING));
}

// Pre-computed star field so it doesn't shimmer between frames.
const STARS = Array.from({ length: 28 }, (_, i) => ({
  x: (i * 53) % W,
  y: (i * 89) % (H - GROUND_H - 40),
  r: (i % 3) * 0.4 + 0.4,
  a: ((i * 7) % 5) / 10 + 0.25,
}));

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function FlappyGame({
  lobbyId,
  onBanked,
}: {
  lobbyId: string;
  onBanked?: (newBalanceCents: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [pipeCount, setPipeCount] = useState(0);
  const [banked, setBanked] = useState(0);
  const [bestBanked, setBestBanked] = useState(0);

  const stateRef = useRef({
    birdY: H / 2,
    birdV: 0,
    pipes: [] as Pipe[],
    nextPipeIn: 0,
    pipeCount: 0,
    phase: "ready" as Phase,
    t: 0,
    scroll: 0,
  });

  const flap = useCallback(() => {
    const s = stateRef.current;
    if (s.phase === "ready") {
      // start
      s.birdY = H / 2;
      s.birdV = FLAP_V;
      s.pipes = [];
      s.nextPipeIn = 60;
      s.pipeCount = 0;
      s.phase = "playing";
      setPhase("playing");
      setPipeCount(0);
      setBanked(0);
      // Anchor the run server-side so the banked score can be validated
      // against elapsed time (anti-cheat). Fire-and-forget — the run plays
      // locally regardless.
      fetch(`/api/lobbies/${lobbyId}/last-chance/flappy/start`, {
        method: "POST",
      }).catch(() => {});
    } else if (s.phase === "playing") {
      s.birdV = FLAP_V;
    }
  }, [lobbyId]);

  const submitRun = useCallback(
    async (pipes: number) => {
      try {
        const res = await fetch(`/api/lobbies/${lobbyId}/last-chance/flappy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pipes }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          banked?: number;
          newBalanceCents?: number;
        };
        if (typeof data.banked === "number" && data.banked > bestBanked) {
          setBestBanked(data.banked);
        }
        // Reflect the credited balance immediately so the player sees the
        // money land without waiting on the realtime round-trip.
        if (typeof data.newBalanceCents === "number") {
          onBanked?.(data.newBalanceCents);
        }
      } catch {
        // ignore — UI keeps the last shown banked
      }
    },
    [lobbyId, bestBanked, onBanked]
  );

  // Keep the latest `die` reachable from the rAF loop without making the
  // loop effect re-subscribe (and tear down the animation) every render.
  const dieRef = useRef<() => void>(() => {});
  dieRef.current = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== "playing") return;
    s.phase = "dead";
    setPhase("dead");
    submitRun(s.pipeCount);
  }, [submitRun]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    let lastTs = 0;
    const tick = (ts: number) => {
      const s = stateRef.current;

      // Delta-time in 60Hz-frame units. The first frame (and the first frame
      // after the tab regains focus, via the visibility reset below) has no
      // previous timestamp, so we treat it as a single nominal step. Clamp to
      // MAX_DT so a long gap can't teleport the bird through pipes.
      let dt = lastTs === 0 ? 1 : (ts - lastTs) / FRAME_MS;
      lastTs = ts;
      if (dt > MAX_DT) dt = MAX_DT;
      if (dt < 0) dt = 0;
      s.t += dt;

      // Update
      if (s.phase === "playing") {
        s.scroll = (s.scroll + PIPE_SPEED * dt) % 24;
        s.birdV += GRAVITY * dt;
        s.birdY += s.birdV * dt;

        // Spawn pipes (nextPipeIn is a countdown in 60Hz-frame units)
        s.nextPipeIn -= dt;
        if (s.nextPipeIn <= 0) {
          const topH = 50 + Math.random() * (H - PIPE_GAP - 100);
          s.pipes.push({ x: W, topH, passed: false });
          s.nextPipeIn = PIPE_SPACING / PIPE_SPEED;
        }

        for (const p of s.pipes) {
          p.x -= PIPE_SPEED * dt;
          // Score when bird passes a pipe
          if (!p.passed && p.x + PIPE_W < BIRD_X - BIRD_R) {
            p.passed = true;
            s.pipeCount++;
            setPipeCount(s.pipeCount);
            setBanked(bankedFor(s.pipeCount));
          }
        }
        s.pipes = s.pipes.filter((p) => p.x + PIPE_W > -10);

        // Collisions
        if (s.birdY > H - BIRD_R || s.birdY < BIRD_R) {
          dieRef.current();
        } else {
          for (const p of s.pipes) {
            const inX = BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + PIPE_W;
            if (inX) {
              if (s.birdY - BIRD_R < p.topH || s.birdY + BIRD_R > p.topH + PIPE_GAP) {
                dieRef.current();
                break;
              }
            }
          }
        }
      } else if (s.phase === "dead") {
        // Let the bird drop onto the ground for a softer landing.
        if (s.birdY < H - BIRD_R) {
          s.birdV += GRAVITY * dt;
          s.birdY = Math.min(H - BIRD_R, s.birdY + s.birdV * dt);
        }
      }

      draw(ctx, s);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    // After the tab is hidden rAF stops firing; drop the stale timestamp so
    // the next frame restarts the clock instead of integrating the whole gap.
    const onVisibility = () => {
      if (document.hidden) lastTs = 0;
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Input bindings
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        flap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flap]);

  function tryAgain() {
    const s = stateRef.current;
    s.phase = "ready";
    s.birdY = H / 2;
    s.birdV = 0;
    s.pipes = [];
    setPhase("ready");
    setPipeCount(0);
    setBanked(0);
  }

  return (
    <div className="w-full max-w-md space-y-3 rounded-2xl border border-white/5 bg-gradient-to-b from-panel to-bg p-5 shadow-xl">
      <div className="text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted">
          Last Chance
        </p>
        <h2 className="text-2xl font-black tracking-tight text-brand drop-shadow-[0_0_10px_rgba(255,184,0,0.35)]">
          🐦 Flappy
        </h2>
        <p className="mt-1 text-xs text-secondary">
          Tap / space to flap. 0.20 pts per pipe — multiplier doubles every 10.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Pipes" value={String(pipeCount)} tone="white" />
        <Stat label="Multi" value={`${multiplierAt(pipeCount)}×`} tone="brand" />
        <Stat label="Banked" value={`${pts(banked)} pts`} tone="accent" />
      </div>

      <div
        className="relative overflow-hidden rounded-xl ring-1 ring-white/10"
        style={{ maxWidth: W }}
        onPointerDown={(e) => {
          e.preventDefault();
          flap();
        }}
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="block w-full cursor-pointer touch-none select-none"
          style={{ aspectRatio: `${W}/${H}` }}
        />
      </div>

      {phase === "dead" && (
        <div className="space-y-2">
          {banked > 0 ? (
            <p className="rounded-lg bg-accent/10 px-3 py-2 text-center text-sm font-bold text-accent ring-1 ring-accent/20">
              +{pts(banked)} pts cashed into your balance
            </p>
          ) : (
            <p className="rounded-lg bg-white/5 px-3 py-2 text-center text-sm text-muted">
              No pipes cleared — give it another go.
            </p>
          )}
          {bestBanked > 0 && (
            <p className="text-center text-xs text-muted">
              Best run this session: {pts(bestBanked)} pts
            </p>
          )}
          <Button onClick={tryAgain} className="w-full">
            Play again
          </Button>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "white" | "brand" | "accent";
}) {
  const color =
    tone === "brand" ? "text-brand" : tone === "accent" ? "text-accent" : "text-white";
  return (
    <div className="rounded-lg bg-black/20 px-2 py-1.5 text-center ring-1 ring-white/5">
      <div className="text-[9px] font-semibold uppercase tracking-widest text-muted">
        {label}
      </div>
      <div className={`text-base font-black tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

type GameState = {
  birdY: number;
  birdV: number;
  pipes: Pipe[];
  pipeCount: number;
  phase: Phase;
  t: number;
  scroll: number;
};

function draw(ctx: CanvasRenderingContext2D, s: GameState) {
  // --- Sky ---
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#0A1622");
  sky.addColorStop(0.6, "#11293A");
  sky.addColorStop(1, "#16374D");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // --- Stars ---
  for (const st of STARS) {
    ctx.globalAlpha = st.a;
    ctx.fillStyle = "#CFE3FF";
    ctx.beginPath();
    ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // --- Distant skyline glow on the horizon ---
  const horizon = H - GROUND_H;
  ctx.fillStyle = "rgba(0,231,1,0.06)";
  for (let i = 0; i < 7; i++) {
    const bw = 26 + ((i * 37) % 22);
    const bh = 24 + ((i * 53) % 46);
    const bx = ((i * 70 - (s.scroll * 0.3)) % (W + 60)) - 30;
    ctx.fillRect(bx, horizon - bh, bw, bh);
  }

  // --- Pipes (neon, with glow + cap) ---
  ctx.save();
  ctx.shadowColor = "rgba(0,231,1,0.55)";
  ctx.shadowBlur = 14;
  for (const p of s.pipes) {
    drawPipe(ctx, p.x, 0, p.topH, false);
    drawPipe(ctx, p.x, p.topH + PIPE_GAP, H - p.topH - PIPE_GAP, true);
  }
  ctx.restore();

  // --- Ground band ---
  const groundGrad = ctx.createLinearGradient(0, horizon, 0, H);
  groundGrad.addColorStop(0, "#0C1C28");
  groundGrad.addColorStop(1, "#081019");
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, horizon, W, GROUND_H);
  // glowing top edge
  ctx.fillStyle = "rgba(0,231,1,0.8)";
  ctx.fillRect(0, horizon, W, 2);
  // scrolling ticks
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  for (let x = -24 + (s.scroll % 24); x < W; x += 24) {
    ctx.fillRect(x, horizon + 6, 12, 3);
  }

  // --- Bird ---
  drawBird(ctx, s);

  // --- Overlays ---
  if (s.phase === "ready") {
    panel(ctx, "Tap to flap", "Dodge the pipes — bank cents per gap");
  } else if (s.phase === "playing") {
    // big live score
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = "900 44px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 8;
    ctx.fillText(String(s.pipeCount), W / 2, 64);
    ctx.shadowBlur = 0;
  } else if (s.phase === "dead") {
    panel(
      ctx,
      "Splat!",
      `${s.pipeCount} pipes · ${pts(bankedFor(s.pipeCount))} pts banked`
    );
  }
}

function drawPipe(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  capAtTop: boolean
) {
  if (h <= 0) return;
  const grad = ctx.createLinearGradient(x, 0, x + PIPE_W, 0);
  grad.addColorStop(0, "#0a8f24");
  grad.addColorStop(0.18, "#2fdd4e");
  grad.addColorStop(0.5, "#00E701");
  grad.addColorStop(0.85, "#11a52b");
  grad.addColorStop(1, "#0a7d20");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, PIPE_W, h);

  // glossy highlight stripe
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(x + 8, y, 6, h);

  // cap (lip) at the mouth of the pipe
  const capH = 16;
  const capY = capAtTop ? y : y + h - capH;
  ctx.fillStyle = "#0e6f1f";
  ctx.fillRect(x - 4, capY, PIPE_W + 8, capH);
  ctx.fillStyle = grad;
  ctx.fillRect(x - 4, capY + 3, PIPE_W + 8, capH - 6);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(x, capY + 3, 6, capH - 6);
}

function drawBird(ctx: CanvasRenderingContext2D, s: GameState) {
  const x = BIRD_X;
  const y = s.birdY;
  // tilt: nose up when rising, dive down when falling
  const tilt = Math.max(-0.5, Math.min(1.1, s.birdV / 12));
  // wing flap cycle — driven by accumulated time so the flap rate is the same
  // regardless of refresh rate (matches the old 60Hz cadence of frame * 0.4).
  const wing = Math.sin(s.t * 0.4) * 0.5;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);

  ctx.shadowColor = "rgba(255,184,0,0.5)";
  ctx.shadowBlur = 12;

  // body
  const body = ctx.createRadialGradient(-3, -3, 2, 0, 0, BIRD_R + 2);
  body.addColorStop(0, "#FFE08A");
  body.addColorStop(0.55, "#FFB800");
  body.addColorStop(1, "#E59400");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // wing
  ctx.fillStyle = "#F59E0B";
  ctx.beginPath();
  ctx.ellipse(-3, 2 + wing * 4, 7, 4.5, wing * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // beak
  ctx.fillStyle = "#FF7A00";
  ctx.beginPath();
  ctx.moveTo(BIRD_R - 2, -2);
  ctx.lineTo(BIRD_R + 7, 1);
  ctx.lineTo(BIRD_R - 2, 4);
  ctx.closePath();
  ctx.fill();

  // eye white + pupil
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(5, -4, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0F212E";
  ctx.beginPath();
  ctx.arc(6.5, -4, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function panel(ctx: CanvasRenderingContext2D, title: string, sub: string) {
  const pw = 240;
  const ph = 92;
  const px = (W - pw) / 2;
  const py = H / 2 - ph / 2 - 20;

  ctx.save();
  ctx.fillStyle = "rgba(10,22,34,0.82)";
  roundRect(ctx, px, py, pw, ph, 14);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,184,0,0.35)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, px, py, pw, ph, 14);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "#FFD45E";
  ctx.font = "900 26px ui-sans-serif, system-ui";
  ctx.fillText(title, W / 2, py + 40);

  ctx.fillStyle = "rgba(177,186,211,0.92)";
  ctx.font = "500 13px ui-sans-serif, system-ui";
  ctx.fillText(sub, W / 2, py + 66);
  ctx.restore();
}
