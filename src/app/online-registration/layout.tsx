import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Online Registration',
  description: 'Register online for Rillcod Technologies STEM and coding programs. Quick and easy enrolment for students and schools across Nigeria.',
  keywords: ['online registration coding Nigeria', 'STEM enrolment online', 'coding class registration Benin City', 'online enrolment Nigeria'],
  alternates: { canonical: 'https://www.rillcod.com/online-registration' },
  openGraph: {
    title: 'Online Registration — Rillcod Technologies',
    description: 'Quick online enrolment for Rillcod Technologies STEM and coding programs across Nigeria.',
    url: 'https://www.rillcod.com/online-registration',
  },
}

export default function OnlineRegistrationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
