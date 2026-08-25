import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// School Directory was merged into CRM / Office Center. This route still
// exists so old bookmarks do not 404. Send each role to the book they are
// actually allowed to open — teachers are denied CRM, so that bounce looked
// like a permission bug.
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
    if (profile?.role === 'school') {
      redirect('/dashboard/records');
    }
    if (profile?.role === 'teacher') {
      redirect('/dashboard/students');
    }
  }
  redirect('/dashboard');
}
