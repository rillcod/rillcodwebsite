"use client";

import React, { useState, useEffect, useRef, ReactNode } from "react";
import { ArrowPathIcon } from "@/lib/icons";
import { useRouter } from "next/navigation";

interface PullToRefreshContainerProps {
  children: ReactNode;
  onRefresh?: () => Promise<void> | void;
}

export default function PullToRefreshContainer({ children, onRefresh }: PullToRefreshContainerProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullDistanceRef = useRef(0);
  const startY = useRef(0);
  const isPulling = useRef(false);
  const maxPull = 80;
  const router = useRouter();

  useEffect(() => {
    pullDistanceRef.current = pullDistance;
  }, [pullDistance]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth >= 768) {
      return;
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY <= 0) {
        startY.current = e.touches[0].pageY;
        isPulling.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling.current) return;
      const currentY = e.touches[0].pageY;
      const distance = currentY - startY.current;
      if (distance > 10 && window.scrollY <= 0) {
        const next = Math.min(distance * 0.35, maxPull);
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
        if (onRefresh) {
          try {
            await onRefresh();
          } catch (err) {
            console.error("Pull to refresh error:", err);
          }
        } else {
          router.refresh();
        }
        setTimeout(() => {
          setRefreshing(false);
          setPullDistance(0);
          pullDistanceRef.current = 0;
        }, 500);
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
  }, [refreshing, onRefresh, router]);

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      {(pullDistance > 0 || refreshing) && (
        <div
          style={{ height: `${pullDistance}px` }}
          className="pointer-events-none fixed left-0 right-0 top-[var(--app-header-height,0px)] z-[60] flex items-center justify-center transition-all duration-150 md:hidden"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/95 shadow-2xl backdrop-blur-xl">
            <ArrowPathIcon
              className={`h-5 w-5 text-primary ${refreshing ? "animate-spin" : ""}`}
              style={{ transform: `rotate(${pullDistance * 4}deg)` }}
            />
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
