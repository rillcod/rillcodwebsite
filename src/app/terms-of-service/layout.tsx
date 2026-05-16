import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for Rillcod Technologies. Read the terms and conditions governing use of our platform, programs, and services.',
  alternates: { canonical: 'https://www.rillcod.com/terms-of-service' },
  openGraph: {
    title: 'Terms of Service — Rillcod Technologies',
    description: 'Terms and conditions governing use of Rillcod Technologies platform, programs, and services.',
    url: 'https://www.rillcod.com/terms-of-service',
  },
}

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
