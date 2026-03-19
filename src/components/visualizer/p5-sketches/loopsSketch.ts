import p5 from 'p5';
import { CodeData } from '../CodeVisualizer';

/**
 * Loops Sketch - Rotating Iterative elements. 
 */
export const loopsSketch = (p: p5, data: CodeData, isPlaying: boolean, speed: number) => {
  let iterations: number[] = data.visualizationState?.iterations || [];
  let ringRadius = 150;
  let angleOffset = 0;
  let currentHue = 330; // Pink
  let currentCounter = data.variables?.i || 0;
  
  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.colorMode(p.HSB, 360, 100, 100, 1);
  };

  p.draw = () => {
    p.clear(0, 0, 0, 0);
    p.background(0, 0, 0, 0);

    const centerX = p.width / 2;
    const centerY = p.height / 2;
    
    // Rotating Aura
    angleOffset += 0.01 * speed;
    
    // Render loop nodes in circle
    const count = Math.max(iterations.length, 1);
    for (let i = 0; i < count; i++) {
       const theta = angleOffset + (i / count) * p.TWO_PI;
       const x = centerX + p.cos(theta) * ringRadius;
       const y = centerY + p.sin(theta) * ringRadius;
       
       // Glowing Connection Line
       p.stroke(currentHue, 80, 50, 0.2);
       p.strokeWeight(1);
       p.line(centerX, centerY, x, y);
       
       // Pulse for the current iteration
       const size = 15 + (i === currentCounter % count ? (p.sin(p.frameCount * 0.2) * 10 + 20) : 0);
       
       p.noStroke();
       const ctx = p.drawingContext as CanvasRenderingContext2D;
       if (i === currentCounter % count) {
         p.fill(currentHue, 100, 100, 0.8);
         // Dynamic shadow
         ctx.shadowBlur = 15;
         ctx.shadowColor = `hsla(${currentHue}, 80%, 50%, 0.5)`;
       } else {
         p.fill(currentHue, 60, 30, 0.4);
         ctx.shadowBlur = 0;
       }
       
       p.ellipse(x, y, size);
       
       // Numerical Label
       p.fill(255);
       p.textAlign(p.CENTER, p.CENTER);
       p.textSize(10);
       p.text(iterations[i] || i, x, y);
    }
    
    // Counter Display in Center
    p.fill(currentHue, 100, 100);
    p.textSize(40);
    p.textAlign(p.CENTER, p.CENTER);
    p.text(currentCounter, centerX, centerY);
    p.textSize(10);
    p.text("INDEX", centerX, centerY + 30);
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };

  (p as any).updateData = (newData: CodeData) => {
    iterations = newData.visualizationState?.iterations || [];
    currentCounter = newData.variables?.i || 0;
  };
};
