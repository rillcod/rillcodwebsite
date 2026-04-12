import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';

export interface SearchFilters {
    query?: string;
    status?: string;
    skillLevel?: string;
    dateFrom?: string;
    dateTo?: string;
    courseId?: string;
    programId?: string;
    type?: 'all' | 'lesson' | 'assignment' | 'course' | 'program' | 'student';
}

export class SearchService {
    async searchAll(query: string, tenantId?: string, filters?: SearchFilters) {
        const supabase = await createClient();

        // Perform parallel searches across multiple domains
        const [courses, programs, teachers, lessons, assignments] = await Promise.all([
            this.searchCourses(query, tenantId, filters),
            this.searchPrograms(query, tenantId, filters),
            this.searchTeachers(query, tenantId, filters),
            this.searchLessons(query, tenantId, filters),
            this.searchAssignments(query, tenantId, filters)
        ]);

        return {
            courses,
            programs,
            teachers,
            lessons,
            assignments
        };
    }

    async searchCourses(query: string, tenantId?: string, filters?: SearchFilters) {
        if (filters?.type && filters.type !== 'all' && filters.type !== 'course') return [];
        
        const supabase = await createClient();
        let q = supabase
            .from('courses')
            .select('id, title, description, is_active, skill_level, created_at, programs(id, name)')
            .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
            .limit(10);

        if (tenantId) {
            q = q.eq('school_id', tenantId);
        }

        if (filters?.skillLevel) {
            q = q.eq('skill_level', filters.skillLevel);
        }

        if (filters?.programId) {
            q = q.eq('program_id', filters.programId);
        }

        const { data } = await q;
        return data || [];
    }

    async searchPrograms(query: string, tenantId?: string, filters?: SearchFilters) {
        if (filters?.type && filters.type !== 'all' && filters.type !== 'program') return [];
        
        const supabase = await createClient();
        const q = supabase
            .from('programs')
            .select('id, name, description, created_at')
            .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
            .limit(10);

        const { data } = await q;
        return data || [];
    }

    async searchTeachers(query: string, tenantId?: string, filters?: SearchFilters) {
        if (filters?.type && filters.type !== 'all' && filters.type !== 'student') return [];
        
        const supabase = await createClient();
        let q = supabase
            .from('portal_users')
            .select('id, full_name, profile_image_url, email, school_id')
            .eq('role', 'teacher')
            .ilike('full_name', `%${query}%`)
            .limit(5);

        if (tenantId) {
            q = q.eq('school_id', tenantId);
        }

        const { data } = await q;
        return data || [];
    }

    async searchLessons(query: string, tenantId?: string, filters?: SearchFilters) {
        if (filters?.type && filters.type !== 'all' && filters.type !== 'lesson') return [];
        if (!query) return [];

        const supabase = await createClient();
        let q = supabase
            .from('lessons')
            .select('id, title, description, lesson_type, status, duration_minutes, created_at, courses(id, title)')
            .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
            .limit(10);

        if (tenantId) {
            q = q.eq('school_id', tenantId);
        }

        if (filters?.status) {
            q = q.eq('status', filters.status);
        }

        if (filters?.courseId) {
            q = q.eq('course_id', filters.courseId);
        }

        if (filters?.dateFrom) {
            q = q.gte('created_at', filters.dateFrom);
        }

        if (filters?.dateTo) {
            q = q.lte('created_at', filters.dateTo);
        }

        const { data } = await q;
        return data || [];
    }

    async searchAssignments(query: string, tenantId?: string, filters?: SearchFilters) {
        if (filters?.type && filters.type !== 'all' && filters.type !== 'assignment') return [];
        if (!query) return [];

        const supabase = await createClient();
        let q = supabase
            .from('assignments')
            .select('id, title, description, assignment_type, status, due_date, created_at, courses(id, title)')
            .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
            .limit(10);

        if (tenantId) {
            q = q.eq('school_id', tenantId);
        }

        if (filters?.status) {
            q = q.eq('status', filters.status);
        }

        if (filters?.courseId) {
            q = q.eq('course_id', filters.courseId);
        }

        if (filters?.dateFrom) {
            q = q.gte('created_at', filters.dateFrom);
        }

        if (filters?.dateTo) {
            q = q.lte('due_date', filters.dateTo);
        }

        const { data } = await q;
        return data || [];
    }
}

export const searchService = new SearchService();
