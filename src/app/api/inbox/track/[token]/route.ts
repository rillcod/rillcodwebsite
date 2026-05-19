import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 1×1 transparent GIF — returned for every request so email clients don't show broken image
const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function decodeToken(raw: string): { reportId?: string; email?: string; type?: string } | null {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf-8');
    return JSON.parse(json);
  } catch {
    try {
      const json = Buffer.from(raw, 'base64').toString('utf-8');
      return JSON.parse(json);
    } catch {
      return null;
    }
  }
}

// GET /api/inbox/track/[token]
// Logs an email open event and returns a 1×1 transparent GIF.
// Token is base64url(JSON.stringify({ reportId, email, type }))
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const payload = decodeToken(token);

  if (payload?.reportId) {
    (async () => {
      const db = adminClient();

      if (payload.type === 'report') {
        // Log open in report metadata
        const { data: row } = await db
          .from('student_progress_reports')
          .select('id')
          .eq('id', payload.reportId)
          .maybeSingle();
        if (row) {
          await (db as any)
            .from('student_progress_reports')
            .update({
              updated_at: new Date().toISOString(),
            })
            .eq('id', payload.reportId);

          // Insert an open-event row into email_events if the table exists, else skip
          await (db as any)
            .from('email_events')
            .insert({
              report_id: payload.reportId,
              event:     'opened',
              email:     payload.email || null,
              occurred_at: new Date().toISOString(),
            })
            .then(() => null)
            .catch(() => null);
        }
      }
    })().catch(() => null);
  }

  return new NextResponse(PIXEL_GIF, {
    status: 200,
    headers: {
      'Content-Type':  'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma':        'no-cache',
      'Expires':       '0',
    },
  });
}
