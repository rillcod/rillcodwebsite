import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// DELETE /api/newsletters/[id] — managers only; must own unless admin. Cascades deliveries.
export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = adminClient();
    const { data: caller } = await admin.from('portal_users').select('id, role').eq('id', user.id).single();
    if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const { id } = await context.params;
    const { data: nl } = await admin.from('newsletters').select('author_id').eq('id', id).maybeSingle();
    if (!nl) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (caller.role !== 'admin' && (nl as any).author_id !== caller.id) {
      return NextResponse.json({ error: 'You can only delete your own newsletters' }, { status: 403 });
    }
    await admin.from('newsletter_delivery').delete().eq('newsletter_id', id);
    const { error } = await admin.from('newsletters').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
