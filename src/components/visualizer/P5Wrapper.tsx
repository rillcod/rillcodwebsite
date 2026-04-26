'use client';

import React, { useEffect, useRef } from 'react';
import p5 from 'p5';
import { VisualizationType, CodeData } from './CodeVisualizer';

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

export default function P5Wrapper({ type, data, isPlaying, speed }: P5WrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const p5InstanceRef = useRef<p5 | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (p5InstanceRef.current) {
      p5InstanceRef.current.remove();
      p5InstanceRef.current = null;
    }

    const sketchMap: Record<VisualizationType, typeof sortingSketch> = {
      sorting: sortingSketch,
      physics: physicsSketch,
      turtle: turtleSketch,
      loops: loopsSketch,
      stateMachine: stateMachineSketch,
    };

    const sketchFunc = sketchMap[type] ?? sortingSketch;
    const container = containerRef.current;

    const sketch = (p: p5) => {
      // Make the container element available inside each sketch so they can
      // query its actual rendered dimensions instead of windowWidth/windowHeight.
      (p as any)._container = container;
      sketchFunc(p, data, isPlaying, speed);
    };

    p5InstanceRef.current = new p5(sketch, container);

    return () => {
      p5InstanceRef.current?.remove();
      p5InstanceRef.current = null;
    };
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync runtime changes (step, play state, speed) without destroying the canvas
  useEffect(() => {
    (p5InstanceRef.current as any)?.updateData?.(data, isPlaying, speed);
  }, [data, isPlaying, speed]);

  return <div ref={containerRef} className="w-full h-full" />;
}
