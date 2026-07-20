import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// School Directory has been merged into CRM / Office Center Retention.
export default async function DirectoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.role === 'admin') {
      redirect('/dashboard/office?workspace=crm');
    }
  }
  redirect('/dashboard/crm');
}
