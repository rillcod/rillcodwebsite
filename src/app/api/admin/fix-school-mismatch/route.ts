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

// GET /api/admin/fix-school-mismatch/suggestions
// Cross-references current students with bulk registration history to suggest restoration.
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: caller } = await admin.from('portal_users').select('role').eq('id', user.id).single();
    if (!caller || caller.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Fetch all students
    const { data: students } = await admin
      .from('portal_users')
      .select('id, full_name, email, school_id, school_name, class_id, section_class')
      .eq('role', 'student');

    // Fetch registration history
    const { data: histResults } = await admin.from('registration_results').select('email, batch_id');
    const batchIds = [...new Set(histResults?.map(r => r.batch_id) ?? [])];
    const { data: batches } = await admin.from('registration_batches').select('*').in('id', batchIds);
    
    // Forensic: Fetch activity indicators
    const { data: activityLogs } = await admin
      .from('activity_logs')
      .select('user_id, school_id')
      .in('user_id', students?.map(s => s.id) ?? [])
      .not('school_id', 'is', null);

    const { data: allSchools } = await admin.from('schools').select('id, name');
    const { data: allClasses } = await admin.from('classes').select('id, name, school_id');

    const batchMap = new Map(batches?.map(b => [b.id, b]) ?? []);
    const studentHistMap = new Map(histResults?.map(r => [r.email.toLowerCase(), r.batch_id]) ?? []);
    const schoolMap = new Map(allSchools?.map(s => [s.id, s.name]) ?? []);
    
    // Map activity logs to counts per school per user
    const activityMap = new Map<string, Map<string, number>>();
    (activityLogs ?? []).forEach(log => {
      const userSchools = activityMap.get(log.user_id) || new Map<string, number>();
      userSchools.set(log.school_id, (userSchools.get(log.school_id) || 0) + 1);
      activityMap.set(log.user_id, userSchools);
    });

    const suggestions = (students ?? []).map(s => {
      const emailKey = s.email?.toLowerCase() || '';
      const batchId = studentHistMap.get(emailKey);
      const batch = batchId ? batchMap.get(batchId) : null;
      const userActivity = activityMap.get(s.id);

      // Scoring Heuristic
      let bestSchoolId = s.school_id;
      let score = 0;
      const evidence: string[] = [];

      // 1. History (Weight 100)
      if (batch) {
        bestSchoolId = batch.school_id;
        score += 100;
        evidence.push('Original Registration Record');
      }

      // 2. Activity (Weight 40 per school match)
      if (userActivity) {
        let topActivitySchool = '';
        let maxLogs = 0;
        for (const [schId, count] of userActivity.entries()) {
          if (count > maxLogs) {
            maxLogs = count;
            topActivitySchool = schId;
          }
        }
        if (topActivitySchool) {
          if (topActivitySchool === bestSchoolId) {
            score += 50;
            evidence.push(`Recent Academic Activity (${maxLogs} events)`);
          } else if (score < 50) {
             // If history is missing, trust activity
             bestSchoolId = topActivitySchool;
             score += 50;
             evidence.push(`Primary School Activity Found (${maxLogs} events)`);
          }
        }
      }

      // 3. Class Match (Weight 30)
      const currentClassId = s.class_id;
      const targetClassId = batch?.class_id || null;
      let finalTargetClassId = targetClassId;

      if (!finalTargetClassId && batch?.class_name) {
        const matchedClass = allClasses?.find(c => c.school_id === bestSchoolId && c.name === batch.class_name);
        if (matchedClass) finalTargetClassId = matchedClass.id;
      }

      const needsRepair = s.school_id !== bestSchoolId || s.class_id !== finalTargetClassId;

      if (needsRepair) {
        return {
          student_id: s.id,
          student_name: s.full_name,
          email: s.email,
          score,
          evidence,
          current: {
            school_id: s.school_id,
            school_name: s.school_name,
            class_id: s.class_id,
            class_name: s.section_class,
          },
          suggested: {
            school_id: bestSchoolId,
            school_name: schoolMap.get(bestSchoolId || '') || batch?.school_name || 'Unknown School',
            class_id: finalTargetClassId,
            class_name: batch?.class_name || (finalTargetClassId ? allClasses?.find(c => c.id === finalTargetClassId)?.name : null),
          },
          batch_id: batchId
        };
      }
      return null;
    }).filter(Boolean);

    return NextResponse.json({ suggestions });
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

    if (action === 'restore_from_history') {
      const { data: students } = await admin.from('portal_users').select('id, email').in('id', studentIds);
      const emails = students?.map(s => s.email?.toLowerCase()).filter(Boolean) as string[];
      
      const { data: histResults } = await admin.from('registration_results').select('email, batch_id').in('email', emails);
      const batchIds = [...new Set(histResults?.map(r => r.batch_id) ?? [])];
      const { data: batches } = await admin.from('registration_batches').select('*').in('id', batchIds);
      const { data: allClasses } = await admin.from('classes').select('id, name, school_id');

      const batchMap = new Map(batches?.map(b => [b.id, b]) ?? []);
      const studentHistMap = new Map(histResults?.map(r => [r.email.toLowerCase(), r.batch_id]) ?? []);

      for (const s of (students ?? [])) {
        try {
          const batchId = studentHistMap.get(s.email?.toLowerCase() || '');
          if (!batchId) {
            errors.push(`No history for ${s.email}`);
            continue;
          }
          const batch = batchMap.get(batchId);
          if (!batch) {
             errors.push(`Batch ${batchId} not found for ${s.email}`);
             continue;
          }

          let targetClassId = batch.class_id;
          let targetClassName = batch.class_name;

          // Resolve class by name if ID missing
          if (!targetClassId && targetClassName && batch.school_id) {
            const matchedClass = allClasses?.find(c => c.school_id === batch.school_id && c.name === targetClassName);
            if (matchedClass) targetClassId = matchedClass.id;
          }

          const update = {
            school_id: batch.school_id,
            school_name: batch.school_name,
            class_id: targetClassId || null,
            section_class: targetClassName || null,
          };

          await admin.from('portal_users').update(update).eq('id', s.id);
          await admin.from('students').update(update).eq('user_id', s.id);
          
          successCount++;
        } catch (e: any) {
          errors.push(`Failed for ${s.id}: ${e.message}`);
        }
      }
    } else if (action === 'align_student') {
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
