import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { duplicateNameKey } from '@/lib/students/clean-name';
import {
  buildNameLookupMaps,
  findNameDuplicate,
  findSchoolNameKeyConflicts,
  loadSchoolStudentsForNameCheck,
} from '@/lib/students/duplicate-name-barricade';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Preview-time same-school name + email conflict check for bulk register.
 * Uses service-role + paged/RPC lookup so teachers are not capped at ~1000 rows.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: caller } = await supabase
      .from('portal_users')
      .select('role, school_id, school_name')
      .eq('id', user.id)
      .single();

    if (!caller || (caller.role !== 'admin' && caller.role !== 'teacher')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const schoolId = (body.school_id?.toString().trim() || caller.school_id || null) as string | null;
    const schoolName = (body.school_name?.toString().trim() || caller.school_name || null) as string | null;
    const names: string[] = Array.isArray(body.names) ? body.names.map((n: unknown) => String(n ?? '')) : [];
    const emails: string[] = Array.isArray(body.emails)
      ? body.emails.map((e: unknown) => String(e ?? '').trim().toLowerCase()).filter(Boolean)
      : [];

    if (!schoolId) {
      return NextResponse.json({ error: 'school_id is required' }, { status: 400 });
    }

    if (caller.role === 'teacher') {
      const assigned = new Set<string>();
      if (caller.school_id) assigned.add(caller.school_id);
      const { data: rows } = await supabaseAdmin
        .from('teacher_schools')
        .select('school_id')
        .eq('teacher_id', user.id);
      for (const row of rows ?? []) {
        if ((row as { school_id?: string }).school_id) assigned.add((row as { school_id: string }).school_id);
      }
      if (!assigned.has(schoolId)) {
        return NextResponse.json({ error: 'You are not assigned to this school.' }, { status: 403 });
      }
    }

    const nameKeys = names.map((n) => duplicateNameKey(n)).filter(Boolean);
    const rpcConflicts = await findSchoolNameKeyConflicts(
      supabaseAdmin as any,
      schoolId,
      schoolName,
      nameKeys,
    );
    const existing = await loadSchoolStudentsForNameCheck(
      supabaseAdmin as any,
      schoolId,
      schoolName,
    );
    const maps = buildNameLookupMaps(existing);
    for (const [key, hit] of rpcConflicts) {
      if (!maps.byKey.has(key)) maps.byKey.set(key, hit);
    }

    const nameConflicts: Array<{
      full_name: string;
      kind: 'exact' | 'swap' | 'key';
      existing_full_name: string;
      existing_email: string;
      name_key: string;
    }> = [];

    const seenNorms = new Set<string>();
    for (const fullName of names) {
      if (!fullName?.trim()) continue;
      const norm = fullName.trim().replace(/\s+/g, ' ').toLowerCase();
      if (seenNorms.has(norm)) continue;
      seenNorms.add(norm);
      const dup = findNameDuplicate(maps, fullName);
      if (!dup) continue;
      nameConflicts.push({
        full_name: fullName.trim(),
        kind: dup.kind,
        existing_full_name: dup.hit.full_name,
        existing_email: dup.hit.email,
        name_key: duplicateNameKey(fullName),
      });
    }

    const emailConflicts: Array<{ email: string; full_name: string; role: string }> = [];
    if (emails.length > 0) {
      const uniqueEmails = [...new Set(emails)];
      const { data: emailRows } = await supabaseAdmin
        .from('portal_users')
        .select('email, full_name, role, is_deleted')
        .in('email', uniqueEmails)
        .or('is_deleted.eq.false,is_deleted.is.null');

      const namesByEmail = new Map<string, string[]>();
      emails.forEach((email, i) => {
        const list = namesByEmail.get(email) ?? [];
        list.push(names[i] ?? '');
        namesByEmail.set(email, list);
      });

      for (const row of emailRows ?? []) {
        const email = (row.email || '').toLowerCase();
        const previewNames = namesByEmail.get(email) ?? [];
        const nameMatches = previewNames.some((name) => {
          const a = (row.full_name || '').trim().replace(/\s+/g, ' ').toLowerCase();
          const b = name.trim().replace(/\s+/g, ' ').toLowerCase();
          if (a === b) return true;
          const parts = b.split(/\s+/);
          return parts.length >= 2 && a === [...parts].reverse().join(' ');
        });
        if (row.role !== 'student' || !nameMatches) {
          emailConflicts.push({
            email,
            full_name: row.full_name,
            role: row.role,
          });
        }
      }
    }

    return NextResponse.json({ nameConflicts, emailConflicts });
  } catch (err: any) {
    console.error('[check-duplicates]', err);
    return NextResponse.json({ error: err?.message || 'Failed to check duplicates' }, { status: 500 });
  }
}
