import { NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { env } from '@/config/env';
import { assertRegistrationInstalmentAllowed } from './instalment-guard';
import { checkCustomRateLimit } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';
import { createPendingPayment, removePendingPayment } from '@/lib/payments/pending-transaction';

// ── Partner school pricing (subsidised, flat per-term in-school fee = ₦20,000) ──
const PARTNER_SCHOOL_TERM_FEE = 20000;
const SCHOOL_YOUNG_INNOVATORS_FEES: Record<string, number> = {
    'Weekday Afternoons': PARTNER_SCHOOL_TERM_FEE,
    'Weekend In-Person':  PARTNER_SCHOOL_TERM_FEE,
    'Termly Programme':   PARTNER_SCHOOL_TERM_FEE,
    'Holiday Programme':  PARTNER_SCHOOL_TERM_FEE,
};

const SCHOOL_TEEN_DEVELOPERS_FEES: Record<string, number> = {
    'Weekday Afternoons': PARTNER_SCHOOL_TERM_FEE,
    'Weekend In-Person':  PARTNER_SCHOOL_TERM_FEE,
    'Termly Programme':   PARTNER_SCHOOL_TERM_FEE,
    'Holiday Programme':  PARTNER_SCHOOL_TERM_FEE,
};

const SCHOOL_OTHER_FEES: Record<string, number> = {
    'Weekday Afternoons': PARTNER_SCHOOL_TERM_FEE,
    'Weekend In-Person':  PARTNER_SCHOOL_TERM_FEE,
    'Termly Programme':   PARTNER_SCHOOL_TERM_FEE,
    'Holiday Programme':  PARTNER_SCHOOL_TERM_FEE,
};

// Individual / online retail (market-realistic): Summer ₦50k online · ₦100k onsite,
// online terms ₦25k–₦40k, weekend bootcamp ₦35k, holiday ₦30k.
const NON_SCHOOL_FEES: Record<string, number> = {
    'Summer School':                50000,
    'Summer Intensive (Day)':       100000,
    'Summer Intensive (Half Day)':  50000,
    'Summer Intensive (Afternoon)': 50000,
    'Weekend Bootcamp':             35000,
    'Holiday Programme':            30000,
    'Online Self-Paced':            30000,
    'Online Live Sessions':         40000,
    'Online Live Classes':          40000,
    'Online Weekend':               25000,
};

const TYPE_FEES: Record<string, number> = {
    school:    20000,
    bootcamp:  35000,
    online:    30000,
    in_person: 50000,
};

const PARENT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function getFee(enrollment_type: string, preferred_schedule: string, course_interest?: string, hasSibling?: boolean): number {
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
    if (enrollment_type === 'online') {
        return TYPE_FEES.online;
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
    parent_email?: string,
): Promise<{ amount: number; programName: string | null; resolvedProgramId: string | null }> {
    // Partner-school registrations are a flat, subsidised per-term fee — NEVER the
    // full programme catalogue price (₦45k–₦180k). Short-circuit so an attached
    // program_id can't override the agreed in-school rate.
    if (enrollment_type === 'school') {
        return {
            amount: getFee(enrollment_type, preferred_schedule, course_interest),
            programName: null,
            resolvedProgramId: null,
        };
    }

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

    // Perform database query to find if parent has registered child
    let hasSibling = false;
    if (parent_email?.trim()) {
        const { count } = await supabase
            .from('students')
            .select('*', { count: 'exact', head: true })
            .eq('parent_email', parent_email.trim().toLowerCase());
        hasSibling = !!(count && count > 0);
    }

    return {
        amount: getFee(enrollment_type, preferred_schedule, course_interest, hasSibling),
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

        // Req 7.2 — 3 req / 5 min per email
        try {
            await checkCustomRateLimit({ key: String(parent_email).trim().toLowerCase(), max: 3, window: 300 });
        } catch (err) {
            if (err instanceof RateLimitError) {
                return NextResponse.json(
                    { error: 'Too many requests. Please wait before trying again.', retryAfter: (err as any).retryAfter ?? 300 },
                    { status: 429 },
                );
            }
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
            parent_email,
        );

        if (payment_plan === 'instalment') {
            let instalmentsEnabled: boolean | null | undefined;
            if (resolvedProgramId) {
                const { data: progInst } = await supabase
                    .from('programs')
                    .select('instalments_enabled')
                    .eq('id', resolvedProgramId)
                    .maybeSingle();
                instalmentsEnabled = progInst?.instalments_enabled;
            }
            try {
                assertRegistrationInstalmentAllowed({
                    payment_plan,
                    resolvedProgramId,
                    instalmentsEnabled,
                });
            } catch (e: any) {
                return NextResponse.json({ error: e?.message || 'Invalid instalment selection' }, { status: 400 });
            }
        }

        // Instalment = pay 50% deposit now; the remaining balance is tracked on the
        // transaction so it can be collected later. Full plan charges the whole fee.
        const isInstalment = payment_plan === 'instalment';
        const chargeAmount = isInstalment ? Math.round(amount * 0.5) : amount;
        const balanceDue = isInstalment ? amount - chargeAmount : 0;

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
        const pending = await createPendingPayment(supabase as any, {
            schoolId: resolvedSchoolId,
            amount: chargeAmount,
            currency: 'NGN',
            method: 'paystack',
            reference,
            subject: { type: 'registration', id: student.id },
            metadata: {
                student_id: student.id,
                student_name: full_name,
                enrollment_type,
                parent_email,
                school_name: school_name || null,
                program_id: program_id || null,
                program_name: programName,
                payment_type: 'registration',
                payment_plan: isInstalment ? 'instalment' : 'full',
                total_tuition: amount,
                balance_due: balanceDue,
            },
        });
        if (!pending.ok) {
            await supabase.from('students').delete().eq('id', student.id);
            return NextResponse.json({ error: pending.error.message }, { status: pending.error.code === 'conflict' ? 409 : 500 });
        }
        const tx = pending.data as { id: string };

        // 3. Initialize Paystack transaction
        const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: parent_email,
                amount: chargeAmount * 100, // convert to kobo (deposit when instalment)
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
            if (tx?.id) {
                await removePendingPayment(supabase as any, tx.id);
            }
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
