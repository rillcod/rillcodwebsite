/**
 * Type definitions for student engagement tables.
 * These tables are created by: supabase/migrations/20260418120000_student_engagement.sql
 *
 * Add these to the generated Database type once Supabase types are regenerated
 * after running the migration. Until then, use the typed helpers below.
 */

import { Json } from './supabase';

// ── Table Row Types ───────────────────────────────────────────────────────────

export interface StudentXPLedgerRow {
  id: string;
  student_id: string;
  event_key: string;
  event_label: string;
  xp: number;
  ref_id: string | null;
  ref_type: string | null;
  term_number: number | null;
  school_id: string | null;
  metadata: Json;
  created_at: string;
}

export interface StudentXPLedgerInsert {
  id?: string;
  student_id: string;
  event_key: string;
  event_label: string;
  xp: number;
  ref_id?: string | null;
  ref_type?: string | null;
  term_number?: number | null;
  school_id?: string | null;
  metadata?: Json;
  created_at?: string;
}

export interface StudentXPSummaryRow {
  student_id: string;
  total_xp: number;
  level: number;
  this_term_xp: number;
  last_updated: string;
}

export interface StudentBadgeRow {
  id: string;
  student_id: string;
  badge_key: string;
  badge_label: string;
  badge_icon: string;
  earned_at: string;
  ref_id: string | null;
  school_id: string | null;
}

export interface StudentBadgeInsert {
  id?: string;
  student_id: string;
  badge_key: string;
  badge_label: string;
  badge_icon?: string;
  earned_at?: string;
  ref_id?: string | null;
  school_id?: string | null;
}

export interface StudentStreakRow {
  student_id: string;
  current_streak: number;
  longest_streak: number;
  last_active_week: string | null;
  total_active_weeks: number;
  updated_at: string;
}

export interface StudentStreakInsert {
  student_id: string;
  current_streak?: number;
  longest_streak?: number;
  last_active_week?: string | null;
  total_active_weeks?: number;
  updated_at?: string;
}

export interface ProjectEngagementRow {
  id: string;
  student_id: string;
  assignment_id: string | null;
  event_type: string;
  score: number | null;
  is_showcase: boolean;
  has_nigerian_context: boolean;
  used_ai_tools: boolean;
  feedback: string | null;
  school_id: string | null;
  curriculum_id: string | null;
  term_number: number | null;
  week_number: number | null;
  created_at: string;
}

export interface StudentAssignmentEngagementRow {
  id: string;
  student_id: string;
  school_id: string | null;
  course_id: string | null;
  term_number: number;
  academic_year: string;
  total_assigned: number;
  total_submitted: number;
  on_time_count: number;
  late_count: number;
  submission_pct: number;    // GENERATED ALWAYS — read-only
  last_submission: string | null;
  updated_at: string;
}

export interface StudentAssignmentEngagementInsert {
  id?: string;
  student_id: string;
  school_id?: string | null;
  course_id?: string | null;
  term_number: number;
  academic_year?: string;
  total_assigned?: number;
  total_submitted?: number;
  on_time_count?: number;
  late_count?: number;
  last_submission?: string | null;
  updated_at?: string;
}

export interface ShowcaseItemRow {
  id: string;
  student_id: string;
  school_id: string | null;
  title: string;
  description: string | null;
  file_url: string | null;
  thumbnail_url: string | null;
  item_type: 'project' | 'assignment' | 'assessment';
  assignment_id: string | null;
  course_name: string | null;
  term_number: number | null;
  academic_year: string;
  is_published: boolean;
  is_pinned: boolean;
  pinned_by: string | null;
  teacher_note: string | null;
  views: number;
  created_at: string;
  updated_at: string;
}

export interface ShowcaseItemInsert {
  id?: string;
  student_id: string;
  school_id?: string | null;
  title: string;
  description?: string | null;
  file_url?: string | null;
  thumbnail_url?: string | null;
  item_type?: 'project' | 'assignment' | 'assessment';
  assignment_id?: string | null;
  course_name?: string | null;
  term_number?: number | null;
  academic_year?: string;
  is_published?: boolean;
  is_pinned?: boolean;
  pinned_by?: string | null;
  teacher_note?: string | null;
  views?: number;
}

// ── Typed Supabase helpers ────────────────────────────────────────────────────
// Use these in place of supabase.from('table_name') for the new tables.
// Pass the typed supabase client and get back typed query builders.

import { SupabaseClient } from '@supabase/supabase-js';

type AnyClient = SupabaseClient<any>;

export const engagementTables = {
  xpLedger:   (db: AnyClient) => db.from('student_xp_ledger'),
  xpSummary:  (db: AnyClient) => db.from('student_xp_summary'),
  badges:     (db: AnyClient) => db.from('student_badges'),
  streaks:    (db: AnyClient) => db.from('student_streaks'),
  projectEng: (db: AnyClient) => db.from('project_engagement'),
  asgnEng:    (db: AnyClient) => db.from('student_assignment_engagement'),
  showcase:   (db: AnyClient) => db.from('showcase_items'),
};
