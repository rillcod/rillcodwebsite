import p5 from 'p5';
import { CodeData } from '../CodeVisualizer';

/**
 * Sorting Sketch - Visualizes comparison and swaps.
 */
export const sortingSketch = (p: p5, data: CodeData, isPlaying: boolean, speed: number) => {
  let bars: number[] = data.visualizationState?.array || [];
  let comparing: number[] = data.visualizationState?.comparing || [];
  let targetBars: number[] = [...bars];
  let lerpedBars: number[] = [...bars];
  let particles: Particle[] = [];
  
  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.colorMode(p.HSB, 360, 100, 100, 1);
  };

  p.draw = () => {
    p.clear(0, 0, 0, 0);
    p.background(0, 0, 0, 0);
    
    const margin = 50;
    const w = (p.width - margin * 2) / bars.length;
    
    // Smooth Lerp for Swaps
    for (let i = 0; i < bars.length; i++) {
      lerpedBars[i] = p.lerp(lerpedBars[i] || 0, targetBars[i] || 0, 0.1 * speed);
      
      const h = p.map(lerpedBars[i], 0, Math.max(...bars, 1), 20, p.height - margin * 2);
      const xInProgress = margin + i * w;
      const yInProgress = p.height - margin - h;

      // Interaction Highlighting
      const isComparing = comparing.includes(i);
      
      p.noStroke();
      if (isComparing) {
        // Neon Pulsing Comparison Bar
        const glow = p.sin(p.frameCount * 0.1) * 20 + 60;
        p.fill(180, 80, glow, 0.8);
        p.rect(xInProgress - 2, yInProgress - 2, w + 4, h + 4);
        p.fill(180, 80, 100);
      } else {
        // Gradient Base Bars
        p.fill(200 + (i / bars.length) * 50, 60, 80, 0.5);
      }
      
      // Draw Bar with Shadow-like effect
      p.rect(xInProgress, yInProgress, w - 2, h);
      
      // Particle Burst on interaction
      if (isComparing && p.frameCount % 5 === 0) {
        for (let j = 0; j < 2; j++) {
          particles.push(new Particle(p, xInProgress + w/2, yInProgress, 180));
        }
      }
    }

    // Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].update();
      particles[i].display();
      if (particles[i].finished()) {
        particles.splice(i, 1);
      }
    }
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };

  // Attach sync method
  (p as any).updateData = (newData: CodeData) => {
    targetBars = newData.visualizationState?.array || [];
    comparing = newData.visualizationState?.comparing || [];
    // Only update base bars if actually different or first run
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
    this.vel = p5.Vector.random2D().mult(p.random(1, 4));
    this.alpha = 1;
    this.hue = hue;
  }

  update() {
    this.pos.add(this.vel);
    this.alpha -= 0.02;
  }

  finished() {
    return this.alpha < 0;
  }

  display() {
    this.p.noStroke();
    this.p.fill(this.hue, 80, 100, this.alpha);
    this.p.ellipse(this.pos.x, this.pos.y, 4);
  }
}
