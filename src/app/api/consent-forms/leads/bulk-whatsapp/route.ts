import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { sendWhatsApp } from '@/lib/whatsapp/send';

export const dynamic = 'force-dynamic';

const MAX_LEADS    = 100;
const MAX_MSG_LEN  = 1000;

function adminClient() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// POST /api/consent-forms/leads/bulk-whatsapp
// Body: { leadIds: string[], message: string }  — max 100 leads, message max 1000 chars
// Sends a personalised WhatsApp message to each lead's parent.
// {{name}} in message is replaced with parent_name from response_data.
// Logs each send in crm_interactions if the lead has a contact_id.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users').select('role, school_id, id, full_name').eq('id', user.id).single();
  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { leadIds?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { leadIds, message } = body;

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return NextResponse.json({ error: 'leadIds must be a non-empty array' }, { status: 400 });
  }
  if (leadIds.length > MAX_LEADS) {
    return NextResponse.json({ error: `Maximum ${MAX_LEADS} leads per request` }, { status: 400 });
  }
  if (typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }
  if (message.length > MAX_MSG_LEN) {
    return NextResponse.json({ error: `message must be ${MAX_MSG_LEN} characters or fewer` }, { status: 400 });
  }

  const sb = adminClient();

  // Fetch all leads in one query
  const { data: leads, error: leadsErr } = await (sb as any)
    .from('form_leads')
    .select('id, school_id, response_data, contact_id')
    .in('id', leadIds);

  if (leadsErr) {
    return NextResponse.json({ error: leadsErr.message }, { status: 500 });
  }

  const results = {
    sent:   0,
    failed: 0,
    total:  (leads ?? []).length,
  };

  const now = new Date().toISOString();

  for (const lead of (leads ?? [])) {
    // School-scoped gate
    if (profile.role !== 'admin' && lead.school_id !== profile.school_id) {
      results.failed++;
      continue;
    }

    const rd          = (lead.response_data ?? {}) as Record<string, string>;
    const parentPhone = (rd.parent_whatsapp || rd.parent_phone || '').trim();
    const parentName  = (rd.parent_name || '').trim() || 'Parent/Guardian';

    if (!parentPhone) {
      results.failed++;
      continue;
    }

    // Personalise the message
    const personalised = message.replace(/\{\{name\}\}/gi, parentName);

    try {
      const ok = await sendWhatsApp(parentPhone, personalised);

      if (ok) {
        results.sent++;

        // Log in crm_interactions if the lead is linked to a CRM contact
        const contactId = lead.contact_id as string | null;
        if (contactId) {
          try {
            await (sb as any).from('crm_interactions').insert({
              contact_id:   contactId,
              contact_name: parentName,
              contact_type: 'form_lead',
              type:         'whatsapp',
              direction:    'outbound',
              content:      personalised,
              staff_id:     profile.id,
              staff_name:   profile.full_name,
              created_at:   now,
            });
          } catch { /* non-fatal: interaction log failure must not break the send */ }
        }
      } else {
        results.failed++;
      }
    } catch {
      results.failed++;
    }
  }

  return NextResponse.json(results);
}
