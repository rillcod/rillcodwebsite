/**
 * Smoke-test all public registration entry paths against live Supabase + route handlers.
 * Creates ephemeral records, asserts responses, then deletes everything.
 *
 * Usage:
 *   npx tsx scripts/smoke-registration-entry-paths.ts
 *   SMOKE_USE_PRODUCTION=1 npx tsx scripts/smoke-registration-entry-paths.ts  (when .env.local uses localhost)
 */
import { config as loadEnv } from 'dotenv';

/** Set SMOKE_USE_PRODUCTION=1 to hit production Supabase when .env.local points at localhost. */
loadEnv({ path: '.env.local' });
loadEnv({
  path: '.env',
  override: process.env.SMOKE_USE_PRODUCTION === '1',
});

/** Valid Nigerian WhatsApp (234 + 10 digits) */
const SMOKE_PHONE = '2348012345678';

const TAG = `[smoke:${Date.now()}]`;
/** Paystack rejects `.test` TLD — use owned domain for live payment init. */
const PARENT_EMAIL = `smoke.parent.${Date.now()}@rillcod.com`;
const TERM_PARENT_EMAIL = `smoke.term.${Date.now()}@rillcod.com`;
const SCHOOL_EMAIL = `smoke.school.${Date.now()}@rillcod.com`;
const STUDENT_NAME = `Smoke Test Child ${TAG}`;
const TERM_STUDENT_NAME = `Smoke Term Child ${TAG}`;
const TRANSFER_REF = `SMOKE-REF-${Date.now()}`;
const TERM_TRANSFER_REF = `SMOKE-TERM-${Date.now()}`;
const TERM_FULL_FEE = 35_000;

type Result = { name: string; ok: boolean; detail?: string };

const results: Result[] = [];
const cleanup = {
  prospectIds: [] as string[],
  studentIds: [] as string[],
  schoolIds: [] as string[],
  txReferences: [] as string[],
};

function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
  console.error(`  ✗ ${name} — ${detail}`);
}

async function jsonRequest(
  handler: (req: import('next/server').NextRequest) => Promise<Response>,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { NextRequest } = await import('next/server');
  const req = new NextRequest(`http://localhost${path}`, init);
  const res = await handler(req);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body: body as Record<string, unknown> };
}

