import { redirect } from 'next/navigation';

/** Legacy governance terminology now resolves to the humanised Studio workflow. */
export default function CurriculumGovernanceRedirect() {
  redirect('/dashboard/academic/distribute');
}
