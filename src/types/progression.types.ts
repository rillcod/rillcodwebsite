// ── Program & Course progression types ───────────────────────────────────────
// These map directly to the DB after the 20260419_program_levels migration.

export type DeliveryType = 'compulsory' | 'optional';

export type LevelStatus =
  | 'active'
  | 'promoted'
  | 'repeated'
  | 'completed'
  | 'withdrawn';

// ── Augmented program (delivery_type added) ───────────────────────────────────
export interface Program {
  id: string;
  name: string;
  title?: string;          // alias used in some queries
  description: string | null;
  delivery_type: DeliveryType;
  duration_weeks: number | null;
  difficulty_level: string;
  price: number;
  is_active: boolean;
  created_at: string;
  // nested from /api/programs
  courses?: CourseLevel[];
}

// ── Course with level sequencing ──────────────────────────────────────────────
export interface CourseLevel {
  id: string;
  title: string;
  description: string | null;
  program_id: string | null;
  level_order: number;         // 1, 2, 3 … — position in the track
  next_course_id: string | null;
  difficulty_level: string | null;
  is_active: boolean;
  duration_weeks: number | null;
  created_at: string;
}

// ── Student level enrollment ───────────────────────────────────────────────────
export interface StudentLevelEnrollment {
  id: string;
  student_id: string;
  course_id: string;
  school_id: string | null;
  program_id: string | null;
  cohort_year: number;         // intake year — e.g. 2024
  term_label: string;          // 'Term 1 2024', 'Term 2 2025'
  start_week: number;          // 1 = from start; >1 = mid-term joiner
  status: LevelStatus;
  promoted_to: string | null;  // course_id of next level
  module_name: string | null;  // optional-track module label
  created_at: string;
  updated_at: string;
  // joined fields
  portal_users?: { id: string; full_name: string; email: string };
  courses?: CourseLevel & { programs?: { name: string; delivery_type: DeliveryType } };
  promoted_course?: { id: string; title: string; level_order: number };
}

// ── Promotion action (teacher submits at term end) ────────────────────────────
export type PromotionDecision = 'promote' | 'repeat' | 'complete' | 'withdraw';

export interface PromotionPayload {
  enrollment_id: string;
  decision: PromotionDecision;
  next_term_label: string;     // e.g. 'Term 2 2024'
  teacher_notes?: string;
}

// ── Mid-term placement (for new students joining in-progress) ─────────────────
export interface MidTermPlacement {
  student_id: string;
  course_id: string;
  school_id: string | null;
  program_id: string | null;
  cohort_year: number;
  term_label: string;
  start_week: number;          // >1 means they missed earlier weeks
  module_name?: string;        // optional track only
}

// ── Cohort summary (for school/teacher overview) ──────────────────────────────
export interface CohortSummary {
  cohort_year: number;
  course_id: string;
  course_title: string;
  level_order: number;
  total_students: number;
  active: number;
  promoted: number;
  repeated: number;
  completed: number;
}
