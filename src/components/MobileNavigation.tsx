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
} from '@/lib/icons';
import { UserRole } from '@/types';

interface MobileNavigationProps {
  userRole: UserRole;
}

export default function MobileNavigation({ userRole }: MobileNavigationProps) {
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState(pathname);

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
      <div className={`fixed bottom-0 left-0 right-0 z-40 lg:hidden`}>
        {/* Background with blur and safe area */}
        <div className="relative">
          <div className="absolute inset-0 bg-[#121212]/95 backdrop-blur-xl border-t border-border"></div>
          
          {/* Navigation items container */}
          <div className="relative flex items-center justify-around px-2 py-2 pb-safe">
            {navigationItems.slice(0, 4).map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setActiveTab(item.href)}
                  className={`flex flex-col items-center justify-center w-16 h-14 rounded-none transition-all duration-200 relative ${
                    isActive
                      ? 'text-orange-500'
                      : 'text-muted-foreground hover:text-white'
                  }`}
                >
                  <item.icon className={`h-5 w-5 mb-1 transition-all duration-200 ${
                    isActive ? 'scale-110' : ''
                  }`} />
                  <span className="text-[9px] font-black uppercase tracking-widest truncate max-w-full px-1">{item.name}</span>
                  
                  {/* Active indicator */}
                  {isActive && (
                    <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-orange-500 rounded-none shadow-[0_0_8px_rgba(255,145,77,0.8)]"></div>
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
        className="flex flex-col items-center justify-center w-16 h-14 rounded-none transition-all duration-200 text-muted-foreground hover:text-white"
      >
        <PlusIcon className="h-5 w-5 mb-1" />
        <span className="text-[9px] font-black uppercase tracking-widest">More</span>
      </button>

      {/* More menu dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Menu */}
          <div className="absolute bottom-20 right-0 mb-2 bg-[#1a1a1a] border border-border rounded-none shadow-2xl py-3 min-w-[200px] z-50">
            <div className="px-4 py-2 border-b border-border mb-2">
                <span className="text-[8px] font-black text-muted-foreground uppercase tracking-[0.3em]">Extended Protocol</span>
            </div>
            {items.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center px-6 py-4 text-xs font-black uppercase tracking-widest transition-colors duration-200 ${
                    isActive
                      ? 'bg-orange-500/10 text-orange-500 border-l-2 border-orange-500'
                      : 'text-muted-foreground/70 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <item.icon className="h-4 w-4 mr-4" />
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
        <div className="absolute bottom-20 right-0 mb-2 space-y-4">
          {quickActions.map((action, index) => (
            <Link
              key={action.name}
              href={action.href}
              className="flex items-center justify-center w-14 h-14 bg-[#1a1a1a] text-orange-500 border border-border rounded-none shadow-2xl hover:border-orange-500 transition-all duration-200 transform hover:scale-110"
              style={{
                animationDelay: `${index * 100}ms`,
                animation: 'slideInUp 0.3s ease-out forwards'
              }}
            >
              <action.icon className="h-6 w-6" />
            </Link>
          ))}
        </div>
      )}
      
      {/* Main FAB */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-16 h-16 bg-orange-500 text-white rounded-none shadow-[0_0_20px_rgba(255,145,77,0.3)] hover:bg-orange-600 transition-all duration-200 transform hover:rotate-90 group"
      >
        {isOpen ? (
          <XMarkIcon className="h-8 w-8" />
        ) : (
          <PlusIcon className="h-8 w-8 group-hover:scale-110" />
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