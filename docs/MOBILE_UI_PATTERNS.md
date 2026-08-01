# Mobile UI patterns (dashboard)

Mobile-only UX lives under `src/components/mobile/`. Desktop layouts are unchanged unless a page opts in via shared primitives.

## Architecture (single source of truth)

| Layer | Responsibility |
|-------|----------------|
| `globals.css` | Safe areas, dock height, z-index scale, motion tokens, `.app-surface` |
| `DashboardShell.tsx` | **Global dock clearance** on mobile (`--app-bottom-nav-height`); immersive routes for lesson/CBT |
| `DashboardNavigation.tsx` | Header + floating bottom dock |
| `mobile-styles.ts` | Reusable class bundles — **no duplicate dock padding** |

### Dock padding rule

**Do not** add full `--app-bottom-nav-height` padding on page roots inside the dashboard. The shell already clears the floating dock.

| Token | Use when |
|-------|----------|
| `MOBILE_PAGE_ROOT` | Every page root — prevents horizontal bleed (`min-w-0 overflow-x-clip`) |
| `MOBILE_STICKY_ACTIONS_BOTTOM` | Page has a **fixed strip above the dock** (Save, Publish, Mark complete) |
| Immersive shell | Lesson player, CBT take — page owns scroll + fixed footers |

```tsx
import { MOBILE_PAGE_ROOT, MOBILE_STICKY_ACTIONS_BOTTOM, MOBILE_TOUCH_BTN } from '@/components/mobile/mobile-styles';

// Standard page
<div className={`space-y-6 ${MOBILE_PAGE_ROOT}`}>

// Page with fixed action bar
<div className={`space-y-6 ${MOBILE_PAGE_ROOT} ${MOBILE_STICKY_ACTIONS_BOTTOM}`}>
```

Fixed bars must use:
- `bottom-[var(--app-bottom-nav-height)]`
- `z-[55]` or higher (above dock `z-50`)

## Reusable primitives

```tsx
import MobilePageHero from '@/components/mobile/MobilePageHero';
import MobileScrollStrip from '@/components/mobile/MobileScrollStrip';
```

### Hero (international org glass header)
```tsx
<MobilePageHero
  badge="Section · role"
  title="Page title"
  description="One clear line."
  icon={SomeIcon}
  stats={[{ label: 'Active', value: 3, tone: 'emerald' }]}
  actions={<button className={MOBILE_TOUCH_BTN}>Action</button>}
/>
```

### Horizontal work modes (mobile only)
```tsx
<MobileScrollStrip
  label="Sections"
  items={[{ id, label, icon, selected, onClick }]}
/>
<div className="hidden md:flex">{/* desktop tabs */}</div>
```

## Global surfaces (globals.css)

| Class | Purpose |
|-------|---------|
| `.app-surface` | Standard card — glass, border, shadow |
| `.app-surface-elevated` | Emphasis card |
| `.app-page-main` | Subtle page enter animation (respects reduced motion) |
| `.section-label` | Red uppercase org label above headings |
| `.touch-active-scale` | Native press feedback |

## Z-index scale (CSS vars)

| Token | Value | Use |
|-------|-------|-----|
| `--z-dock` | 50 | Bottom nav, mobile header |
| `--z-sticky-actions` | 55 | Fixed Save/Publish/lesson bars |
| `--z-sheet` | 60 | Nav sheet, drawers |
| `--z-modal` | 70 | Modals |
| `--z-toast` | 80 | Toasts |

## When adding a new dashboard page

1. Root: `MOBILE_PAGE_ROOT` (not `pb-20`)
2. Hero: `MobilePageHero` instead of ad-hoc headers
3. 3+ tabs: `MobileScrollStrip` on mobile, desktop grid unchanged
4. Buttons: `MOBILE_TOUCH_BTN` / `min-h-11`
5. Fixed footer: `MOBILE_STICKY_ACTIONS_BOTTOM` + `bottom-[var(--app-bottom-nav-height)] z-[55]`
6. Do **not** change desktop sidebar or `lg:` layouts

## Immersive routes (shell-managed)

These bypass standard shell padding; the page controls scroll:

- `/dashboard/lessons/[id]` — lesson player
- `/dashboard/cbt/[id]/take` — exam
- `/dashboard/flashcards/[deckId]/review` — flashcard review
