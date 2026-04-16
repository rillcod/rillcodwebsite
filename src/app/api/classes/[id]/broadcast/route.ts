import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { queueService } from '@/services/queue.service';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Caller = { role: string; id: string; school_id: string | null; full_name: string | null };

async function requireStaff(): Promise<Caller | { _err: string } | null> {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { _err: `auth:${error?.message ?? 'no user'}` };
  
  const { data: caller, error: dbErr } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id, full_name')
    .eq('id', user.id)
    .single();
    
  if (!caller) return { _err: `profile:${dbErr?.message ?? 'not found'} uid=${user.id}` };
  if (!['admin', 'teacher', 'school'].includes(caller.role)) return { _err: `role:${caller.role}` };
  return caller as Caller;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
      const staffResult = await requireStaff();
      if (!staffResult || '_err' in staffResult) {
        return NextResponse.json(
          { error: staffResult ? `Access denied [${(staffResult as any)._err}]` : 'Access denied' },
          { status: 403 },
        );
      }
      const caller = staffResult as Caller;
      const { id: classId } = await params;
      const admin = adminClient();
    
      // Fetch the class
      const { data: cls } = await admin
        .from('classes')
        .select('id, name, school_id')
        .eq('id', classId)
        .single();
    
      if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    
      // Validate access (allow admin, or same school, or assigned teacher)
      if (caller.role !== 'admin') {
          if (caller.role === 'school' && caller.school_id !== cls.school_id) {
              return NextResponse.json({ error: 'Access denied' }, { status: 403 });
          }
          if (caller.role === 'teacher' && caller.school_id !== cls.school_id) {
              const { data: ts } = await admin.from('teacher_schools').select('school_id').eq('teacher_id', caller.id).eq('school_id', cls.school_id).maybeSingle();
              if (!ts) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
          }
      }
    
      const body = await request.json();
      if (!body.text || typeof body.text !== 'string') {
          return NextResponse.json({ error: 'Message text is required' }, { status: 400 });
      }
    
      // Find all students enrolled in the class
      const { data: students } = await admin
        .from('portal_users')
        .select('id')
        .eq('class_id', classId)
        .eq('role', 'student');
    
      if (!students || students.length === 0) {
          return NextResponse.json({ error: 'No students enrolled in this class' }, { status: 400 });
      }
    
      const prefixName = caller.full_name ? caller.full_name.split(' ')[0] : 'Teacher';
      const formattedMessage = `*[Rillcod: ${cls.name}]*\n_${prefixName} says:_ \n\n${body.text}`;
    
      // Queue WhatsApp broadcast
      let queuedCount = 0;
      for (const student of students) {
          await queueService.queueNotification(student.id, 'whatsapp', {
              body: formattedMessage,
              mediaUrl: body.mediaUrl || undefined // Optional attachment support
          }).catch(console.error);
          queuedCount++;
      }
    
      return NextResponse.json({ success: true, queued: queuedCount });
  } catch (err: any) {
      console.error('Broadcast error:', err);
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
