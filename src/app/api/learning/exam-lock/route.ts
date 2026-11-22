import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { checkExamMaterialLock } from '@/lib/cbt/exam-material-lock';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * GET /api/learning/exam-lock?lesson_id=...&course_id=...
 * Checks if study materials are currently locked by a live official examination.
 * Enforced across ALL student accounts so switching accounts cannot bypass the lock.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ locked: false }, { status: 401 });
  }

  const admin = adminClient();
  const { data: profile } = await admin
    .from('portal_users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const { searchParams } = request.nextUrl;
  const lessonId = searchParams.get('lesson_id');
  const courseId = searchParams.get('course_id');

  const lock = await checkExamMaterialLock(admin, {
    userRole: String(profile?.role ?? 'student'),
    lessonId,
    courseId,
  });

  return NextResponse.json(lock, {
    status: lock.locked ? 423 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
