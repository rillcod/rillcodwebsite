import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  deliverConsentParentConfirmationEmail,
  deliverConsentParentWhatsAppAck,
  deliverConsentStaffLeadNotification,
} from '@/lib/consent/lead-notifications';
import { reconcileLeadWithCrm } from '@/lib/crm/reconcile-lead';
import { logAudit } from '@/lib/audit/log';
import {
  hashConsentSubmissionIp,
  isConsentSubmissionThrottled,
  recordConsentSubmissionAttempt,
} from '@/lib/consent/submission-throttle';
import { upsertLeadChildLink } from '@/lib/consent/lead-child-links';
import {
  findParentPortalIdByContact,
  isAutoResolvableConsentMatch,
  resolveConsentLeadMatch,
} from '@/lib/consent/resolve-consent-lead-match';
import { looseNameMatch } from '@/lib/parent-claim/name-match';
import { SMTP_FROM_EMAIL } from '@/config/brand';

export const dynamic = 'force-dynamic';

const SERVER_MANAGED_RESPONSE_KEYS = new Set([
  '_ip',
  'child_matches',
  'child_match_candidates',
  'submission_snapshot',
]);

function sanitizeSubmittedResponse(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeSubmittedResponse);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SERVER_MANAGED_RESPONSE_KEYS.has(key))
      .map(([key, nested]) => [key, sanitizeSubmittedResponse(nested)]),
  );
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// ── Name matching utilities ───────────────────────────────────────────────────

/** Normalise a name into lowercase word tokens, dropping very short tokens */
function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

/** Count how many tokens from `a` also appear in `b` */
function tokenOverlap(a: string, b: string): number {
  const tb = new Set(nameTokens(b));
  return nameTokens(a).filter(t => tb.has(t)).length;
}

/** Token overlap for programme/class names — same algorithm, works for
 *  "Quincy Python class", "Scratch Beginners", "Advanced HTML", etc. */
function classOverlap(formClass: string, storedClass: string): number {
  return tokenOverlap(formClass, storedClass);
}

interface StudentCandidate {
  id: string;
  full_name: string;
  section_class: string | null;
  school_id: string | null;
  score: number;
  nameOverlap: number;
  classOverlap: number;
  parentMatch: boolean;
}

