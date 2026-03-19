'use client';
import React from 'react';

export default function Loading() {
  return (
    <div className="min-h-screen bg-background font-sans flex items-center justify-center relative overflow-hidden">
      {/* Grid Pattern Background */}
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#FF914D 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
      
      <div className="relative z-10 text-center">
        {/* Technical Spinner */}
        <div className="mb-12 relative inline-block">
          <div className="w-24 h-24 border-2 border-border rounded-none flex items-center justify-center shadow-2xl bg-card">
            <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-none animate-spin"></div>
          </div>
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500"></div>
          <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-blue-500"></div>
        </div>

        {/* Loading Intel */}
        <div className="space-y-4">
          <h2 className="text-xl font-black text-foreground uppercase tracking-[0.5em] italic">
            Initializing <span className="text-orange-500 italic">Uplink...</span>
          </h2>
          <div className="flex items-center justify-center gap-4">
            <div className="h-[1px] w-8 bg-orange-500/30"></div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest animate-pulse">
              Syncing with RILLCOD mainframes
            </p>
            <div className="h-[1px] w-8 bg-orange-500/30"></div>
          </div>
        </div>

        {/* Technical Progress Bar */}
        <div className="mt-12 w-64 mx-auto">
          <div className="h-1 w-full bg-border rounded-none relative overflow-hidden">
            <div className="absolute inset-y-0 bg-orange-500 animate-[loading_2s_ease-in-out_infinite]" style={{ width: '40%' }}></div>
          </div>
          <div className="flex justify-between mt-3">
            <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Protocol: 0x82FS</span>
            <span className="text-[8px] font-black text-orange-500 uppercase tracking-widest animate-pulse">Active</span>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
      `}</style>
    </div>
  );
}