import p5 from 'p5';
import { CodeData } from '../CodeVisualizer';

export const turtleSketch = (p: p5, data: CodeData, _isPlaying: boolean, speed: number) => {
  let path: p5.Vector[] = [];
  let currentHue = 180;
  let targetHue = 180;
  let currentPos: p5.Vector;
  let targetPos: p5.Vector;

  const containerEl = (): HTMLElement | null => (p as any)._container ?? null;

  const syncData = (d: CodeData) => {
    const ts = d.visualizationState?.turtle || { x: 0.5, y: 0.5, hue: 180, path: [] };
    path = (ts.path || []).map((pt: { x: number; y: number }) => p.createVector(pt.x * p.width, pt.y * p.height));
    targetPos = p.createVector(ts.x * p.width, ts.y * p.height);
    targetHue = ts.hue ?? 180;
  };

  p.setup = () => {
    const el = containerEl();
    const w = el?.offsetWidth || 600;
    const h = el?.offsetHeight || 400;
    p.createCanvas(w, h);
    p.colorMode(p.HSB, 360, 100, 100, 1);
    currentPos = p.createVector(p.width / 2, p.height / 2);
    targetPos = p.createVector(p.width / 2, p.height / 2);
    syncData(data);
  };

  p.draw = () => {
    p.background(0, 0, 5);

    currentPos = p5.Vector.lerp(currentPos, targetPos, 0.12 * speed);
    currentHue = p.lerp(currentHue, targetHue, 0.1 * speed);

    // Trail
    p.noFill();
    p.strokeWeight(2.5);
    if (path.length > 1) {
      for (let i = 1; i < path.length; i++) {
        const alpha = p.map(i, 0, path.length, 0.15, 0.8);
        p.stroke(currentHue, 80, 100, alpha);
        p.line(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y);
      }
      // current segment
      if (path.length > 0) {
        p.stroke(currentHue, 80, 100, 0.9);
        p.line(path[path.length - 1].x, path[path.length - 1].y, currentPos.x, currentPos.y);
      }
    }

    // Turtle head glow
    for (let i = 0; i < 4; i++) {
      p.fill(currentHue, 100, 100, 0.08);
      p.noStroke();
      p.ellipse(currentPos.x, currentPos.y, 12 + i * 7);
    }

    // Pointer triangle
    p.push();
    p.translate(currentPos.x, currentPos.y);
    const angle = p.atan2(targetPos.y - currentPos.y, targetPos.x - currentPos.x);
    p.rotate(angle);
    p.fill(0, 0, 100);
    p.noStroke();
    p.triangle(12, 0, -6, 6, -6, -6);
    p.pop();
  };

  p.windowResized = () => {
    const el = containerEl();
    if (el) p.resizeCanvas(el.offsetWidth, el.offsetHeight);
  };

  (p as any).updateData = (newData: CodeData) => {
    syncData(newData);
  };
};
