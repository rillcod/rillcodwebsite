import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { env } from '@/config/env';

// Public-facing API — use service role to bypass RLS for inserts
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      student_name,
      parent_name,
      parent_phone,
      parent_email,
      student_email,
      student_phone,
      school,
      current_class,
      age,
      gender,
      preferred_mode,
      hear_about_us,
      additional_info,
      payment_method = 'paystack', // 'paystack' or 'bank_transfer'
      payment_plan = 'full', // 'full' or 'installment'
      payment_reference, // manual bank transfer reference
    } = body;

    if (!student_name || !parent_name || !parent_phone || !student_phone) {
      return NextResponse.json(
        { error: 'Student name, parent name, parent phone, and student phone are required' },
        { status: 400 }
      );
    }

    // Resolve pricing (₦70,000 for full, ₦35,000 for 50% installment deposit)
    const amount = payment_plan === 'installment' ? 35000 : 70000;
    const courseInterest = `${current_class ? current_class + ' ' : ''}Summer School 2026`;
    const initialStatus = payment_method === 'paystack' ? 'unpaid' : 'pending_verification';

    const supabase = getAdminClient();

    // Format notes to serialize the student's phone number prefix
    const studentPhoneStr = student_phone ? `[Student Phone: ${student_phone}]` : '';
    const notesStr = `${studentPhoneStr} ${additional_info || ''}`.trim();

    // Create the prospective student record
    const { data: prospect, error: prospectErr } = await supabase
      .from('prospective_students')
      .insert({
        full_name: student_name,
        email: student_email || parent_email || `summer-${Date.now()}@rillcod.com`,
        parent_name,
        parent_phone,
        parent_email: parent_email || null,
        grade: current_class || null,
        school_id: null,
        school_name: school || 'Direct / Summer School',
        age: age || null,
        gender: gender || null,
        course_interest: courseInterest,
        preferred_schedule: preferred_mode || null,
        hear_about_us: hear_about_us || null,
        notes: notesStr || null,
        status: initialStatus,
        is_active: false,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (prospectErr || !prospect) {
      console.error('Summer school registration db error:', prospectErr);
      return NextResponse.json(
        { error: prospectErr?.message || 'Failed to save registration details' },
        { status: 500 }
      );
    }

    // Handle bank transfer manual verification
    if (payment_method === 'bank_transfer') {
      const reference = payment_reference?.trim() || `MAN-SUM-${Date.now()}-${prospect.id.substring(0, 4).toUpperCase()}`;
      
      // Save pending transaction record
      await supabase.from('payment_transactions').insert([{
        portal_user_id: null,
        school_id: null,
        course_id: null,
        amount,
        currency: 'NGN',
        payment_method: 'bank_transfer',
        payment_status: 'pending',
        transaction_reference: reference,
        payment_gateway_response: {
          prospect_id: prospect.id,
          student_name,
          parent_email,
          payment_type: 'summer_school',
          payment_plan,
          notes: additional_info || null
        },
        created_at: new Date().toISOString(),
      }]);

      return NextResponse.json({
        success: true,
        reference,
        paymentMethod: 'bank_transfer',
        message: 'Registration submitted successfully. Please wait while our team verifies your bank transfer reference.',
      });
    }

    // Handle Paystack payment integration
    if (!env.PAYSTACK_SECRET_KEY) {
      return NextResponse.json(
        { error: 'Payment gateway is not configured. Please contact support.' },
        { status: 500 }
      );
    }

    const reference = `SUM-REG-${Date.now()}-${prospect.id.substring(0, 6)}`;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com';

    // Create pending payment transaction record
    const { data: tx } = await supabase
      .from('payment_transactions')
      .insert([{
        portal_user_id: null,
        school_id: null,
        course_id: null,
        amount,
        currency: 'NGN',
        payment_method: 'paystack',
        payment_status: 'pending',
        transaction_reference: reference,
        payment_gateway_response: {
          prospect_id: prospect.id,
          student_name,
          parent_email,
          payment_type: 'summer_school',
          payment_plan,
        },
        created_at: new Date().toISOString(),
      }])
      .select('id')
      .single();

    // Initialize Paystack transaction
    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: parent_email || 'summer-school-billing@rillcod.com',
        amount: amount * 100, // convert to kobo
        reference,
        callback_url: `${baseUrl}/summer-school?payment=success&reference=${encodeURIComponent(reference)}&name=${encodeURIComponent(student_name)}&plan=${payment_plan}&method=paystack`,
        metadata: {
          prospect_id: prospect.id,
          student_name,
          payment_type: 'summer_school',
          payment_plan,
          transaction_id: tx?.id,
        },
      }),
    });

    const paystackData = await paystackRes.json();

    if (!paystackData.status) {
      console.error('Paystack initialization failed:', paystackData);
      // Clean up prospect record if Paystack initialisation fails
      await supabase.from('prospective_students').delete().eq('id', prospect.id);
      return NextResponse.json(
        { error: paystackData.message || 'Payment gateway failed to initialize' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      paymentUrl: paystackData.data.authorization_url,
      reference,
      paymentMethod: 'paystack',
    });

  } catch (err: any) {
    console.error('Summer school API error:', err);
    return NextResponse.json(
      { error: err.message || 'Something went wrong' },
      { status: 500 }
    );
  }
}
