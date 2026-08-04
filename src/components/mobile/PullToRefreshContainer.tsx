"use client";

import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowPathIcon } from "@/lib/icons";

interface PullToRefreshContainerProps {
  children: ReactNode;
  onRefresh?: () => Promise<void> | void;
}

/**
 * Optional pull-to-refresh. When no onRefresh is provided, listeners are not
 * attached — attaching them on every dashboard page was fighting native scroll
 * on mobile/PWA (shell scrollTop stayed 0, so every drag looked like a pull).
 */
export default function PullToRefreshContainer({ children, onRefresh }: PullToRefreshContainerProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pullDistanceRef = useRef(0);
  const startY = useRef(0);
  const startX = useRef(0);
  const isPulling = useRef(false);
  const maxPull = 80;

  useEffect(() => {
    pullDistanceRef.current = pullDistance;
  }, [pullDistance]);

  useEffect(() => {
    if (!onRefresh) return;
    if (typeof window === "undefined" || window.innerWidth >= 768) return;

    const scrollTop = () => {
      // Mobile uses document scroll; desktop may use .app-shell-scroll.
      const docTop =
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0;
      if (docTop > 0) return docTop;
      const shell = containerRef.current?.closest(".app-shell-scroll") as HTMLElement | null;
      return shell?.scrollTop ?? 0;
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (refreshing || scrollTop() > 0) return;
      startY.current = event.touches[0].pageY;
      startX.current = event.touches[0].pageX;
      isPulling.current = true;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!isPulling.current) return;
      const deltaY = event.touches[0].pageY - startY.current;
      const deltaX = event.touches[0].pageX - startX.current;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        isPulling.current = false;
        setPullDistance(0);
        return;
      }

      if (deltaY > 10 && scrollTop() <= 0) {
        const next = Math.min(deltaY * 0.35, maxPull);
        pullDistanceRef.current = next;
        setPullDistance(next);
      }
    };

    const handleTouchEnd = async () => {
      if (!isPulling.current) return;
      isPulling.current = false;
      const pulled = pullDistanceRef.current;

      if (pulled >= 60 && !refreshing) {
        setRefreshing(true);
        setPullDistance(50);
        pullDistanceRef.current = 50;
        try {
          await onRefresh();
        } catch (error) {
          console.error("Pull to refresh error:", error);
        } finally {
          window.setTimeout(() => {
            setRefreshing(false);
            setPullDistance(0);
            pullDistanceRef.current = 0;
          }, 500);
        }
      } else {
        setPullDistance(0);
        pullDistanceRef.current = 0;
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [refreshing, onRefresh]);

  return (
    <div ref={containerRef} className="relative flex w-full min-w-0 flex-1 flex-col">
      {onRefresh && (pullDistance > 0 || refreshing) && (
        <div
          style={{ height: `${pullDistance}px` }}
          className="pointer-events-none fixed left-0 right-0 top-[var(--app-header-height)] z-[60] flex items-center justify-center transition-[height] duration-150 md:hidden"
          role="status"
          aria-live="polite"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card shadow-md">
            <ArrowPathIcon
              className={`h-5 w-5 text-primary ${refreshing ? "animate-spin" : ""}`}
              style={{ transform: `rotate(${pullDistance * 4}deg)` }}
            />
          </div>
          <span className="sr-only">{refreshing ? "Refreshing" : "Pull to refresh"}</span>
        </div>
      )}
      {children}
    </div>
  );
}
