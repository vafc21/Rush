"use client";
import { useEffect, useRef } from "react";

/**
 * Burst of celebratory particles. Mount this with a `trigger` value
 * that changes when you want to fire (e.g. when a win settles). It
 * spawns ~28 particles that radiate outward, fade, and disappear.
 *
 * Render anywhere — it's `pointer-events-none` and absolutely
 * positioned so it overlays whatever parent has `position: relative`.
 *
 * Set `intensity` from 0 (off) to 1+ (more particles). For really big
 * wins, pass 1.5–2.
 */

type Particle = {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  color: string;
  rotation: number;
  vrotation: number;
  life: number; // 0..1, decreases each frame
};

const PALETTE = ["#00E701", "#FFB800", "#B1BAD3", "#ffffff"];

export function WinBurst({
  trigger,
  intensity = 1,
}: {
  trigger: number | string | boolean;
  intensity?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);

  // Fire when `trigger` changes
  useEffect(() => {
    if (!trigger) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const count = Math.round(28 * intensity);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speed = 130 + Math.random() * 180;
      particlesRef.current.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80, // slight upward bias
        size: 3 + Math.random() * 4,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        rotation: Math.random() * Math.PI * 2,
        vrotation: (Math.random() - 0.5) * 8,
        life: 1,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  // RAF loop: integrate particles and redraw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(40, t - last) / 1000;
      last = t;

      // Match canvas backing size to display size for sharp rendering
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const targetW = Math.round(rect.width * dpr);
      const targetH = Math.round(rect.height * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const ps = particlesRef.current;
      for (const p of ps) {
        p.vy += 380 * dt; // gravity
        p.vx *= Math.pow(0.85, dt); // air drag
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += p.vrotation * dt;
        p.life -= dt * 0.85;
        if (p.life <= 0) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.5);
        ctx.restore();
      }
      particlesRef.current = ps.filter((p) => p.life > 0);

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
