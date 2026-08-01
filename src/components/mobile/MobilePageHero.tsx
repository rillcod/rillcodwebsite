"use client";

import type { ComponentType, ReactNode } from "react";
import {
  MOBILE_GLASS_HERO,
  MOBILE_HERO_BADGE,
  MOBILE_HERO_ICON,
} from "./mobile-styles";

export type MobilePageHeroStat = {
  label: string;
  value: string | number;
  tone?: "default" | "emerald" | "primary";
};

type Props = {
  badge: string;
  title: string;
  description?: string;
  icon: ComponentType<{ className?: string }>;
  actions?: ReactNode;
  stats?: MobilePageHeroStat[];
  children?: ReactNode;
  className?: string;
};

/**
 * Standard dashboard page hero from the Aug 2026 mobile overhaul.
 * Glass surface, gradient icon, red badge — desktop layout unchanged via sm: breakpoints.
 */
export default function MobilePageHero({
  badge,
  title,
  description,
  icon: Icon,
  actions,
  stats,
  children,
  className = "",
}: Props) {
  return (
    <div
      className={`${MOBILE_GLASS_HERO} flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between print:hidden ${className}`}
    >
      <div
        className="pointer-events-none absolute top-0 right-0 h-48 w-48 rounded-full bg-primary/10 blur-3xl"
        aria-hidden
      />
      <div className="relative z-10 flex min-w-0 flex-1 items-start gap-3.5 sm:items-center">
        <div className={MOBILE_HERO_ICON}>
          <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <span className={MOBILE_HERO_BADGE}>{badge}</span>
          <h1 className="text-xl font-black uppercase tracking-tight text-foreground sm:text-2xl md:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="mt-0.5 max-w-2xl text-xs font-medium leading-relaxed text-muted-foreground sm:text-sm">
              {description}
            </p>
          )}
          {children}
        </div>
      </div>

      {(stats?.length || actions) && (
        <div className="relative z-10 flex flex-col gap-3 sm:items-end">
          {stats && stats.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="min-w-[5.5rem] rounded-xl border border-border bg-background/70 px-4 py-3 text-center backdrop-blur-md"
                >
                  <p
                    className={`text-xl font-black tabular-nums ${
                      stat.tone === "emerald"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : stat.tone === "primary"
                          ? "text-primary"
                          : "text-foreground"
                    }`}
                  >
                    {stat.value}
                  </p>
                  <p className="mt-0.5 text-[8px] font-black uppercase tracking-widest text-muted-foreground">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          )}
          {actions && (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              {actions}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
