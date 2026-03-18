import { NextResponse } from 'next/server';
import { notificationsService } from '@/services/notifications.service';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = body?.email as string | undefined;
    const status = body?.status as 'approved' | 'rejected' | undefined;
    const schoolName = body?.schoolName as string | undefined;

    if (!email || !status) {
      return NextResponse.json({ error: 'Email and status are required' }, { status: 400 });
    }

    const subject = status === 'approved'
      ? 'Your school registration has been approved'
      : 'Your school registration has been reviewed';

    const html = `
      <p>Hello${schoolName ? ` ${schoolName}` : ''},</p>
      <p>Your school registration has been <strong>${status}</strong>.</p>
      ${status === 'approved'
        ? '<p>Our team will contact you shortly with next steps.</p>'
        : '<p>If you believe this was a mistake, please reply to this email.</p>'}
      <p>Thank you,<br/>Rillcod Technologies</p>
    `;

    await notificationsService.sendExternalEmail({
      to: email,
      subject,
      html,
    });

    return NextResponse.json({ message: 'Notification sent' });
  } catch (error) {
    console.error('Failed to send school approval notification:', error);
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}
