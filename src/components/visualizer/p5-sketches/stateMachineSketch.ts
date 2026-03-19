import p5 from 'p5';
import { CodeData } from '../CodeVisualizer';

/**
 * State Machine Sketch - Nodes and transitions. 
 */
export const stateMachineSketch = (p: p5, data: CodeData, isPlaying: boolean, speed: number) => {
  let nodes: Node[] = [];
  let connections: { from: number; to: number }[] = [];
  let currentState: number = data.variables?.state || 0;
  
  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.colorMode(p.HSB, 360, 100, 100, 1);
    
    // Initialize Nodes - Fixed positions for simplicity in educational sync
    const stateData = data.visualizationState?.states || [];
    stateData.forEach((s: any, i: number) => {
      nodes.push(new Node(p, s.label, s.x * p.width, s.y * p.height, i));
    });
    
    connections = data.visualizationState?.connections || [];
  };

  p.draw = () => {
    p.clear(0, 0, 0, 0);
    p.background(0, 0, 0, 0);

    // Render Transitions First
    p.strokeWeight(1);
    connections.forEach(conn => {
       const from = nodes[conn.from];
       const to = nodes[conn.to];
       if (from && to) {
         p.stroke(25, 0, 100, 0.1);
         p.line(from.pos.x, from.pos.y, to.pos.x, to.pos.y);
         
         // Particle Flow on line
         const t = (p.frameCount * 0.05 * speed) % 1;
         const px = p.lerp(from.pos.x, to.pos.x, t);
         const py = p.lerp(from.pos.y, to.pos.y, t);
         p.fill(25, 100, 100, 0.4);
         p.noStroke();
         p.ellipse(px, py, 3);
       }
    });

    // Render Nodes
    nodes.forEach((node, i) => {
      node.update(i === currentState);
      node.display();
    });
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };

  (p as any).updateData = (newData: CodeData) => {
    currentState = newData.variables?.state || 0;
    // Re-sync if nodes changed
    const nextStates = newData.visualizationState?.states || [];
    if (nextStates.length !== nodes.length) {
      nodes = nextStates.map((s: any, i: number) => new Node(p, s.label, s.x * p.width, s.y * p.height, i));
      connections = newData.visualizationState?.connections || [];
    }
  };
};

class Node {
  p: p5;
  label: string;
  pos: p5.Vector;
  index: number;
  size: number = 40;
  lerpedSize: number = 40;
  isActive: boolean = false;
  hue: number = 25; // Orange default

  constructor(p: p5, label: string, x: number, y: number, index: number) {
    this.p = p;
    this.label = label;
    this.pos = p.createVector(x, y);
    this.index = index;
  }

  update(active: boolean) {
    this.isActive = active;
    const targetSize = active ? 60 : 40;
    this.lerpedSize = this.p.lerp(this.lerpedSize, targetSize, 0.1);
  }

  display() {
    this.p.push();
    this.p.translate(this.pos.x, this.pos.y);
    
    // Active Halo
    if (this.isActive) {
       for (let i = 0; i < 3; i++) {
         this.p.noFill();
         this.p.stroke(this.hue, 100, 100, 0.4 / (i + 1));
         this.p.strokeWeight(1.5);
         this.p.ellipse(0, 0, this.lerpedSize + (this.p.frameCount % 50) + (i * 10));
       }
       this.p.fill(this.hue, 100, 100, 0.9);
    } else {
       this.p.fill(this.hue, 100, 20, 0.8);
    }
    
    // Node Body
    this.p.stroke(255, 0.2);
    this.p.strokeWeight(2);
    this.p.ellipse(0, 0, this.lerpedSize);
    
    // Label
    this.p.fill(255);
    this.p.textAlign(this.p.CENTER, this.p.CENTER);
    this.p.textSize(10);
    this.p.text(this.label, 0, 0);
    
    this.p.pop();
  }
}
