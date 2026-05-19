import { redirect } from 'next/navigation';

// School Directory has been merged into the CRM.
export default function DirectoryPage() {
  redirect('/dashboard/crm');
}
