import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';

export class SearchService {
    async searchAll(query: string, tenantId?: string) {
        const supabase = await createClient();

        // Perform parallel searches across multiple domains
        const [courses, programs, teachers] = await Promise.all([
            this.searchCourses(query, tenantId),
            this.searchPrograms(query, tenantId),
            this.searchTeachers(query, tenantId)
        ]);

        return {
            courses,
            programs,
            teachers
        };
    }

    async searchCourses(query: string, tenantId?: string) {
        const supabase = await createClient();
        let q = supabase
            .from('courses')
            .select('*, programs(name)')
            .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
            .limit(10);

        if (tenantId) {
            q = q.eq('school_id', tenantId);
        }

        const { data } = await q;
        return data || [];
    }

    async searchPrograms(query: string, tenantId?: string) {
        const supabase = await createClient();
        let q = supabase
            .from('programs')
            .select('*')
            .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
            .limit(10);

        // Programs might not have tenantId directly, depending on schema
        const { data } = await q;
        return data || [];
    }

    async searchTeachers(query: string, tenantId?: string) {
        const supabase = await createClient();
        let q = supabase
            .from('portal_users')
            .select('id, full_name, profile_image_url')
            .eq('role', 'teacher')
            .ilike('full_name', `%${query}%`)
            .limit(5);

        if (tenantId) {
            // q = q.eq('tenant_id', tenantId);
        }

        const { data } = await q;
        return data || [];
    }
}

export const searchService = new SearchService();
