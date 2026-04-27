"use client";

import { useEffect, useState } from 'react';

export default function LoadingIndicator() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setMounted(true);
    const timer = setTimeout(() => {
      setVisible(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  if (!mounted || !visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-500"
      style={{ backgroundColor: '#0f0f1a', opacity: visible ? 1 : 0 }}
    >
      <div className="flex flex-col items-center gap-6">

        {/* Dual-ring spinner */}
        <div className="relative w-16 h-16">
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border-[3px] border-primary/20" />
          <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-primary animate-spin" />
          {/* Inner ring — counter spin */}
          <div className="absolute inset-[10px] rounded-full border-[2px] border-transparent border-t-indigo-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.6s' }} />
          {/* Centre dot */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          </div>
        </div>

        {/* Brand name */}
        <div className="text-center">
          <p className="text-white font-black text-lg tracking-[0.25em] uppercase">Rillcod</p>
          <p className="text-primary/60 text-[11px] font-semibold tracking-[0.3em] uppercase mt-0.5">Academy</p>
        </div>

        {/* Pulsing dots */}
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>

      </div>
    </div>
  );
}
