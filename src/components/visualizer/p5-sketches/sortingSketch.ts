import p5 from 'p5';
import { CodeData } from '../CodeVisualizer';

export const sortingSketch = (p: p5, data: CodeData, isPlaying: boolean, speed: number) => {
  let bars: number[] = data.visualizationState?.array || [];
  let comparing: number[] = data.visualizationState?.comparing || [];
  let targetBars: number[] = [...bars];
  const lerpedBars: number[] = [...bars];
  const particles: Particle[] = [];

  const containerEl = (): HTMLElement | null => (p as any)._container ?? null;

  p.setup = () => {
    const el = containerEl();
    const w = el?.offsetWidth || 600;
    const h = el?.offsetHeight || 400;
    p.createCanvas(w, h);
    p.colorMode(p.HSB, 360, 100, 100, 1);
  };

  p.draw = () => {
    p.clear(0, 0, 0, 0);
    p.background(0, 0, 5);

    const margin = 30;
    const totalBars = bars.length || 1;
    const w = (p.width - margin * 2) / totalBars;

    for (let i = 0; i < totalBars; i++) {
      lerpedBars[i] = p.lerp(lerpedBars[i] ?? targetBars[i] ?? 0, targetBars[i] ?? 0, 0.15 * speed);

      const maxVal = Math.max(...bars, 1);
      const h2 = p.map(lerpedBars[i], 0, maxVal, 10, p.height - margin * 2);
      const x = margin + i * w;
      const y = p.height - margin - h2;

      const isComparing = comparing.includes(i);

      p.noStroke();
      if (isComparing) {
        const glow = p.sin(p.frameCount * 0.12) * 20 + 60;
        p.fill(180, 80, glow, 0.85);
        p.rect(x - 1, y - 1, w + 2, h2 + 2);
        p.fill(180, 80, 100);
      } else {
        p.fill(200 + (i / totalBars) * 50, 60, 75, 0.6);
      }
      p.rect(x, y, w - 2, h2);

      // Value label on taller bars
      if (h2 > 20) {
        p.fill(0, 0, 100, 0.5);
        p.textAlign(p.CENTER, p.BOTTOM);
        p.textSize(9);
        p.text(bars[i] ?? 0, x + w / 2, y - 2);
      }

      if (isComparing && p.frameCount % 5 === 0) {
        for (let j = 0; j < 2; j++) {
          particles.push(new Particle(p, x + w / 2, y, 180));
        }
      }
    }

    // Drain particles (cap to prevent unbounded growth)
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].update();
      particles[i].display();
      if (particles[i].finished()) particles.splice(i, 1);
    }
    if (particles.length > 120) particles.splice(0, particles.length - 120);
  };

  p.windowResized = () => {
    const el = containerEl();
    if (el) p.resizeCanvas(el.offsetWidth, el.offsetHeight);
  };

  (p as any).updateData = (newData: CodeData) => {
    targetBars = newData.visualizationState?.array || [];
    comparing = newData.visualizationState?.comparing || [];
    if (bars.length !== targetBars.length) bars = [...targetBars];
  };
};

class Particle {
  p: p5;
  pos: p5.Vector;
  vel: p5.Vector;
  alpha: number;
  hue: number;

  constructor(p: p5, x: number, y: number, hue: number) {
    this.p = p;
    this.pos = p.createVector(x, y);
    this.vel = p5.Vector.random2D().mult(p.random(1, 3));
    this.alpha = 1;
    this.hue = hue;
  }
  update() { this.pos.add(this.vel); this.alpha -= 0.03; }
  finished() { return this.alpha < 0; }
  display() {
    this.p.noStroke();
    this.p.fill(this.hue, 80, 100, this.alpha);
    this.p.ellipse(this.pos.x, this.pos.y, 4);
  }
}
