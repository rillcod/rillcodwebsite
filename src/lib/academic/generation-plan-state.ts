type GenerationPlan = {
  id?: unknown;
  status?: unknown;
  plan_data?: unknown;
};

export type GenerationPlanState = {
  ready: boolean;
  activated: boolean;
  reason?: string;
};

function hasTeachingWeeks(planData: unknown): boolean {
  if (!planData || typeof planData !== "object" || Array.isArray(planData)) {
    return false;
  }
  const weeks = (planData as { weeks?: unknown }).weeks;
  return Array.isArray(weeks) && weeks.length > 0;
}

/**
 * A published plan enables generation; it does not expose child content.
 * Child lessons, slides, cards and tasks retain their own held/live status.
 * This distinction lets automation prepare work without bypassing teacher review.
 */
export async function ensureGenerationPlanReady(
  db: any,
  plan: GenerationPlan,
  now = new Date().toISOString(),
): Promise<GenerationPlanState> {
  if (plan.status === "published") {
    return { ready: true, activated: false };
  }
  if (plan.status === "archived") {
    return {
      ready: false,
      activated: false,
      reason: "This class plan is archived.",
    };
  }
  if (!plan.id || !hasTeachingWeeks(plan.plan_data)) {
    return {
      ready: false,
      activated: false,
      reason: "This class plan needs teaching weeks before content can be prepared.",
    };
  }

  const { error } = await db
    .from("lesson_plans")
    .update({ status: "published", updated_at: now })
    .eq("id", String(plan.id));
  if (error) {
    return {
      ready: false,
      activated: false,
      reason: error.message || "The class plan could not be activated.",
    };
  }
  plan.status = "published";
  return { ready: true, activated: true };
}
