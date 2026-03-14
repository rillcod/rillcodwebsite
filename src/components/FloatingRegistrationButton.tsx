// @refresh reset
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { 
  PlusIcon, 
  AcademicCapIcon, 
  BuildingOfficeIcon,
  BookOpenIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'

export default function FloatingRegistrationButton() {
  const [isOpen, setIsOpen] = useState(false)

  const toggleMenu = () => {
    setIsOpen(!isOpen)
  }

  return (
    <div className="fixed bottom-6 right-6 z-30 lg:z-50">
      {/* Registration Menu */}
      {isOpen && (
        <div className="absolute bottom-16 right-0 mb-2 space-y-2">
          {/* Student Registration */}
          <Link
            href="/student-registration"
            className="group flex items-center bg-green-600 text-white px-4 py-3 rounded-full shadow-lg hover:bg-green-700 transform transition-all duration-300 hover:scale-105 hover:shadow-xl"
            onClick={() => setIsOpen(false)}
          >
            <AcademicCapIcon className="w-5 h-5 mr-2" />
            <span className="text-sm font-semibold whitespace-nowrap">Student Registration</span>
          </Link>
          
          {/* School Registration */}
          <Link
            href="/school-registration"
            className="group flex items-center bg-purple-600 text-white px-4 py-3 rounded-full shadow-lg hover:bg-purple-700 transform transition-all duration-300 hover:scale-105 hover:shadow-xl"
            onClick={() => setIsOpen(false)}
          >
            <BuildingOfficeIcon className="w-5 h-5 mr-2" />
            <span className="text-sm font-semibold whitespace-nowrap">School Registration</span>
          </Link>

          {/* Online School Registration */}
          <Link
            href="/online-registration"
            className="group flex items-center bg-emerald-600 text-white px-4 py-3 rounded-full shadow-lg hover:bg-emerald-700 transform transition-all duration-300 hover:scale-105 hover:shadow-xl"
            onClick={() => setIsOpen(false)}
          >
            <BookOpenIcon className="w-5 h-5 mr-2" />
            <span className="text-sm font-semibold whitespace-nowrap">Online School Sign Up</span>
          </Link>
        </div>
      )}

      {/* Main FAB Button */}
      <button
        onClick={toggleMenu}
        className={`w-14 h-14 rounded-full shadow-lg transform transition-all duration-300 hover:scale-110 hover:shadow-xl flex items-center justify-center ${
          isOpen 
            ? 'bg-red-600 hover:bg-red-700' 
            : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
        }`}
        aria-label="Registration Menu"
      >
        {isOpen ? (
          <XMarkIcon className="w-6 h-6 text-white" />
        ) : (
          <PlusIcon className="w-6 h-6 text-white" />
        )}
      </button>

      {/* Pulse Animation Ring */}
      {!isOpen && (
        <div className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-20"></div>
      )}
    </div>
  )
} 