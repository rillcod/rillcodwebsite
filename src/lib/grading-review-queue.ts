export type GradingReviewFilter = 'priority' | 'ai_ready' | 'manual';

export type GradingReviewItem = {
  id: string;
  status?: string | null;
  submitted_at?: string | null;
  ai_suggested_grade?: number | null;
};

function reviewPriority(item: GradingReviewItem): number {
  if (item.status === 'late') return 0;
  if (item.ai_suggested_grade == null) return 1;
  return 2;
}

/** Late and manual exceptions come first; AI-ready work remains one filter away. */
export function buildGradingReviewQueue<T extends GradingReviewItem>(
  items: readonly T[],
  filter: GradingReviewFilter,
): T[] {
  const filtered = items.filter((item) => {
    if (filter === 'ai_ready') return item.ai_suggested_grade != null;
    if (filter === 'manual') return item.ai_suggested_grade == null;
    return true;
  });

  return [...filtered].sort((left, right) => {
    const priority = reviewPriority(left) - reviewPriority(right);
    if (priority !== 0) return priority;
    const leftTime = new Date(left.submitted_at ?? 0).getTime();
    const rightTime = new Date(right.submitted_at ?? 0).getTime();
    return leftTime - rightTime || left.id.localeCompare(right.id);
  });
}
