'use client'

import { usePathname } from 'next/navigation'
import WhatsAppButton from './WhatsAppButton'
import FloatingRegistrationButton from './FloatingRegistrationButton'

export default function DashboardFloatingButtons() {
  const pathname = usePathname()

  // Don't show floating buttons on dashboard pages
  if (pathname?.startsWith('/dashboard')) {
    return null
  }

  return (
    <>
      <WhatsAppButton />
      <FloatingRegistrationButton />
    </>
  )
} 