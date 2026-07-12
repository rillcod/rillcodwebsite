import { NextRequest, NextResponse } from 'next/server';
import { requireBillingDocsCaller } from '@/lib/billing/docs-auth';
import {
  loadAttendanceRosterData,
  loadBillingDocsBootstrap,
  loadLinkedSchoolInvoice,
  loadPaymentRegisterData,
} from '@/lib/billing/docs-data';

/**
 * GET /api/billing/docs/data
 * Admin-only billing document source data (service-role reads).
 *
 * ?bootstrap=1 — schools, bank accounts, overdue school invoices
 * ?mode=register&schoolId= — students + invoices + receipts
 * ?mode=attendance&schoolId=&dateFrom=&dateTo=
 * ?mode=linked&schoolId=&academicYear=&termNumber=
 */
export async function GET(req: NextRequest) {
  const caller = await requireBillingDocsCaller({ adminOnly: true });
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  try {
    if (searchParams.get('bootstrap') === '1') {
      const data = await loadBillingDocsBootstrap();
      return NextResponse.json({ data });
    }

    const mode = searchParams.get('mode');
    const schoolId = searchParams.get('schoolId');
    if (!mode || !schoolId) {
      return NextResponse.json({ error: 'mode and schoolId are required' }, { status: 400 });
    }

    if (mode === 'register') {
      const data = await loadPaymentRegisterData(schoolId);
      return NextResponse.json({ data });
    }

    if (mode === 'attendance') {
      const dateFrom = searchParams.get('dateFrom');
      const dateTo = searchParams.get('dateTo');
      if (!dateFrom || !dateTo) {
        return NextResponse.json({ error: 'dateFrom and dateTo are required' }, { status: 400 });
      }
      const students = await loadAttendanceRosterData(schoolId, dateFrom, dateTo);
      return NextResponse.json({ data: { students } });
    }

    if (mode === 'linked') {
      const academicYear = searchParams.get('academicYear');
      const termNumber = searchParams.get('termNumber');
      if (!academicYear || !termNumber) {
        return NextResponse.json({ error: 'academicYear and termNumber are required' }, { status: 400 });
      }
      const invoice = await loadLinkedSchoolInvoice(schoolId, academicYear, termNumber);
      return NextResponse.json({ data: { invoice } });
    }

    return NextResponse.json({ error: 'Unknown mode' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load billing docs data' }, { status: 500 });
  }
}
