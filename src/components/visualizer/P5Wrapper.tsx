'use client';

import React, { useEffect, useRef, useMemo } from 'react';
import p5 from 'p5';
import { VisualizationType, CodeData } from './CodeVisualizer';

// Import Sketches
import { sortingSketch } from './p5-sketches/sortingSketch';
import { physicsSketch } from './p5-sketches/physicsSketch';
import { turtleSketch } from './p5-sketches/turtleSketch';
import { loopsSketch } from './p5-sketches/loopsSketch';
import { stateMachineSketch } from './p5-sketches/stateMachineSketch';

interface P5WrapperProps {
  type: VisualizationType;
  data: CodeData;
  isPlaying: boolean;
  speed: number;
}

/**
 * P5Wrapper - A React wrapper for P5.js that handles lifecycle and data sync.
 */
export default function P5Wrapper({
  type,
  data,
  isPlaying,
  speed
}: P5WrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const p5InstanceRef = useRef<p5 | null>(null);

  // Initialize and Update Instance
  useEffect(() => {
    if (!containerRef.current) return;

    // Clean up previous instance
    if (p5InstanceRef.current) {
      p5InstanceRef.current.remove();
      p5InstanceRef.current = null;
    }

    // Select sketch based on type
    const getSketchFunc = () => {
      switch (type) {
        case 'sorting': return sortingSketch;
        case 'physics': return physicsSketch;
        case 'turtle': return turtleSketch;
        case 'loops': return loopsSketch;
        case 'stateMachine': return stateMachineSketch;
        default: return sortingSketch;
      }
    };

    const sketchFunc = getSketchFunc();
    const sketch = (p: p5) => {
      // Store any necessary state on the prototype if needed or let the sketch handle it
      sketchFunc(p, data, isPlaying, speed);
    };

    p5InstanceRef.current = new p5(sketch, containerRef.current);

    return () => {
      if (p5InstanceRef.current) {
        p5InstanceRef.current.remove();
      }
    };
  }, [type]); // Re-initialize only if sketch type changes

  // Synchronize data without full re-mount for high performance
  useEffect(() => {
    if (p5InstanceRef.current) {
      // Custom method we'll implement in sketches to update data
      (p5InstanceRef.current as any).updateData?.(data, isPlaying, speed);
    }
  }, [data, isPlaying, speed]);

  return <div ref={containerRef} className="w-full h-full" />;
}
