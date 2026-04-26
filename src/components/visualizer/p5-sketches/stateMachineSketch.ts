import p5 from 'p5';
import { CodeData } from '../CodeVisualizer';

export const stateMachineSketch = (p: p5, data: CodeData, _isPlaying: boolean, speed: number) => {
  let nodes: Node[] = [];
  let connections: { from: number; to: number }[] = [];
  let currentState: number = data.variables?.state ?? 0;

  const containerEl = (): HTMLElement | null => (p as any)._container ?? null;

  const buildNodes = (stateData: any[]) => {
    nodes = stateData.map((s: any, i: number) =>
      new Node(p, s.label ?? `S${i}`, s.x * p.width, s.y * p.height, i)
    );
  };

  p.setup = () => {
    const el = containerEl();
    const w = el?.offsetWidth || 600;
    const h = el?.offsetHeight || 400;
    p.createCanvas(w, h);
    p.colorMode(p.HSB, 360, 100, 100, 1);

    const stateData: any[] = data.visualizationState?.states || [];
    if (stateData.length > 0) {
      buildNodes(stateData);
    } else {
      // Default 4-state machine if no data provided
      const defaults = [
        { label: 'IDLE', x: 0.2, y: 0.5 },
        { label: 'INIT', x: 0.4, y: 0.25 },
        { label: 'RUN', x: 0.65, y: 0.25 },
        { label: 'DONE', x: 0.8, y: 0.5 },
      ];
      buildNodes(defaults);
      connections = [{ from: 0, to: 1 }, { from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 0 }];
    }
    connections = data.visualizationState?.connections || connections;
  };

  p.draw = () => {
    p.background(0, 0, 5);

    // Connections
    p.strokeWeight(1);
    connections.forEach(conn => {
      const from = nodes[conn.from];
      const to = nodes[conn.to];
      if (!from || !to) return;

      p.stroke(25, 0, 60, 0.2);
      p.line(from.pos.x, from.pos.y, to.pos.x, to.pos.y);

      // Flowing particle on each edge
      const t = ((p.frameCount * 0.03 * speed) % 1 + conn.from * 0.25) % 1;
      const px = p.lerp(from.pos.x, to.pos.x, t);
      const py = p.lerp(from.pos.y, to.pos.y, t);
      p.fill(25, 100, 100, 0.5);
      p.noStroke();
      p.ellipse(px, py, 4);
    });

    nodes.forEach((node, i) => {
      node.update(i === currentState);
      node.display();
    });
  };

  p.windowResized = () => {
    const el = containerEl();
    if (el) p.resizeCanvas(el.offsetWidth, el.offsetHeight);
  };

  (p as any).updateData = (newData: CodeData) => {
    currentState = newData.variables?.state ?? currentState;
    const next = newData.visualizationState?.states || [];
    if (next.length !== nodes.length) {
      buildNodes(next);
      connections = newData.visualizationState?.connections || connections;
    }
  };
};

class Node {
  p: p5;
  label: string;
  pos: p5.Vector;
  index: number;
  lerpedSize = 40;
  isActive = false;
  hue = 200;

  constructor(p: p5, label: string, x: number, y: number, index: number) {
    this.p = p;
    this.label = label;
    this.pos = p.createVector(x, y);
    this.index = index;
    this.hue = 160 + index * 40;
  }

  update(active: boolean) {
    this.isActive = active;
    this.lerpedSize = this.p.lerp(this.lerpedSize, active ? 58 : 40, 0.1);
  }

  display() {
    this.p.push();
    this.p.translate(this.pos.x, this.pos.y);

    if (this.isActive) {
      // Pulsing halo
      const pulse = (this.p.frameCount % 60) / 60;
      for (let i = 0; i < 3; i++) {
        this.p.noFill();
        this.p.stroke(this.hue, 100, 100, 0.35 / (i + 1));
        this.p.strokeWeight(1.5);
        this.p.ellipse(0, 0, this.lerpedSize + pulse * 20 + i * 12);
      }
      this.p.fill(this.hue, 90, 100, 0.92);
    } else {
      this.p.fill(this.hue, 60, 22, 0.8);
    }

    this.p.stroke(255, 0.15);
    this.p.strokeWeight(1.5);
    this.p.ellipse(0, 0, this.lerpedSize);

    this.p.fill(255);
    this.p.noStroke();
    this.p.textAlign(this.p.CENTER, this.p.CENTER);
    this.p.textSize(10);
    this.p.text(this.label, 0, 0);

    this.p.pop();
  }
}
