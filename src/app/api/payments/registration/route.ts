import { NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { env } from '@/config/env';
import { notificationsService } from '@/services/notifications.service';
import { buildRillcodTransactionalEmailHtml } from '@/lib/email/rillcod-transactional-email';
import { assertRegistrationInstalmentAllowed } from './instalment-guard';
import { checkCustomRateLimit } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';
import { createPendingPayment, removePendingPayment } from '@/lib/payments/pending-transaction';
import { cleanGrade, parseBandLabel } from '@/lib/classes/naming';
import { PARTNER_SCHOOL_TERM_FEE } from '@/lib/registration/programme-map';
import { isSpecialEnrollment, SPECIAL_LEGACY_PUBLIC_PATH, STUDENT_REGISTRATION_PATH } from '@/lib/registration/enrollment-types';
import {
  NON_SCHOOL_SCHEDULE_FEES,
  ONLINE_LIVE_FEE,
} from '@/lib/registration/schedules';

/** Keep band labels (Basic 1-3); normalise single grades / aliases. */
function registrationGradeLevel(grade: unknown): string | null {
    if (grade == null || !String(grade).trim()) return null;
    const raw = String(grade).trim();
    const band = parseBandLabel(raw);
    if (band && band.low !== band.high) return band.label;
    return cleanGrade(raw) || raw;
}

// Partner school: Young Innovators / Teen Developers — flat subsidised term fee
const SCHOOL_SCHEDULE_FEES: Record<string, number> = {
    'Weekday Afternoons': PARTNER_SCHOOL_TERM_FEE,
    'Weekend In-Person':  PARTNER_SCHOOL_TERM_FEE,
    'Termly Programme':   PARTNER_SCHOOL_TERM_FEE,
    'Holiday Programme':  PARTNER_SCHOOL_TERM_FEE,
};

// Online retail schedules (in-person centre seats are Summer /special only)
const NON_SCHOOL_FEES: Record<string, number> = { ...NON_SCHOOL_SCHEDULE_FEES };

const TYPE_FEES: Record<string, number> = {
    school:    PARTNER_SCHOOL_TERM_FEE,
    online:    ONLINE_LIVE_FEE,
};

const PARENT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function getFee(enrollment_type: string, preferred_schedule: string, _course_interest?: string): number {
    if (enrollment_type === 'school') {
        if (preferred_schedule && SCHOOL_SCHEDULE_FEES[preferred_schedule] != null) {
            return SCHOOL_SCHEDULE_FEES[preferred_schedule];
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

/** Primary: programs.price via program_id. Fallback: hardcoded fee tables. */
async function resolveRegistrationPrice(
    supabase: any,
    program_id: string | undefined,
    enrollment_type: string,
    preferred_schedule: string,
    course_interest?: string,
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

    // Schedule tables are the source of truth for the public registration form.
    // Do NOT let a silent app_settings default override the fee the parent saw.

    return {
        amount: getFee(enrollment_type, preferred_schedule, course_interest),
        programName: null,
        resolvedProgramId: program_id || null,
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
            rc_code,
            is_app_enrolment,
        } = body;

        // Validate required fields
        if (isSpecialEnrollment(enrollment_type)) {
            return NextResponse.json(
                {
                    error: 'Special / seasonal programmes register on the live special programme page (correct fees & onboarding).',
                    redirect: SPECIAL_LEGACY_PUBLIC_PATH,
                },
                { status: 400 },
            );
        }
        if (enrollment_type === 'in_person' || enrollment_type === 'in-person') {
            return NextResponse.json(
                {
                    error: 'In-person centre seats are Summer / special programme only. Register on the live special programme page.',
                    redirect: SPECIAL_LEGACY_PUBLIC_PATH,
                },
                { status: 400 },
            );
        }
        if (!enrollment_type || !TYPE_FEES[enrollment_type]) {
            return NextResponse.json({ error: 'Invalid enrollment type' }, { status: 400 });
        }
        if (enrollment_type === 'school') {
            const allowed = ['Young Innovators', 'Teen Developers'];
            if (!allowed.includes(String(course_interest || '').trim())) {
                return NextResponse.json(
                    { error: 'Partner school enrolment is Young Innovators or Teen Developers only. Choose Online for specialist tracks, or Summer for in-person centre seats.' },
                    { status: 400 },
                );
            }
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

        const supabase = createSupabaseAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );

        // Summer-style duplicate guard: same parent + child must not spam pending rows.
        const emailNorm = String(parent_email).trim().toLowerCase();
        const nameNorm = String(full_name).trim().replace(/\s+/g, ' ');
        const { data: existingRegs } = await supabase
            .from('students')
            .select('id, status, created_at, registration_payment_at')
            .eq('parent_email', emailNorm)
            .ilike('full_name', nameNorm)
            .in('status', ['pending', 'active', 'approved'])
            .order('created_at', { ascending: false })
            .limit(10);

        const paidOrActive = (existingRegs ?? []).find((r: any) =>
            r.status === 'active' || r.status === 'approved' || r.registration_payment_at);
        if (paidOrActive) {
            return NextResponse.json(
                { error: `${nameNorm} is already registered with this parent email. Log in or contact support — no need to register again.` },
                { status: 409 },
            );
        }
        // Reuse any unpaid pending row (abandoned Paystack) instead of blocking for 24h or inserting a twin.
        const reusable = (existingRegs ?? []).find((r: any) =>
            r.status === 'pending' && !r.registration_payment_at);

        let resolvedSchoolId: string | null = null;
        if (enrollment_type === 'school' && school_name && String(school_name).trim()) {
            const q = String(school_name).trim();
            const { data: schoolMatch } = await supabase
                .from('schools')
                .select('id')
                .ilike('name', q)
                .limit(1)
                .maybeSingle();
            resolvedSchoolId = schoolMatch?.id ?? null;
        }

        // RC Validation
        const track = preferred_schedule === 'Holiday Programme' ? 'holiday' : 'term';
        if (enrollment_type === 'school' && track === 'holiday') {
            if (!rc_code || !String(rc_code).trim()) {
                return NextResponse.json({ error: 'Registration Code (RC) is required for partner school enrolment' }, { status: 400 });
            }
            
            const upper = String(rc_code).trim().toUpperCase();
            let { data: card, error: cardError } = await supabase
                .from('identity_cards')
                .select('id, status, expires_at, school_id')
                .eq('verification_code', upper)
                .maybeSingle();

            if (!card && !cardError) {
                ({ data: card, error: cardError } = await supabase
                    .from('identity_cards')
                    .select('id, status, expires_at, school_id')
                    .eq('card_number', upper)
                    .maybeSingle());
            }

            if (cardError) {
                return NextResponse.json({ error: 'Database error validating Registration Code' }, { status: 500 });
            }

            if (!card) {
                return NextResponse.json({ error: 'Invalid Registration Code (RC). Please check the code on your access card.' }, { status: 400 });
            }

            const now = Date.now();
            const expiresAt = card.expires_at ? new Date(card.expires_at).getTime() : null;
            const isExpired = expiresAt && expiresAt < now;

            if (card.status === 'revoked' || card.status === 'expired' || isExpired) {
                return NextResponse.json({ error: 'This Registration Code (RC) has expired or been revoked. Only active partner students qualify for the subsidy.' }, { status: 400 });
            }

            if (card.school_id && resolvedSchoolId && card.school_id !== resolvedSchoolId) {
                return NextResponse.json({ error: 'This Registration Code (RC) is linked to a different school than the one selected.' }, { status: 400 });
            }
        }

        const { amount, programName, resolvedProgramId } = await resolveRegistrationPrice(
            supabase,
            program_id,
            enrollment_type,
            preferred_schedule,
            course_interest,
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

        // 1. Save or refresh student registration (status: pending — summer-style reuse)
        const isSelf = String(parent_relationship || '').toLowerCase() === 'self';
        const resolvedStudentEmail =
            (student_email && String(student_email).trim()) ||
            (isSelf ? emailNorm : null) ||
            null;
        const studentPayload = {
            name: full_name,
            full_name,
            date_of_birth: date_of_birth || null,
            gender: gender?.toLowerCase() || null,
            grade_level: registrationGradeLevel(grade_level),
            school_name: school_name || null,
            school_id: resolvedSchoolId,
            city: city || null,
            state: state || null,
            student_email: resolvedStudentEmail,
            parent_name,
            parent_phone,
            parent_email: emailNorm,
            parent_relationship,
            interests: course_interest || null,
            goals: preferred_schedule || null,
            course_interest: course_interest || null,
            preferred_schedule: preferred_schedule || null,
            heard_about_us: heard_about_us || null,
            enrollment_type,
            payment_plan: payment_plan === 'instalment' ? 'instalment' : 'full',
            status: 'pending',
            partner_program_track: enrollment_type === 'school' ? track : null,
            rc_code: enrollment_type === 'school' && rc_code ? String(rc_code).trim().toUpperCase() : null,
        };

        let student: { id: string } | null = null;
        if (reusable?.id) {
            const { data: updated, error: updErr } = await supabase
                .from('students')
                .update({ ...studentPayload, updated_at: new Date().toISOString() })
                .eq('id', reusable.id)
                .select('id')
                .single();
            if (updErr || !updated) {
                console.error('Student refresh error:', updErr);
                return NextResponse.json({ error: updErr?.message || 'Failed to refresh registration' }, { status: 500 });
            }
            student = updated;
        } else {
            const { data: inserted, error: studentErr } = await supabase
                .from('students')
                .insert([{ ...studentPayload, created_at: new Date().toISOString() }])
                .select('id')
                .single();
            if (studentErr || !inserted) {
                console.error('Student insert error:', studentErr);
                return NextResponse.json({ error: studentErr?.message || 'Failed to save registration' }, { status: 500 });
            }
            student = inserted;
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
                partner_program_track: enrollment_type === 'school' ? track : null,
                rc_code: enrollment_type === 'school' && rc_code ? String(rc_code).trim().toUpperCase() : null,
                parent_email: emailNorm,
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
            // Keep student row for retry (same as summer prospect keep-on-fail).
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
                callback_url: `${baseUrl}${STUDENT_REGISTRATION_PATH}?payment=success&reference=${encodeURIComponent(reference)}&name=${encodeURIComponent(full_name)}&type=${enrollment_type}`,
                metadata: {
                    student_id: student.id,
                    student_name: full_name,
                    enrollment_type,
                    partner_program_track: enrollment_type === 'school' ? track : null,
                    rc_code: enrollment_type === 'school' && rc_code ? String(rc_code).trim().toUpperCase() : null,
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
            // Keep student row for retry (mirrors summer prospect keep-on-fail).
            if (tx?.id) {
                await removePendingPayment(supabase as any, tx.id);
            }
            return NextResponse.json({
                error: paystackData.message || 'Payment initialisation failed. Your details were saved — try again shortly.',
            }, { status: 500 });
        }

        // Trigger email with both Paystack Link & Bank Details for in-app registrations
        if (is_app_enrolment) {
            try {
                const { data: bankAccounts } = await supabase
                    .from('payment_accounts')
                    .select('label, bank_name, account_number, account_name, payment_note')
                    .eq('is_active', true);

                const bankDetailsHtml = bankAccounts && bankAccounts.length > 0
                    ? `<div style="margin-top: 25px; padding: 20px; background-color: #1e1e2f; border: 1px solid #3b3b4f; border-radius: 8px;">
                        <h3 style="margin: 0 0 15px; color: #fff; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">🏦 Option 2: Direct Bank Transfer</h3>
                        <p style="margin: 0 0 15px; color: #a1a1aa; font-size: 12px; line-height: 1.5;">You can also pay via direct bank transfer. Please pay to any of the accounts below:</p>
                        ${bankAccounts.map((acc: any) => `
                          <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px dashed #3b3b4f;">
                            <p style="margin: 0 0 4px; color: #fff; font-size: 12px; font-weight: bold;">${acc.bank_name}</p>
                            <p style="margin: 0 0 4px; color: #38bdf8; font-size: 13px; font-family: monospace; font-weight: bold;">Account: ${acc.account_number}</p>
                            <p style="margin: 0; color: #a1a1aa; font-size: 11px;">Name: ${acc.account_name}</p>
                          </div>
                        `).join('')}
                        <p style="margin: 10px 0 0; color: #a1a1aa; font-size: 11px; line-height: 1.4;">
                          <strong>Note:</strong> After transfer, log in to your Parent Portal, go to <strong>Invoices & Payments</strong>, select your invoice, and upload a screenshot of your receipt/transfer confirmation.
                        </p>
                       </div>`
                    : '';

                const emailHtml = buildRillcodTransactionalEmailHtml({
                    title: 'Complete Your Enrolment',
                    bodyHtml: `
                        <p style="margin: 0 0 15px; color: #fff; font-size: 16px; font-weight: bold; text-align: center;">Welcome to Rillcod Academy! 🚀</p>
                        <p style="margin: 0 0 15px; color: #a1a1aa; font-size: 13px; line-height: 1.6;">
                          We have received your registration for <strong style="color: #fff;">${full_name}</strong>. To complete the enrolment and secure their spot, please finalize your payment using one of the secure methods below:
                        </p>
                        <div style="text-align: center; margin: 30px 0;">
                          <a href="${paystackData.data.authorization_url}" style="display: inline-block; padding: 14px 28px; background-color: #2563eb; color: #ffffff; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; text-decoration: none; border-radius: 6px; box-shadow: 0 4px 12px rgba(37,99,235,0.2);">
                            💳 Option 1: Pay Online via Paystack
                          </a>
                        </div>
                        ${bankDetailsHtml}
                    `,
                    summaryRows: [
                        { label: 'Student Name', value: full_name },
                        { label: 'Programme Track', value: course_interest || 'STEM / Coding' },
                        { label: 'Schedule', value: preferred_schedule || 'Term Class' },
                        { label: 'Amount Due', value: `₦${chargeAmount.toLocaleString()}` },
                        { label: 'Reference ID', value: reference },
                    ],
                    footerNote: '<span style="color:#a1a1aa;">This is a secure transactional email from Rillcod Technologies. Support: support@rillcod.com</span>',
                });

                await notificationsService.sendExternalEmail({
                    to: emailNorm,
                    subject: `Action Required: Complete Enrolment for ${full_name}`,
                    fromName: 'Rillcod Technologies',
                    fromEmail: 'support@rillcod.com',
                    html: emailHtml,
                });
            } catch (mailErr) {
                console.error('Failed to send app registration helper email:', mailErr);
            }
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
