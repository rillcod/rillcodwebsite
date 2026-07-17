import { NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { env } from '@/config/env';
import { sendRegistrationPaymentEmail } from '@/lib/registration/payment-link-email';
import { sendNativeEnrolmentAcknowledgement } from '@/lib/registration/native-enrolment-email';
import { assertRegistrationInstalmentAllowed } from './instalment-guard';
import { checkCustomRateLimit } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';
import { createPendingPayment, removePendingPayment } from '@/lib/payments/pending-transaction';
import { cleanGrade, parseBandLabel } from '@/lib/classes/naming';
import { PARTNER_SCHOOL_TERM_FEE } from '@/lib/registration/programme-map';
import { isSpecialEnrollment, SPECIAL_LEGACY_PUBLIC_PATH, STUDENT_REGISTRATION_PATH } from '@/lib/registration/enrollment-types';
import { resolveOnlineSchool } from '@/lib/schools/resolve-online-school';
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

function registrationSaveError(message: string | undefined, fallback: string): string {
    if (message && /registered school selection|selected school is not registered/i.test(message)) {
        return 'We could not confirm the selected school. Return to Learner Info, choose the school from the list, and try again.';
    }
    return message || fallback;
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
            school_id,
            school_name,
            origin_school_name,
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

        const originSchoolName = enrollment_type === 'online'
            ? String(origin_school_name || school_name || '').trim()
            : '';
        let resolvedSchoolId: string | null = null;
        let resolvedSchoolName: string | null = null;
        if (enrollment_type === 'school') {
            const requestedSchoolId = String(school_id || '').trim();
            const legacySchoolName = String(school_name || '').trim();
            if (!requestedSchoolId && !legacySchoolName) {
                return NextResponse.json(
                    { error: "Select the learner's registered partner school from the list." },
                    { status: 400 },
                );
            }

            const baseSchoolQuery = supabase
                .from('schools')
                .select('id, name')
                .eq('status', 'approved');
            const { data: schoolMatch, error: schoolLookupError } = requestedSchoolId
                ? await baseSchoolQuery.eq('id', requestedSchoolId).limit(1).maybeSingle()
                : await baseSchoolQuery.ilike('name', legacySchoolName).limit(1).maybeSingle();

            if (schoolLookupError) {
                console.error('Partner school lookup error:', schoolLookupError);
                return NextResponse.json(
                    { error: 'Partner schools could not be checked. Please try again.' },
                    { status: 500 },
                );
            }
            if (!schoolMatch) {
                return NextResponse.json(
                    { error: 'That partner school is not available. Return to Learner Info and choose a school from the list.' },
                    { status: 400 },
                );
            }
            resolvedSchoolId = schoolMatch.id;
            resolvedSchoolName = schoolMatch.name;
        } else if (enrollment_type === 'online') {
            try {
                const onlineSchool = await resolveOnlineSchool(supabase as any);
                resolvedSchoolId = onlineSchool.id;
                resolvedSchoolName = onlineSchool.name;
            } catch (schoolError) {
                console.error('Online school resolution error:', schoolError);
                return NextResponse.json(
                    { error: 'Online School could not be prepared. Please try again.' },
                    { status: 500 },
                );
            }
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
            school_name: resolvedSchoolName,
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
            ...(body.is_app_enrolment ? { created_by: 'mobile_application' } : {}),
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
                return NextResponse.json({ error: registrationSaveError(updErr?.message, 'Failed to refresh registration') }, { status: 500 });
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
                return NextResponse.json({ error: registrationSaveError(studentErr?.message, 'Failed to save registration') }, { status: 500 });
            }
            student = inserted;
        }

        // Sync direct student portal registration to the CRM and form_leads follow-up pool
        try {
            const { upsertBookParent } = await import('@/lib/crm/contact-book');
            const { upsertCrmPipeline } = await import('@/lib/crm/pipeline');

            const bookId = await upsertBookParent(supabase as any, {
                fullName: parent_name || full_name,
                email: emailNorm,
                phone: parent_phone || null,
                schoolName: resolvedSchoolName || null,
                source: 'portal_registration',
                lastChannel: 'portal_registration',
                childEntry: {
                    name: full_name,
                    gender: gender || null,
                    grade: grade_level || null,
                    program: course_interest || null,
                },
            });

            if (bookId) {
                // Add to CRM pipeline as a prospect
                await upsertCrmPipeline(supabase as any, {
                    contactId: bookId,
                    contactName: parent_name || full_name,
                    contactType: 'form_lead',
                    stage: 'prospect',
                    promoteOnly: true,
                });

                // Fetch any active/existing consent form to satisfy the foreign key constraint on form_leads
                const { data: cf } = await supabase
                    .from('consent_forms')
                    .select('id')
                    .limit(1)
                    .maybeSingle();

                if (cf?.id) {
                    const { data: existingLead } = await supabase
                        .from('form_leads')
                        .select('id')
                        .eq('form_id', cf.id)
                        .eq('email', emailNorm)
                        .limit(1)
                        .maybeSingle();

                    if (!existingLead) {
                        const progCat = course_interest === 'Teen Developers'
                            ? 'teen_developers'
                            : course_interest === 'Young Innovators'
                            ? 'young_innovators'
                            : course_interest || 'young_innovators';

                        await supabase.from('form_leads').insert({
                            form_id: cf.id,
                            email: emailNorm,
                            status: 'new',
                            contact_id: bookId,
                            school_id: resolvedSchoolId || null,
                            response_data: {
                                parent_name: parent_name || 'Parent/Guardian',
                                child_name: full_name,
                                program_category: progCat,
                                parent_email: emailNorm,
                                parent_phone: parent_phone || null,
                                preferred_schedule: preferred_schedule || null,
                            },
                            submitted_at: new Date().toISOString(),
                        });
                    }
                }
            }
        } catch (crmErr) {
            console.error('CRM sync warning (non-fatal):', crmErr);
        }

        const { error: supersedeError } = await supabase
            .from('payment_transactions')
            .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
            .eq('payment_status', 'pending')
            .contains('payment_gateway_response', { student_id: student.id });
        if (supersedeError) {
            console.error('Failed to retire earlier registration payment links:', supersedeError);
        }


        const reference = `REG-${Date.now()}-${student.id.substring(0, 6)}`;
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com';

        if (body.is_app_enrolment) {
            const pending = await createPendingPayment(supabase as any, {
                schoolId: resolvedSchoolId,
                amount: chargeAmount,
                currency: 'NGN',
                method: 'other',
                reference,
                subject: { type: 'registration', id: student.id },
                metadata: {
                    student_id: student.id,
                    student_name: full_name,
                    enrollment_type,
                    partner_program_track: enrollment_type === 'school' ? track : null,
                    rc_code: enrollment_type === 'school' && rc_code ? String(rc_code).trim().toUpperCase() : null,
                    parent_email: emailNorm,
                    parent_name: parent_name || null,
                    school_name: resolvedSchoolName,
                    origin_school_name: originSchoolName || null,
                    program_id: resolvedProgramId || program_id || null,
                    program_name: programName || null,
                    payment_type: 'registration',
                    payment_plan: isInstalment ? 'instalment' : 'full',
                    total_tuition: amount,
                    balance_due: balanceDue,
                    is_app_enrolment: true,
                },
            });

            if (!pending.ok) {
                return NextResponse.json({ error: pending.error.message }, { status: pending.error.code === 'conflict' ? 409 : 500 });
            }

            const emailDelivery = await sendNativeEnrolmentAcknowledgement({
                supabase,
                subjectId: student.id,
                reference,
                parentEmail: emailNorm,
                parentName: parent_name,
                studentName: full_name,
                programmeTitle: programName || course_interest || enrollment_type,
            });

            return NextResponse.json({
                success: true,
                reference,
                paymentEmailSent: emailDelivery.delivered,
                paymentEmailError: emailDelivery.error ?? null,
            });
        }

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
                school_name: resolvedSchoolName,
                origin_school_name: originSchoolName || null,
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
                email: emailNorm,
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

        const authorizationUrl = String(paystackData.data.authorization_url || '');
        const paymentMetadata = {
            student_id: student.id,
            student_name: full_name,
            enrollment_type,
            partner_program_track: enrollment_type === 'school' ? track : null,
            rc_code: enrollment_type === 'school' && rc_code ? String(rc_code).trim().toUpperCase() : null,
            parent_email: emailNorm,
            parent_name: parent_name || null,
            school_name: resolvedSchoolName,
            origin_school_name: originSchoolName || null,
            program_id: resolvedProgramId || program_id || null,
            program_name: programName || null,
            payment_type: 'registration',
            payment_plan: isInstalment ? 'instalment' : 'full',
            total_tuition: amount,
            balance_due: balanceDue,
            authorization_url: authorizationUrl,
            access_code: paystackData.data.access_code || null,
        };

        await supabase
            .from('payment_transactions')
            .update({ payment_gateway_response: paymentMetadata })
            .eq('id', tx.id);

        // Send for both web and Android. Web users receive a fallback if they
        // leave Paystack; Android users use the email as the external handoff.
        const emailDelivery = await sendRegistrationPaymentEmail({
            supabase,
            subjectId: student.id,
            reference,
            parentEmail: emailNorm,
            parentName: parent_name,
            studentName: full_name,
            programmeTitle: programName || course_interest || enrollment_type,
            schedule: preferred_schedule || null,
            amount: chargeAmount,
            paymentUrl: authorizationUrl,
            paymentMethod: 'paystack',
        });
        return NextResponse.json({
            success: true,
            paymentUrl: authorizationUrl,
            reference,
            paymentEmailSent: emailDelivery.delivered,
            paymentEmailError: emailDelivery.error ?? null,
        });

    } catch (err: any) {
        console.error('Registration payment error:', err);
        return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
    }
}
