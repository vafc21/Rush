"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./Button";

/**
 * Tiny Flappy Bird-style skill game. Tap (or hit space) to flap, dodge
 * pipes, each pipe passed banks $0.01 × current multiplier, multiplier
 * doubles every 10 pipes (1× / 2× / 4× / 8× / ...). Dying ends the run
 * and POSTs the pipe count to the server, which credits the player.
 */

const W = 360;
const H = 480;
const GRAVITY = 0.45;
const FLAP_V = -7.5;
const PIPE_W = 60;
const PIPE_GAP = 130;
const PIPE_SPACING = 200;
const PIPE_SPEED = 2.5;
const BIRD_X = 80;
const BIRD_R = 12;

const PIPES_PER_DOUBLING = 10;
const BASE_CENTS_PER_PIPE = 1;

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

export function FlappyGame({ lobbyId }: { lobbyId: string }) {
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
    raf: 0,
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
    } else if (s.phase === "playing") {
      s.birdV = FLAP_V;
    }
  }, []);

  const submitRun = useCallback(
    async (pipes: number) => {
      try {
        const res = await fetch(`/api/lobbies/${lobbyId}/last-chance/flappy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pipes }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { banked?: number };
        if (typeof data.banked === "number" && data.banked > bestBanked) {
          setBestBanked(data.banked);
        }
      } catch {
        // ignore — UI keeps the last shown banked
      }
    },
    [lobbyId, bestBanked]
  );

  const die = useCallback(() => {
    const s = stateRef.current;
    s.phase = "dead";
    setPhase("dead");
    const pipes = s.pipeCount;
    submitRun(pipes);
  }, [submitRun]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const tick = () => {
      const s = stateRef.current;

      // Update
      if (s.phase === "playing") {
        s.birdV += GRAVITY;
        s.birdY += s.birdV;

        // Spawn pipes
        s.nextPipeIn--;
        if (s.nextPipeIn <= 0) {
          const topH = 50 + Math.random() * (H - PIPE_GAP - 100);
          s.pipes.push({ x: W, topH, passed: false });
          s.nextPipeIn = PIPE_SPACING / PIPE_SPEED;
        }

        for (const p of s.pipes) {
          p.x -= PIPE_SPEED;
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
          die();
        } else {
          for (const p of s.pipes) {
            const inX = BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + PIPE_W;
            if (inX) {
              if (s.birdY - BIRD_R < p.topH || s.birdY + BIRD_R > p.topH + PIPE_GAP) {
                die();
                break;
              }
            }
          }
        }
      }

      // Draw
      ctx.fillStyle = "#0F212E";
      ctx.fillRect(0, 0, W, H);

      // Pipes
      ctx.fillStyle = "#00E701";
      for (const p of s.pipes) {
        ctx.fillRect(p.x, 0, PIPE_W, p.topH);
        ctx.fillRect(p.x, p.topH + PIPE_GAP, PIPE_W, H - p.topH - PIPE_GAP);
      }

      // Ground line
      ctx.fillStyle = "#1A2C38";
      ctx.fillRect(0, H - 2, W, 2);

      // Bird
      ctx.beginPath();
      ctx.arc(BIRD_X, s.birdY, BIRD_R, 0, Math.PI * 2);
      ctx.fillStyle = "#FFB800";
      ctx.fill();
      // Bird eye
      ctx.beginPath();
      ctx.arc(BIRD_X + 4, s.birdY - 3, 2, 0, Math.PI * 2);
      ctx.fillStyle = "#0F212E";
      ctx.fill();

      // Overlay text
      if (s.phase === "ready") {
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = "bold 20px ui-sans-serif, system-ui";
        ctx.textAlign = "center";
        ctx.fillText("Tap to flap", W / 2, H / 2);
      } else if (s.phase === "dead") {
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = "bold 24px ui-sans-serif, system-ui";
        ctx.textAlign = "center";
        ctx.fillText("Splat", W / 2, H / 2 - 10);
        ctx.font = "14px ui-sans-serif, system-ui";
        ctx.fillStyle = "rgba(177,186,211,0.85)";
        ctx.fillText(
          `${s.pipeCount} pipes · $${(bankedFor(s.pipeCount) / 100).toFixed(2)} banked`,
          W / 2,
          H / 2 + 16
        );
      }

      s.raf = requestAnimationFrame(tick);
    };
    stateRef.current.raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(stateRef.current.raf);
  }, [die]);

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
    setPhase("ready");
    setPipeCount(0);
    setBanked(0);
  }

  return (
    <div className="w-full max-w-md space-y-3 rounded-lg bg-panel p-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-muted">Last Chance</p>
        <h2 className="text-xl font-black text-brand">Flappy</h2>
        <p className="mt-1 text-xs text-secondary">
          Tap / space to flap. $0.01 per pipe — multiplier doubles every 10.
        </p>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">
          Pipes <span className="font-bold tabular-nums text-white">{pipeCount}</span>
        </span>
        <span className="text-muted">
          Multi <span className="font-bold tabular-nums text-accent">{multiplierAt(pipeCount)}×</span>
        </span>
        <span className="text-muted">
          Banked <span className="font-bold tabular-nums text-accent">${(banked / 100).toFixed(2)}</span>
        </span>
      </div>

      <div
        className="overflow-hidden rounded-md"
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
          className="block w-full touch-none"
          style={{ aspectRatio: `${W}/${H}` }}
        />
      </div>

      {phase === "dead" && (
        <div className="space-y-2">
          {banked > 0 && (
            <p className="rounded-md bg-accent/10 px-3 py-2 text-center text-sm font-bold text-accent">
              +${(banked / 100).toFixed(2)} added to your balance
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
