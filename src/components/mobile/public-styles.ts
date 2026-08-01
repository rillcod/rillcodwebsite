/**
 * Public marketing & auth surfaces — outside DashboardShell.
 * Safe areas, bleed prevention, restrained motion for international org polish.
 */

/** Root wrapper for login, registration, standalone public pages. */
export const PUBLIC_PAGE_ROOT =
  "min-h-dvh min-w-0 overflow-x-clip bg-background text-foreground antialiased";

/** Safe-area aware padding for full-screen auth layouts. */
export const PUBLIC_SAFE_INSET =
  "px-[max(0.75rem,var(--safe-area-left))] pt-[max(0.75rem,var(--safe-area-top))] pb-[max(0.75rem,var(--safe-area-bottom))] pr-[max(0.75rem,var(--safe-area-right))]";

/** Professional card surface for forms and modals. */
export const PUBLIC_SURFACE =
  "rounded-2xl border border-border/80 bg-card/95 backdrop-blur-xl shadow-xl";

/** Subtle ambient background — no aggressive pulse (international org tone). */
export const PUBLIC_AMBIENT_BG =
  "pointer-events-none absolute inset-0 overflow-hidden aria-hidden";

/** Primary CTA — brand gradient, touch-friendly. */
export const PUBLIC_CTA =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold bg-primary text-primary-foreground shadow-lg transition-all duration-200 hover:brightness-105 active:scale-[0.98]";

/** Secondary outline CTA. */
export const PUBLIC_CTA_OUTLINE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold border border-border bg-card text-foreground transition-all duration-200 hover:bg-muted active:scale-[0.98]";
