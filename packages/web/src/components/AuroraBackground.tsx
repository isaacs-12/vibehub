'use client';

import { useEffect, useRef } from 'react';

/**
 * Animated purple aurora background.
 * No CSS blur — all softness comes from very large radial gradients
 * with many stops and a smooth falloff curve. This avoids the color
 * banding that CSS filter: blur() introduces.
 */

interface Blob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseRadius: number;
  color: [number, number, number];
  opacity: number;
  angle: number;
  angleSpeed: number;
  phase: number;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// Attempt smooth Gaussian-like falloff
function gaussianFalloff(t: number): number {
  // Attempt approximation of gaussian: e^(-3t^2)
  return Math.exp(-3 * t * t);
}

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

    function resize() {
      // Use full device pixel ratio for crisp rendering
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();
    window.addEventListener('resize', resize);

    const dim = Math.max(width, height);

    // Make radii very large so the gradients are inherently soft — no blur needed
    const blobs: Blob[] = [
      {
        x: width * 0.15, y: height * 0.25,
        vx: 0, vy: 0,
        baseRadius: dim * 0.55,
        color: [124, 58, 237],
        opacity: 0.12,
        angle: 0, angleSpeed: 0.0004,
        phase: 0,
      },
      {
        x: width * 0.8, y: height * 0.15,
        vx: 0, vy: 0,
        baseRadius: dim * 0.5,
        color: [139, 92, 246],
        opacity: 0.09,
        angle: Math.PI * 0.7, angleSpeed: 0.00035,
        phase: 1.2,
      },
      {
        x: width * 0.5, y: height * 0.75,
        vx: 0, vy: 0,
        baseRadius: dim * 0.52,
        color: [109, 40, 217],
        opacity: 0.1,
        angle: Math.PI * 1.3, angleSpeed: 0.00045,
        phase: 2.5,
      },
      {
        x: width * 0.3, y: height * 0.1,
        vx: 0, vy: 0,
        baseRadius: dim * 0.35,
        color: [167, 139, 250],
        opacity: 0.07,
        angle: Math.PI * 0.4, angleSpeed: 0.0005,
        phase: 3.8,
      },
      {
        x: width * 0.85, y: height * 0.6,
        vx: 0, vy: 0,
        baseRadius: dim * 0.38,
        color: [91, 33, 182],
        opacity: 0.08,
        angle: Math.PI * 1.8, angleSpeed: 0.00038,
        phase: 5.1,
      },
      {
        x: width * 0.55, y: height * 0.4,
        vx: 0, vy: 0,
        baseRadius: dim * 0.42,
        color: [99, 102, 241],
        opacity: 0.06,
        angle: Math.PI * 2.2, angleSpeed: 0.0003,
        phase: 6.3,
      },
      {
        x: width * 0.1, y: height * 0.7,
        vx: 0, vy: 0,
        baseRadius: dim * 0.32,
        color: [147, 51, 234],
        opacity: 0.07,
        angle: Math.PI * 0.9, angleSpeed: 0.00055,
        phase: 7.7,
      },
      {
        x: width * 0.65, y: height * 0.05,
        vx: 0, vy: 0,
        baseRadius: dim * 0.28,
        color: [124, 58, 237],
        opacity: 0.06,
        angle: Math.PI * 1.6, angleSpeed: 0.0006,
        phase: 8.9,
      },
    ];

    let time = 0;

    function updateBlob(blob: Blob, dt: number) {
      blob.angle += blob.angleSpeed * dt;

      const t = time * 0.0001;
      const wobble1 = Math.sin(t * 1.7 + blob.phase) * 0.5;
      const wobble2 = Math.sin(t * 0.8 + blob.phase * 1.3) * 0.3;
      const wobble3 = Math.cos(t * 2.3 + blob.phase * 0.7) * 0.2;

      const speed = 0.4;
      const targetVx = Math.cos(blob.angle + wobble1 + wobble2) * speed;
      const targetVy = Math.sin(blob.angle + wobble1 + wobble3) * speed;

      blob.vx = lerp(blob.vx, targetVx, 0.015);
      blob.vy = lerp(blob.vy, targetVy, 0.015);

      blob.x += blob.vx * dt * 0.08;
      blob.y += blob.vy * dt * 0.08;

      const margin = blob.baseRadius * 0.3;
      const pushStrength = 0.015;
      if (blob.x < -margin) blob.angle = lerp(blob.angle, 0, pushStrength);
      if (blob.x > width + margin) blob.angle = lerp(blob.angle, Math.PI, pushStrength);
      if (blob.y < -margin) blob.angle = lerp(blob.angle, Math.PI / 2, pushStrength);
      if (blob.y > height + margin) blob.angle = lerp(blob.angle, -Math.PI / 2, pushStrength);
    }

    function drawBlob(blob: Blob) {
      // Breathing radius
      const t = time * 0.0001;
      const breathe = 1 + Math.sin(t * 1.1 + blob.phase) * 0.08;
      const radius = blob.baseRadius * breathe;

      const gradient = ctx!.createRadialGradient(
        blob.x, blob.y, 0,
        blob.x, blob.y, radius
      );
      const [r, g, b] = blob.color;

      // 48 stops with gaussian falloff — produces extremely smooth gradients
      const STOPS = 48;
      for (let i = 0; i <= STOPS; i++) {
        const pos = i / STOPS;
        const alpha = blob.opacity * gaussianFalloff(pos);
        gradient.addColorStop(pos, `rgba(${r}, ${g}, ${b}, ${alpha})`);
      }

      ctx!.fillStyle = gradient;
      ctx!.beginPath();
      ctx!.arc(blob.x, blob.y, radius, 0, Math.PI * 2);
      ctx!.fill();
    }

    let lastTime = performance.now();

    function animate(now: number) {
      const dt = Math.min(now - lastTime, 50);
      lastTime = now;
      time += dt;

      ctx!.clearRect(0, 0, width, height);
      ctx!.globalCompositeOperation = 'lighter';

      for (const blob of blobs) {
        updateBlob(blob, dt);
        drawBlob(blob);
      }

      ctx!.globalCompositeOperation = 'source-over';
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
