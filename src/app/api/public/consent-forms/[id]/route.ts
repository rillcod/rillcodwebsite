import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notificationsService } from '@/services/notifications.service';
import { buildFormLeadConfirmationEmail, buildLeadNotificationEmail } from '@/lib/email/rillcod-transactional-email';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { resolveStudentRowId, syncExplicitParentStudentLink } from '@/lib/parents/links';
import { reconcileLeadWithCrm } from '@/lib/crm/reconcile-lead';

export const dynamic = 'force-dynamic';

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
  email: string;
  phone: string | null;
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

  const { data: students } = await (sb as any)
    .from('portal_users')
    .select('id, full_name, section_class, school_id, email, phone')
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
    if (nameOv === 0) continue; // must share at least one name token

    const classOv = childClass && student.section_class
      ? classOverlap(childClass, student.section_class)
      : 0;

    // This specific student is the submitting parent's child (linked or by email).
    const directParentMatch = parentChildUserIds.has(student.id);

    let score = nameOv * 10 + classOv * 5;
    if (directParentMatch) score += 20;

    if (!best || score > best.score) {
      best = {
        id:           student.id,
        full_name:    student.full_name,
        section_class: student.section_class,
        school_id:    student.school_id,
        email:        student.email,
        phone:        student.phone,
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
    .select('id, title, body, form_type, due_date, school_id, view_count, schools(name)')
    .eq('id', id).eq('is_public', true).single();
  if (error || !form) return NextResponse.json({ error: 'Form not found or not public' }, { status: 404 });

  // Fire-and-forget view increment (non-blocking)
  (sb as any)
    .from('consent_forms')
    .update({ view_count: (form as any).view_count ? (form as any).view_count + 1 : 1 })
    .eq('id', id)
    .then(() => {})
    .catch(() => {});

  return NextResponse.json({ data: form });
}

// POST /api/public/consent-forms/[id]
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const sb = adminClient();

  const { data: form, error: formErr } = await sb
    .from('consent_forms')
    .select('id, title, school_id, form_type, is_public, schools(name, email)')
    .eq('id', id).single();

  if (formErr || !form || !form.is_public) {
    return NextResponse.json({ error: 'Form not found or no longer accepting submissions' }, { status: 404 });
  }

  // Simple IP-based rate limiting — max 5 submissions per IP per 10 minutes
  const clientIp = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (clientIp !== 'unknown') {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await (sb as any)
      .from('form_leads')
      .select('id', { count: 'exact', head: true })
      .eq('form_id', id)
      .gte('submitted_at', tenMinutesAgo)
      .eq('response_data->>_ip', clientIp);
    if ((count ?? 0) >= 5) {
      return NextResponse.json({ error: 'Too many submissions. Please try again later.' }, { status: 429 });
    }
  }

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

  // Stamp the IP into response_data for rate-limit tracking (not displayed to users)
  const response_data = { ...rawData, _ip: clientIp };

  // Duplicate detection — same email + child name + form within 30 days
  const parentEmail = (rawData.parent_email || email || '').trim().toLowerCase();
  if (parentEmail) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await (sb as any)
      .from('form_leads')
      .select('id, submitted_at')
      .eq('form_id', id)
      .eq('email', parentEmail)
      .gte('submitted_at', thirtyDaysAgo)
      .maybeSingle();
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

  // High confidence unlocks quick-check immediately; medium confidence still
  // goes to staff review to avoid linking the wrong child.
  const autoApproved = matchResult?.confidence === 'high';
  const needsReview = !!matchResult && matchResult.confidence === 'medium';
  const matchStatus = autoApproved ? 'approved' : needsReview ? 'pending_review' : 'new_prospect';

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

  // Enrich response_data with child_matches if any were found
  const enrichedResponseData = childMatchEntries.length > 0
    ? { ...response_data, child_matches: childMatchEntries }
    : response_data;

  const parentEmailForMatch = (response_data.parent_email || email || '').trim().toLowerCase();
  const { data: matchedParent } = parentEmailForMatch
    ? await (sb as any)
      .from('portal_users')
      .select('id')
      .eq('role', 'parent')
      .ilike('email', parentEmailForMatch)
      .maybeSingle()
    : { data: null };

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
      matched_student_id: autoApproved ? matchResult!.candidate.id : null,
      matched_parent_id:  autoApproved ? matchedParent?.id ?? null : null,
      match_confidence:   matchResult?.confidence ?? null,
      match_notes:        matchNotes,
    })
    .select()
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') return NextResponse.json({ success: true, duplicate: true });
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  if (autoApproved && matchedParent?.id && matchResult?.candidate.id) {
    try {
      const studentRowId = await resolveStudentRowId(sb as any, matchResult.candidate.id);
      if (studentRowId) await syncExplicitParentStudentLink(sb as any, matchedParent.id, studentRowId);
    } catch {
      // Non-fatal: matched_student_id still unlocks quick-check.
    }
  }

  // ── Back-patch child_matches onto the saved lead (post-insert update) ─────
  if (childMatchEntries.length > 0 && lead?.id) {
    try {
      await (sb as any)
        .from('form_leads')
        .update({ response_data: enrichedResponseData })
        .eq('id', lead.id);
    } catch { /* non-fatal */ }
  }

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
      const html = buildFormLeadConfirmationEmail({
        parentName:      response_data.parent_name || 'Parent/Guardian',
        childName:       allChildrenDisplay,
        programCategory: childrenArr ? undefined : response_data.program_category,
        formTitle:       form.title, schoolName,
        formType:        form.form_type ?? 'general', appUrl,
      });
      const subject = isExistingParent
        ? `↩️ Welcome Back! We've Received Your Update — Rillcod Technologies`
        : childrenArr
          ? `✅ Registration Received for ${childrenArr.length} Children — Rillcod Technologies`
          : `✅ Registration Received — Rillcod Technologies`;
      await notificationsService.sendEmail('system', {
        to: toEmail, subject, html,
        fromName: 'Rillcod Technologies', replyTo: 'support@rillcod.com',
      });
    } catch { /* non-fatal */ }
  }

  // ── Staff email + in-app notifications ────────────────────────────────────
  try {
    const { data: matchedSchool } = matched_school_id
      ? await sb.from('schools').select('name').eq('id', matched_school_id).single()
      : { data: null };

    const matchInfo = needsReview && matchResult
      ? `\n\n⚠️ POSSIBLE EXISTING STUDENT MATCH (${matchResult.confidence.toUpperCase()} confidence): "${matchResult.candidate.full_name}" — ${matchResult.candidate.section_class ?? 'no class'}. Please review in dashboard.`
      : '';

    const childDisplay = allChildrenDisplay;
    const childCountNote = childrenArr ? ` (${childrenArr.length} children)` : '';

    const notifTitle = needsReview
      ? `⚠️ Match Needed: ${childDisplay}`
      : isExistingParent
      ? `↩️ Returning Family: ${childDisplay}`
      : `🔔 New Enquiry: ${childDisplay}`;

    const notifMessage = needsReview
      ? `"${childDisplay}" (${matchResult!.confidence} confidence) may be an existing student. Review & approve in Consent Forms.`
      : isExistingParent
      ? `${response_data.parent_name} (existing parent) submitted ${form.title} for ${childDisplay}${childCountNote}.`
      : `New enquiry from ${response_data.parent_name} via "${form.title}". Children: ${childDisplay}${childCountNote}.`;

    const emailSubject = needsReview
      ? `🔔⚠️ Match Needed: ${childDisplay} — ${form.title}`
      : isExistingParent
      ? `↩️ Returning Family: ${childDisplay} — ${form.title}`
      : `🔔 New Enquiry: ${childDisplay}${childCountNote} — ${form.title}`;

    // Staff email
    const staffEmail = schoolData?.email;
    if (staffEmail && staffEmail.includes('@')) {
      const extraChildrenNote = childrenArr && childrenArr.length > 1
        ? `\n\nADDITIONAL CHILDREN (${childrenArr.length - 1} more):\n` +
          childrenArr.slice(1).map((c, i) =>
            `Child ${i + 2}: ${c.name || '—'} | ${c.gender || '—'} | Age ${c.age || '—'} | ${c.class || '—'} | ${c.program || '—'}`
          ).join('\n')
        : '';
      const html = buildLeadNotificationEmail({
        schoolName, formTitle: form.title + matchInfo + extraChildrenNote,
        childName:         childDisplay,
        childAge:          response_data.child_age,
        childClass:        response_data.child_class,
        programCategory:   response_data.program_category,
        parentName:        response_data.parent_name,
        parentWhatsapp:    response_data.parent_whatsapp,
        parentEmail:       response_data.parent_email || toEmail,
        currentSchool:     child_current_school?.trim() || undefined,
        matchedSchoolName: (matchedSchool as any)?.name ?? matchedSchoolName,
        dashboardUrl:      appUrl,
      });
      await notificationsService.sendEmail('system', {
        to: staffEmail, subject: emailSubject, html,
        fromName: 'Rillcod Forms', replyTo: toEmail || 'support@rillcod.com',
      });
    }

    // In-app notifications — school staff + platform admins (null school_id)
    if (form.school_id) {
      const [{ data: schoolStaff }, { data: platformAdmins }] = await Promise.all([
        (sb as any)
          .from('portal_users').select('id')
          .in('role', ['teacher', 'school'])
          .eq('school_id', form.school_id)
          .eq('is_active', true).eq('is_deleted', false),
        (sb as any)
          .from('portal_users').select('id')
          .eq('role', 'admin')
          .eq('is_active', true).eq('is_deleted', false),
      ]);
      const staffUsers = [...(schoolStaff ?? []), ...(platformAdmins ?? [])];

      if (staffUsers && staffUsers.length > 0) {
        const notifType = needsReview ? 'warning' : 'info';
        const notifRows = (staffUsers as { id: string }[]).map(u => ({
          user_id:    u.id,
          title:      notifTitle,
          message:    notifMessage,
          type:       notifType,
          is_read:    false,
          created_at: now,
          updated_at: now,
        }));
        await (sb as any).from('notifications').insert(notifRows);

        // Supabase Realtime broadcast for live popup
        for (const u of staffUsers as { id: string }[]) {
          try {
            await sb.channel(`popup-notifications-${u.id}`).send({
              type: 'broadcast',
              event: 'notification:popup',
              payload: {
                id:          `lead-${lead!.id}-${u.id}`,
                title:       notifTitle,
                message:     notifMessage,
                type:        notifType,
                timestamp:   now,
                priority:    needsReview ? 'high' : 'normal',
                autoClose:   needsReview ? 0 : 6000,
                persistent:  needsReview,
                actionLabel: 'View Leads',
                actionUrl:   '/dashboard/consent-forms',
                category:    'form_lead',
                sound:       needsReview,
              },
            });
          } catch { /* non-fatal */ }
        }
      }
    }
  } catch { /* non-fatal */ }

  // ── Immediate WhatsApp confirmation to parent ─────────────────────────────
  try {
    const parentWhatsapp = response_data.parent_whatsapp;
    if (parentWhatsapp?.trim()) {
      let waMsg: string;
      if (childrenArr && childrenArr.length > 1) {
        const childLines = childrenArr.map((c, i) => {
          const prog = c.program === 'young_innovators' ? 'Young Innovators' :
                       c.program === 'teen_developers'  ? 'Teen Developers'  : c.program || 'coding programme';
          return `${i + 1}. ${c.name} — ${prog}`;
        }).join('\n');
        waMsg = `Hi ${response_data.parent_name || 'there'}! 🎉 We've received registrations for ${childrenArr.length} children at Rillcod Technologies:\n\n${childLines}\n\nOur team will reach out within 24 hours to confirm placements and share next steps.\n\nQuestions? Call us: +234 811 660 0091\nReply STOP to opt out.`;
      } else {
        const programme =
          response_data.program_category === 'young_innovators' ? 'Young Innovators' :
          response_data.program_category === 'teen_developers'  ? 'Teen Developers'  :
          response_data.program_category || 'coding programme';
        waMsg = `Hi ${response_data.parent_name || 'there'}! 🎉 We've received ${response_data.child_name}'s registration for ${programme} at Rillcod Technologies.\n\nOur team will reach out within 24 hours to confirm your child's placement and share next steps.\n\nQuestions? Call us: +234 811 660 0091\nReply STOP to opt out.`;
      }
      await sendWhatsApp(parentWhatsapp, waMsg);
    }
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
