import p5 from 'p5';
import { CodeData } from '../CodeVisualizer';

/**
 * Turtle Sketch - Linear drawing logic. 
 */
export const turtleSketch = (p: p5, data: CodeData, isPlaying: boolean, speed: number) => {
  let path: p5.Vector[] = [];
  let currentHue = 180;
  let targetHue = 180;
  let currentPos = p.createVector(p.width / 2, p.height / 2);
  let targetPos = p.createVector(p.width / 2, p.height / 2);
  let progress = 0;
  
  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.colorMode(p.HSB, 360, 100, 100, 1);
    
    // Reset defaults based on step 0
    syncData(data);
  };

  const syncData = (newData: CodeData) => {
    const turtleState = newData.visualizationState?.turtle || { x: 0.5, y: 0.5, hue: 180, path: [] };
    path = (turtleState.path || []).map((pt: any) => p.createVector(pt.x * p.width, pt.y * p.height));
    targetPos = p.createVector(turtleState.x * p.width, turtleState.y * p.height);
    targetHue = turtleState.hue || 180;
  };

  p.draw = () => {
    p.clear(0, 0, 0, 0);
    p.background(0, 0, 0, 0);

    // Easing for currentPos
    currentPos = p5.Vector.lerp(currentPos, targetPos, 0.1 * speed);
    currentHue = p.lerp(currentHue, targetHue, 0.1 * speed);

    // Render Trail
    p.noFill();
    p.strokeWeight(3);
    p.beginShape();
    path.forEach((v, i) => {
      p.stroke(currentHue, 80, 100, p.map(i, 0, path.length, 0.2, 0.8));
      p.vertex(v.x, v.y);
    });
    p.vertex(currentPos.x, currentPos.y); // Current drawing segment
    p.endShape();

    // The Glowing Turtle Head
    p.push();
    p.translate(currentPos.x, currentPos.y);
    // Add glowing aura
    for (let i = 0; i < 5; i++) {
      p.fill(currentHue, 100, 100, 0.1);
      p.noStroke();
      p.ellipse(0, 0, 10 + i * 5);
    }
    // Main pointer
    p.rotate(p.atan2(targetPos.y - currentPos.y, targetPos.x - currentPos.x));
    p.fill(0, 0, 100);
    p.triangle(10, 0, -5, 5, -5, -5);
    p.pop();

    // Pulse effect
    if (isPlaying && p.frameCount % 20 === 0) {
       // Sparkle on current position
    }
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };

  (p as any).updateData = (newData: CodeData) => {
    syncData(newData);
  };
};
