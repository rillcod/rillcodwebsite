import p5 from 'p5';
import { CodeData } from '../CodeVisualizer';

export const physicsSketch = (p: p5, data: CodeData, isPlaying: boolean, speed: number) => {
  let balls: Ball[] = [];
  let playing = isPlaying;

  const containerEl = (): HTMLElement | null => (p as any)._container ?? null;

  p.setup = () => {
    const el = containerEl();
    const w = el?.offsetWidth || 600;
    const h = el?.offsetHeight || 400;
    p.createCanvas(w, h);
    p.colorMode(p.HSB, 360, 100, 100, 1);

    const initial = data.visualizationState?.balls || [];
    balls = initial.map((b: any) => new Ball(p, b.x, b.y, b.vx, b.vy, b.radius, b.hue));

    // Spawn defaults if none provided
    if (balls.length === 0) {
      balls = [
        new Ball(p, 0.3, 0.2, 2, 0, 20, 120),
        new Ball(p, 0.6, 0.15, -1.5, 0, 16, 200),
        new Ball(p, 0.5, 0.35, 1, 0, 24, 30),
      ];
    }
  };

  p.draw = () => {
    p.background(0, 0, 5);

    if (playing) {
      balls.forEach(b => { b.applyGravity(); b.update(speed); b.checkEdges(); });
    }
    balls.forEach(b => { b.display(); b.drawVector(); });
  };

  p.windowResized = () => {
    const el = containerEl();
    if (el) p.resizeCanvas(el.offsetWidth, el.offsetHeight);
  };

  (p as any).updateData = (newData: CodeData, newPlaying: boolean, newSpeed: number) => {
    playing = newPlaying;
    const next = newData.visualizationState?.balls || [];
    if (next.length !== balls.length) {
      balls = next.map((b: any) => new Ball(p, b.x, b.y, b.vx, b.vy, b.radius, b.hue));
    } else {
      next.forEach((b: any, i: number) => {
        const dist = p.dist(balls[i].pos.x, balls[i].pos.y, b.x * p.width, b.y * p.height);
        if (dist > 15) {
          balls[i].pos.set(b.x * p.width, b.y * p.height);
          balls[i].vel.set(b.vx, b.vy);
        }
      });
    }
  };
};

class Ball {
  p: p5;
  pos: p5.Vector;
  vel: p5.Vector;
  acc: p5.Vector;
  radius: number;
  hue: number;
  history: p5.Vector[] = [];

  constructor(p: p5, x: number, y: number, vx: number, vy: number, r: number, h: number) {
    this.p = p;
    this.pos = p.createVector(x * p.width, y * p.height);
    this.vel = p.createVector(vx, vy);
    this.acc = p.createVector(0, 0);
    this.radius = r || 18;
    this.hue = h || 120;
  }

  applyGravity() { this.acc.y = 0.2; }

  update(speed: number) {
    this.vel.add(this.acc);
    this.pos.add(p5.Vector.mult(this.vel, speed));
    this.acc.mult(0);
    this.history.push(this.pos.copy());
    if (this.history.length > 18) this.history.shift();
  }

  checkEdges() {
    if (this.pos.y > this.p.height - this.radius) {
      this.pos.y = this.p.height - this.radius;
      this.vel.y *= -0.82;
    }
    if (this.pos.x > this.p.width - this.radius || this.pos.x < this.radius) {
      this.vel.x *= -1;
    }
  }

  display() {
    this.p.noFill();
    this.p.strokeWeight(1.5);
    for (let i = 0; i < this.history.length; i++) {
      const alpha = this.p.map(i, 0, this.history.length, 0, 0.35);
      this.p.stroke(this.hue, 80, 100, alpha);
      this.p.ellipse(this.history[i].x, this.history[i].y, this.radius * (i / this.history.length));
    }

    this.p.noStroke();
    const ctx = this.p.drawingContext as CanvasRenderingContext2D;
    const grad = ctx.createRadialGradient(this.pos.x, this.pos.y, 0, this.pos.x, this.pos.y, this.radius);
    grad.addColorStop(0, 'white');
    grad.addColorStop(0.2, `hsla(${this.hue}, 80%, 60%, 0.85)`);
    grad.addColorStop(1, `hsla(${this.hue}, 80%, 20%, 0)`);
    ctx.fillStyle = grad;
    this.p.ellipse(this.pos.x, this.pos.y, this.radius * 2);
  }

  drawVector() {
    const v = p5.Vector.mult(this.vel, 5);
    this.p.stroke(0, 0, 100, 0.5);
    this.p.strokeWeight(1);
    this.p.line(this.pos.x, this.pos.y, this.pos.x + v.x, this.pos.y + v.y);
  }
}
