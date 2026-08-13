import { NextRequest } from 'next/server';
import {
  DELETE as deleteAssignmentSubmission,
  PATCH as updateAssignmentSubmission,
} from '@/app/api/assignment-submissions/[id]/route';

export const dynamic = 'force-dynamic';

/** Legacy Gradebook URL retained as a compatibility adapter. */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return updateAssignmentSubmission(request, context);
}

/** Legacy Gradebook URL retained as a compatibility adapter. */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return deleteAssignmentSubmission(request, context);
}
