import { NextRequest } from 'next/server';
import { PATCH as updateAssignmentSubmission } from '@/app/api/assignment-submissions/[id]/route';

export const dynamic = 'force-dynamic';

/**
 * Compatibility route for the unified Grading Queue. All validation, weighted
 * scoring, audit evidence, and learner notifications live in the canonical
 * assignment-submission workflow.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return updateAssignmentSubmission(request, context);
}
