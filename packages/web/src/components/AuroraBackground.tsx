'use client';

import { useEffect, useRef } from 'react';

/**
 * Soft purple aurora ribbons (canvas, no CSS blur).
 * Rendered at 2× internal resolution and scaled down — averages quantized
 * steps so gradients read smooth on 8-bit displays.
 */

const SUPER_SAMPLE = 2;

interface Blob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseRadius: number;
  stretchX: number;
  stretchY: number;
  color: [number, number, number];
  opacity: number;
  angle: number;
  angleSpeed: number;
  ribbonRotation: number;
  ribbonSpin: number;
  phase: number;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function gaussianFalloff(t: number): number {
  return Math.exp(-2.85 * t * t);
}

const GRADIENT_STOPS = 72;

export default function AuroraBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationId: number;
    let width = 0;
    let height = 0;
    let ssCanvas: HTMLCanvasElement | null = null;
    let ssCtx: CanvasRenderingContext2D | null = null;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const ss = document.createElement('canvas');
      ss.width = Math.round(width * dpr * SUPER_SAMPLE);
      ss.height = Math.round(height * dpr * SUPER_SAMPLE);
      const sctx = ss.getContext('2d', { alpha: true });
      if (!sctx) {
        ssCanvas = null;
        ssCtx = null;
        return;
      }
      sctx.setTransform(dpr * SUPER_SAMPLE, 0, 0, dpr * SUPER_SAMPLE, 0, 0);
      ssCanvas = ss;
      ssCtx = sctx;
    }

    resize();
    window.addEventListener('resize', resize);

    const dim = Math.max(width, height);

    const blobs: Blob[] = [
      {
        x: width * 0.2,
        y: height * 0.2,
        vx: 0,
        vy: 0,
        baseRadius: dim * 0.42,
        stretchX: 2.2,
        stretchY: 0.38,
        color: [124, 58, 237],
        opacity: 0.055,
        angle: 0,
        angleSpeed: 0.00055,
        ribbonRotation: 0.35,
        ribbonSpin: 0.00012,
        phase: 0,
      },
      {
        x: width * 0.85,
        y: height * 0.25,
        vx: 0,
        vy: 0,
        baseRadius: dim * 0.38,
        stretchX: 2.0,
        stretchY: 0.42,
        color: [139, 92, 246],
        opacity: 0.048,
        angle: Math.PI * 0.8,
        angleSpeed: 0.00048,
        ribbonRotation: -0.5,
        ribbonSpin: -0.0001,
        phase: 2.1,
      },
      {
        x: width * 0.45,
        y: height * 0.72,
        vx: 0,
        vy: 0,
        baseRadius: dim * 0.4,
        stretchX: 2.4,
        stretchY: 0.35,
        color: [109, 40, 217],
        opacity: 0.05,
        angle: Math.PI * 1.4,
        angleSpeed: 0.00062,
        ribbonRotation: 1.1,
        ribbonSpin: 0.00014,
        phase: 4.2,
      },
      {
        x: width * 0.55,
        y: height * 0.48,
        vx: 0,
        vy: 0,
        baseRadius: dim * 0.28,
        stretchX: 1.7,
        stretchY: 0.48,
        color: [167, 139, 250],
        opacity: 0.038,
        angle: Math.PI * 0.3,
        angleSpeed: 0.0007,
        ribbonRotation: 0.9,
        ribbonSpin: -0.00018,
        phase: 6.0,
      },
    ];

    let time = 0;

    function updateBlob(blob: Blob, dt: number) {
      blob.angle += blob.angleSpeed * dt;
      blob.ribbonRotation += blob.ribbonSpin * dt;

      const t = time * 0.0001;
      const wobble1 = Math.sin(t * 1.7 + blob.phase) * 0.55;
      const wobble2 = Math.sin(t * 0.85 + blob.phase * 1.3) * 0.32;
      const wobble3 = Math.cos(t * 2.1 + blob.phase * 0.7) * 0.22;

      const speed = 0.72;
      const targetVx = Math.cos(blob.angle + wobble1 + wobble2) * speed;
      const targetVy = Math.sin(blob.angle + wobble1 + wobble3) * speed;

      blob.vx = lerp(blob.vx, targetVx, 0.022);
      blob.vy = lerp(blob.vy, targetVy, 0.022);

      blob.x += blob.vx * dt * 0.11;
      blob.y += blob.vy * dt * 0.11;

      const margin = blob.baseRadius * blob.stretchX * 0.35;
      const pushStrength = 0.018;
      if (blob.x < -margin) blob.angle = lerp(blob.angle, 0, pushStrength);
      if (blob.x > width + margin) blob.angle = lerp(blob.angle, Math.PI, pushStrength);
      if (blob.y < -margin) blob.angle = lerp(blob.angle, Math.PI / 2, pushStrength);
      if (blob.y > height + margin) blob.angle = lerp(blob.angle, -Math.PI / 2, pushStrength);
    }

    function drawBlob(blob: Blob, c: CanvasRenderingContext2D) {
      const t = time * 0.0001;
      const breathe = 1 + Math.sin(t * 1.05 + blob.phase) * 0.06;
      const radius = blob.baseRadius * breathe;
      const wobbleRot =
        Math.sin(t * 0.9 + blob.phase) * 0.25 + Math.cos(t * 0.45 + blob.phase * 1.2) * 0.12;
      const rot = blob.ribbonRotation + wobbleRot;

      const [r, g, b] = blob.color;

      c.save();
      c.translate(blob.x, blob.y);
      c.rotate(rot);
      c.scale(blob.stretchX, blob.stretchY);

      const gradient = c.createRadialGradient(-radius * 0.08, 0, 0, 0, 0, radius);
      for (let i = 0; i <= GRADIENT_STOPS; i++) {
        const pos = i / GRADIENT_STOPS;
        const alpha = blob.opacity * gaussianFalloff(pos);
        gradient.addColorStop(pos, `rgba(${r}, ${g}, ${b}, ${alpha})`);
      }

      c.fillStyle = gradient;
      c.beginPath();
      c.arc(0, 0, radius, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }

    let lastTime = performance.now();

    function animate(now: number) {
      const dt = Math.min(now - lastTime, 50);
      lastTime = now;
      time += dt;

      if (!ssCtx || !ssCanvas) {
        animationId = requestAnimationFrame(animate);
        return;
      }

      ssCtx.clearRect(0, 0, width, height);
      ssCtx.globalCompositeOperation = 'lighter';

      for (const blob of blobs) {
        updateBlob(blob, dt);
        drawBlob(blob, ssCtx);
      }

      ssCtx.globalCompositeOperation = 'source-over';

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(ssCanvas, 0, 0, ssCanvas.width, ssCanvas.height, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      animationId = requestAnimationFrame(animate);
    }

    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
    />
  );
}
