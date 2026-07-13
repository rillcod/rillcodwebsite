// @refresh reset
'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  PlusIcon,
  AcademicCapIcon,
  BuildingOfficeIcon,
  XMarkIcon,
} from '@/lib/icons'
import {
  SCHOOL_REGISTRATION_PATH,
  STUDENT_REGISTRATION_PATH,
} from '@/lib/registration/enrollment-types'

export default function FloatingRegistrationButton() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="fixed bottom-6 right-6 z-30 lg:z-50">
      {isOpen && (
        <div className="absolute bottom-16 right-0 mb-2 space-y-2">
          <Link
            href={STUDENT_REGISTRATION_PATH}
            className="group flex items-center bg-green-600 text-white px-4 py-3 rounded-full shadow-lg hover:bg-green-700 transform transition-all duration-300 hover:scale-105 hover:shadow-xl"
            onClick={() => setIsOpen(false)}
          >
            <AcademicCapIcon className="w-5 h-5 mr-2" />
            <span className="text-sm font-semibold whitespace-nowrap">Register a Learner</span>
          </Link>

          <Link
            href={SCHOOL_REGISTRATION_PATH}
            className="group flex items-center bg-purple-600 text-white px-4 py-3 rounded-full shadow-lg hover:bg-purple-700 transform transition-all duration-300 hover:scale-105 hover:shadow-xl"
            onClick={() => setIsOpen(false)}
          >
            <BuildingOfficeIcon className="w-5 h-5 mr-2" />
            <span className="text-sm font-semibold whitespace-nowrap">Partner School</span>
          </Link>
        </div>
      )}

      <button
        onClick={() => setIsOpen((open) => !open)}
        className={`w-14 h-14 rounded-full shadow-lg transform transition-all duration-300 hover:scale-110 hover:shadow-xl flex items-center justify-center ${
          isOpen
            ? 'bg-red-600 hover:bg-red-700'
            : 'bg-gradient-to-r from-primary to-purple-600 hover:from-primary hover:to-purple-700'
        }`}
        aria-label="Registration Menu"
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <XMarkIcon className="w-6 h-6 text-white" />
        ) : (
          <PlusIcon className="w-6 h-6 text-white" />
        )}
      </button>

      {!isOpen && (
        <div className="absolute inset-0 rounded-full bg-primary animate-ping opacity-20" />
      )}
    </div>
  )
}
