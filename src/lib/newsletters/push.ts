import type { SupabaseClient } from '@supabase/supabase-js';

type AnySupabase = SupabaseClient<any>;
export type NewsletterTarget = 'all' | 'students' | 'teachers' | 'schools';

const NO_MATCH = '00000000-0000-0000-0000-000000000000';

/** Schools a manager may broadcast to: admin = everywhere (null), school = own, teacher = assigned. */
export async function authorSchoolScope(
  admin: AnySupabase,
  author: { id: string; role: string; school_id: string | null },
): Promise<string[] | null> {
  if (author.role === 'admin') return null; // no restriction
  const ids = new Set<string>();
  if (author.school_id) ids.add(author.school_id);
  if (author.role === 'teacher') {
    const { data } = await admin.from('teacher_schools').select('school_id').eq('teacher_id', author.id);
    (data ?? []).forEach((r: any) => r.school_id && ids.add(r.school_id));
  }
  return [...ids];
}

/** Resolve recipient portal_user ids for a target audience, within the author's school scope. */
export async function resolveRecipients(
  admin: AnySupabase,
  opts: { target: NewsletterTarget; schoolScope: string[] | null },
): Promise<string[]> {
  let q = admin.from('portal_users').select('id').eq('is_active', true);
  if (opts.target === 'students') q = q.eq('role', 'student');
  else if (opts.target === 'teachers') q = q.eq('role', 'teacher');
  else if (opts.target === 'schools') q = q.eq('role', 'school');
  else q = q.in('role', ['student', 'teacher', 'school', 'parent']);

  if (opts.schoolScope !== null) {
    q = opts.schoolScope.length ? q.in('school_id', opts.schoolScope) : q.in('id', [NO_MATCH]);
  }
  const { data } = await q;
  return (data ?? []).map((u: any) => u.id);
}

const isRealEmail = (e?: string | null) => {
  const x = (e || '').trim().toLowerCase();
  return !!x && !x.endsWith('@rillcod.com') && !x.endsWith('@noemail.local') && x.includes('@');
};

const chunk = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

/**
 * Deliver a newsletter to a set of users: upsert in-app deliveries (idempotent on the
 * (newsletter_id, user_id) unique index, chunked so a big blast never exceeds limits), mark the
 * newsletter published, and optionally email recipients who have a real inbox (best-effort).
 */
export async function deliverNewsletter(
  admin: AnySupabase,
  params: { newsletterId: string; userIds: string[]; sendEmail?: boolean },
): Promise<{ delivered: number; emailed: number; failed: number }> {
  const { newsletterId, userIds } = params;
  let delivered = 0;
  let failed = 0;

  for (const batch of chunk(userIds, 500)) {
    const rows = batch.map((uid) => ({ newsletter_id: newsletterId, user_id: uid, is_viewed: false }));
    const { error } = await admin
      .from('newsletter_delivery')
      .upsert(rows, { onConflict: 'newsletter_id,user_id', ignoreDuplicates: true });
    if (error) failed += batch.length; else delivered += batch.length;
  }

  await admin.from('newsletters')
    .update({ status: 'published', published_at: new Date().toISOString(), scheduled_for: null })
    .eq('id', newsletterId);

  let emailed = 0;
  if (params.sendEmail && userIds.length) {
    try {
      const { data: nl } = await admin.from('newsletters').select('title, content').eq('id', newsletterId).single();
      const { notificationsService } = await import('@/services/notifications.service');
      const { buildAnnouncementEmail } = await import('@/lib/email/rillcod-transactional-email');
      const title = (nl as any)?.title || 'Rillcod Academy Newsletter';
      // Plain-text body for email (the announcement template paragraph-wraps it).
      const plain = String((nl as any)?.content || '')
        .replace(/^#{1,6}\s+/gm, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1').replace(/^[*-]\s+/gm, '• ').replace(/\[(.+?)\]\(.+?\)/g, '$1').trim();
      const portalUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://academy.rillcod.com') + '/dashboard/newsletters';
      // Only recipients with a real inbox (student @rillcod logins have none).
      const recipients: { name: string; email: string }[] = [];
      for (const ids of chunk(userIds, 300)) {
        const { data: us } = await admin.from('portal_users').select('full_name, email').in('id', ids);
        for (const u of us ?? []) if (isRealEmail((u as any).email)) recipients.push({ name: (u as any).full_name || 'there', email: (u as any).email });
      }
      for (const grp of chunk(recipients, 20)) {
        const results = await Promise.allSettled(grp.map((r) =>
          notificationsService.sendExternalEmail({
            to: r.email,
            subject: title,
            html: buildAnnouncementEmail({ recipientName: r.name, schoolName: 'Rillcod Technologies', announcementTitle: title, body: plain, portalUrl }),
          }),
        ));
        emailed += results.filter((x) => x.status === 'fulfilled').length;
      }
    } catch {
      /* email is best-effort — in-app delivery already succeeded */
    }
  }

  return { delivered, emailed, failed };
}

/**
 * Publish every newsletter whose scheduled_for has passed, delivering to the stored target with
 * the author's school scope. Idempotent (upsert on the delivery unique index) so it's safe to
 * call from any cron — including piggybacking on an existing frequent sweep. Returns how many
 * were published.
 */
export async function publishDueNewsletters(admin: AnySupabase): Promise<{ count: number }> {
  const { data: due } = await admin
    .from('newsletters')
    .select('id, author_id, scheduled_target, scheduled_send_email')
    .eq('status', 'scheduled')
    .lte('scheduled_for', new Date().toISOString())
    .limit(50);

  let count = 0;
  for (const nl of due ?? []) {
    const { data: author } = await admin.from('portal_users')
      .select('id, role, school_id').eq('id', (nl as any).author_id).maybeSingle();
    const scope = author ? await authorSchoolScope(admin, author as any) : null;
    const target = ((nl as any).scheduled_target || 'all') as NewsletterTarget;
    const userIds = await resolveRecipients(admin, { target, schoolScope: scope });
    if (userIds.length === 0) {
      // Publish anyway so it doesn't loop forever on an empty audience.
      await admin.from('newsletters')
        .update({ status: 'published', published_at: new Date().toISOString(), scheduled_for: null })
        .eq('id', (nl as any).id);
      continue;
    }
    await deliverNewsletter(admin, { newsletterId: (nl as any).id, userIds, sendEmail: (nl as any).scheduled_send_email === true });
    count++;
  }
  return { count };
}
