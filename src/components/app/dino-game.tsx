'use client';

import { useRef, useEffect, useCallback, useState } from 'react';

// ── Constants ───────────────────────────────────────────────────────────────

const CANVAS_W = 480;
const CANVAS_H = 130;
const GROUND_Y = 105;
const GRAVITY = 0.45;
const JUMP_VEL = -9;
const INITIAL_SPEED = 3;
const MAX_SPEED = 7;
const SPEED_INCREMENT = 0.0006;
const CACTUS_MIN_GAP = 140;
const CACTUS_MAX_GAP = 260;

// ── Dino shape (pixel-art style via rects) ──────────────────────────────────

function drawDino(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, dead: boolean) {
  ctx.fillStyle = '#535353';

  // Body
  ctx.fillRect(x, y - 26, 17, 26);
  // Head
  ctx.fillRect(x + 10, y - 36, 14, 14);
  // Eye
  ctx.fillStyle = dead ? '#535353' : '#fff';
  ctx.fillRect(x + 19, y - 34, 3, 3);
  if (dead) {
    // X eyes
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 19, y - 34, 1, 1);
    ctx.fillRect(x + 21, y - 34, 1, 1);
    ctx.fillRect(x + 20, y - 33, 1, 1);
    ctx.fillRect(x + 19, y - 32, 1, 1);
    ctx.fillRect(x + 21, y - 32, 1, 1);
  }
  ctx.fillStyle = '#535353';
  // Mouth
  ctx.fillRect(x + 21, y - 28, 3, 2);
  // Tail
  ctx.fillRect(x - 5, y - 24, 7, 3);
  ctx.fillRect(x - 8, y - 21, 5, 3);
  // Arms
  ctx.fillRect(x + 12, y - 14, 7, 3);

  // Legs (alternating)
  if (y < GROUND_Y) {
    ctx.fillRect(x + 2, y - 1, 4, 5);
    ctx.fillRect(x + 10, y - 1, 4, 5);
  } else if (dead) {
    ctx.fillRect(x + 2, y, 4, 6);
    ctx.fillRect(x + 10, y, 4, 6);
  } else {
    if (frame % 2 === 0) {
      ctx.fillRect(x + 2, y, 4, 6);
      ctx.fillRect(x + 10, y - 1, 4, 5);
    } else {
      ctx.fillRect(x + 2, y - 1, 4, 5);
      ctx.fillRect(x + 10, y, 4, 6);
    }
  }
}

// ── Cactus shapes ───────────────────────────────────────────────────────────

interface Cactus {
  x: number;
  w: number;
  h: number;
  variant: number;
}

function drawCactus(ctx: CanvasRenderingContext2D, c: Cactus) {
  ctx.fillStyle = '#535353';
  const baseY = GROUND_Y;

  if (c.variant === 0) {
    // Single tall
    ctx.fillRect(c.x, baseY - c.h, c.w, c.h);
    ctx.fillRect(c.x - 3, baseY - c.h + 8, 3, 10);
    ctx.fillRect(c.x + c.w, baseY - c.h + 14, 3, 8);
  } else if (c.variant === 1) {
    // Double
    ctx.fillRect(c.x, baseY - c.h, c.w, c.h);
    ctx.fillRect(c.x + c.w + 3, baseY - c.h + 5, c.w - 2, c.h - 5);
  } else {
    // Small
    ctx.fillRect(c.x, baseY - c.h, c.w, c.h);
  }
}

function cactusHitbox(c: Cactus): { x: number; y: number; w: number; h: number } {
  const extra = c.variant === 1 ? c.w : 0;
  // Generous hitbox — shrink by 4px on each side
  return { x: c.x + 4, y: GROUND_Y - c.h + 4, w: c.w + extra - 8, h: c.h - 6 };
}

// ── Ground pattern ──────────────────────────────────────────────────────────

function drawGround(ctx: CanvasRenderingContext2D, offset: number) {
  ctx.strokeStyle = '#535353';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y + 1);
  ctx.lineTo(CANVAS_W, GROUND_Y + 1);
  ctx.stroke();

  ctx.fillStyle = '#a0a0a0';
  for (let i = 0; i < 16; i++) {
    const bx = ((i * 42 + 7) - offset) % CANVAS_W;
    if (bx > 0) {
      ctx.fillRect(bx, GROUND_Y + 4, 3, 1);
    }
  }
}

// ── Cloud ───────────────────────────────────────────────────────────────────

interface Cloud {
  x: number;
  y: number;
}

function drawCloud(ctx: CanvasRenderingContext2D, c: Cloud) {
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(c.x, c.y, 24, 6);
  ctx.fillRect(c.x + 5, c.y - 4, 14, 5);
  ctx.fillRect(c.x + 8, c.y - 7, 8, 4);
}

