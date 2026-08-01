/**
 * Shared mobile-only class bundles. Desktop keeps existing layouts.
 *
 * IMPORTANT: DashboardShell already applies `--app-bottom-nav-height` clearance
 * on mobile. Do NOT duplicate full dock padding on page roots — use
 * MOBILE_PAGE_ROOT for bleed prevention only, and MOBILE_STICKY_ACTIONS_BOTTOM
 * when a page has its own fixed action strip above the dock.
 */

/** Glass hero shell — professional international org surface. */
export const MOBILE_GLASS_HERO =
  "rounded-2xl border border-border bg-card p-4 shadow-sm sm:rounded-3xl sm:p-8 sm:shadow-lg relative overflow-hidden";

/** Gradient icon tile in page heroes. */
export const MOBILE_HERO_ICON =
  "w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary text-primary-foreground border border-primary/20 flex items-center justify-center shadow-sm shrink-0";

/** Red section pill above titles. */
export const MOBILE_HERO_BADGE =
  "inline-flex px-2.5 py-1 bg-primary/10 text-primary text-[11px] font-semibold rounded-full mb-1";

/** Minimum 44px touch target + press scale (pairs with .touch-active-scale in globals.css). */
export const MOBILE_TOUCH_BTN =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold touch-active-scale active:scale-[0.98]";

/** Page root: contain overflow, allow flex shrink. Shell clears the dock globally. */
export const MOBILE_PAGE_ROOT =
  "min-w-0 overflow-x-clip md:overflow-visible";

/**
 * Standard page root — prevents horizontal bleed. Shell handles dock clearance.
 * @deprecated Prefer MOBILE_PAGE_ROOT; kept for backward compatibility.
 *
 * Must be declared AFTER MOBILE_PAGE_ROOT: a `const` is in the temporal dead zone until its own
 * declaration runs, so reading it earlier is not merely a type error — it throws at module load,
 * taking down every page that imports from this file.
 */
export const MOBILE_PAGE_BOTTOM = MOBILE_PAGE_ROOT;

/**
 * Extra scroll padding when the page renders a fixed strip above the dock
 * (PublishControls, lesson save bar, exam nav). Shell already clears the dock.
 */
export const MOBILE_STICKY_ACTIONS_BOTTOM =
  "pb-[calc(var(--app-sticky-actions-height)+0.75rem)] md:pb-0 min-w-0 overflow-x-clip";

/** Horizontal chip strip — work modes, tabs, filters. */
export const MOBILE_SCROLL_STRIP =
  "flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** Individual chip in a scroll strip. */
export const MOBILE_SCROLL_CHIP =
  "flex min-h-11 min-w-[8rem] shrink-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-all touch-active-scale";

/** Native-feel card on small screens. */
export const MOBILE_GLASS_CARD =
  "rounded-2xl border border-border bg-card shadow-sm md:rounded-3xl md:shadow-md";

/** Smooth enter for dashboard sections (respects prefers-reduced-motion via globals). */
export const MOBILE_SECTION_ENTER =
  "animate-in fade-in slide-in-from-bottom-2 duration-300 md:duration-500";
