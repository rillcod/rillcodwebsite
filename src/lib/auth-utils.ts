import { createClient } from '@supabase/supabase-js';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Fetches all school IDs associated with a teacher, including their primary school_id
 * and any entries in the teacher_schools link table.
 */
export async function getTeacherSchoolIds(userId: string, primarySchoolId: string | null): Promise<string[]> {
  const ids: string[] = [];
  if (primarySchoolId) ids.push(primarySchoolId);
  
  const admin = adminClient();
  const { data: ts } = await admin
    .from('teacher_schools')
    .select('school_id')
    .eq('teacher_id', userId);
    
  (ts ?? []).forEach((r: any) => {
    if (r.school_id && !ids.includes(r.school_id)) {
      ids.push(r.school_id);
    }
  });
  
  return ids;
}

/**
 * Checks if a user has access to a specific school.
 * Admins always have access.
 */
export async function canAccessSchool(userId: string, role: string, schoolId: string | null, primarySchoolId: string | null): Promise<boolean> {
  if (role === 'admin') return true;
  if (!schoolId) return true; // Platform templates are accessible to all
  
  const sids = await getTeacherSchoolIds(userId, primarySchoolId);
  return sids.includes(schoolId);
}
