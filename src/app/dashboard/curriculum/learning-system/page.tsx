import { redirect } from 'next/navigation';

/** Legacy technical map now resolves to the single humanised admin workspace. */
export default function LearningSystemRedirect() {
  redirect('/dashboard/academic-direction');
}