/** Find the best-matching existing student for this form submission */
async function findStudentMatch(
  sb: ReturnType<typeof adminClient>,
  params: {
    childName: string;
    childClass: string;
    parentEmail: string;
    parentPhone: string;
    schoolId: string | null;
    matchedSchoolId: string | null;
  },
): Promise<{ candidate: StudentCandidate; confidence: 'high' | 'medium' | 'low' } | null> {
  const { childName, childClass, parentEmail, parentPhone, schoolId, matchedSchoolId } = params;

  // Search in both the form's school and the child's current school (if different)
  const schoolIds = [...new Set([schoolId, matchedSchoolId].filter(Boolean))] as string[];
  if (schoolIds.length === 0) return null;

  // Identity fields only — never pull student email/phone into the matcher.
  const { data: students } = await (sb as any)
    .from('portal_users')
    .select('id, full_name, section_class, school_id')
    .eq('role', 'student')
    .eq('is_active', true)
    .eq('is_deleted', false)
    .in('school_id', schoolIds);

  if (!students || students.length === 0) return null;

  // Also check if the parent email/phone already exists as a portal_users parent
  const normalPhone = parentPhone?.replace(/\D/g, '') || '';
  let parentPortalId: string | null = null;
  if (parentEmail || normalPhone) {
    let q = (sb as any).from('portal_users').select('id').eq('role', 'parent').eq('is_active', true);
    if (parentEmail) q = q.eq('email', parentEmail);
    const { data: parentMatch } = await q.maybeSingle();
    if (!parentMatch && normalPhone) {
      const { data: phoneMatch } = await (sb as any)
        .from('portal_users').select('id').eq('role', 'parent').ilike('phone', `%${normalPhone.slice(-9)}%`).maybeSingle();
      parentPortalId = phoneMatch?.id ?? null;
    } else {
      parentPortalId = parentMatch?.id ?? null;
    }
  }

  // Build the set of portal-student ids that are GENUINELY this parent's children
  // — via the explicit parent_student_links junction AND the denormalised
  // parent_email on the student record. The +20 "parent in system" boost must
  // only apply to a parent's actual children, never to every same-name student,
  // or it forces false-high-confidence matches.
  const parentChildUserIds = new Set<string>();
  try {
    if (parentPortalId) {
      const { data: links } = await (sb as any)
        .from('parent_student_links').select('student_id').eq('parent_id', parentPortalId);
      const studentRowIds = (links ?? []).map((l: any) => l.student_id).filter(Boolean);
      if (studentRowIds.length > 0) {
        const { data: linkedRows } = await (sb as any)
          .from('students').select('user_id').in('id', studentRowIds);
        for (const r of linkedRows ?? []) if (r.user_id) parentChildUserIds.add(r.user_id);
      }
    }
    if (parentEmail) {
      const { data: byEmail } = await (sb as any)
        .from('students').select('user_id').ilike('parent_email', parentEmail).not('user_id', 'is', null);
      for (const r of byEmail ?? []) if (r.user_id) parentChildUserIds.add(r.user_id);
    }
  } catch { /* non-fatal — fall back to no parent boost */ }

  let best: StudentCandidate | null = null;

  for (const student of students) {
    const nameOv  = tokenOverlap(childName, student.full_name);
    const fuzzy   = looseNameMatch(childName, student.full_name);
    if (nameOv === 0 && !fuzzy) continue;

    const classOv = childClass && student.section_class
      ? classOverlap(childClass, student.section_class)
      : 0;

    // This specific student is the submitting parent's child (linked or by email).
    const directParentMatch = parentChildUserIds.has(student.id);

    let score = Math.max(nameOv, fuzzy ? 1 : 0) * 10 + classOv * 5;
    if (directParentMatch) score += 20;

    if (!best || score > best.score) {
      best = {
        id:           student.id,
        full_name:    student.full_name,
        section_class: student.section_class,
        school_id:    student.school_id,
        score,
        nameOverlap:  nameOv,
        classOverlap: classOv,
        parentMatch:  directParentMatch,
      };
    }
  }

  if (!best) return null;

  // Confidence thresholds
  let confidence: 'high' | 'medium' | 'low';
  if (best.score >= 25 || best.parentMatch) {
    confidence = 'high';   // strong name match + class, OR parent already in system
  } else if (best.score >= 15) {
    confidence = 'medium'; // 2+ name tokens, or 1 token + class match
  } else {
    confidence = 'low';    // 1 token, school only — note but don't block for review
  }

  return { candidate: best, confidence };
}


// GET /api/public/consent-forms/[id]
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const sb = adminClient();
  const { data: form, error } = await sb
    .from('consent_forms')
    // consent_forms has no view_count column. Asking for it failed the SELECT with 42703, which
    // set `error` — so this route answered "Form not found or not public" for EVERY public
    // consent form. The view counter was never stored anywhere; dropping it restores the page.
    .select('id, title, body, form_type, due_date, schools(name)')
    .eq('id', id).eq('is_public', true).single();
  if (error || !form) return NextResponse.json({ error: 'Form not found or not public' }, { status: 404 });

  // Public DTO only — no school_id / internal counters beyond what's needed to render.
  return NextResponse.json({
    data: {
      id: form.id,
      title: form.title,
      body: form.body,
      form_type: form.form_type,
      due_date: form.due_date,
      schools: form.schools ? { name: (form.schools as any).name ?? null } : null,
    },
  });
}