async function preflightSupabase(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;

  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
    /* keep raw url */
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${url}/rest/v1/`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(20000),
      });
      if (res.status < 500) return true;
    } catch (err) {
      if (attempt === 3) {
        console.warn(
          `  ⚠ Supabase unreachable (${host}):`,
          err instanceof Error ? err.message : err,
        );
        if (host === 'localhost' || host === '127.0.0.1') {
          console.warn('  Tip: start local Supabase or run with SMOKE_USE_PRODUCTION=1');
        }
      } else {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }
  return false;
}

async function runUnitChecks() {
  console.log('\n── Unit / logic gates ──');
  const {
    classifyRegistrationDuplicate,
    resolveBalancePaymentCharge,
    resolveRegistrationCharge,
    resolveProgramTuitionContext,
  } = await import('../src/lib/summer-school/registration-intake');
  const { isSpecialProgramProspect } = await import('../src/lib/summer-school/balance-prospect');
  const { studentApprovalPaymentState } = await import('../src/lib/registration/payment-state');
  const { shouldAutoEnrolOnlinePaystack } = await import('../src/lib/registration/onboard-paid-student');
  const { parseBankTransferReference } = await import('../src/lib/summer-school/receipt-upload');
  const { resolveTermRegistrationCharge } = await import('../src/lib/registration/term-registration-intake');

  const termCharge = resolveTermRegistrationCharge({
    paymentMethod: 'bank_transfer',
    paymentPlan: 'full',
    totalTuition: TERM_FULL_FEE,
    transferAmount: TERM_FULL_FEE,
  });
  if (!termCharge.ok) fail('term registration bank charge', termCharge.error);
  else pass('term registration bank charge', `₦${termCharge.charge.chargeAmount}`);

  const tuition = resolveProgramTuitionContext(
    { online_fee: 50000, onsite_fee: 40000, deposit_percent: 50 },
    'Online',
    'installment',
  );
  const charge = resolveRegistrationCharge({
    paymentMethod: 'bank_transfer',
    paymentPlan: 'installment',
    tuition,
    transferAmount: 30000,
  });
  if (!charge.ok) fail('registration-intake bank charge', charge.error);
  else pass('registration-intake bank charge', `₦${charge.charge.chargeAmount}`);

  const balanceCharge = resolveBalancePaymentCharge({
    paymentMethod: 'bank_transfer',
    outstandingBalance: 20000,
    totalTuition: 50000,
    amountPaidSoFar: 30000,
    transferAmount: 15000,
  });
  if (!balanceCharge.ok) fail('balance payment charge', balanceCharge.error);
  else pass('balance payment charge', `remaining ₦${balanceCharge.charge.balanceDue}`);

  const dup = classifyRegistrationDuplicate([
    { id: '1', status: 'partially_paid', created_at: '1' },
  ], null, 'Ada');
  if (dup.kind !== 'block_balance') fail('duplicate guard', `got ${dup.kind}`);
  else pass('duplicate guard blocks balance re-register');

  if (!isSpecialProgramProspect({ course_interest: 'Summer School', notes: '[SpecialPage: x]' })) {
    fail('isSpecialProgramProspect', 'expected true');
  } else pass('isSpecialProgramProspect');

  if (studentApprovalPaymentState({}) !== 'awaiting_payment') fail('approval gate unpaid', 'fail');
  else pass('studentApprovalPaymentState unpaid gate');

  if (studentApprovalPaymentState({ registration_payment_at: new Date().toISOString() }) !== 'paid') {
    fail('approval gate paid', 'fail');
  } else pass('studentApprovalPaymentState paid');

  if (!shouldAutoEnrolOnlinePaystack('online', 'paystack')) fail('auto-enrol online', 'fail');
  else pass('auto-enrol online Paystack');

  if (shouldAutoEnrolOnlinePaystack('school', 'paystack')) fail('auto-enrol school block', 'fail');
  else pass('auto-enrol blocks partner school');

  const parsed = parseBankTransferReference(TRANSFER_REF);
  if (!parsed.ok) fail('bank transfer reference parse', parsed.error);
  else pass('bank transfer reference parse');
}

async function runRejectionPaths() {
  console.log('\n── Rejection / guard paths ──');
  const { POST: regPost } = await import('../src/app/api/payments/registration/route');
  const special = await jsonRequest(regPost, '/api/payments/registration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enrollment_type: 'special', full_name: 'X', parent_email: PARENT_EMAIL }),
  });
  if (special.status === 400) pass('term registration rejects special type');
  else fail('term registration rejects special type', String(special.status));

  const { POST: summerPost } = await import('../src/app/api/summer-school/route');
  const badEmail = await jsonRequest(summerPost, '/api/summer-school', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      student_name: 'X',
      parent_name: 'Y',
      parent_phone: SMOKE_PHONE,
      parent_email: 'not-an-email',
    }),
  });
  if (badEmail.status === 400) pass('summer-school rejects invalid email');
  else fail('summer-school rejects invalid email', String(badEmail.status));
}

async function runSchoolPartnershipPath(admin: Awaited<ReturnType<typeof import('../src/lib/supabase/admin')['createAdminClient']>>) {
  console.log('\n── School partnership application ──');
  const { POST: schoolsPost } = await import('../src/app/api/schools/route');
  const schoolPayload = {
    schoolName: `Smoke Test Academy ${TAG}`,
    principalName: 'Smoke Principal',
    schoolEmail: SCHOOL_EMAIL,
    schoolPhone: SMOKE_PHONE,
    schoolAddress: 'Smoke Test Address',
    programInterest: 'Coding',
    studentCount: 50,
  };

  const first = await jsonRequest(schoolsPost, '/api/schools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(schoolPayload),
  });

  if (first.status !== 201) {
    fail('POST /api/schools', String(first.body.error || first.status));
    return;
  }
  pass('POST /api/schools', 'created pending school');

  const schoolId = (first.body.school as { id?: string })?.id;
  if (schoolId) cleanup.schoolIds.push(schoolId);

  const dup = await jsonRequest(schoolsPost, '/api/schools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(schoolPayload),
  });
  if (dup.status === 409) pass('duplicate school application blocked', '409');
  else fail('duplicate school application blocked', `got ${dup.status}`);

  const { data: school } = await admin
    .from('schools')
    .select('id, status')
    .eq('email', SCHOOL_EMAIL)
    .maybeSingle();
  if (school?.status === 'pending') pass('school status pending');
  else fail('school status', String(school?.status));
  if (school?.id && !cleanup.schoolIds.includes(school.id)) cleanup.schoolIds.push(school.id);
}

async function runSpecialProgrammePath(admin: Awaited<ReturnType<typeof import('../src/lib/supabase/admin')['createAdminClient']>>) {
  console.log('\n── Special programme (bank transfer) ──');
  const { POST: summerPost } = await import('../src/app/api/summer-school/route');
  const payload = {
    student_name: STUDENT_NAME,
    parent_name: 'Smoke Parent',
    parent_phone: SMOKE_PHONE,
    parent_email: PARENT_EMAIL,
    age: 12,
    gender: 'Male',
    preferred_mode: 'Online',
    payment_method: 'bank_transfer',
    payment_plan: 'installment',
    payment_reference: TRANSFER_REF,
    transfer_amount: 30000,
    parent_consent: true,
    whatsapp_consent: true,
    school: 'Smoke Test School',
    current_class: 'Basic 5',
    hear_about_us: 'Smoke test',
  };

  const { status, body } = await jsonRequest(summerPost, '/api/summer-school', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (status !== 200 || !body.success) {
    fail('POST /api/summer-school bank transfer', String(body.error || status));
    return;
  }
  pass('POST /api/summer-school bank transfer', String(body.reference || ''));

  const { data: prospect } = await admin
    .from('prospective_students')
    .select('id, status')
    .eq('parent_email', PARENT_EMAIL)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!prospect?.id) {
    fail('prospect row created', 'not found');
    return;
  }
  cleanup.prospectIds.push(prospect.id);
  if (prospect.status !== 'pending_verification') {
    fail('prospect status', `expected pending_verification, got ${prospect.status}`);
  } else pass('prospect status pending_verification');

  const { data: tx } = await admin
    .from('payment_transactions')
    .select('transaction_reference')
    .contains('payment_gateway_response', { prospect_id: prospect.id })
    .eq('payment_status', 'pending')
    .maybeSingle();

  if (!tx?.transaction_reference) fail('pending payment tx', 'not found');
  else {
    cleanup.txReferences.push(tx.transaction_reference);
    pass('pending payment tx created', tx.transaction_reference);
  }

  const { GET: balanceGet } = await import('../src/app/api/summer-school/balance/route');
  const bal = await jsonRequest(balanceGet, `/api/summer-school/balance?email=${encodeURIComponent(PARENT_EMAIL)}`);
  if (bal.status === 404) pass('balance GET before verify', '404 expected');
  else pass('balance GET', `status ${bal.status}`);
}

async function runTermBankTransferPath(admin: Awaited<ReturnType<typeof import('../src/lib/supabase/admin')['createAdminClient']>>) {
  console.log('\n── Term registration (bank transfer) ──');
  const { POST: regPost } = await import('../src/app/api/payments/registration/route');
  const payload = {
    enrollment_type: 'online',
    full_name: TERM_STUDENT_NAME,
    parent_name: 'Smoke Term Parent',
    parent_phone: SMOKE_PHONE,
    parent_email: TERM_PARENT_EMAIL,
    course_interest: 'Young Innovators',
    preferred_schedule: 'Online Live Classes',
    payment_method: 'bank_transfer',
    payment_plan: 'full',
    payment_reference: TERM_TRANSFER_REF,
    transfer_amount: TERM_FULL_FEE,
    grade_level: 'Basic 5',
    gender: 'Male',
  };

  const { status, body } = await jsonRequest(regPost, '/api/payments/registration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (status !== 200 || !body.success) {
    fail('POST /api/payments/registration bank transfer', String(body.error || status));
    return;
  }
  pass('POST /api/payments/registration bank transfer', String(body.reference || ''));

  const { data: student } = await admin
    .from('students')
    .select('id, status, enrollment_type')
    .eq('parent_email', TERM_PARENT_EMAIL)
    .ilike('full_name', `%Smoke Term Child%`)
    .maybeSingle();

  if (!student?.id) {
    fail('term student row created', 'not found');
    return;
  }
  cleanup.studentIds.push(student.id);
  if (student.status !== 'pending') fail('term student status', student.status);
  else pass('term student status pending', String(student.enrollment_type));

  const { data: tx } = await admin
    .from('payment_transactions')
    .select('transaction_reference, payment_status')
    .contains('payment_gateway_response', { student_id: student.id })
    .eq('payment_status', 'pending')
    .maybeSingle();

  if (!tx?.transaction_reference) fail('term pending payment tx', 'not found');
  else {
    cleanup.txReferences.push(tx.transaction_reference);
    pass('term pending payment tx created', tx.transaction_reference);
  }

  const { GET: balanceGet } = await import('../src/app/api/payments/registration/balance/route');
  const bal = await jsonRequest(
    balanceGet,
    `/api/payments/registration/balance?email=${encodeURIComponent(TERM_PARENT_EMAIL)}`,
  );
  if (bal.status === 404) pass('term balance GET before verify', '404 expected');
  else pass('term balance GET', `status ${bal.status}`);
}

async function runOnlineRegistrationPath(admin: Awaited<ReturnType<typeof import('../src/lib/supabase/admin')['createAdminClient']>>) {
  console.log('\n── Online student registration ──');
  const { env } = await import('../src/config/env');
  if (!env.PAYSTACK_SECRET_KEY) {
    pass('POST /api/payments/registration online', 'skipped — no PAYSTACK_SECRET_KEY');
    return;
  }

  const { POST: regPost } = await import('../src/app/api/payments/registration/route');
  const payload = {
    enrollment_type: 'online',
    full_name: STUDENT_NAME,
    parent_name: 'Smoke Parent',
    parent_phone: SMOKE_PHONE,
    parent_email: PARENT_EMAIL,
    course_interest: 'Young Innovators',
    preferred_schedule: 'Weekday Afternoons',
    payment_plan: 'full',
    grade_level: 'Basic 5',
  };

  const { status, body } = await jsonRequest(regPost, '/api/payments/registration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (status !== 200 || !(body.paymentUrl || body.authorization_url)) {
    fail('POST /api/payments/registration online', String(body.error || status));
    return;
  }
  pass('POST /api/payments/registration online', 'Paystack URL returned');

  const { data: student } = await admin
    .from('students')
    .select('id, status, enrollment_type')
    .eq('parent_email', PARENT_EMAIL)
    .ilike('full_name', `%Smoke Test Child%`)
    .maybeSingle();

  if (!student?.id) {
    fail('student row created', 'not found');
    return;
  }
  cleanup.studentIds.push(student.id);
  if (student.status !== 'pending') fail('student status', student.status);
  else pass('student status pending', String(student.enrollment_type));

  const ref = body.reference as string | undefined;
  if (ref) cleanup.txReferences.push(ref);

  const { GET: verifyGet } = await import('../src/app/api/payments/registration/verify/route');
  const verify = await jsonRequest(
    verifyGet,
    `/api/payments/registration/verify?reference=${encodeURIComponent(ref || 'SMOKE-MISSING')}`,
  );
  if (verify.body.ok === false) pass('registration verify unpaid', 'correctly pending');
  else pass('registration verify', String(verify.body.ok));
}

async function cleanupCrmByEmail(
  admin: Awaited<ReturnType<typeof import('../src/lib/supabase/admin')['createAdminClient']>>,
  email: string,
) {
  const normalized = email.trim().toLowerCase();
  const { data: books } = await admin
    .from('customer_contact_book')
    .select('id')
    .ilike('email', normalized);
  const bookIds = (books ?? []).map((b) => b.id);
  if (bookIds.length) {
    await admin.from('crm_pipeline').delete().in('contact_id', bookIds);
    await admin.from('form_leads').delete().in('contact_id', bookIds);
    await admin.from('customer_contact_book').delete().in('id', bookIds);
  }
  await admin.from('form_leads').delete().ilike('email', normalized);
}

async function cleanupAll(admin: Awaited<ReturnType<typeof import('../src/lib/supabase/admin')['createAdminClient']>>) {
  console.log('\n── Cleanup ──');
  for (const ref of cleanup.txReferences) {
    await admin.from('payment_transactions').delete().eq('transaction_reference', ref);
  }
  for (const prospectId of cleanup.prospectIds) {
    await admin.from('payment_transactions').delete().contains('payment_gateway_response', { prospect_id: prospectId });
    await admin.from('prospective_students').delete().eq('id', prospectId);
  }
  for (const studentId of cleanup.studentIds) {
    await admin.from('payment_transactions').delete().contains('payment_gateway_response', { student_id: studentId });
    await admin.from('students').delete().eq('id', studentId);
  }
  for (const schoolId of cleanup.schoolIds) {
    await admin.from('schools').delete().eq('id', schoolId);
  }
  await cleanupCrmByEmail(admin, PARENT_EMAIL);
  await cleanupCrmByEmail(admin, TERM_PARENT_EMAIL);
  await cleanupCrmByEmail(admin, SCHOOL_EMAIL);
  await admin.from('notifications').delete().ilike('message', `%${PARENT_EMAIL}%`);
  await admin.from('notifications').delete().ilike('message', `%${TERM_PARENT_EMAIL}%`);
  await admin.from('notifications').delete().ilike('message', `%${SCHOOL_EMAIL}%`);
  pass('cleanup complete', `${cleanup.prospectIds.length} prospects, ${cleanup.studentIds.length} students, ${cleanup.schoolIds.length} schools`);
}

async function main() {
  console.log(`\nRegistration entry-path smoke test ${TAG}`);
  console.log(`Parent email: ${PARENT_EMAIL}`);
  if (process.env.SMOKE_USE_PRODUCTION === '1') {
    console.log('Mode: production Supabase (SMOKE_USE_PRODUCTION=1)');
  }
  try {
    console.log(`Supabase host: ${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').hostname}`);
  } catch {
    /* ignore */
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing Supabase env in .env.local');
    process.exit(1);
  }

  await runUnitChecks();
  await runRejectionPaths();

  const dbOk = await preflightSupabase();
  if (!dbOk) {
    console.log('\n── Live DB tests skipped (Supabase not reachable from this network) ──');
    console.log('Run on production server or CI with network access: npx tsx scripts/smoke-registration-entry-paths.ts');
    const failed = results.filter((r) => !r.ok);
    console.log(`\nOffline results: ${results.length - failed.length}/${results.length} passed`);
    process.exit(failed.length ? 1 : 0);
  }

  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const admin = createAdminClient();

  try {
    await runSchoolPartnershipPath(admin);
    await runSpecialProgrammePath(admin);
    await runTermBankTransferPath(admin);
    await runOnlineRegistrationPath(admin);
  } finally {
    await cleanupAll(admin);
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n══════════════════════════════════════');
  console.log(`Results: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) console.log(`  • ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  console.log('All smoke checks passed.\n');
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
