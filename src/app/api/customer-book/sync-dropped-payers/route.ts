import { NextRequest, NextResponse } from 'next/server';
import { crmAuthErrorResponse, requireCustomerBookCaller } from '@/lib/crm/auth';
import { backfillDroppedPayers } from '@/lib/crm/sync-dropped-payer';

/** POST /api/customer-book/sync-dropped-payers — backfill Contact Book from unpaid registrations */
export async function POST(_req: NextRequest) {
  try {
    const { caller, db } = await requireCustomerBookCaller();
    if (caller.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const result = await backfillDroppedPayers(db);
    return NextResponse.json({
      success: true,
      ...result,
      message: `Synced ${result.synced} dropped payer(s) into Contact Directory.`,
    });
  } catch (e) {
    return crmAuthErrorResponse(e);
  }
}
