import { NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { env } from '@/config/env';

// ── Partner school pricing (Young Innovators & Teen Developers are subsidised) ──
const SCHOOL_YOUNG_INNOVATORS_FEES: Record<string, number> = {
    'Weekday Afternoons': 12000,
    'Weekend In-Person':  10000,
    'Termly Programme':   12000,
    'Holiday Programme':  18000,
};

const SCHOOL_TEEN_DEVELOPERS_FEES: Record<string, number> = {
    'Weekday Afternoons': 15000,
    'Weekend In-Person':  12000,
    'Termly Programme':   15000,
    'Holiday Programme':  22000,
};

const SCHOOL_OTHER_FEES: Record<string, number> = {
    'Weekday Afternoons': 20000,
    'Weekend In-Person':  18000,
    'Termly Programme':   20000,
    'Holiday Programme':  25000,
};

// Bootcamp and online remain unchanged
const NON_SCHOOL_FEES: Record<string, number> = {
    'Summer Intensive (Day)':       60000,
    'Summer Intensive (Half Day)':  45000,
    'Summer Intensive (Afternoon)': 45000,
    'Weekend Bootcamp':             35000,
    'Holiday Programme':            30000,
    'Online Self-Paced':            30000,
    'Online Live Sessions':         40000,
    'Online Weekend':               25000,
};

const TYPE_FEES: Record<string, number> = {
    school:   20000,
    bootcamp: 60000,
    online:   30000,
    in_person: 50000,
};

const PARENT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function getFee(enrollment_type: string, preferred_schedule: string, course_interest?: string): number {
    if (enrollment_type === 'school') {
        const lower = (course_interest || '').toLowerCase();
        const schoolMap = lower.includes('young innovator')
            ? SCHOOL_YOUNG_INNOVATORS_FEES
            : lower.includes('teen developer')
                ? SCHOOL_TEEN_DEVELOPERS_FEES
                : SCHOOL_OTHER_FEES;
        if (preferred_schedule && schoolMap[preferred_schedule] != null) {
            return schoolMap[preferred_schedule];
        }
        return TYPE_FEES.school;
    }
    if (preferred_schedule && NON_SCHOOL_FEES[preferred_schedule] != null) {
        return NON_SCHOOL_FEES[preferred_schedule];
    }
    return TYPE_FEES[enrollment_type] ?? 30000;
}

/** Primary: programs.price via program_id or app_settings.default_registration_program_id. Fallback: hardcoded fee tables. */
async function resolveRegistrationPrice(
    supabase: any,
    program_id: string | undefined,
    enrollment_type: string,
    preferred_schedule: string,
    course_interest?: string,
): Promise<{ amount: number; programName: string | null; resolvedProgramId: string | null }> {
    const tryProgram = async (id: string) => {
        const { data: prog } = await supabase
            .from('programs')
            .select('price, name')
            .eq('id', id)
            .maybeSingle();
        if (prog?.price != null && Number(prog.price) > 0) {
            return {
                amount: Number(prog.price),
                programName: prog.name ?? null,
                resolvedProgramId: id,
            };
        }
        return null;
    };

    if (program_id) {
        const fromId = await tryProgram(program_id);
        if (fromId) return fromId;
    }

    const { data: setting } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'default_registration_program_id')
        .maybeSingle();
    if (setting?.value?.trim()) {
        const fromDefault = await tryProgram(setting.value.trim());
        if (fromDefault) return fromDefault;
    }

    return {
        amount: getFee(enrollment_type, preferred_schedule, course_interest),
        programName: null,
        resolvedProgramId: null,
    };
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
            program_id, // optional — if set, price comes from programs table
            payment_plan, // optional: 'full' | 'instalment' (requires programs.instalments_enabled for instalment)
        } = body;

        // Validate required fields
        if (!enrollment_type || !TYPE_FEES[enrollment_type]) {
            return NextResponse.json({ error: 'Invalid enrollment type' }, { status: 400 });
        }
        if (!parent_email) {
            return NextResponse.json({ error: 'Parent email is required to process payment' }, { status: 400 });
        }
        if (!PARENT_EMAIL_RE.test(String(parent_email).trim())) {
            return NextResponse.json({ error: 'Invalid parent email address' }, { status: 400 });
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

        let resolvedSchoolId: string | null = null;
        if (school_name && String(school_name).trim()) {
            const q = String(school_name).trim();
            const { data: schoolMatch } = await supabase
                .from('schools')
                .select('id')
                .ilike('name', q)
                .limit(1)
                .maybeSingle();
            resolvedSchoolId = schoolMatch?.id ?? null;
        }

        const { amount, programName, resolvedProgramId } = await resolveRegistrationPrice(
            supabase,
            program_id,
            enrollment_type,
            preferred_schedule,
            course_interest,
        );

        if (payment_plan === 'instalment') {
            if (!resolvedProgramId) {
                return NextResponse.json(
                    { error: 'Instalment plan requires a programme price (program_id or default_registration_program_id in app_settings)' },
                    { status: 400 },
                );
            }
            const { data: progInst } = await supabase
                .from('programs')
                .select('instalments_enabled')
                .eq('id', resolvedProgramId)
                .maybeSingle();
            if (!progInst?.instalments_enabled) {
                return NextResponse.json(
                    { error: 'This programme does not support instalment payments' },
                    { status: 400 },
                );
            }
        }

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
                school_id: resolvedSchoolId,
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
                payment_plan: payment_plan === 'instalment' ? 'instalment' : 'full',
                status: 'pending',
                created_at: new Date().toISOString(),
            }])
            .select('id')
            .single();

        if (studentErr || !student) {
            console.error('Student insert error:', studentErr);
            return NextResponse.json({ error: studentErr?.message || 'Failed to save registration' }, { status: 500 });
        }

        const reference = `REG-${Date.now()}-${student.id.substring(0, 6)}`;
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com';

        // 2. Create pending payment transaction record
        await supabase.from('payment_transactions').insert([{
            portal_user_id: null,
            school_id: resolvedSchoolId,
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
                school_name: school_name || null,
                program_id: program_id || null,
                program_name: programName,
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
                callback_url: `${baseUrl}/online-registration?payment=success&reference=${encodeURIComponent(reference)}&name=${encodeURIComponent(full_name)}&type=${enrollment_type}`,
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
