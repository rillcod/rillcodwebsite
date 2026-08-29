import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

type AdoptionResult = {
  plan_id: string;
  class_id: string;
  already_adopted?: boolean;
  review_required?: boolean;
  preserved?: Record<string, number>;
};

function adoptionError(error: {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}) {
  const code = error.message ?? "";
  const conflicts: Record<string, string> = {
    PLAN_ALREADY_ASSIGNED:
      "This historical plan already belongs to another class.",
    PLAN_CLASS_SCHOOL_MISMATCH:
      "Choose a class from the same school as this plan.",
    PLAN_CLASS_PROGRAM_MISMATCH:
      "Choose a class following the same programme as this course.",
    PLAN_CLASS_TERM_MISMATCH:
      "This plan belongs to a different academic term. Choose the matching class term.",
    PLAN_CLASS_PERIOD_MISMATCH:
      "This plan belongs to a different programme delivery period.",
    CLASS_TEACHING_PERIOD_REQUIRED:
      "The selected class needs an academic term or delivery period first.",
    PLAN_COURSE_REQUIRED:
      "Link this historical plan to a course before moving it into a class.",
    LEGACY_PLAN_HAS_LEARNER_EVIDENCE:
      "This plan already has learner work or scores. It was left unchanged so no evidence is moved or overwritten.",
  };

  if (code === "TARGET_CLASS_PLAN_EXISTS") {
    return {
      status: 409,
      error:
        "That class already has its one class plan for this course and teaching period. Choose another class; no duplicate was created.",
      existingId: error.details ?? null,
    };
  }
  if (code === "PLAN_NOT_FOUND" || code === "CLASS_NOT_FOUND") {
    return { status: 404, error: "The plan or class could not be found." };
  }
  if (
    code === "ACTOR_NOT_ALLOWED" ||
    code === "PLAN_OR_CLASS_OUT_OF_SCOPE"
  ) {
    return {
      status: 403,
      error: "You do not have permission to move this plan into that class.",
    };
  }
  if (conflicts[code]) {
    return { status: 409, error: conflicts[code] };
  }
  if (/official curriculum direction|academic pathway|not published/i.test(code)) {
    return {
      status: 409,
      error:
        "The selected class needs a matching approved curriculum direction before this plan can be moved into it.",
    };
  }
  return {
    status: 500,
    error: "The plan could not be moved into the class. Nothing was changed.",
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("portal_users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !["admin", "teacher"].includes(profile.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    class_id?: unknown;
  };
  const classId =
    typeof body.class_id === "string" ? body.class_id.trim() : "";
  if (!classId) {
    return NextResponse.json(
      { error: "Choose the class that should own this plan." },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc(
    "adopt_legacy_lesson_plan_into_class",
    {
      p_plan_id: id,
      p_class_id: classId,
      p_actor_id: user.id,
    },
  );

  if (error) {
    const mapped = adoptionError(error);
    return NextResponse.json(
      {
        error: mapped.error,
        ...("existingId" in mapped && mapped.existingId
          ? { existing_id: mapped.existingId }
          : {}),
      },
      { status: mapped.status },
    );
  }

  const result = data as AdoptionResult;
  await logAudit(admin as any, {
    action: "adopt_historical_class_plan",
    actorId: user.id,
    resourceType: "lesson_plan",
    resourceId: result.plan_id ?? id,
    tableName: "lesson_plans",
    recordId: result.plan_id ?? id,
    newValues: {
      class_id: result.class_id ?? classId,
      review_required: result.review_required ?? true,
      preserved: result.preserved ?? {},
    },
  });

  return NextResponse.json({ data: result });
}
