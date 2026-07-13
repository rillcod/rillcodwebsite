import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Online Registration — Kids, Teens, Adults & Individuals | Rillcod Technologies',
  description:
    'Register online for Rillcod Technologies STEM and coding programmes. Kids, teens, adults, and individual learners — partner schools, live online, self-paced, or in-person across Nigeria.',
  keywords: [
    'online registration coding Nigeria',
    'STEM enrolment online',
    'adult coding classes Nigeria',
    'individual learner programming',
    'coding class registration Benin City',
    'online enrolment Nigeria',
  ],
  alternates: { canonical: 'https://www.rillcod.com/online-registration' },
  openGraph: {
    title: 'Online Registration — Kids, Teens, Adults & Individuals | Rillcod',
    description:
      'Quick online enrolment for Rillcod STEM and coding programmes — every age welcome across Nigeria.',
    url: 'https://www.rillcod.com/online-registration',
  },
}

export default function OnlineRegistrationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
