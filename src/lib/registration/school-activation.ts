import { deliverPortalCredentials } from '@/lib/credentials/deliver-portal-credentials';
import { portalAppUrl } from '@/lib/credentials/app-url';

type AdminClient = { from: (table: string) => any; auth: { admin: any } };

export async function sendSchoolPartnershipActivation(
  admin: AdminClient,
  input: {
    schoolId: string;
    schoolName: string;
    contactName: string;
    email: string;
    portalUserId: string;
    tempPassword: string;
    force?: boolean;
  },
): Promise<{ email: boolean }> {
  const to = input.email.trim().toLowerCase();
  const externalId = `school_activation:${input.schoolId}`;

  if (!input.force) {
    const { data: previousDelivery } = await admin
      .from('notifications')
      .select('id')
      .eq('external_id', externalId)
      .eq('delivery_status', 'sent')
      .limit(1)
      .maybeSingle();
    if (previousDelivery) {
      return { email: true };
    }
  }

  const appUrl = portalAppUrl();
  const delivery = await deliverPortalCredentials(admin as any, {
    parent: {
      userId: input.portalUserId,
      email: to,
      displayName: input.contactName,
      role: 'school',
      storedPassword: input.tempPassword,
    },
    parentName: input.contactName,
    schoolName: input.schoolName,
    schoolId: input.schoolId,
    resetPolicy: 'if-never-signed-in',
    showParentCredentials: true,
    showParentEmailAlways: true,
    emailChannel: 'external',
    emailSubject: `Your Rillcod School Portal is active — ${input.schoolName}`,
    title: 'Welcome to the Rillcod School Portal',
    bodyIntro: `Dear ${input.contactName}, <strong style="color:#fff;">${input.schoolName}</strong> is approved on Rillcod. Use the login below to manage your school dashboard, students, and billing.`,
    appendBodyHtml: `<p style="margin:16px 0 0;font-size:12px;color:#71717a;">Sign in at <a href="${appUrl}/login" style="color:#7c3aed;">${appUrl}/login</a> with the School Administrator role.</p>`,
  });

  if (delivery.email) {
    try {
      await admin.from('notifications').insert({
        user_id: null,
        title: 'School partnership activation delivered',
        message: `${input.schoolName} | ${to}`,
        type: 'success',
        notification_channel: 'email',
        delivery_status: 'sent',
        retry_count: 0,
        sent_at: new Date().toISOString(),
        external_id: externalId,
        action_url: '/dashboard/schools',
      });
    } catch (trackErr) {
      console.error('[school-activation] delivery tracking failed:', trackErr);
    }
  }

  return { email: delivery.email };
}
