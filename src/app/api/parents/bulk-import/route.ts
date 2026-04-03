import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function requireStaff(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 };
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_name')
    .eq('id', user.id)
    .single();
  if (!profile || !['admin', 'teacher'].includes(profile.role)) {
    return { error: 'Forbidden', status: 403 };
  }
  return { profile };
}

function genPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789@#$!';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// POST — Bulk import parents
// Body: { rows: Array<{ full_name, email, phone?, student_name?, relationship? }> }
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const guard = await requireStaff(supabase);
    if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: (guard as any).status });

    const { rows } = await req.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
    }
    if (rows.length > 200) {
      return NextResponse.json({ error: 'Max 200 rows per import' }, { status: 400 });
    }

    const admin = createAdminClient();
    const results: { email: string; status: 'created' | 'skipped' | 'error'; message?: string; password?: string }[] = [];

    for (const row of rows) {
      const email = (row.email ?? '').trim().toLowerCase();
      const full_name = (row.full_name ?? '').trim();
      const phone = (row.phone ?? '').trim() || null;
      const relationship = (row.relationship ?? 'Guardian').trim();

      if (!email || !full_name) {
        results.push({ email: email || '(blank)', status: 'error', message: 'Missing email or name' });
        continue;
      }

      try {
        // Check existing portal user
        const { data: existing } = await supabase
          .from('portal_users')
          .select('id, role')
          .eq('email', email)
          .maybeSingle();

        if (existing && existing.role !== 'parent') {
          results.push({ email, status: 'skipped', message: `Already registered as ${existing.role}` });
          continue;
        }

        const password = genPassword();
        let portalUserId: string;

        if (existing) {
          portalUserId = existing.id;
          // Update name/phone if already exists as parent
          await supabase.from('portal_users').update({ full_name, phone }).eq('id', portalUserId);
          results.push({ email, status: 'skipped', message: 'Parent account already exists — updated name/phone' });
        } else {
          // Create auth account
          const { data: authData, error: authErr } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name, role: 'parent' },
          });
          if (authErr || !authData.user) {
            results.push({ email, status: 'error', message: authErr?.message ?? 'Auth creation failed' });
            continue;
          }
          portalUserId = authData.user.id;

          // Upsert portal_users
          await admin.from('portal_users').upsert({
            id: portalUserId,
            email,
            full_name,
            phone,
            role: 'parent',
            is_active: true,
          }, { onConflict: 'id' });

          results.push({ email, status: 'created', password });
        }

        // Link student by name if provided
        if (row.student_name) {
          const studentName = (row.student_name ?? '').trim();
          if (studentName) {
            const { data: student } = await admin
              .from('students')
              .select('id')
              .ilike('full_name', studentName)
              .limit(1)
              .maybeSingle();
            if (student) {
              await admin.from('students').update({
                parent_email: email,
                parent_name: full_name,
                parent_phone: phone,
                parent_relationship: relationship,
                updated_at: new Date().toISOString(),
              }).eq('id', student.id);
            }
          }
        }
      } catch (err: any) {
        results.push({ email, status: 'error', message: err.message ?? 'Unknown error' });
      }
    }

    const created = results.filter(r => r.status === 'created').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const errors = results.filter(r => r.status === 'error').length;

    return NextResponse.json({ results, summary: { created, skipped, errors } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Server error' }, { status: 500 });
  }
}
