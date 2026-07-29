/**
 * Categories for the activity trail.
 *
 * The trail was a flat stream of technical event names, and one event —
 * parent_student_linked — accounted for 95% of it, so anything that mattered
 * was impossible to find. Grouping events into the questions a school actually
 * asks makes the trail answer them: what changed in the curriculum, who moved
 * a class, which results went out, who looked up a report.
 *
 * Patterns are the glob/comma syntax /api/activity-logs already understands,
 * so this adds no new query surface.
 */

export type AuditCategory = {
  id: string;
  label: string;
  /** What question this category answers, in one line. */
  purpose: string;
  /** Glob/comma pattern passed through as eventType. */
  pattern: string;
  /** Highlighted because it carries accountability rather than volume. */
  accountable?: boolean;
};

export const AUDIT_CATEGORIES: AuditCategory[] = [
  {
    id: "curriculum",
    label: "Curriculum decisions",
    purpose: "Who certified an official edition, and which schools received it.",
    pattern: "curriculum.*",
    accountable: true,
  },
  {
    id: "classes",
    label: "Class changes",
    purpose: "Classes moved between programmes, offerings or periods.",
    pattern: "class.*,create_class,delete_class",
    accountable: true,
  },
  {
    id: "results",
    label: "Results",
    purpose: "Results published, withdrawn or recalculated from evidence.",
    pattern: "result.published,result.withdrawn,result.recalculated,*progress_report*,override_grade",
    accountable: true,
  },
  {
    id: "certificates",
    label: "Certificates",
    purpose: "Certificates issued, revoked or reinstated.",
    pattern: "certificate.*,card_*",
    accountable: true,
  },
  {
    id: "checks",
    label: "Result look-ups",
    purpose: "Parents and schools checking a result or scanning a code.",
    pattern: "result_check_*",
  },
  {
    id: "students",
    label: "Students",
    purpose: "Registrations, transfers, deletions and duplicate decisions.",
    pattern: "student*,students.*",
  },
  {
    id: "parents",
    label: "Parents",
    purpose: "Parent accounts linked to or unlinked from a learner.",
    pattern: "parent_student_*",
  },
  {
    id: "consent",
    label: "Consent",
    purpose: "Consent forms, matches and the portals created from them.",
    pattern: "consent_*,*consent*",
  },
  {
    id: "finance",
    label: "Finance",
    purpose: "Invoices, payments, refunds and reconciliation.",
    pattern:
      "*invoice*,*payment*,*refund*,mark_paid,*marked_paid*,*reconciliation*,*settlement*,*billing_cycle*,*proof*",
  },
  {
    id: "accounts",
    label: "Accounts and settings",
    purpose: "Account removals, school changes and platform settings.",
    pattern: "delete_user,delete_school,update_platform_settings,program.*,academic.*",
  },
];

/** The categories worth showing first: decisions, not traffic. */
export const ACCOUNTABLE_CATEGORIES = AUDIT_CATEGORIES.filter((c) => c.accountable);

const MATCHERS: { id: string; test: (action: string) => boolean }[] =
  AUDIT_CATEGORIES.map((category) => {
    const parts = category.pattern.split(",").map((p) => p.trim()).filter(Boolean);
    const regexes = parts.map(
      (p) =>
        new RegExp(
          `^${p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`,
          "i"
        )
    );
    return { id: category.id, test: (action: string) => regexes.some((r) => r.test(action)) };
  });

/** Which category an event belongs to, for labelling a row in the list. */
export function categoryForAction(action: string | null | undefined): AuditCategory | null {
  if (!action) return null;
  const hit = MATCHERS.find((m) => m.test(action));
  return hit ? AUDIT_CATEGORIES.find((c) => c.id === hit.id) ?? null : null;
}
