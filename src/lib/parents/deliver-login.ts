import { sendWhatsApp } from '@/lib/whatsapp/send';
import { notificationsService } from '@/services/notifications.service';
import { SMTP_FROM_EMAIL } from '@/config/brand';

export interface LoginDelivery { email: boolean; whatsapp: boolean }

/**
 * Deliver a parent portal login by email + WhatsApp. Single source so every flow that
 * hands a parent their credentials uses the same channels, link and wording. Each
 * channel is attempted independently; returns which ones landed.
 */
export async function deliverParentLogin(input: {
  email: string;
  phone: string | null;
  fullName: string;
  password: string;
  schoolName?: string | null;
}): Promise<LoginDelivery> {
  const { email, phone, fullName, password, schoolName } = input;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://academy.rillcod.com').replace(/\/$/, '');
  const loginUrl = `${appUrl}/login?type=parent&email=${encodeURIComponent(email)}`;

  let whatsapp = false;
  if (phone) {
    const waMsg =
      `Rillcod parent account for ${fullName}${schoolName ? ` (${schoolName})` : ''}.\n` +
      `Login: ${email}\nPassword: ${password}\nSign in: ${loginUrl}\n\n` +
      `You can change your password after signing in.`;
    whatsapp = await sendWhatsApp(phone, waMsg);
  }

  let emailSent = false;
  try {
    await notificationsService.sendExternalEmail({
      to: email,
      subject: 'Your Rillcod parent account',
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111;line-height:1.6">
        <p>Hello ${fullName}, your Rillcod parent account is ready${schoolName ? ` for ${schoolName}` : ''}.</p>
        <p><strong>Email:</strong> ${email}<br/><strong>Password:</strong> ${password}</p>
        <p><a href="${loginUrl}">Sign in to your parent portal</a></p>
        <p style="color:#666;font-size:13px">You can change your password after signing in.</p>
      </div>`,
      fromName: schoolName ? `${schoolName} via Rillcod Technologies` : 'Rillcod Technologies',
      fromEmail: SMTP_FROM_EMAIL,
    });
    emailSent = true;
  } catch (e) {
    console.error('[deliverParentLogin] email failed:', e);
  }

  return { email: emailSent, whatsapp };
}
