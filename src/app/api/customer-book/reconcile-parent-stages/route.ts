import { NextRequest, NextResponse } from 'next/server';
import { crmAuthErrorResponse, requireCustomerBookCaller } from '@/lib/crm/auth';
import { reconcileKnownParentStages } from '@/lib/crm/reconcile-known-parent-stages';

/** POST — promote portal parents from prospect → contacted/won */
export async function POST(_req: NextRequest) {
  try {
    const { caller, db } = await requireCustomerBookCaller();
    if (caller.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const result = await reconcileKnownParentStages(db);
    return NextResponse.json({
      success: true,
      ...result,
      message: `Reconciled ${result.portalParents} portal parent(s); ${result.pipelinePromoted} promoted from prospect; ${result.bookRowsUpdated} directory row(s) updated.`,
    });
  } catch (e) {
    return crmAuthErrorResponse(e);
  }
}
