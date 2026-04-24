import { createClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('portal_users')
      .select('id, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Use optimized RPC function for activity feed
    const { data: activities, error } = await supabase.rpc('get_dashboard_activity', {
      user_role: profile.role,
      user_uuid: profile.id,
      activity_limit: 6,
    });

    if (error) {
      console.error('Activity fetch error:', error);
      return NextResponse.json({ activities: [] });
    }

    return NextResponse.json({ activities: activities || [] });
  } catch (error: any) {
    console.error('Dashboard activity error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch dashboard activity' },
      { status: 500 }
    );
  }
}
