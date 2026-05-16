import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Student Showcase',
  description: 'Browse projects built by Rillcod Technologies students — websites, apps, games, and robotics projects created by young coders across Benin City, Edo State, and Nigeria.',
  keywords: ['student projects Nigeria', 'coding showcase Benin City', 'kids coding projects', 'STEM showcase Nigeria', 'young coders portfolio'],
  alternates: { canonical: 'https://www.rillcod.com/showcase' },
  openGraph: {
    title: 'Student Showcase — Rillcod Technologies',
    description: 'Real projects built by real students — websites, apps, games, and robotics from young coders across Nigeria.',
    url: 'https://www.rillcod.com/showcase',
  },
}

export default function ShowcaseLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
