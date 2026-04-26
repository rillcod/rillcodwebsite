import p5 from 'p5';
import { CodeData } from '../CodeVisualizer';

export const loopsSketch = (p: p5, data: CodeData, _isPlaying: boolean, speed: number) => {
  let iterations: number[] = data.visualizationState?.iterations || [0, 1, 2, 3, 4, 5, 6, 7];
  let currentCounter: number = data.variables?.i ?? 0;
  let angleOffset = 0;
  const HUE = 280; // Violet

  const containerEl = (): HTMLElement | null => (p as any)._container ?? null;

  p.setup = () => {
    const el = containerEl();
    const w = el?.offsetWidth || 600;
    const h = el?.offsetHeight || 400;
    p.createCanvas(w, h);
    p.colorMode(p.HSB, 360, 100, 100, 1);
  };

  p.draw = () => {
    p.background(0, 0, 5);

    const cx = p.width / 2;
    const cy = p.height / 2;
    const radius = Math.min(p.width, p.height) * 0.32;

    // Wrap to prevent float precision drift over long sessions
    angleOffset = (angleOffset + 0.01 * speed) % p.TWO_PI;

    const count = Math.max(iterations.length, 1);
    const active = currentCounter % count;

    for (let i = 0; i < count; i++) {
      const theta = angleOffset + (i / count) * p.TWO_PI;
      const x = cx + p.cos(theta) * radius;
      const y = cy + p.sin(theta) * radius;

      p.stroke(HUE, 60, 40, 0.25);
      p.strokeWeight(1);
      p.line(cx, cy, x, y);

      const isActive = i === active;
      const pulse = isActive ? p.sin(p.frameCount * 0.18) * 6 + 16 : 12;

      p.noStroke();
      if (isActive) {
        const ctx = p.drawingContext as CanvasRenderingContext2D;
        ctx.shadowBlur = 18;
        ctx.shadowColor = `hsla(${HUE}, 80%, 60%, 0.6)`;
        p.fill(HUE, 100, 100, 0.9);
      } else {
        const ctx = p.drawingContext as CanvasRenderingContext2D;
        ctx.shadowBlur = 0;
        p.fill(HUE, 55, 35, 0.5);
      }
      p.ellipse(x, y, pulse);

      p.fill(0, 0, 100, 0.85);
      p.textAlign(p.CENTER, p.CENTER);
      p.textSize(9);
      p.noStroke();
      p.text(iterations[i] ?? i, x, y);

      // Reset shadow so it doesn't leak to other draws
      (p.drawingContext as CanvasRenderingContext2D).shadowBlur = 0;
    }

    // Counter in centre
    p.noStroke();
    p.fill(HUE, 80, 100, 0.9);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(Math.max(24, radius * 0.25));
    p.text(currentCounter, cx, cy - 6);
    p.textSize(9);
    p.fill(HUE, 60, 70, 0.6);
    p.text('INDEX', cx, cy + radius * 0.15);
  };

  p.windowResized = () => {
    const el = containerEl();
    if (el) p.resizeCanvas(el.offsetWidth, el.offsetHeight);
  };

  (p as any).updateData = (newData: CodeData) => {
    iterations = newData.visualizationState?.iterations || iterations;
    currentCounter = newData.variables?.i ?? currentCounter;
  };
};
