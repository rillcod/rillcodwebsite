'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Shield,
  Users,
  Building2,
  GraduationCap,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Home,
  UserPlus,
  School,
  BookOpen,
  Bell,
  Search,
  FileText,
  MessageSquare,
  Video,
  Monitor
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  description: string;
}

const navigation: NavItem[] = [
  {
    name: 'Dashboard',
    href: '/admin',
    icon: <Home className="w-5 h-5" />,
    description: 'Overview and analytics'
  },
  {
    name: 'Users',
    href: '/admin/users',
    icon: <Users className="w-5 h-5" />,
    description: 'Manage portal users'
  },
  {
    name: 'Schools',
    href: '/admin/schools',
    icon: <Building2 className="w-5 h-5" />,
    description: 'Partner schools'
  },
  {
    name: 'Students',
    href: '/admin/students',
    icon: <GraduationCap className="w-5 h-5" />,
    description: 'Student registrations'
  },
  {
    name: 'Programs',
    href: '/admin/programs',
    icon: <BookOpen className="w-5 h-5" />,
    description: 'Educational programs'
  },
  {
    name: 'Courses',
    href: '/admin/courses',
    icon: <FileText className="w-5 h-5" />,
    description: 'Course management'
  },
  {
    name: 'Assignments',
    href: '/admin/assignments',
    icon: <FileText className="w-5 h-5" />,
    description: 'Assignments and assessments'
  },
  {
    name: 'CBT',
    href: '/admin/cbt',
    icon: <Monitor className="w-5 h-5" />,
    description: 'Computer-based tests'
  },
  {
    name: 'Communications',
    href: '/admin/communications',
    icon: <MessageSquare className="w-5 h-5" />,
    description: 'Announcements and chat'
  },
  {
    name: 'Analytics',
    href: '/admin/analytics',
    icon: <BarChart3 className="w-5 h-5" />,
    description: 'Reports and insights'
  },
  {
    name: 'Settings',
    href: '/admin/settings',
    icon: <Settings className="w-5 h-5" />,
    description: 'System configuration'
  }
];

export default function AdminNavbar() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const pathname = usePathname();

  const handleLogout = () => {
    // Add logout logic here
    console.log('Logging out...');
  };

  const isActive = (href: string) => {
    if (href === '/admin') {
      return pathname === '/admin';
    }
    return pathname?.startsWith(href);
  };

  return (
    <>
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-50 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
        <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-card dark:bg-gray-800">
          <div className="flex h-16 items-center justify-between px-4 border-b border-border dark:border-gray-700">
            <div className="flex items-center space-x-2">
              <img src="/images/logo.png" alt="Rillcod" className="w-8 h-8 object-contain rounded-md" />
              <span className="text-xl font-bold text-foreground dark:text-white">Admin</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-muted-foreground/70 hover:text-muted-foreground dark:hover:text-muted-foreground/50"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <nav className="flex-1 space-y-1 px-2 py-4">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${isActive(item.href)
                    ? 'bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'text-muted-foreground hover:bg-background hover:text-foreground dark:text-muted-foreground/50 dark:hover:bg-gray-700 dark:hover:text-white'
                  }`}
              >
                {item.icon}
                <span className="ml-3">{item.name}</span>
              </Link>
            ))}
          </nav>

          <div className="border-t border-border dark:border-gray-700 p-4">
            <button
              onClick={handleLogout}
              className="flex items-center w-full px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-background hover:text-foreground dark:text-muted-foreground/50 dark:hover:bg-gray-700 dark:hover:text-white rounded-md transition-colors"
            >
              <LogOut className="w-5 h-5 mr-3" />
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Desktop navbar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-card dark:bg-gray-800 border-r border-border dark:border-gray-700">
          <div className="flex h-16 items-center px-4 border-b border-border dark:border-gray-700">
            <div className="flex items-center space-x-2">
              <img src="/images/logo.png" alt="Rillcod" className="w-8 h-8 object-contain rounded-md" />
              <span className="text-xl font-bold text-foreground dark:text-white">Admin Panel</span>
            </div>
          </div>

          <nav className="flex-1 space-y-1 px-2 py-4">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${isActive(item.href)
                    ? 'bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'text-muted-foreground hover:bg-background hover:text-foreground dark:text-muted-foreground/50 dark:hover:bg-gray-700 dark:hover:text-white'
                  }`}
              >
                {item.icon}
                <span className="ml-3">{item.name}</span>
              </Link>
            ))}
          </nav>

          <div className="border-t border-border dark:border-gray-700 p-4">
            <button
              onClick={handleLogout}
              className="flex items-center w-full px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-background hover:text-foreground dark:text-muted-foreground/50 dark:hover:bg-gray-700 dark:hover:text-white rounded-md transition-colors"
            >
              <LogOut className="w-5 h-5 mr-3" />
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Top navbar */}
      <div className="lg:pl-64">
        <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-border dark:border-gray-700 bg-card dark:bg-gray-800 px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
          <button
            type="button"
            className="-m-2.5 p-2.5 text-foreground/80 dark:text-muted-foreground/50 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>

          <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
            <div className="relative flex flex-1 items-center">
              <Search className="pointer-events-none absolute inset-y-0 left-0 h-full w-5 text-muted-foreground/70 pl-3" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block h-full w-full border-0 py-0 pl-10 pr-0 text-foreground dark:text-white placeholder:text-muted-foreground/70 focus:ring-0 sm:text-sm bg-transparent"
              />
            </div>

            <div className="flex items-center gap-x-4 lg:gap-x-6">
              <button
                type="button"
                className="-m-2.5 p-2.5 text-muted-foreground/70 hover:text-muted-foreground dark:hover:text-muted-foreground/50"
              >
                <Bell className="h-6 w-6" />
              </button>

              <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-muted dark:bg-gray-700" />

              <div className="flex items-center gap-x-4">
                <div className="hidden sm:flex sm:flex-col sm:items-end">
                  <p className="text-sm font-medium text-foreground dark:text-white">Admin User</p>
                  <p className="text-xs text-muted-foreground dark:text-muted-foreground/70">admin@rillcod.com</p>
                </div>
                <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
} 