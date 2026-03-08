import { NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { env } from '@/config/env';

// Schedule-specific fees in Naira — must stay in sync with StudentRegistration.tsx SCHEDULE_FEES
const SCHEDULE_FEES: Record<string, number> = {
    // Partner school schedules
    'Weekday Afternoons':          25000,
    'Weekend In-Person':           20000,

    // Summer bootcamp schedules
    'Summer Intensive (Day)':      60000,
    'Summer Intensive (Half Day)': 45000,
    'Summer Intensive (Afternoon)':45000,
    'Weekend Bootcamp':            35000,

    // Holiday / termly programme (same type as bootcamp or school)
    'Holiday Programme':           30000,
    'Termly Programme':            25000,

    // Online schedules
    'Online Self-Paced':           30000,
    'Online Live Sessions':        40000,
    'Online Weekend':              25000,
};

// Fallback fees per enrollment type when schedule isn't matched
const TYPE_FEES: Record<string, number> = {
    school:   25000,
    bootcamp: 60000,
    online:   30000,
};

function getFee(enrollment_type: string, preferred_schedule: string): number {
    if (preferred_schedule && SCHEDULE_FEES[preferred_schedule] != null) {
        return SCHEDULE_FEES[preferred_schedule];
    }
    return TYPE_FEES[enrollment_type] ?? 30000;
}

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const {
            enrollment_type,
            full_name,
            date_of_birth,
            gender,
            grade_level,
            school_name,
            city,
            state,
            student_email,
            parent_name,
            parent_phone,
            parent_email,
            parent_relationship,
            course_interest,
            preferred_schedule,
            heard_about_us,
        } = body;

        // Validate required fields
        if (!enrollment_type || !TYPE_FEES[enrollment_type]) {
            return NextResponse.json({ error: 'Invalid enrollment type' }, { status: 400 });
        }
        if (!parent_email) {
            return NextResponse.json({ error: 'Parent email is required to process payment' }, { status: 400 });
        }
        if (!full_name) {
            return NextResponse.json({ error: 'Student name is required' }, { status: 400 });
        }
        if (!env.PAYSTACK_SECRET_KEY) {
            return NextResponse.json({ error: 'Payment gateway not configured' }, { status: 500 });
        }

        // Use service role to bypass RLS — this is a public registration endpoint (no user session)
        const supabase = createSupabaseAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );

        // 1. Save student registration (status: 'pending' — awaiting admin approval after payment)
        const { data: student, error: studentErr } = await supabase
            .from('students')
            .insert([{
                name: full_name,
                full_name,
                date_of_birth: date_of_birth || null,
                gender: gender?.toLowerCase() || null,
                grade_level,
                school_name: school_name || null,
                city: city || null,
                state: state || null,
                student_email: student_email || null,
                parent_name,
                parent_phone,
                parent_email,
                parent_relationship,
                interests: course_interest || null,
                goals: preferred_schedule || null,
                course_interest: course_interest || null,
                preferred_schedule: preferred_schedule || null,
                heard_about_us: heard_about_us || null,
                enrollment_type,
                status: 'pending',
                created_at: new Date().toISOString(),
            }])
            .select('id')
            .single();

        if (studentErr || !student) {
            console.error('Student insert error:', studentErr);
            return NextResponse.json({ error: studentErr?.message || 'Failed to save registration' }, { status: 500 });
        }

        const amount = getFee(enrollment_type, preferred_schedule);
        const reference = `REG-${Date.now()}-${student.id.substring(0, 6)}`;
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com';

        // 2. Create pending payment transaction record
        await supabase.from('payment_transactions').insert([{
            portal_user_id: null,
            course_id: null,
            amount,
            currency: 'NGN',
            payment_method: 'paystack',
            payment_status: 'pending',
            transaction_reference: reference,
            payment_gateway_response: {
                student_id: student.id,
                student_name: full_name,
                enrollment_type,
                parent_email,
                payment_type: 'registration',
            },
            created_at: new Date().toISOString(),
        }]);

        // 3. Initialize Paystack transaction
        const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: parent_email,
                amount: amount * 100, // convert to kobo
                reference,
                callback_url: `${baseUrl}/online-registration?payment=success&name=${encodeURIComponent(full_name)}&type=${enrollment_type}`,
                metadata: {
                    student_id: student.id,
                    student_name: full_name,
                    enrollment_type,
                    payment_type: 'registration',
                    custom_fields: [
                        { display_name: 'Student Name', variable_name: 'student_name', value: full_name },
                        { display_name: 'Enrollment Type', variable_name: 'enrollment_type', value: enrollment_type },
                    ],
                },
            }),
        });

        const paystackData = await paystackRes.json();

        if (!paystackData.status) {
            // Roll back student insert if Paystack fails to initialise
            await supabase.from('students').delete().eq('id', student.id);
            return NextResponse.json({ error: paystackData.message || 'Payment initialisation failed' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            paymentUrl: paystackData.data.authorization_url,
            reference,
        });

    } catch (err: any) {
        console.error('Registration payment error:', err);
        return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
    }
}
