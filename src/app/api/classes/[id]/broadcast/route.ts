import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

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
  context: { params: Promise<{ id: string }> },
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
      const { id: classId } = await context.params;
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
    
      // Find all students enrolled in the class with their phone numbers
      const { data: students } = await admin
        .from('portal_users')
        .select(`
          id, 
          full_name, 
          email, 
          phone,
          student_id,
          students(parent_phone, parent_name, phone)
        `)
        .eq('class_id', classId)
        .eq('role', 'student');
    
      if (!students || students.length === 0) {
          return NextResponse.json({ error: 'No students enrolled in this class' }, { status: 400 });
      }

      // Filter students who have reachable phone numbers (student phone OR parent phone)
      const reachableStudents = students.filter(student => {
        const studentInfo = Array.isArray(student.students) ? student.students[0] : student.students;
        const studentPhone = student.phone || studentInfo?.phone;
        const parentPhone = studentInfo?.parent_phone;
        return studentPhone || parentPhone;
      });

      if (reachableStudents.length === 0) {
          return NextResponse.json({ 
            error: 'No students have phone numbers available for WhatsApp broadcast',
            total_students: students.length,
            reachable_students: 0
          }, { status: 400 });
      }
    
      const prefixName = caller.full_name ? caller.full_name.split(' ')[0] : 'Teacher';
      const formattedMessage = `*[Rillcod: ${cls.name}]*\n_${prefixName} says:_ \n\n${body.text}`;
    
      // Send WhatsApp messages to reachable students
      let successCount = 0;
      let failureCount = 0;
      
      for (const student of reachableStudents) {
        try {
          // Prefer parent phone, fallback to student phone
          const studentInfo = Array.isArray(student.students) ? student.students[0] : student.students;
          const targetPhone = studentInfo?.parent_phone || student.phone || studentInfo?.phone;
          const recipientName = studentInfo?.parent_name || student.full_name;
          
          if (!targetPhone) continue;

          // Send WhatsApp message using Meta WhatsApp Business API
          const phoneId = process.env.WHATSAPP_PHONE_ID || '1165370629985726';
          const whatsappToken = process.env.WHATSAPP_API_TOKEN;
          
          if (!whatsappToken) {
            console.error('WhatsApp API token not configured');
            failureCount++;
            continue;
          }

          const whatsappApiUrl = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
          const whatsappRes = await fetch(whatsappApiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${whatsappToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: targetPhone.replace(/^\+/, ''), // Remove + prefix if present
              type: 'text',
              text: { body: formattedMessage }
            })
          });

          if (whatsappRes.ok) {
            successCount++;
          } else {
            failureCount++;
            console.error(`Failed to send WhatsApp to ${targetPhone}:`, await whatsappRes.text());
          }
        } catch (error) {
          failureCount++;
          console.error(`Error sending WhatsApp to student ${student.id}:`, error);
        }
      }
    
      return NextResponse.json({ 
        success: true, 
        total_students: students.length,
        reachable_students: reachableStudents.length,
        messages_sent: successCount,
        failures: failureCount,
        message: `WhatsApp broadcast sent to ${successCount} out of ${reachableStudents.length} reachable students (${students.length} total enrolled)`
      });
  } catch (err: any) {
      console.error('Broadcast error:', err);
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
