/**
 * Shared mobile-only class bundles. Desktop keeps existing layouts;
 * these tighten touch targets, safe areas, and glass surfaces on phones.
 */

/** Glass hero shell — matches Students Registry / mobile overhaul commits. */
export const MOBILE_GLASS_HERO =
  "bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-5 sm:p-8 shadow-xl relative overflow-hidden";

/** Gradient icon tile in page heroes. */
export const MOBILE_HERO_ICON =
  "w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 text-white border border-primary/30 flex items-center justify-center shadow-xl shadow-primary/30 shrink-0";

/** Red section pill above titles. */
export const MOBILE_HERO_BADGE =
  "inline-block px-3 py-1 bg-brand-red-accent text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-sm mb-1";

/** Minimum 44px touch target + press scale (pairs with .touch-active-scale in globals.css). */
export const MOBILE_TOUCH_BTN =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black touch-active-scale active:scale-[0.98]";

/** Bottom padding so content clears the floating dock — mobile only. */
export const MOBILE_PAGE_BOTTOM =
  "pb-[calc(var(--app-bottom-nav-height)+0.5rem)] md:pb-0";

/** Clearance for pages with a fixed action strip above the dock (e.g. Report Builder). */
export const MOBILE_STICKY_ACTIONS_BOTTOM =
  "pb-[calc(var(--app-bottom-nav-height)+var(--app-sticky-actions-height)+0.5rem)] md:pb-0";

/** Horizontal chip strip — work modes, tabs, filters. */
export const MOBILE_SCROLL_STRIP =
  "flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** Individual chip in a scroll strip. */
export const MOBILE_SCROLL_CHIP =
  "flex min-h-11 min-w-[9rem] shrink-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-all touch-active-scale";

/** Native-feel card on small screens. */
export const MOBILE_GLASS_CARD =
  "rounded-2xl border border-border/80 bg-card/90 backdrop-blur-xl shadow-lg md:rounded-3xl";
