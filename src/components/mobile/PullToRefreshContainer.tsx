// @refresh reset
'use client';

import React, { useState, useEffect, useRef, ReactNode } from 'react';
import { ArrowPathIcon } from '@/lib/icons';

interface PullToRefreshContainerProps {
  children: ReactNode;
  onRefresh?: () => Promise<void> | void;
}

export default function PullToRefreshContainer({ children, onRefresh }: PullToRefreshContainerProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const isPulling = useRef(false);
  const maxPull = 80;

  useEffect(() => {
    // Strictly target mobile touch devices (under 768px width)
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      return;
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        startY.current = e.touches[0].pageY;
        isPulling.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling.current) return;
      const currentY = e.touches[0].pageY;
      const distance = currentY - startY.current;
      if (distance > 0 && window.scrollY === 0) {
        setPullDistance(Math.min(distance * 0.4, maxPull));
      }
    };

    const handleTouchEnd = async () => {
      if (!isPulling.current) return;
      isPulling.current = false;
      if (pullDistance >= 50 && !refreshing) {
        setRefreshing(true);
        setPullDistance(50);
        if (onRefresh) {
          try {
            await onRefresh();
          } catch (err) {
            console.error('Pull to refresh failed:', err);
          }
        } else {
          window.location.reload();
        }
        setTimeout(() => {
          setRefreshing(false);
          setPullDistance(0);
        }, 800);
      } else {
        setPullDistance(0);
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pullDistance, refreshing, onRefresh]);

  return (
    <div className="relative w-full flex-1 flex flex-col min-h-0">
      {/* Pull Indicator Spinner — Touch Mobile Only */}
      {(pullDistance > 0 || refreshing) && (
        <div
          style={{ height: `${pullDistance}px` }}
          className="fixed top-[var(--app-header-height,0px)] left-0 right-0 z-[60] flex items-center justify-center transition-all duration-150 pointer-events-none md:hidden"
        >
          <div className="w-9 h-9 rounded-full bg-card border border-border shadow-xl flex items-center justify-center">
            <ArrowPathIcon
              className={`w-5 h-5 text-primary ${refreshing ? 'animate-spin' : ''}`}
              style={{ transform: `rotate(${pullDistance * 4}deg)` }}
            />
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
