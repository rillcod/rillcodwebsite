import { Database } from './supabase';

export type StudentReport = Database['public']['Tables']['student_progress_reports']['Row'] & {
    template_id?: 'futuristic' | 'industrial' | 'executive' | string | null;
    // Grade level shown as "Class" on the report — distinct from section_class (the cohort,
    // shown as "Section"). Column exists in DB; typed here until supabase types are regenerated.
    student_grade?: string | null;
};
export type OrgSettings = Database['public']['Tables']['report_settings']['Row'];

/**
 * Specifically typed interface for the engagement_metrics JSON field
 */
export interface EngagementMetrics {
    classwork_score?: number;
    assessment_score?: number;
    /** Immutable Academic Office policy snapshot used to calculate this report. */
    score_weights?: {
        theory: number;
        classwork: number;
        practical: number;
        assignments: number;
        attendance: number;
        assessment: number;
    };
    grading_scheme_id?: string | null;
    grading_scheme_name?: string | null;
    [key: string]: any;
}

/**
 * Type-safe helper to parse engagement_metrics from the report row
 */
export function parseEngagementMetrics(metrics: any): EngagementMetrics {
    if (!metrics || typeof metrics !== 'object') return {};
    return metrics as EngagementMetrics;
}
