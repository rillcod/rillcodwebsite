import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Partnership',
  description: 'Partner with Rillcod Technologies to bring world-class STEM and coding education to your school or organisation. We offer tailored partnership packages for schools across Benin City, Edo State, and Nigeria.',
  keywords: ['school partnership Nigeria', 'STEM partnership Benin City', 'coding partnership Edo State', 'educational partnership Nigeria', 'technology education partner'],
  alternates: { canonical: 'https://www.rillcod.com/partnership' },
  openGraph: {
    title: 'Partnership — Rillcod Technologies',
    description: 'Bring STEM and coding education to your school or organisation. Tailored partnership packages across Edo State and Nigeria.',
    url: 'https://www.rillcod.com/partnership',
  },
}

export default function PartnershipLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
