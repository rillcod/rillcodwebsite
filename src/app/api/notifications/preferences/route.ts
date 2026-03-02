import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { preferencesService } from '@/services/preferences.service';
import { withValidation } from '@/proxies/validation.proxy';

const updatePrefsSchema = z.object({
    email_enabled: z.boolean().optional(),
    sms_enabled: z.boolean().optional(),
    push_enabled: z.boolean().optional(),
    assignment_reminders: z.boolean().optional(),
    grade_notifications: z.boolean().optional(),
    announcement_notifications: z.boolean().optional(),
    discussion_replies: z.boolean().optional(),
    marketing_emails: z.boolean().optional(),
});

async function getHandler(req: Request, ctx: ApiContext) {
    const prefs = await preferencesService.getPreferences(ctx.user!.id);
    return NextResponse.json({ success: true, data: prefs });
}

async function putHandler(req: Request, ctx: ApiContext) {
    const { data, errorResponse } = await withValidation(req as any, updatePrefsSchema);
    if (errorResponse) return errorResponse;

    await preferencesService.updatePreferences(ctx.user!.id, data!);
    return NextResponse.json({ success: true, message: 'Preferences updated' });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler)(req, ctx);
export const PUT = (req: any, ctx: any) => withApiProxy(putHandler)(req, ctx);
