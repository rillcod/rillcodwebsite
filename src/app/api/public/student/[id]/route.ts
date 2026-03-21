import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const db = createAdminClient();

  // 1. Try portal_users (enrolled / registered students)
  const { data: portalData } = await db
    .from('portal_users')
    .select('id, full_name, school_name, is_active, enrollment_type, avatar_url')
    .eq('id', id)
    .eq('role', 'student')
    .maybeSingle();

  if (portalData) {
    return NextResponse.json({
      id: portalData.id,
      full_name: portalData.full_name,
      school_name: portalData.school_name,
      is_active: portalData.is_active,
      enrollment_type: portalData.enrollment_type,
      avatar_url: portalData.avatar_url ?? null,
      source: 'portal',
    });
  }

  // 2. Fallback: pre-portal students table
  const { data: studentData } = await db
    .from('students')
    .select('id, full_name, school_name, status')
    .eq('id', id)
    .maybeSingle();

  if (studentData) {
    return NextResponse.json({
      id: studentData.id,
      full_name: studentData.full_name,
      school_name: studentData.school_name,
      is_active: studentData.status === 'active',
      enrollment_type: null,
      avatar_url: null,
      source: 'students',
    });
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
