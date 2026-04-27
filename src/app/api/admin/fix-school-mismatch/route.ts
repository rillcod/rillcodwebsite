import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/admin/fix-school-mismatch
// Scans for students who are enrolled in a class belonging to a different school.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: caller } = await admin.from('portal_users').select('role').eq('id', user.id).single();
    if (!caller || caller.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Fetch students who have a class assigned
    const { data: students, error: stuErr } = await admin
      .from('portal_users')
      .select('id, full_name, email, school_id, school_name, class_id, section_class')
      .eq('role', 'student')
      .not('class_id', 'is', null);

    if (stuErr) return NextResponse.json({ error: stuErr.message }, { status: 500 });

    // Fetch all classes that have a school assigned
    const { data: classes, error: clsErr } = await admin
      .from('classes')
      .select('id, name, school_id')
      .not('school_id', 'is', null);

    if (clsErr) return NextResponse.json({ error: clsErr.message }, { status: 500 });

    const classMap = new Map(classes.map(c => [c.id, c]));
    
    // Identify mismatches
    const mismatches = students.filter(s => {
      const cls = classMap.get(s.class_id!);
      if (!cls) return false; // Class has no school or doesn't exist
      
      // Mismatch if school IDs are different
      return s.school_id !== cls.school_id;
    }).map(s => {
      const cls = classMap.get(s.class_id!)!;
      return {
        student_id: s.id,
        student_name: s.full_name,
        student_school_id: s.school_id,
        student_school_name: s.school_name,
        class_id: s.class_id,
        class_name: s.section_class || cls.name,
        class_school_id: cls.school_id,
      };
    });

    return NextResponse.json({ 
      count: mismatches.length, 
      mismatches 
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/admin/fix-school-mismatch
// Repairs mismatches. 
// Body: { action: 'align_student' | 'unenroll', studentIds: string[] }
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: caller } = await admin.from('portal_users').select('role').eq('id', user.id).single();
    if (!caller || caller.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { action, studentIds } = await request.json();
    if (!action || !Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json({ error: 'action and studentIds required' }, { status: 400 });
    }

    let successCount = 0;
    const errors: string[] = [];

    if (action === 'align_student') {
      // Update student's school to match their current class
      for (const sid of studentIds) {
        try {
          const { data: student } = await admin.from('portal_users').select('class_id').eq('id', sid).single();
          if (!student?.class_id) continue;

          const { data: cls } = await admin.from('classes').select('school_id, name').eq('id', student.class_id).single();
          if (!cls?.school_id) continue;

          const { data: school } = await admin.from('schools').select('name').eq('id', cls.school_id).single();

          await admin.from('portal_users').update({
            school_id: cls.school_id,
            school_name: school?.name ?? null
          }).eq('id', sid);
          
          // Also sync to 'students' (pre-portal) table if it exists
          await admin.from('students').update({
            school_id: cls.school_id,
            school_name: school?.name ?? null
          }).eq('user_id', sid);

          successCount++;
        } catch (e: any) {
          errors.push(`Failed for ${sid}: ${e.message}`);
        }
      }
    } else if (action === 'unenroll') {
      // Remove student from the class
      for (const sid of studentIds) {
        try {
          const { data: student } = await admin.from('portal_users').select('class_id').eq('id', sid).single();
          const prevClassId = student?.class_id;

          await admin.from('portal_users').update({
            class_id: null,
            section_class: null
          }).eq('id', sid);

          if (prevClassId) {
             // Resync class count
             const { count } = await admin.from('portal_users').select('id', { count: 'exact', head: true }).eq('class_id', prevClassId).eq('role', 'student');
             await admin.from('classes').update({ current_students: count ?? 0 }).eq('id', prevClassId);
          }

          successCount++;
        } catch (e: any) {
          errors.push(`Failed for ${sid}: ${e.message}`);
        }
      }
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true, 
      applied: successCount, 
      errors: errors.length > 0 ? errors : undefined 
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
