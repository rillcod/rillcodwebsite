import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/config/env';

/**
 * POST /api/payments/parent-pay
 * Initiates a Paystack payment for a parent paying an invoice on behalf of their child.
 * Returns: { paymentUrl, reference, bankAccounts }
 *
 * Bank accounts are returned alongside Paystack so the parent can choose either method.
 * When Paystack confirms payment, the existing webhook auto-generates a receipt.
 * For bank transfers, admin approves via /api/payments/approve which also auto-generates receipt + notification.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    // 1. Auth — parent only
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('portal_users')
      .select('id, email, full_name, role, school_id')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'parent') {
      return NextResponse.json({ error: 'Only parents can use this endpoint' }, { status: 403 });
    }

    const { invoice_id } = await req.json();
    if (!invoice_id) return NextResponse.json({ error: 'invoice_id required' }, { status: 400 });

    // 2. Fetch invoice — must belong to one of this parent's children
    const { data: invoice } = await supabase
      .from('invoices')
      .select('id, invoice_number, amount, currency, status, portal_user_id, school_id')
      .eq('id', invoice_id)
      .single();

    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    if (invoice.status === 'paid') return NextResponse.json({ error: 'Invoice already paid' }, { status: 400 });

    // Verify this invoice belongs to one of the parent's children
    const { data: children } = await supabase
      .from('students')
      .select('user_id')
      .eq('parent_email', profile.email);

    const childUserIds = (children ?? []).map(c => c.user_id).filter(Boolean);
    if (!childUserIds.includes(invoice.portal_user_id)) {
      return NextResponse.json({ error: 'This invoice does not belong to your child' }, { status: 403 });
    }

    // 3. Fetch bank transfer accounts (school-specific or global)
    const { data: bankAccounts } = await supabase
      .from('payment_accounts')
      .select('id, label, bank_name, account_number, account_name, account_type, payment_note')
      .eq('is_active', true)
      .or(invoice.school_id ? `school_id.eq.${invoice.school_id},owner_type.eq.global` : 'owner_type.eq.global')
      .limit(5);

    // 4. Initiate Paystack if key is configured
    let paystackUrl: string | null = null;
    let reference: string | null = null;

    if (env.PAYSTACK_SECRET_KEY) {
      reference = `PAR-INV-${invoice.invoice_number}-${Date.now()}`;
      const amountKobo = Math.round(invoice.amount * 100); // Paystack uses kobo

      // Create a payment_transaction record
      const { data: tx } = await supabase
        .from('payment_transactions')
        .insert({
          portal_user_id: profile.id,
          school_id: invoice.school_id ?? null,
          amount: invoice.amount,
          currency: invoice.currency ?? 'NGN',
          payment_method: 'paystack',
          payment_status: 'pending',
          transaction_reference: reference,
          invoice_id: invoice_id,
          payment_gateway_response: { payment_type: 'invoice', invoice_id, parent_id: profile.id },
        })
        .select('id')
        .single();

      const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/dashboard/parent-invoices?paid=1&invoice=${invoice_id}`;

      const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: profile.email,
          amount: amountKobo,
          reference,
          currency: invoice.currency ?? 'NGN',
          callback_url: callbackUrl,
          metadata: {
            invoice_id,
            invoice_number: invoice.invoice_number,
            parent_id: profile.id,
            parent_name: profile.full_name,
            transaction_id: tx?.id,
            cancel_action: callbackUrl,
          },
        }),
      });

      const paystackData = await paystackRes.json();
      if (paystackData.status) {
        paystackUrl = paystackData.data.authorization_url;
      }
    }

    return NextResponse.json({
      success: true,
      paystackUrl,
      reference,
      bankAccounts: bankAccounts ?? [],
    });

  } catch (error: any) {
    console.error('Parent pay error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
