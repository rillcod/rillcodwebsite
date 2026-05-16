import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy for Rillcod Technologies. Learn how we collect, use, and protect your personal data in compliance with applicable Nigerian data protection laws.',
  alternates: { canonical: 'https://www.rillcod.com/privacy-policy' },
  openGraph: {
    title: 'Privacy Policy — Rillcod Technologies',
    description: 'How Rillcod Technologies collects, uses, and protects your personal information.',
    url: 'https://www.rillcod.com/privacy-policy',
  },
}

export default function PrivacyPolicyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
