/**
 * Shared public identity redaction for result-check / card / student public APIs.
 * Keep reveal rules in one place so gates stay consistent and non-duplicated.
 */

export type PublicStudentIdentity = {
  id: string;
  full_name: string | null;
  school_name: string | null;
  is_active: boolean | null;
  enrollment_type: string | null;
  avatar_url: string | null;
  class_name: string | null;
  school_logo?: string | null;
  enrolled_at: string | null;
  source?: string;
};

export function toPublicStudentIdentity(
  student: {
    id: string;
    full_name: string | null;
    school_name: string | null;
    is_active: boolean | null;
    enrollment_type?: string | null;
    avatar_url?: string | null;
    class_name?: string | null;
    section_class?: string | null;
    school_logo?: string | null;
    enrolled_at?: string | null;
    created_at?: string | null;
    source?: string;
  },
  revealIdentity: boolean,
): PublicStudentIdentity {
  return {
    id: student.id,
    full_name: revealIdentity ? student.full_name : null,
    school_name: revealIdentity ? student.school_name : null,
    is_active: student.is_active,
    enrollment_type: student.enrollment_type ?? null,
    avatar_url: revealIdentity ? (student.avatar_url ?? null) : null,
    class_name: revealIdentity ? (student.class_name ?? student.section_class ?? null) : null,
    school_logo: revealIdentity ? (student.school_logo ?? null) : null,
    enrolled_at: revealIdentity ? (student.enrolled_at ?? student.created_at ?? null) : null,
    ...(student.source ? { source: student.source } : {}),
  };
}