// ── Component ───────────────────────────────────────────────────────────────

interface DinoGameProps {
  active?: boolean;
}

export function DinoGame({ active = true }: DinoGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const stateRef = useRef({
    playing: false,
    gameOver: false,
    dinoY: GROUND_Y,
    dinoVel: 0,
    speed: INITIAL_SPEED,
    score: 0,
    highScore: 0,
    cacti: [] as Cactus[],
    clouds: [] as Cloud[],
    groundOffset: 0,
    frame: 0,
    nextCactus: 200,
    started: false,
  });
  const [, forceRender] = useState(0);

  const jump = useCallback(() => {
    const s = stateRef.current;
    if (s.gameOver) {
      // Restart
      s.playing = true;
      s.gameOver = false;
      s.dinoY = GROUND_Y;
      s.dinoVel = 0;
      s.speed = INITIAL_SPEED;
      s.score = 0;
      s.cacti = [];
      s.groundOffset = 0;
      s.frame = 0;
      s.nextCactus = 200;
      return;
    }
    if (s.dinoY >= GROUND_Y) {
      s.dinoVel = JUMP_VEL;
      s.started = true;
      s.playing = true;
    }
  }, []);

  // ── Game loop ─────────────────────────────────────────────────────────────

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const s = stateRef.current;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    for (const cloud of s.clouds) {
      drawCloud(ctx, cloud);
    }

    drawGround(ctx, s.groundOffset);
    drawDino(ctx, 40, s.dinoY, s.frame, s.gameOver);

    for (const c of s.cacti) {
      drawCactus(ctx, c);
    }

    // Score
    ctx.fillStyle = '#535353';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    const scoreText = String(Math.floor(s.score)).padStart(5, '0');
    ctx.fillText(scoreText, CANVAS_W - 8, 16);
    if (s.highScore > 0) {
      ctx.fillStyle = '#a0a0a0';
      ctx.fillText(`HI ${String(s.highScore).padStart(5, '0')}`, CANVAS_W - 60, 16);
    }

    if (s.gameOver) {
      ctx.fillStyle = '#535353';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', CANVAS_W / 2, 40);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#a0a0a0';
      ctx.fillText('Space to restart', CANVAS_W / 2, 56);
      rafRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    if (!s.playing) {
      rafRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    // ── Physics ───────────────────────────────────────────────────────────
    s.dinoVel += GRAVITY;
    s.dinoY += s.dinoVel;
    if (s.dinoY >= GROUND_Y) {
      s.dinoY = GROUND_Y;
      s.dinoVel = 0;
    }

    s.groundOffset += s.speed;
    s.frame = Math.floor(s.groundOffset / 14);
    s.score += s.speed * 0.03;
    s.speed = Math.min(MAX_SPEED, s.speed + SPEED_INCREMENT);

    // Spawn cacti
    s.nextCactus -= s.speed;
    if (s.nextCactus <= 0) {
      const variant = Math.floor(Math.random() * 3);
      const h = 16 + Math.random() * 14;
      const w = variant === 1 ? 7 : 8 + Math.random() * 4;
      s.cacti.push({ x: CANVAS_W + 10, w, h, variant });
      s.nextCactus = CACTUS_MIN_GAP + Math.random() * CACTUS_MAX_GAP;
    }

    s.cacti = s.cacti
      .map((c) => ({ ...c, x: c.x - s.speed }))
      .filter((c) => c.x > -30);

    s.clouds = s.clouds
      .map((c) => ({ ...c, x: c.x - s.speed * 0.3 }))
      .filter((c) => c.x > -40);
    if (Math.random() < 0.005) {
      s.clouds.push({ x: CANVAS_W + 10, y: 12 + Math.random() * 35 });
    }

    // Collision — forgiving hitbox
    const dinoBox = { x: 44, y: s.dinoY - 24, w: 12, h: 22 };
    for (const c of s.cacti) {
      const hb = cactusHitbox(c);
      if (
        dinoBox.x < hb.x + hb.w &&
        dinoBox.x + dinoBox.w > hb.x &&
        dinoBox.y < hb.y + hb.h &&
        dinoBox.y + dinoBox.h > hb.y
      ) {
        s.gameOver = true;
        s.playing = false;
        if (Math.floor(s.score) > s.highScore) {
          s.highScore = Math.floor(s.score);
        }
        forceRender((n) => n + 1);
        break;
      }
    }

    rafRef.current = requestAnimationFrame(gameLoop);
  }, []);

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!active) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    rafRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, gameLoop]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, jump]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      onClick={jump}
      className="w-full cursor-pointer select-none rounded-lg border border-border/50 bg-white dark:bg-zinc-900"
      style={{ imageRendering: 'pixelated', maxHeight: '130px' }}
    />
  );
}
