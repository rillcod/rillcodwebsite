import { Database } from './supabase';

export type StudentReport = Database['public']['Tables']['student_progress_reports']['Row'] & {
    template_id?: 'futuristic' | 'industrial' | 'executive' | string | null;
};
export type OrgSettings = Database['public']['Tables']['report_settings']['Row'];

/**
 * Specifically typed interface for the engagement_metrics JSON field
 */
export interface EngagementMetrics {
    classwork_score?: number;
    assessment_score?: number;
    [key: string]: any;
}

/**
 * Type-safe helper to parse engagement_metrics from the report row
 */
export function parseEngagementMetrics(metrics: any): EngagementMetrics {
    if (!metrics || typeof metrics !== 'object') return {};
    return metrics as EngagementMetrics;
}
