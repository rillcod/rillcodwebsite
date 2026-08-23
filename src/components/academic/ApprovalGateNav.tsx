import Link from "next/link";

/**
 * The two teaching gates live on different pages. One nav strip so teachers
 * are not asked to hunt two Academic Office rows in the sidebar.
 */
export function ApprovalGateNav({
  current,
}: {
  current: "weeks" | "plans";
}) {
  const item = (href: string, id: "weeks" | "plans", label: string) => {
    const active = current === id;
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`rounded-xl px-3 py-2 text-xs font-black uppercase tracking-widest ${
          active
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-card text-muted-foreground hover:text-foreground"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav aria-label="Approval queues" className="flex flex-wrap gap-2">
      {item("/dashboard/teaching/approvals", "weeks", "Week drafts")}
      {item("/dashboard/lesson-plans/approvals", "plans", "Teaching plans")}
    </nav>
  );
}
