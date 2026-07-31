export type Person = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  is_active: boolean;
  enrollment_type: string | null;
  school_name: string | null;
  class_from_roster: string | null;
  class_on_profile: string | null;
  roster_status: string | null;
  reports_total: number;
  reports_published: number;
  reports_draft: number;
  has_parent_contact: boolean;
  has_parent_email?: boolean;
  flags: string[] | null;
};

export type ClassRow = {
  class: string;
  students: number;
  reports: number;
  published: number;
  draft: number;
  missing?: number;
};

export type TeacherReport = {
  teacher_id: string | null;
  teacher: string;
  course: string;
  term: string;
  total_reports: number;
  published: number;
  drafts: number;
  completion_pct: number;
};

export type EmailTypeRow = {
  email_type: string;
  provider?: string;
  total_dispatched: number;
  delivered: number;
  failed_or_bounced: number;
  pending: number;
};

export type Coverage = {
  generated_at: string;
  term_context?: { term_id: string; academic_year: string; term_label: string } | null;
  totals: Record<string, number>;
  gaps: Record<string, number>;
  classes_without_reports: { class: string; students: number }[];
  by_class: ClassRow[];
  by_teacher?: TeacherReport[];
  by_email_type?: EmailTypeRow[];
  by_provider?: EmailTypeRow[];
  drafts_by_teacher: { teacher: string; course: string; term: string; drafts: number }[];
  possible_duplicate_classes: { normalised: string; names: string[] }[];
};

export type Backlog = {
  generated_at: string;
  all_terms: { reports: number; published: number; drafts: number };
  current_term: { reports: number; published: number; drafts: number };
  hidden_by_term_filter: { reports: number; drafts: number };
  overdue_by_teacher: {
    teacher: string; course: string; term: string; drafts: number; oldest_days: number | null;
  }[];
  drafts_by_term: { term: string; drafts: number; is_current_term: boolean }[];
};

export type AccountabilityTab =
  | 'overview'
  | 'people'
  | 'teachers'
  | 'reports'
  | 'comms'
  | 'report';

/** Plain-language labels for gap flags shown in the UI. */
export const FLAG_LABEL: Record<string, string> = {
  no_class: 'Not put in a class yet',
  no_report: 'No progress report this term',
  draft_pending: 'Report started but not sent',
  no_parent_phone: 'No parent phone number',
  no_parent_email: 'No parent email',
  class_mismatch: 'Wrong class on their account',
  inactive: 'Account turned off',
  no_enrolment_type: 'Enrolment type not set',
  withdrawn: 'Left the school / ended',
};

export const ROLE_META: Record<string, {
  label: string;
  short: string;
  description: string;
  tone: string;
  bg: string;
  border: string;
}> = {
  student: {
    label: 'Student',
    short: 'Student',
    description: 'A learner. Needs a class, progress reports, and parent contact details.',
    tone: 'text-sky-600 dark:text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/25',
  },
  teacher: {
    label: 'Teacher',
    short: 'Teacher',
    description: 'Teaching staff who write and send progress reports.',
    tone: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/25',
  },
  parent: {
    label: 'Parent / Guardian',
    short: 'Parent',
    description: 'A parent or guardian who gets results and school messages.',
    tone: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/25',
  },
  admin: {
    label: 'Administrator',
    short: 'Admin',
    description: 'Someone who can see every school and fix account problems.',
    tone: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/25',
  },
  school: {
    label: 'School login',
    short: 'School',
    description: 'The school’s own login for managing its students and staff.',
    tone: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/25',
  },
};

export function normalizeRole(role: string | null | undefined): string {
  return (role || '(none)').trim().toLowerCase() || '(none)';
}

export function roleMeta(role: string | null | undefined) {
  const key = normalizeRole(role);
  return ROLE_META[key] ?? {
    label: key === '(none)' ? 'Unknown role' : key.charAt(0).toUpperCase() + key.slice(1),
    short: key === '(none)' ? 'Unknown' : key,
    description: 'This account type is not one of the usual roles.',
    tone: 'text-muted-foreground',
    bg: 'bg-muted',
    border: 'border-border',
  };
}

export function isStudent(p: Person) {
  return normalizeRole(p.role) === 'student';
}

export function isTeacher(p: Person) {
  return normalizeRole(p.role) === 'teacher';
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export function fmtShortDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}
