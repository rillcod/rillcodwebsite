import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { env } from '@/config/env';

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireAdmin() {
    const supabase = await createClient();
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();
    if (error || !user) return null;
    const { data: profile } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return null;
    return user;
}

/**
 * GET /api/admin/billing-health
 * Read-only ops checklist: env + app_settings + counts (no secrets returned).
 */
export async function GET() {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const db = createAdminClient();
    const adminOpsEmail = env.ADMIN_OPS_EMAIL?.trim() ?? '';
    const adminOpsEmailConfigured = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(adminOpsEmail);

    const { data: defProgRow } = await db
        .from('app_settings')
        .select('value')
        .eq('key', 'default_registration_program_id')
        .maybeSingle();
    const raw = (defProgRow?.value ?? '').trim();
    const validUuid = raw.length > 0 && UUID_RE.test(raw);
    let programmeExists = false;
    if (validUuid) {
        const { data: prog } = await db.from('programs').select('id').eq('id', raw).maybeSingle();
        programmeExists = !!prog;
    }

    const { count: instalmentsOnCount } = await db
        .from('programs')
        .select('*', { count: 'exact', head: true })
        .eq('instalments_enabled', true);

    const { data: programs } = await db.from('programs').select('id, price');
    const pricedProgramIds = new Set(
        (programs ?? [])
            .filter((p) => p.price != null && Number(p.price) > 0)
            .map((p) => p.id),
    );
    const { data: activeCourses } = await db.from('courses').select('program_id').eq('is_active', true);
    const activeMissingPrice = (activeCourses ?? []).filter(
        (c) => !c.program_id || !pricedProgramIds.has(c.program_id),
    ).length;

    return NextResponse.json({
        admin_ops_email_configured: adminOpsEmailConfigured,
        default_registration_program_id: {
            set: raw.length > 0,
            valid_uuid: validUuid,
            programme_exists: programmeExists,
        },
        programs_with_instalments_enabled: instalmentsOnCount ?? 0,
        active_courses_without_priced_programme: activeMissingPrice,
        hints: [
            'Set ADMIN_OPS_EMAIL in the host environment (e.g. Vercel) for registration payment alerts.',
            'Set app_settings.default_registration_program_id via PUT /api/app-settings (admin) to a programme UUID with programs.price > 0.',
            'Enable programs.instalments_enabled only on programmes that truly offer instalments.',
            'After db push, migration 20260415140000_unpublish_courses_without_priced_program sets is_active=false on courses missing a priced programme.',
        ],
    });
}
