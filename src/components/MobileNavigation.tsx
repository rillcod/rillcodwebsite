// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  HomeIcon,
  UsersIcon,
  BookOpenIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  BuildingOfficeIcon,
  AcademicCapIcon,
  UserGroupIcon,
  ComputerDesktopIcon,
  ClipboardDocumentListIcon,
  PresentationChartLineIcon,
  PlusIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { UserRole } from '@/types';

interface MobileNavigationProps {
  userRole: UserRole;
}

export default function MobileNavigation({ userRole }: MobileNavigationProps) {
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState(pathname);
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  // Hide navigation on scroll down, show on scroll up
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setIsVisible(currentScrollY < lastScrollY || currentScrollY < 100);
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  const getNavigationItems = (role: UserRole) => {
    const baseItems = [
      { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
    ];

    switch (role) {
      case 'admin':
        return [
          ...baseItems,
          { name: 'Schools', href: '/dashboard/schools', icon: BuildingOfficeIcon },
          { name: 'Students', href: '/dashboard/students', icon: UserGroupIcon },
          { name: 'Courses', href: '/dashboard/courses', icon: BookOpenIcon },
          { name: 'Analytics', href: '/dashboard/analytics', icon: ChartBarIcon },
        ];
      
      case 'teacher':
        return [
          ...baseItems,
          { name: 'Classes', href: '/dashboard/classes', icon: BookOpenIcon },
          { name: 'Students', href: '/dashboard/students', icon: UserGroupIcon },
          { name: 'Lessons', href: '/dashboard/lessons', icon: ClipboardDocumentListIcon },
          { name: 'Progress', href: '/dashboard/progress', icon: ChartBarIcon },
        ];
      
      case 'student':
        return [
          ...baseItems,
          { name: 'Courses', href: '/dashboard/courses', icon: BookOpenIcon },
          { name: 'Lessons', href: '/dashboard/lessons', icon: ClipboardDocumentListIcon },
          { name: 'Progress', href: '/dashboard/progress', icon: ChartBarIcon },
          { name: 'Assignments', href: '/dashboard/assignments', icon: PresentationChartLineIcon },
        ];
      
      default:
        return baseItems;
    }
  };

  const navigationItems = getNavigationItems(userRole);

  return (
    <>
      {/* Mobile Navigation Bar */}
      <div className={`fixed bottom-0 left-0 right-0 z-40 lg:hidden transition-transform duration-300 ${
        isVisible ? 'translate-y-0' : 'translate-y-full'
      }`}>
        {/* Background with blur and safe area */}
        <div className="relative">
          <div className="absolute inset-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-t border-gray-200/50 dark:border-gray-700/50"></div>
          
          {/* Navigation items container */}
          <div className="relative flex items-center justify-around px-2 py-2 pb-safe">
            {navigationItems.slice(0, 4).map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setActiveTab(item.href)}
                  className={`flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-200 relative ${
                    isActive
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <item.icon className={`h-6 w-6 mb-1 transition-all duration-200 ${
                    isActive ? 'scale-110' : ''
                  }`} />
                  <span className="text-xs font-medium truncate max-w-full px-1">{item.name}</span>
                  
                  {/* Active indicator */}
                  {isActive && (
                    <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full"></div>
                  )}
                </Link>
              );
            })}
            
            {/* More menu for additional items */}
            {navigationItems.length > 4 && (
              <MobileMoreMenu items={navigationItems.slice(4)} />
            )}
          </div>
        </div>
      </div>

      {/* Safe area spacer */}
      <div className="h-20 lg:hidden"></div>
    </>
  );
}

// More menu component for additional navigation items
function MobileMoreMenu({ items }: { items: Array<{ name: string; href: string; icon: any }> }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-200 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
      >
        <PlusIcon className="h-6 w-6 mb-1" />
        <span className="text-xs font-medium">More</span>
      </button>

      {/* More menu dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-50 bg-black/20"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Menu */}
          <div className="absolute bottom-16 right-0 mb-2 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-2 min-w-48 z-50">
            {items.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center px-4 py-3 text-sm transition-colors duration-200 ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <item.icon className="h-5 w-5 mr-3" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Floating action button for quick actions
export function FloatingActionButton() {
  const [isOpen, setIsOpen] = useState(false);

  const quickActions = [
    { name: 'Add Student', href: '/dashboard/students/add', icon: UserGroupIcon },
    { name: 'Create Course', href: '/dashboard/courses/add', icon: BookOpenIcon },
    { name: 'View Reports', href: '/dashboard/reports', icon: ChartBarIcon },
  ];

  return (
    <div className="fixed bottom-24 right-4 z-30 lg:hidden">
      {/* Quick action menu */}
      {isOpen && (
        <div className="absolute bottom-16 right-0 mb-2 space-y-2">
          {quickActions.map((action, index) => (
            <Link
              key={action.name}
              href={action.href}
              className="flex items-center justify-center w-12 h-12 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all duration-200 transform hover:scale-110"
              style={{
                animationDelay: `${index * 100}ms`,
                animation: 'slideInUp 0.3s ease-out forwards'
              }}
            >
              <action.icon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
            </Link>
          ))}
        </div>
      )}
      
      {/* Main FAB */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-14 h-14 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-110"
      >
        {isOpen ? (
          <XMarkIcon className="h-6 w-6" />
        ) : (
          <PlusIcon className="h-6 w-6" />
        )}
      </button>
    </div>
  );
}

// Add CSS for animations and safe area
const styles = `
  @keyframes slideInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .pb-safe {
    padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
} 