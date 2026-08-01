"use client";

import type { ComponentType, ReactNode } from "react";
import { MOBILE_SCROLL_CHIP, MOBILE_SCROLL_STRIP } from "./mobile-styles";

export type MobileScrollStripItem = {
  id: string;
  label: string;
  hint?: string;
  icon?: ComponentType<{ className?: string }>;
  selected?: boolean;
  onClick?: () => void;
};

type Props = {
  label?: string;
  items: MobileScrollStripItem[];
  ariaLabel?: string;
  /** Render on desktop too (default: mobile-only via md:hidden wrapper). */
  showOnDesktop?: boolean;
  trailing?: ReactNode;
};

/**
 * Thumb-friendly horizontal work-mode strip. Used on class detail, learner progress, etc.
 * Desktop keeps grid sidebars; this is the mobile-native pattern.
 */
export default function MobileScrollStrip({
  label,
  items,
  ariaLabel = "Work modes",
  showOnDesktop = false,
  trailing,
}: Props) {
  const wrap = showOnDesktop ? "block" : "md:hidden";

  return (
    <div className={wrap}>
      {(label || trailing) && (
        <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
          {label && (
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {label}
            </p>
          )}
          {trailing}
        </div>
      )}
      <div className={MOBILE_SCROLL_STRIP} role="tablist" aria-label={ariaLabel}>
        {items.map((item) => {
          const Icon = item.icon;
          const active = !!item.selected;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={item.onClick}
              className={`${MOBILE_SCROLL_CHIP} ${
                active
                  ? "border-primary/40 bg-primary/10 text-foreground shadow-sm"
                  : "border-border bg-background text-muted-foreground hover:border-primary/25"
              }`}
            >
              {Icon && (
                <Icon
                  className={`h-4 w-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`}
                />
              )}
              <span className="min-w-0">
                <span className="block truncate text-xs font-black leading-tight">
                  {item.label}
                </span>
                {item.hint && (
                  <span className="mt-0.5 block truncate text-[10px] leading-tight text-muted-foreground">
                    {item.hint}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
