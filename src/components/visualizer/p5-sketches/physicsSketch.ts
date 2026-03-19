import p5 from 'p5';
import { CodeData } from '../CodeVisualizer';

/**
 * Physics Sketch - Interactive bouncing balls with physics properties.
 */
export const physicsSketch = (p: p5, data: CodeData, isPlaying: boolean, speed: number) => {
  let balls: Ball[] = [];
  
  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.colorMode(p.HSB, 360, 100, 100, 1);
    
    // Initial State - Sync with data
    const initialBalls = data.visualizationState?.balls || [];
    initialBalls.forEach((b: any, index: number) => {
      balls.push(new Ball(p, b.x, b.y, b.vx, b.vy, b.radius, b.hue));
    });
  };

  p.draw = () => {
    p.clear(0, 0, 0, 0);
    p.background(0, 0, 0, 0);

    // Dynamic Physics simulation if playing
    if (isPlaying) {
      balls.forEach(ball => {
        ball.applyGravity();
        ball.update(speed);
        ball.checkEdges();
      });
    }

    balls.forEach(ball => {
      ball.display();
      ball.drawVector();
    });
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };

  (p as any).updateData = (newData: CodeData) => {
    const nextBalls = newData.visualizationState?.balls || [];
    
    // Simple state synchronization: if counts don't match, rebuild
    if (nextBalls.length !== balls.length) {
      balls = nextBalls.map((b: any) => new Ball(p, b.x, b.y, b.vx, b.vy, b.radius, b.hue));
    } else {
      // Smoothly correct positions based on step data if different
      nextBalls.forEach((b: any, i: number) => {
        if (p.dist(balls[i].pos.x, balls[i].pos.y, b.x * p.width, b.y * p.height) > 10) {
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
    this.radius = r || 20;
    this.hue = h || 120;
  }

  applyGravity() {
    this.acc.y = 0.2;
  }

  update(speed: number) {
    this.vel.add(this.acc);
    this.pos.add(p5.Vector.mult(this.vel, speed));
    this.acc.mult(0);
    
    // Trail handling
    this.history.push(this.pos.copy());
    if (this.history.length > 15) {
      this.history.shift();
    }
  }

  checkEdges() {
    if (this.pos.y > this.p.height - this.radius) {
      this.pos.y = this.p.height - this.radius;
      this.vel.y *= -0.85; // Energy loss bounce
    }
    if (this.pos.x > this.p.width - this.radius || this.pos.x < this.radius) {
      this.vel.x *= -1;
    }
  }

  display() {
    // Glow Trail
    this.p.noFill();
    this.p.strokeWeight(2);
    for (let i = 0; i < this.history.length; i++) {
      const alpha = this.p.map(i, 0, this.history.length, 0, 0.4);
      this.p.stroke(this.hue, 80, 100, alpha);
      this.p.ellipse(this.history[i].x, this.history[i].y, this.radius * (i / this.history.length));
    }

    // Main Ball
    this.p.noStroke();
    const ctx = this.p.drawingContext as CanvasRenderingContext2D;
    const grad = ctx.createRadialGradient(
      this.pos.x, this.pos.y, 0,
      this.pos.x, this.pos.y, this.radius
    );
    grad.addColorStop(0, 'white');
    grad.addColorStop(0.2, `hsla(${this.hue}, 80%, 60%, 0.8)`);
    grad.addColorStop(1, `hsla(${this.hue}, 80%, 20%, 0)`);
    ctx.fillStyle = grad;
    this.p.ellipse(this.pos.x, this.pos.y, this.radius * 2);
  }

  drawVector() {
    // Educational Velocity Vector
    const arrowSize = 10;
    const v = p5.Vector.mult(this.vel, 5);
    this.p.stroke(0, 0, 100, 0.6);
    this.p.line(this.pos.x, this.pos.y, this.pos.x + v.x, this.pos.y + v.y);
  }
}
