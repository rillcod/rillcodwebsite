# Rillcod product UI/UX standard

This document is the visual and interaction contract for every Rillcod surface. It applies to dashboard routes, public marketing pages, authentication, registration and payment flows, shared-detail pages, and native/PWA layouts.

The baseline audit covers 222 page routes: 179 dashboard pages and 43 public or utility pages. New routes inherit the same contract and must pass `npm run audit:ui`.

## Product principles

1. **Mobile first, not mobile reduced.** Design at 390px first, remain usable from 360px, then enhance at `sm`, `md`, and `lg`.
2. **One clear task per screen.** Keep one primary action and one search for the active data set. Do not place a global search beside a page-level search.
3. **Calm hierarchy.** Use sentence case, restrained 600–700 weights, short descriptions, and one accent colour. Avoid decorative uppercase, micro-text, hard black borders, and offset black shadows.
4. **Theme-safe surfaces.** Use semantic tokens (`bg-background`, `bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `border-border`) instead of hard-coded white/gray cards.
5. **Native-feeling interaction.** Controls have at least a 44px touch target, visible focus, immediate pressed/hover feedback, predictable back/close actions, and no accidental horizontal page scroll.
6. **Progressive disclosure.** Put advanced filters and secondary actions behind a clear menu, sheet, or expandable region. Do not show controls that do nothing.

## Layout and card geometry

- `DashboardShell` owns the dashboard canvas. Pages must not add a second viewport-height shell or compensate for the app header.
- Standard dashboard content uses the shared `app-page-main` canvas and fills the available width up to its product max-width.
- Public navigation is sticky and remains in normal document flow. Public pages must not add `pt-16`, `pt-20`, or `pt-24` as a fixed-navigation workaround.
- Reading pages and focused forms may use `max-w-2xl` through `max-w-4xl`. Operational dashboards should use the full shared canvas.
- Cards fill their grid track: `w-full min-w-0`. Use `h-full` only when equal-height cards improve scanning.
- Standard card surface: `rounded-2xl border border-border bg-card shadow-sm`.
- Standard responsive grid: one column on phones; add columns only when the card's content remains readable. Prefer `gap-4 sm:gap-6`.
- Never allow the document itself to scroll horizontally. Wide tables, timelines, tabs, and code blocks own their local `overflow-x-auto` region.

## Typography and density

- Use sentence case for headings, buttons, tabs, labels, and table headers.
- Page titles: 28–36px desktop and 22–28px mobile, weight 700, balanced wrapping.
- Card titles: 16–20px, weight 600–700.
- Body copy: 14–16px with 1.5–1.7 line height.
- Supporting labels never render below 12px. Inputs render at 16px on phones to prevent browser zoom.
- Avoid italic body copy and excessive tracking. Preserve italics only when they carry meaning, such as a cited title.

## Controls, search, and forms

- Use shared primitives from `src/components/ui` before creating page-local buttons, inputs, selects, textareas, tabs, cards, or page headers.
- Every input has an accessible label or `aria-label`, a visible focus state, and an adjacent validation message.
- Search belongs next to the list it filters. A modal or picker may have its own scoped search because it is a separate task context.
- The dashboard command palette remains available by keyboard; the top bar must not duplicate local page search.
- Filters must either change results or be removed. Empty filter buttons are prohibited.
- Primary actions use the primary brand treatment. Secondary actions use a neutral or outline treatment. Destructive actions require a destructive treatment and confirmation proportional to impact.
- Mobile forms stack fields and actions. Do not force an input and button into a row below `sm`.

## Navigation and route shells

- Route visibility rules live in `src/lib/layout/public-route-policy.ts`; do not create new page-local copies.
- Marketing pages receive one public navigation and one public footer.
- Authentication, verification, registration, result-checking, shared forms, and payment-balance flows omit marketing navigation/footer so users can complete the task without distraction.
- Dashboard desktop has one breadcrumb/top bar, one notification entry point, and one theme control. Mobile has one app header and one bottom navigation surface.

## States and feedback

Every data surface must define:

- a loading state that preserves the eventual layout;
- an empty state that explains what is empty and offers the next useful action;
- an error state in plain language with retry or recovery where possible;
- disabled and submitting states that prevent duplicate actions;
- success feedback close to the action that caused it.

Use skeletons for card/list loading, not full-screen spinners, unless the whole application is booting.

## Customer action reliability

- A customer-triggered network or authentication action must have a deadline. Use
  `fetchActionJson` for JSON HTTP actions and `withTimeoutOrThrow` for Supabase or other
  promise-based actions. Never use a fallback-returning timeout where the fallback could
  be mistaken for success.
- Loading and duplicate-submission locks must always be released in `finally`. A stalled
  provider must not leave a button disabled indefinitely.
- Preserve drafts until the authoritative save succeeds. Once the server confirms a save,
  show the saved/confirmation state even when a secondary checkout, email, CRM, or analytics
  operation fails. Never invite a duplicate submission for a record that already exists.
- Clear an uploaded-file reference only after remote deletion succeeds. On failure, retain
  the reference and provide a retry path.
- Public APIs log database, storage, gateway, and provider details on the server. Customer
  surfaces receive plain-language recovery guidance and never raw SQL errors, UUIDs, stack
  traces, provider payloads, internal route names, or configuration details.
- Optional non-blocking work may not interrupt the primary journey, but its failure must be
  logged for operations rather than swallowed silently.
- If a control cannot work because required data failed to load, keep it unavailable with a
  visible reason and a retry action. Do not replace failed data with believable empty totals,
  defaults, or success states.

## Accessibility and international readiness

- Meet WCAG AA contrast for text and interactive states.
- All keyboard-focusable elements have a visible focus ring.
- Icon-only controls require an accessible name.
- Do not communicate state with colour alone.
- Keep labels and containers resilient to translated text expansion and long names.
- Use locale-aware date/number formatting and tabular numerals for operational tables.
- Respect reduced-motion preferences and safe-area insets.

## Operational workflow contract

- Authorization is action-based, not page-local role guessing. Add or change policy in
  `src/lib/auth/capabilities.ts`, then use the same capability in the page and its API.
- Accountability remains a separate cross-school admin control centre. It may link to
  Records, Reports, Users, and Finance, but those workspaces keep their distinct jobs.
- Records is a scoped directory. Temporary passwords are available only to platform
  administrators and the relevant school manager, and standard exports omit passwords.
- Account removal means archive by default. A learner with assignment grades, CBT results,
  progress reports, or moderated term grades cannot be hard-deleted.
- Saved student scores are protected evidence. Official report totals are always re-derived
  from the shared grading policy; clients cannot directly override totals or grades.
- Finance records are never cleared as part of UI cleanup, account cleanup, or demo cleanup;
  every monetary mutation must preserve traceability and use an explicit finance workflow.
- Finance UI must mirror the manage_finance boundary: approval, manual ledger writes,
  statements, refunds, reminders, and receipt withdrawal are administrator actions.
- Schools manage and pay only their own Rillcod billing; family finance appears as a
  status indicator without amounts or personal contact details. Teachers receive the
  same status-only disclosure and no finance documents.
- Destructive finance labels use Withdraw, Archive, Deactivate, Cancel, or Void and
  explicitly tell the user that the historical record is preserved.
- Every privileged lifecycle or financial mutation records an actor-linked audit event without
  logging passwords, tokens, or other reusable secrets.

## Definition of done for visual changes

Before pushing a UI change:

1. Run `npm run audit:ui`.
2. Run `npm run lint:encoding`.
3. Run `npx tsc --noEmit`.
4. Run focused tests for the changed route family.
5. Verify representative 390×844 and desktop views.
6. Confirm no horizontal document overflow, no hydration errors, one navigation/footer instance, and no duplicated search or notification controls.
7. Check both light and dark semantic surfaces when hard-coded colours were changed.

## Review checklist

- Does the page fit the shared canvas and do cards fill their tracks?
- Is the primary task obvious within five seconds?
- Is every visible control functional and necessary?
- Are search and filters scoped to the data they affect?
- Is the page comfortable at 390px without sideways scrolling?
- Are tap targets at least 44px and labels at least 12px?
- Do empty, loading, error, success, and disabled states exist?
- Does the page use shared primitives and semantic colour tokens?
- Does navigation match the route policy?
- Will long names and translated text wrap without breaking the layout?
