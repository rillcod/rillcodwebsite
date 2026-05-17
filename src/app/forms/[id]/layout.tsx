import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Register Now — Rillcod Technologies',
  description: 'Complete your child\'s registration with Rillcod Technologies STEM & Coding Academy.',
  openGraph: {
    title: 'Register Now — Rillcod Technologies',
    description: 'Empowering Young Minds Through Code.',
    siteName: 'Rillcod Technologies',
  },
};

export default function FormsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
