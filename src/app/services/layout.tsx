import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Services',
  description: 'Explore Rillcod Technologies services — STEM & coding education for schools, professional web and app development, smart home automation, and IoT solutions in Benin City, Edo State, Nigeria.',
  keywords: ['STEM education services Nigeria', 'web development services Benin City', 'app development Nigeria', 'smart home automation Benin City', 'IoT solutions Edo State', 'coding training Nigeria'],
  alternates: { canonical: 'https://www.rillcod.com/services' },
  openGraph: {
    title: 'Services — Rillcod Technologies',
    description: 'STEM education, web/app development, smart home automation, and IoT solutions in Benin City, Nigeria.',
    url: 'https://www.rillcod.com/services',
  },
}

export default function ServicesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
