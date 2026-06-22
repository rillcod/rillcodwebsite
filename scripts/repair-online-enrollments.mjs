// One-off repair: re-point online/summer learners who are still on a flagship
// DEFAULT programme onto the real track they signed up for (students.course_interest).
//
// Mirrors migration 20260501000061 step 3 EXACTLY, including the admin-override
// guard (skip anyone who already holds a non-flagship enrolment).
//
// Dry-run by default. Pass --apply to actually write.
//
//   node scripts/repair-online-enrollments.mjs           # preview only
//   node scripts/repair-online-enrollments.mjs --apply   # perform updates

import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
// Fallback track when course_interest doesn't name a programme (e.g. it only holds
// a grade like "JSS3 Summer School 2026"). Pass --default="AI Engineering & Automation".
const DEFAULT_ARG = process.argv.find((a) => a.startsWith('--default='));
const DEFAULT_PROGRAM_NAME = DEFAULT_ARG ? DEFAULT_ARG.slice('--default='.length) : null;
const ONLINE_TYPES = ['summer_school', 'online', 'online_school', 'bootcamp'];
const FLAGSHIP = /(teen developer|young innovator)/i;

const db = createClient(URL, KEY, { auth: { persistSession: false } });

const isFlagship = (name) => FLAGSHIP.test(name || '');

/** Bidirectional, length>=4, longest-name-wins — identical to the SQL matcher. */
function matchProgram(courseInterest, programs) {
  const ci = (courseInterest || '').trim().toLowerCase();
  if (ci.length < 4) return null;
  const candidates = programs.filter((p) => {
    if (p.is_active === false) return false;
    const n = (p.name || '').toLowerCase();
    return n.length > 0 && (ci.includes(n) || n.includes(ci));
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (b.name?.length ?? 0) - (a.name?.length ?? 0));
  return candidates[0];
}

async function main() {
  // 1. Programmes.
  const { data: programs, error: pErr } = await db.from('programs').select('id, name, is_active');
  if (pErr) throw pErr;
  const programById = new Map(programs.map((p) => [p.id, p]));

  // Resolve the named fallback programme (exact, else contains), if provided.
  let defaultProgram = null;
  if (DEFAULT_PROGRAM_NAME) {
    const want = DEFAULT_PROGRAM_NAME.trim().toLowerCase();
    defaultProgram =
      programs.find((p) => (p.name || '').toLowerCase() === want) ||
      programs.find((p) => (p.name || '').toLowerCase().includes(want)) || null;
    if (!defaultProgram) { console.error(`Default programme "${DEFAULT_PROGRAM_NAME}" not found.`); process.exit(1); }
    if (isFlagship(defaultProgram.name)) { console.error(`Default programme "${defaultProgram.name}" is a flagship — refusing.`); process.exit(1); }
    console.log(`Fallback track for unmatched course_interest: "${defaultProgram.name}"`);
  }

  // 2. Online/summer learners (+ course_interest from students).
  const { data: users, error: uErr } = await db
    .from('portal_users')
    .select('id, email, full_name, enrollment_type')
    .in('enrollment_type', ONLINE_TYPES);
  if (uErr) throw uErr;
  if (!users.length) { console.log('No online/summer learners found.'); return; }

  const userIds = users.map((u) => u.id);
  const userById = new Map(users.map((u) => [u.id, u]));

  const { data: studentRows, error: sErr } = await db
    .from('students')
    .select('user_id, course_interest')
    .in('user_id', userIds);
  if (sErr) throw sErr;
  const interestByUser = new Map((studentRows ?? []).map((s) => [s.user_id, s.course_interest]));

  // 3. Their enrolments.
  const { data: enrollments, error: eErr } = await db
    .from('enrollments')
    .select('id, user_id, program_id')
    .in('user_id', userIds);
  if (eErr) throw eErr;

  const enrByUser = new Map();
  for (const e of enrollments) {
    if (!enrByUser.has(e.user_id)) enrByUser.set(e.user_id, []);
    enrByUser.get(e.user_id).push(e);
  }

  // 4. Decide.
  const plan = [];
  const skippedOverride = [];
  const noMatch = [];

  for (const [userId, enrs] of enrByUser) {
    const hasNonFlagship = enrs.some((e) => {
      const p = programById.get(e.program_id);
      return p && !isFlagship(p.name);
    });
    if (hasNonFlagship) { skippedOverride.push(userId); continue; } // admin override — leave alone

    const flagshipEnrs = enrs.filter((e) => {
      const p = programById.get(e.program_id);
      return p && isFlagship(p.name);
    });
    if (flagshipEnrs.length === 0) continue;

    const interest = interestByUser.get(userId);
    const target = matchProgram(interest, programs) || defaultProgram;
    const u = userById.get(userId);
    if (!target) { noMatch.push({ email: u?.email, interest }); continue; }

    for (const e of flagshipEnrs) {
      if (e.program_id === target.id) continue; // already correct
      plan.push({
        enrollmentId: e.id,
        email: u?.email,
        name: u?.full_name,
        interest,
        from: programById.get(e.program_id)?.name,
        to: target.name,
        toId: target.id,
      });
    }
  }

  // 5. Report.
  console.log(`\nOnline/summer learners: ${users.length}`);
  console.log(`Skipped (admin override — already on a real track): ${skippedOverride.length}`);
  console.log(`No course_interest match (left on flagship): ${noMatch.length}`);
  if (noMatch.length) {
    for (const n of noMatch.slice(0, 20)) console.log(`   · ${n.email}  interest="${n.interest ?? ''}"`);
  }
  console.log(`\nEnrolments to re-point: ${plan.length}`);
  for (const r of plan) console.log(`   → ${r.email}  "${r.interest ?? ''}"  [${r.from}] => [${r.to}]`);

  if (!APPLY) {
    console.log('\nDRY RUN — no changes written. Re-run with --apply to perform the repair.\n');
    return;
  }

  let ok = 0, fail = 0;
  for (const r of plan) {
    const { error } = await db.from('enrollments').update({ program_id: r.toId }).eq('id', r.enrollmentId);
    if (error) { fail++; console.error(`   ✗ ${r.email}: ${error.message}`); }
    else ok++;
  }
  console.log(`\nAPPLIED — updated ${ok} enrolment(s), ${fail} failure(s).\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