// POST /api/public/consent-forms/[id]
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const sb = adminClient();

  const { data: form, error: formErr } = await sb
    .from('consent_forms')
    .select('id, title, school_id, form_type, is_public, due_date, schools(name, email)')
    .eq('id', id).single();

  if (formErr || !form || !form.is_public) {
    return NextResponse.json({ error: 'Form not found or no longer accepting submissions' }, { status: 404 });
  }
  if (form.due_date && new Date(form.due_date).getTime() < Date.now()) {
    return NextResponse.json({ error: 'This consent form deadline has passed.' }, { status: 410 });
  }

  // Privacy-preserving rate limiting — the raw address is never persisted.
  const clientIp = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const ipHash = hashConsentSubmissionIp(clientIp);
  if (await isConsentSubmissionThrottled(sb as any, { formId: id, ipHash })) {
    return NextResponse.json({ error: 'Too many submissions. Please try again later.' }, { status: 429 });
  }
  await recordConsentSubmissionAttempt(sb as any, { formId: id, ipHash });

  const body = await req.json().catch(() => ({}));
  const { response_data: rawData = {}, child_current_school, email } = body;

  // Validate required fields
  if (!rawData.child_name?.trim()) {
    return NextResponse.json({ error: 'Child name is required' }, { status: 400 });
  }
  if (!rawData.parent_name?.trim()) {
    return NextResponse.json({ error: 'Parent/guardian name is required' }, { status: 400 });
  }
  if (!email?.trim() && !rawData.parent_email?.trim() && !rawData.parent_whatsapp?.trim()) {
    return NextResponse.json({ error: 'At least one contact method (email or WhatsApp) is required' }, { status: 400 });
  }
  if (rawData.parent_whatsapp) {
    const whatsappDigits = String(rawData.parent_whatsapp).replace(/\D/g, '');
    if (whatsappDigits.length !== 13) {
      return NextResponse.json({ error: 'WhatsApp number must contain exactly 13 digits, including country code.' }, { status: 400 });
    }
  }
  const submittedChildren = Array.isArray(rawData.children)
    ? rawData.children as Array<{ name?: string }>
    : [{ name: rawData.child_name as string }];
  const normalizedChildNames = submittedChildren
    .map((child) => String(child?.name ?? '').toLowerCase().replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (new Set(normalizedChildNames).size !== normalizedChildNames.length) {
    return NextResponse.json({ error: 'Each child may only appear once in a submission.' }, { status: 400 });
  }

  const response_data = sanitizeSubmittedResponse(rawData) as Record<string, any>;

  // Duplicate detection — same email + child name + form within 30 days
  const parentEmail = (rawData.parent_email || email || '').trim().toLowerCase();
  const submittedChildKey = String(rawData.child_name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (parentEmail) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: existingForContact } = await (sb as any)
      .from('form_leads')
      .select('id, submitted_at, response_data')
      .eq('form_id', id)
      .eq('email', parentEmail)
      .gte('submitted_at', thirtyDaysAgo)
      .limit(50);
    const existing = (existingForContact ?? []).find((row: any) =>
      String(row.response_data?.child_name ?? '').toLowerCase().replace(/\s+/g, ' ').trim() === submittedChildKey
    );
    if (existing) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        message: `We already have a submission for this email. Our team will be in touch soon!`,
      });
    }
  }

  // ── Fuzzy-match child's current school ───────────────────────────────────
  let matched_school_id: string | null = null;
  let matchedSchoolName: string | undefined;
  if (child_current_school?.trim()) {
    const { data: schoolMatch } = await sb.from('schools').select('id, name')
      .ilike('name', `%${child_current_school.trim()}%`).limit(1).maybeSingle();
    matched_school_id = (schoolMatch as any)?.id ?? null;
    matchedSchoolName = (schoolMatch as any)?.name;
  }

  // ── Smart student matching ────────────────────────────────────────────────
  const matchResult = await findStudentMatch(sb, {
    childName:      response_data.child_name,
    childClass:     response_data.child_class || '',
    parentEmail:    response_data.parent_email || email?.trim() || '',
    parentPhone:    response_data.parent_whatsapp || '',
    schoolId:       form.school_id ?? null,
    matchedSchoolId: matched_school_id,
  });

  const parentEmailForMatch = response_data.parent_email || email?.trim() || '';
  const parentPhoneForMatch = response_data.parent_whatsapp || '';
  const parentPortalVerified = !!(await findParentPortalIdByContact(
    sb as any,
    parentEmailForMatch,
    parentPhoneForMatch,
  ));

  // A match is only a suggestion unless auto-resolution is safe (parent-owned + plausible name).
  let needsReview = !!matchResult && ['high', 'medium'].includes(matchResult.confidence);
  const matchStatus = needsReview ? 'pending_review' : 'new_prospect';

  let matchNotes: string | null = null;
  if (matchResult) {
    const c = matchResult.candidate;
    matchNotes = `Matched "${c.full_name}" (${c.section_class ?? 'no class'}) — name overlap: ${c.nameOverlap}, class overlap: ${c.classOverlap}, parent in system: ${c.parentMatch}. Confidence: ${matchResult.confidence}.`;
  }

  // ── Multi-child matching (index ≥ 1) ─────────────────────────────────────
  interface ChildMatchEntry {
    childIndex: number;
    studentId: string;
    studentName: string;
    studentClass: string | null;
    confidence: 'high' | 'medium';
  }
  const childMatchEntries: ChildMatchEntry[] = [];
  const multiChildren = Array.isArray(response_data.children)
    ? (response_data.children as Array<{ name?: string; gender?: string; age?: string; class?: string; program?: string; school?: string }>)
    : null;
  if (multiChildren && multiChildren.length >= 2) {
    for (let ci = 1; ci < multiChildren.length; ci++) {
      const child = multiChildren[ci];
      if (!child.name?.trim()) continue;
      try {
        const childMatch = await findStudentMatch(sb, {
          childName:       child.name,
          childClass:      child.class || '',
          parentEmail:     response_data.parent_email || email?.trim() || '',
          parentPhone:     response_data.parent_whatsapp || '',
          schoolId:        form.school_id ?? null,
          matchedSchoolId: matched_school_id,
        });
        if (childMatch && childMatch.confidence !== 'low') {
          childMatchEntries.push({
            childIndex:   ci,
            studentId:    childMatch.candidate.id,
            studentName:  childMatch.candidate.full_name,
            studentClass: childMatch.candidate.section_class,
            confidence:   childMatch.confidence,
          });
        }
      } catch { /* non-fatal */ }
    }
  }

  // Match suggestions stay in form_lead_child_links only — never echo portal UUIDs
  // or matched student names back into response_data (avoids duplication + public export risk).
  const immutableSubmission = structuredClone(response_data);
  const enrichedResponseData = {
    ...response_data,
    submission_snapshot: immutableSubmission,
  };

  // ── Save form lead ────────────────────────────────────────────────────────
  const { data: lead, error: insertErr } = await (sb as any)
    .from('form_leads')
    .insert({
      form_id: id,
      school_id: form.school_id ?? null,
      matched_school_id,
      child_current_school: child_current_school?.trim() || null,
      email: email?.trim() || null,
      response_data: enrichedResponseData,
      match_status:       matchStatus,
      match_candidate_id: needsReview ? matchResult!.candidate.id : null,
      matched_student_id: null,
      matched_parent_id:  null,
      match_confidence:   matchResult?.confidence ?? null,
      match_notes:        matchNotes,
    })
    .select()
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') return NextResponse.json({ success: true, duplicate: true });
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }
  await logAudit(sb as any, {
    action: 'consent_submitted',
    resourceType: 'form_lead',
    resourceId: lead.id,
    newValue: [
      `Consent form submitted`,
      response_data.parent_name ? `by ${response_data.parent_name}` : null,
      response_data.child_name ? `for child: ${response_data.child_name}` : null,
      email ? `(${email})` : null,
      `— match status: ${matchStatus}`,
      matchResult?.candidate?.full_name ? `— candidate match: ${matchResult.candidate.full_name} (${matchResult.confidence} confidence)` : null,
    ].filter(Boolean).join(' '),
    newValues: {
      form_id: id,
      school_id: form.school_id,
      match_status: matchStatus,
      parent_name: response_data.parent_name ?? null,
      child_name: response_data.child_name ?? null,
      parent_email: email ?? null,
      match_confidence: matchResult?.confidence ?? null,
      match_candidate_name: matchResult?.candidate?.full_name ?? null,
      viewer: 'Public consent form submission (anonymous visitor)',
    },
    ip: null,
    userAgent: req.headers.get('user-agent'),
  });

  // Persist match suggestions as relational candidate slots — never as live child_matches.
  try {
    if (needsReview && matchResult?.candidate) {
      await upsertLeadChildLink(sb as any, {
        lead_id: lead.id,
        child_index: 0,
        student_portal_user_id: matchResult.candidate.id,
        student_name: matchResult.candidate.full_name,
        student_class: matchResult.candidate.section_class,
        link_status: 'candidate',
        source: 'match_review',
        linked_by: null,
      });
    }
    for (const entry of childMatchEntries) {
      await upsertLeadChildLink(sb as any, {
        lead_id: lead.id,
        child_index: entry.childIndex,
        student_portal_user_id: entry.studentId,
        student_name: entry.studentName,
        student_class: entry.studentClass,
        link_status: 'candidate',
        source: 'match_review',
        linked_by: null,
      });
    }
  } catch { /* non-fatal — staff can still review via match_candidate_id */ }

  // Auto-link existing students when parent ownership + name plausibly match (fixes spelling, no duplicate account).
  let autoMatched = false;
  if (matchResult?.candidate && isAutoResolvableConsentMatch({
    submittedName: response_data.child_name,
    candidateName: matchResult.candidate.full_name,
    parentMatch: matchResult.candidate.parentMatch,
    confidence: matchResult.confidence,
    parentPortalVerified,
  })) {
    const autoResult = await resolveConsentLeadMatch(sb as any, {
      leadId: lead.id,
      studentPortalUserId: matchResult.candidate.id,
      childIndex: 0,
      actorId: null,
      source: 'auto',
      parentMatch: matchResult.candidate.parentMatch,
      confidence: matchResult.confidence,
    });
    if (autoResult.ok) {
      autoMatched = true;
      needsReview = false;
      try {
        await (sb as any).from('form_leads').update({
          match_status: 'auto_matched',
          match_notes: `${matchNotes ?? ''}\nAuto-linked to existing student; consent name applied for spelling.`.trim(),
        }).eq('id', lead.id);
      } catch { /* non-fatal */ }
    }
  }

  // ── Back-patch is unnecessary: match suggestions live in form_lead_child_links.

  const schoolData = (form as any).schools as { name?: string; email?: string } | null;
  const schoolName  = schoolData?.name ?? 'Rillcod Technologies';
  const appUrl      = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const toEmail     = email?.trim();
  const isExistingParent = Boolean(response_data.is_existing_parent);
  const now         = new Date().toISOString();

  // Extract multi-child array (children[0] == legacy primary fields, already stored)
  const childrenArr = Array.isArray(response_data.children) && response_data.children.length > 1
    ? (response_data.children as Array<Record<string, string>>)
    : null;

  // Human-readable children list for messages e.g. "Ayo, Bisi and Chidi"
  function listChildNames(arr: Array<Record<string, string>> | null, primary: string): string {
    if (!arr || arr.length === 0) return primary || 'your child';
    const names = arr.map(c => c.name).filter(Boolean);
    if (names.length === 0) return primary || 'your child';
    if (names.length === 1) return names[0];
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }
  const allChildrenDisplay = listChildNames(childrenArr, response_data.child_name);

  // ── CRM reconciliation (primary child / child 1) ──────────────────────────
  const { contactId, prospectId } = await reconcileLeadWithCrm(sb, {
    parentName:       response_data.parent_name || 'Parent/Guardian',
    parentEmail:      response_data.parent_email || toEmail || '',
    parentWhatsapp:   response_data.parent_whatsapp || '',
    childName:        response_data.child_name,
    childAge:         response_data.child_age || '',
    childGender:      response_data.child_gender || undefined,
    childClass:       response_data.child_class || '',
    programCategory:  response_data.program_category || '',
    currentSchool:    child_current_school?.trim() || null,
    matchedSchoolId:  matched_school_id,
    schoolId:         form.school_id ?? null,
    schoolName,
    formId:           lead!.id,
    formTitle:        form.title,
    referralSource:    response_data.referral_source,
    preferredSchedule: response_data.preferred_schedule,
    hearAboutUs:       response_data.hear_about_us,
    whatsappOptIn:       response_data.whatsapp_consent === true,
    marketingEmailOptIn: response_data.marketing_email_consent === true,
    priorCoding:       response_data.prior_coding,
    priorPlatform:     response_data.prior_platform,
    devices:           Array.isArray(response_data.devices) ? response_data.devices : undefined,
    learningGoal:      response_data.learning_goal,
    specialNotes:      response_data.special_notes,
  });

  if (contactId || prospectId) {
    await (sb as any).from('form_leads')
      .update({ contact_id: contactId, prospect_id: prospectId })
      .eq('id', lead!.id);
  }

  // ── Additional children (multi-child) → CRM entries ─────────────────────
  if (childrenArr && contactId) {
    for (const child of childrenArr.slice(1)) {
      if (!child.name?.trim()) continue;
      const cLabel =
        child.program === 'young_innovators' ? 'Young Innovators (PRY · Ages 5–10)' :
        child.program === 'teen_developers'  ? 'Teen Developers (SEC · Ages 11–19)' :
        child.program || null;

      // Add child to contact book children array
      try {
        const { data: cb } = await (sb as any)
          .from('customer_contact_book').select('metadata').eq('id', contactId).single();
        if (cb) {
          const meta = (cb.metadata as Record<string, unknown>) ?? {};
          const kids = Array.isArray(meta.children) ? meta.children as Record<string, unknown>[] : [];
          const entry = { name: child.name, age: child.age, class: child.class, program: cLabel, school: child.school };
          const idx = kids.findIndex(k => String(k.name ?? '').toLowerCase() === child.name.toLowerCase());
          if (idx >= 0) kids[idx] = { ...kids[idx], ...entry };
          else kids.push(entry);
          await (sb as any).from('customer_contact_book')
            .update({ metadata: { ...meta, children: kids }, updated_at: now })
            .eq('id', contactId);
        }
      } catch { /* non-fatal */ }

      // Create / update prospective_students row for this child
      try {
        const pEmail = (response_data.parent_email || toEmail || '').trim().toLowerCase();
        const pPhone = (response_data.parent_whatsapp || '').replace(/\D/g, '') || null;
        let existingP: { id: string } | null = null;
        if (pEmail) {
          const { data } = await (sb as any)
            .from('prospective_students').select('id')
            .eq('parent_email', pEmail).ilike('full_name', child.name).maybeSingle();
          existingP = data;
        }
        const payload = {
          full_name:       child.name,
          email:           pEmail || `lead-${lead!.id}-${child.name.replace(/\s+/g, '-').toLowerCase()}@noemail.local`,
          age:             child.age ? parseInt(child.age, 10) : null,
          grade:           child.class || null,
          course_interest: cLabel,
          parent_name:     response_data.parent_name || 'Parent/Guardian',
          parent_email:    pEmail || null,
          parent_phone:    pPhone,
          school_id:       matched_school_id ?? form.school_id ?? null,
          school_name:     child.school || schoolName,
          status:          'enquiry',
          updated_at:      now,
        };
        if (existingP) {
          await (sb as any).from('prospective_students').update(payload).eq('id', existingP.id);
        } else {
          await (sb as any).from('prospective_students')
            .insert({ ...payload, created_at: now, is_active: true, is_deleted: false });
        }
      } catch { /* non-fatal */ }
    }
  }

  // ── Parent confirmation email (SMTP — send first) ─────────────────────────
  if (toEmail && toEmail.includes('@')) {
    try {
      await deliverConsentParentConfirmationEmail({
        toEmail,
        responseData: response_data,
        formTitle: form.title,
        schoolName,
        formType: form.form_type ?? 'general',
        appUrl,
        isExistingParent,
        childrenCount: childrenArr?.length,
        replyTo: SMTP_FROM_EMAIL,
      });
    } catch { /* non-fatal */ }
  }

  // ── Staff email + in-app notifications ────────────────────────────────────
  try {
    const { data: matchedSchool } = matched_school_id
      ? await sb.from('schools').select('name').eq('id', matched_school_id).single()
      : { data: null };

    await deliverConsentStaffLeadNotification({
      admin: sb as any,
      schoolId: form.school_id,
      leadId: lead!.id,
      schoolName,
      formTitle: form.title,
      staffEmail: schoolData?.email,
      parentReplyEmail: toEmail,
      responseData: response_data,
      childDisplay: allChildrenDisplay,
      childrenArr,
      needsReview,
      isExistingParent,
      matchConfidence: matchResult?.confidence,
      matchCandidateName: matchResult?.candidate.full_name,
      matchCandidateClass: matchResult?.candidate.section_class,
      autoMatched,
      childAge: response_data.child_age,
      childClass: response_data.child_class,
      programCategory: response_data.program_category,
      currentSchool: child_current_school?.trim() || undefined,
      matchedSchoolName: (matchedSchool as any)?.name ?? matchedSchoolName,
      appUrl,
    });
  } catch { /* non-fatal */ }

  // ── Immediate WhatsApp confirmation to parent ─────────────────────────────
  try {
    await deliverConsentParentWhatsAppAck({ responseData: response_data });
  } catch { /* non-fatal */ }

  // ── Staff follow-up task (CRM interaction) ────────────────────────────────
  try {
    const savedContactId = contactId;
    if (savedContactId) {
      const programme =
        response_data.program_category === 'young_innovators' ? 'Young Innovators' :
        response_data.program_category === 'teen_developers'  ? 'Teen Developers'  :
        response_data.program_category || 'coding programme';
      await (sb as any).from('crm_interactions').insert({
        contact_id:   savedContactId,
        contact_name: response_data.parent_name || 'Parent',
        contact_type: 'form_lead',
        type:         'task_followup',
        direction:    'internal',
        content:      `Follow-up task: Contact ${response_data.parent_name || 'parent'} about ${allChildrenDisplay}'s registration (${programme}${childrenArr ? ` · ${childrenArr.length} children` : ''}). Submitted: ${new Date().toLocaleDateString('en-GB')}`,
        created_at:   now,
      });
    }
  } catch { /* non-fatal */ }

  return NextResponse.json({ success: true, id: lead?.id, matchPending: needsReview });
}
