import { NextRequest, NextResponse } from 'next/server';
import { crmAuthErrorResponse, requireCrmStaff } from '@/lib/crm/auth';
import {
  migrateCrmActivityToPortal,
  normalizeCrmEmail,
  normalizeCrmPhone,
  promoteBookLeadToPortalIfLinked,
} from '@/lib/crm/contact-book';
import { insertCrmInteraction, upsertCrmPipeline } from '@/lib/crm/pipeline';
import { assertCrmContactAccess } from '@/lib/crm/scope';

/**
 * POST /api/crm/contacts/[id]/convert
 * Promote a book lead onto a matching (or newly specified) portal parent:
 * migrate crm_* activity, link book.user_id, advance pipeline.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { caller, db } = await requireCrmStaff();
    const access = await assertCrmContactAccess(db, caller, id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    if (access.kind !== 'book') {
      return NextResponse.json({ error: 'Only form leads (contact book) can be converted' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const portalIdBody = typeof body.portal_user_id === 'string' ? body.portal_user_id : null;
    const book = access.row;
    const email = normalizeCrmEmail(typeof body.email === 'string' ? body.email : book.email);
    const phone = normalizeCrmPhone(typeof body.phone === 'string' ? body.phone : book.phone);

    let portalId = portalIdBody;
    if (!portalId) {
      const promo = await promoteBookLeadToPortalIfLinked(db, { bookId: id, email, phone });
      portalId = promo.portalId;
      if (portalId && promo.migrated) {
        // already migrated
      }
    }

    if (!portalId && email) {
      const { data } = await db.from('portal_users').select('id, full_name, role').eq('email', email).eq('role', 'parent').maybeSingle();
      portalId = data?.id ?? null;
    }
    if (!portalId && phone) {
      const { data } = await db.from('portal_users').select('id').eq('phone', phone).eq('role', 'parent').maybeSingle();
      portalId = data?.id ?? null;
    }

    if (!portalId) {
      return NextResponse.json({
        error: 'No matching portal parent found. Create/enroll the parent first, or pass portal_user_id.',
      }, { status: 404 });
    }

    const portalAccess = await assertCrmContactAccess(db, caller, portalId);
    if (!portalAccess.ok) return NextResponse.json({ error: portalAccess.error }, { status: portalAccess.status });

    await migrateCrmActivityToPortal(db, { bookId: id, portalId });

    const parentName = book.full_name || portalAccess.row.full_name || 'Parent';
    await upsertCrmPipeline(db, {
      contactId: portalId,
      contactName: parentName,
      contactType: 'parent',
      stage: 'active',
      promoteOnly: true,
      updatedBy: caller.id,
      updatedByName: caller.full_name ?? null,
    });
    await insertCrmInteraction(db, {
      contactId: portalId,
      contactName: parentName,
      contactType: 'parent',
      type: 'note',
      direction: 'internal',
      content: `Lead converted to portal parent by ${caller.full_name || caller.role}. Book id ${id} linked.`,
      staffId: caller.id,
      staffName: caller.full_name ?? null,
    });

    const { data: portal } = await db
      .from('portal_users')
      .select('id, full_name, email, phone, role, school_name, school_id, section_class')
      .eq('id', portalId)
      .single();

    return NextResponse.json({
      success: true,
      portal_user_id: portalId,
      book_id: id,
      contact: portal ? { ...portal, _type: 'portal', pipeline_stage: 'active' } : null,
    });
  } catch (e) {
    return crmAuthErrorResponse(e);
  }
}
