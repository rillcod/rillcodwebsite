import { redirect } from 'next/navigation';

export default function StudentLoginRedirect() {
  redirect('/login?type=student');
}
