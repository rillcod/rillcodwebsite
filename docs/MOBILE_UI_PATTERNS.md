# Mobile UI patterns (dashboard)

Mobile-only UX lives under `src/components/mobile/`. Desktop layouts are unchanged unless a page opts in via shared primitives.

## Infrastructure (already global)

| Piece | Location |
|-------|----------|
| Safe areas + dock height | `globals.css` → `--app-header-height`, `--app-bottom-nav-height` |
| Top header + bottom dock | `DashboardNavigation.tsx` |
| Spring menu sheet | `MobileNavSheet.tsx` |
| Pull to refresh | `PullToRefreshContainer.tsx` in `DashboardShell` |
| Touch scale + 16px inputs | `globals.css` `@media (max-width: 767px)` |

## Reusable primitives (spread these)

```tsx
import MobilePageHero from '@/components/mobile/MobilePageHero';
import MobileScrollStrip from '@/components/mobile/MobileScrollStrip';
import { MOBILE_PAGE_BOTTOM, MOBILE_TOUCH_BTN } from '@/components/mobile/mobile-styles';
```

### Page root
```tsx
<div className={`min-h-screen ... ${MOBILE_PAGE_BOTTOM}`}>
```

### Hero (glass header)
```tsx
<MobilePageHero
  badge="Section · role"
  title="Page title"
  description="One line."
  icon={SomeIcon}
  stats={[{ label: 'Active', value: 3, tone: 'emerald' }]}
  actions={<button className={MOBILE_TOUCH_BTN}>Action</button>}
/>
```

### Horizontal work modes (mobile only)
```tsx
<MobileScrollStrip
  label="Class work"
  items={modes.map(m => ({ id: m.id, label: m.title, hint: m.stat, icon: m.icon, selected, onClick }))}
/>
{/* Desktop: keep grid/sidebar with `hidden md:grid` */}
```

## Pages already on the glass hero pattern (~20)

Students, Classes, Courses, Programs, Schools, Parents, Users, Announcements, Approvals, Timetable, Lesson plans, Grading, Finance, Learning, Path progress, Certificates, Dashboard home, Assignments, CBT, etc.

## Pages updated in this pass

- Learner Progress — hero + mobile scroll strip for views
- Live Sessions — plain-language hero (removed “Broadcast Uplink” jargon)
- Accountability — hero + mobile tab strip
- Attendance (staff) — hero + bottom safe padding
- Class detail — bottom padding uses dock CSS var
- Academic Results — glass hero + dock-safe padding
- Projects — glass hero, mobile tab strip, touch-friendly CTAs
- Content Library — mobile-only glass hero (desktop keeps animated header)
- Lessons — hero + dock-safe padding
- Consent Forms — hero + touch CTAs
- Flashcards — hero; stat cards desktop-only
- Messages — hero + flexible chat grid height
- Academic Office — hero with class filter
- Newsletters — hero (standalone view)
- Results (Publish & Share) — mobile glass hero when roster visible
- Report Builder — mobile hero + dock padding
- Profile — dock-safe padding
- Settings — glass hero (standalone page)

## When adding a new dashboard page

1. Wrap root with `MOBILE_PAGE_BOTTOM`
2. Use `MobilePageHero` instead of ad-hoc headers
3. If the page has 3+ modes/tabs, add `MobileScrollStrip` for `md:hidden` and keep desktop grid
4. Buttons on mobile: `min-h-11` / `MOBILE_TOUCH_BTN`
5. Do **not** change desktop sidebar or `lg:` layouts
