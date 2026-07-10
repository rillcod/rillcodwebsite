export type TransferActorRole = 'admin' | 'teacher' | 'school' | string;

/** Cross-owner approval is required only for teacher-initiated moves. */
export function requiresTeacherTransferRequest(input: {
  actorRole: TransferActorRole;
  currentTeacherId: string | null;
  destinationTeacherId: string | null;
}): boolean {
  return input.actorRole === 'teacher'
    && Boolean(input.currentTeacherId)
    && input.currentTeacherId !== input.destinationTeacherId;
}