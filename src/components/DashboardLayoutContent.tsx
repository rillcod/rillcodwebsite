'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { 
  HomeIcon, 
  UsersIcon, 
  BookOpenIcon, 
  ChartBarIcon, 
  Cog6ToothIcon,
  BellIcon,
  BuildingOfficeIcon,
  AcademicCapIcon,
  UserGroupIcon,
  ComputerDesktopIcon,
  ClipboardDocumentListIcon,
  PresentationChartLineIcon,
  Bars3Icon,
  XMarkIcon,
  SwatchIcon,
  SunIcon,
  MoonIcon,
  ClipboardDocumentCheckIcon
} from '@heroicons/react/24/outline'
import { NotificationBell } from '@/components/ui/notification-bell'
import { UserRole } from '@/types'
import { useAuth } from '@/contexts/auth-context'
import PWAInstaller, { OfflineIndicator } from '@/components/PWAInstaller'
import MobileNavigation, { FloatingActionButton } from '@/components/MobileNavigation'
import { useTheme } from '@/contexts/theme-context'

export default function DashboardLayoutContent({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, profile, signOut, loading } = useAuth()
  
  // Get theme context - this will throw an error if not within ThemeProvider
  let themeContext;
  try {
    themeContext = useTheme();
  } catch (error) {
    // If theme context is not available, render without theme functionality
    themeContext = { theme: 'light', mounted: false, toggleTheme: () => {} };
  }

  const { theme, toggleTheme, mounted } = themeContext;
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Check if device is mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  // Show loading while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  // Don't render if not authenticated
  if (!user) {
    return null
  }

  // Role-based navigation items
  const getNavigationItems = (role: string) => {
    const baseItems = [
      { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
    ]

    switch (role) {
      case 'admin':
        return [
          ...baseItems,
          { name: 'Schools', href: '/dashboard/schools', icon: BuildingOfficeIcon },
          { name: 'Teachers', href: '/dashboard/teachers', icon: AcademicCapIcon },
          { name: 'Students', href: '/dashboard/students', icon: UserGroupIcon },
          { name: 'Courses', href: '/dashboard/courses', icon: BookOpenIcon },
          { name: 'Evaluations', href: '/dashboard/evaluations', icon: ClipboardDocumentCheckIcon },
          { name: 'Analytics', href: '/dashboard/analytics', icon: ChartBarIcon },
          { name: 'IoT Monitor', href: '/dashboard/iot', icon: ComputerDesktopIcon },
          { name: 'Reports', href: '/dashboard/reports', icon: ClipboardDocumentListIcon },
          { name: 'Settings', href: '/dashboard/settings', icon: Cog6ToothIcon },
        ]
      
      case 'teacher':
        return [
          ...baseItems,
          { name: 'My Classes', href: '/dashboard/classes', icon: BookOpenIcon },
          { name: 'Students', href: '/dashboard/students', icon: UserGroupIcon },
          { name: 'Lessons', href: '/dashboard/lessons', icon: ClipboardDocumentListIcon },
          { name: 'Evaluations', href: '/dashboard/evaluations', icon: ClipboardDocumentCheckIcon },
          { name: 'Assessments', href: '/dashboard/assessments', icon: PresentationChartLineIcon },
          { name: 'Progress', href: '/dashboard/progress', icon: ChartBarIcon },
          { name: 'Settings', href: '/dashboard/settings', icon: Cog6ToothIcon },
        ]
      
      case 'student':
        return [
          ...baseItems,
          { name: 'My Courses', href: '/dashboard/courses', icon: BookOpenIcon },
          { name: 'Lessons', href: '/dashboard/lessons', icon: ClipboardDocumentListIcon },
          { name: 'Progress', href: '/dashboard/progress', icon: ChartBarIcon },
          { name: 'Assignments', href: '/dashboard/assignments', icon: PresentationChartLineIcon },
          { name: 'Settings', href: '/dashboard/settings', icon: Cog6ToothIcon },
        ]
      
      default:
        return baseItems
    }
  }

  const navigationItems = getNavigationItems(profile?.role || 'student')

  const handleLogout = () => {
    signOut()
    router.push('/')
  }

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200 ${mounted && theme === 'dark' ? 'dark' : ''}`}>
      <OfflineIndicator />
      
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 shadow-xl transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-purple-600">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <span className="text-white font-bold text-lg">RA</span>
              </div>
              <span className="ml-3 text-lg font-bold text-white hidden sm:block">Rillcod Academy</span>
              <span className="ml-3 text-lg font-bold text-white sm:hidden">RA</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 rounded-md text-white/80 hover:text-white hover:bg-white/20 transition-colors"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
          
          {/* Navigation */}
          <nav className="flex-1 mt-6 px-3 overflow-y-auto">
            <div className="space-y-2">
              {navigationItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white hover:shadow-md'
                    }`}
                  >
                    <item.icon
                      className={`mr-3 h-5 w-5 transition-colors duration-200 ${
                        isActive ? 'text-white' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-300'
                      }`}
                    />
                    <span className="hidden sm:block">{item.name}</span>
                    {isActive && (
                      <div className="ml-auto w-2 h-2 bg-white rounded-full"></div>
                    )}
                  </Link>
                )
              })}
              {/* Video Conferencing Nav Link */}
              <Link
                href="/dashboard/video-conferencing"
                className={`group flex items-center px-4 py-2 rounded-lg transition-colors ${pathname.startsWith('/dashboard/video-conferencing') ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-bold' : 'text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-700 dark:hover:text-blue-300'}`}
              >
                <ComputerDesktopIcon className="h-6 w-6 mr-3" />
                Video Conferencing
              </Link>
            </div>
          </nav>

          {/* User Info & Logout */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center mb-4 p-3 bg-white dark:bg-gray-700 rounded-xl shadow-sm">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-bold">
                  {profile?.full_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'U'}
                </span>
              </div>
              <div className="ml-3 flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{profile?.full_name || 'User'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 capitalize truncate">{profile?.role?.replace('_', ' ') || 'user'}</p>
              </div>
            </div>
            
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 rounded-xl transition-all duration-200 border border-gray-200 dark:border-gray-600 hover:border-red-200 dark:hover:border-red-800"
            >
              <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:block">Logout</span>
              <span className="sm:hidden">Exit</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-30 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-6">
            <div className="flex items-center">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Bars3Icon className="h-6 w-6" />
              </button>
            </div>
            
            <div className="flex items-center space-x-2 sm:space-x-3">
              {/* Dark mode toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title={
                  theme === 'light' ? 'Switch to dark mode' :
                  theme === 'dark' ? 'Switch to system theme' :
                  'Switch to light mode'
                }
              >
                {theme === 'light' ? (
                  <SunIcon className="h-5 w-5" />
                ) : theme === 'dark' ? (
                  <MoonIcon className="h-5 w-5" />
                ) : (
                  <ComputerDesktopIcon className="h-5 w-5" />
                )}
              </button>
              
              <NotificationBell />
              
              <div className="hidden sm:flex items-center space-x-3">
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{profile?.full_name || 'User'}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{profile?.role?.replace('_', ' ') || 'user'}</p>
                </div>
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center shadow-lg">
                  <span className="text-white text-sm font-bold">
                    {profile?.full_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'U'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="min-h-screen pb-20 lg:pb-6">
          <div className="px-4 sm:px-6 lg:px-6 py-6">
            {children}
          </div>
        </main>
      </div>
      
      {/* Mobile Navigation */}
      <MobileNavigation userRole={profile?.role as UserRole || UserRole.STUDENT} />
      
      {/* Floating Action Button - Only show on mobile and adjust position */}
      <div className="lg:hidden">
        <FloatingActionButton />
      </div>
      
      {/* PWA Installer - Adjust position for mobile */}
      <div className="lg:hidden">
        <PWAInstaller />
      </div>
    </div>
  )
} 