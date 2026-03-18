// @refresh reset
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  HomeIcon,
  UserGroupIcon,
  BookOpenIcon,
  AcademicCapIcon,
  ChartBarIcon,
  CogIcon,
  BuildingOfficeIcon,
  ClipboardDocumentCheckIcon,
  Bars3Icon,
  XMarkIcon,
  ArrowLeftOnRectangleIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  BellIcon,
  UserCircleIcon,
  DocumentDuplicateIcon,
  TrophyIcon,
  CommandLineIcon,
  UserIcon,
  UserPlusIcon,
  ComputerDesktopIcon,
  ClockIcon,
  DocumentTextIcon,
  ArrowTrendingUpIcon,
  RectangleGroupIcon,
  ChatBubbleOvalLeftIcon,
  Cog6ToothIcon,
  VideoCameraIcon,
  Squares2X2Icon
} from "@/lib/icons";
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";

export default function DashboardNavigation() {
  const pathname = usePathname();
  const { user, profile, loading } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const menuItems = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: HomeIcon,
      color: 'emerald',
      roles: ['admin', 'teacher', 'school'] as const
    },
    {
      label: 'Teaching',
      href: '/dashboard/teaching',
      icon: AcademicCapIcon,
      color: 'blue',
      roles: ['admin', 'teacher'] as const,
      children: [
        { label: 'My Classes', href: '/dashboard/classes', icon: BuildingOfficeIcon },
        { label: 'Lessons', href: '/dashboard/lessons', icon: BookOpenIcon },
        { label: 'Assignments', href: '/dashboard/assignments', icon: ClipboardDocumentCheckIcon },
        { label: 'CBT Exams', href: '/dashboard/cbt', icon: ComputerDesktopIcon },
        { label: 'Attendance', href: '/dashboard/attendance', icon: UserGroupIcon },
        { label: 'Timetable', href: '/dashboard/timetable', icon: ClockIcon },
      ]
    },
    {
      label: 'Students',
      href: '/dashboard/students-hub',
      icon: UserIcon,
      color: 'orange',
      roles: ['admin', 'teacher', 'school'] as const,
      children: [
        { label: 'Register Students', href: '/dashboard/students/bulk-register', icon: UserPlusIcon },
        { label: 'Enrol Students', href: '/dashboard/students', icon: UserGroupIcon },
      ]
    },
    {
      label: 'Grades',
      href: '/dashboard/grades',
      icon: ChartBarIcon,
      color: 'purple',
      roles: ['admin', 'teacher'] as const
    },
    {
      label: 'Reports',
      href: '/dashboard/reports',
      icon: DocumentTextIcon,
      color: 'amber',
      roles: ['admin', 'teacher', 'school'] as const,
      children: [
        { label: 'Report Builder', href: '/dashboard/reports/builder', icon: CogIcon },
        { label: 'Progress Reports', href: '/dashboard/reports/progress', icon: ArrowTrendingUpIcon },
      ]
    },
    {
      label: 'Content',
      href: '/dashboard/content',
      icon: RectangleGroupIcon,
      color: 'rose',
      roles: ['admin', 'teacher'] as const,
      children: [
        { label: 'Library', href: '/dashboard/library', icon: BookOpenIcon },
        { label: 'Code Playground', href: '/dashboard/playground', icon: CommandLineIcon },
        { label: 'Leaderboard', href: '/dashboard/leaderboard', icon: TrophyIcon },
      ]
    },
    {
      label: 'More',
      href: '/dashboard/more',
      icon: Squares2X2Icon,
      color: 'indigo',
      roles: ['admin', 'teacher', 'school'] as const,
      children: [
        { label: 'Live Sessions', href: '/dashboard/live', icon: VideoCameraIcon },
        { label: 'Messages', href: '/dashboard/messages', icon: ChatBubbleOvalLeftIcon },
        { label: 'Settings', href: '/dashboard/settings', icon: Cog6ToothIcon },
        { label: 'Notifications', href: '/dashboard/notifications', icon: BellIcon },
        { label: 'Profile', href: '/dashboard/profile', icon: UserCircleIcon },
      ]
    }
  ];

  const filteredMenu = menuItems.filter(item =>
    !item.roles || (profile?.role && (item.roles as any).includes(profile.role))
  );

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const BrandMark = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => {
    const iconSize = size === "sm" ? "w-5 h-5" : size === "md" ? "w-7 h-7" : "w-10 h-10";
    const boxSize = size === "sm" ? "w-9 h-9" : size === "md" ? "w-12 h-12" : "w-16 h-16";

    return (
      <div className={`${boxSize} bg-orange-500 flex items-center justify-center rounded-none shadow-xl shadow-orange-500/20`}>
        <AcademicCapIcon className={`${iconSize} text-white fill-none`} />
      </div>
    );
  };

  const BrandText = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => {
    const titleClass = size === "sm" ? "text-base" : size === "md" ? "text-xl" : "text-2xl";
    const subClass = size === "sm" ? "text-[7px]" : size === "md" ? "text-[9px]" : "text-[10px]";

    return (
      <div className="text-left">
        <h3 className={`${titleClass} font-black text-white uppercase tracking-tight block leading-none italic`}>
          RILLCOD<span className="text-orange-500 not-italic">.</span>
        </h3>
        <p className={`${subClass} font-black text-white/30 uppercase tracking-[0.4em] leading-none mt-1.5 whitespace-nowrap`}>STEM Excellence</p>
      </div>
    );
  };

  return (
    <>
      {/* Mobile Top Bar */}
      <div className={`md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2 transition-all duration-300 border-b ${isScrolled ? 'bg-[#121212]/95 backdrop-blur-md border-white/10 shadow-2xl' : 'bg-[#121212] border-white/5'
        }`}>
        <Link href="/dashboard" className="flex items-center gap-3">
          <BrandMark size="sm" />
          <BrandText size="sm" />
        </Link>

        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2.5 bg-white/5 border border-white/10 rounded-none text-white hover:bg-white/10 transition-all"
        >
          {isMobileMenuOpen ? <XMarkIcon className="w-6 h-6" /> : <Bars3Icon className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[55] md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`
        fixed inset-y-0 left-0 z-[60] w-72 bg-[#121212] border-r border-white/5 transform transition-transform duration-500 ease-sharp shadow-2xl
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:sticky md:translate-x-0'}
      `}>
        {/* Logo Section */}
        <div className="hidden md:flex flex-col items-center justify-center py-10 border-b border-white/5">
          <div className="mb-4">
            <BrandMark size="lg" />
          </div>
          <BrandText size="lg" />
        </div>

        {/* Scrollable Nav Items */}
        <nav className="flex-1 px-4 py-8 overflow-y-auto space-y-1.5 custom-scrollbar h-[calc(100vh-320px)]">
          <div className="space-y-1.5 pt-8">
            {filteredMenu.map((item, idx) => {
              const isActive = pathname === item.href;
              const hasChildren = !!item.children;
              const isOpen = activeDropdown === item.label;

              // Determine base color class for the main item
              const baseColorClass = item.color ? `text-${item.color}-500` : 'text-orange-500';
              const baseBgClass = item.color ? `bg-${item.color}-500/10` : 'bg-orange-500/10';
              const baseBorderClass = item.color ? `border-${item.color}-500` : 'border-orange-500';

              return (
                <div key={item.label || idx} className="space-y-1">
                  {hasChildren ? (
                    <button
                      onClick={() => setActiveDropdown(isOpen ? null : item.label)}
                      className={`w-full flex items-center justify-between px-4 py-3.5 group rounded-none transition-all ${isOpen ? `${baseBgClass} ${baseColorClass}` : 'text-slate-500 hover:text-white hover:bg-white/5'
                        }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <item.icon className={`w-5 h-5 transition-colors ${isOpen ? baseColorClass : 'group-hover:text-white'}`} />
                        <span className="text-[11px] font-black uppercase tracking-widest">{item.label}</span>
                      </div>
                      <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                  ) : (
                    <Link
                      href={item.href || "#"}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center gap-4 px-5 py-4 group rounded-none transition-all border-l-2 ${isActive
                          ? `${baseBgClass} ${baseColorClass} ${baseBorderClass}`
                          : 'text-white/30 hover:text-white hover:bg-white/5 border-transparent'
                        }`}
                    >
                      <item.icon className={`w-5 h-5 transition-transform group-hover:scale-110 ${isActive ? baseColorClass : 'group-hover:text-white'}`} />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em]">{item.label}</span>
                      {isActive && (
                        <div className={`ml-auto w-1.5 h-1.5 ${baseColorClass.replace('text-', 'bg-')} rounded-full shadow-[0_0_10px_rgba(234,88,12,0.5)]`} />
                      )}
                    </Link>
                  )}

                  {/* Sub-menu */}
                  {hasChildren && isOpen && (
                    <div className="grid grid-cols-1 gap-1 ml-4 border-l border-white/5 pl-2 mt-1 py-1">
                      {item.children?.map(child => {
                        const isChildActive = pathname === child.href;
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-none transition-all ${isChildActive
                                ? 'text-orange-500 font-bold'
                                : 'text-slate-500 hover:text-white hover:bg-white/5'
                              }`}
                          >
                            <child.icon className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-black uppercase tracking-widest">{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </nav>

        {/* User Profile & Logout Section */}
        <div className="p-6 border-t border-white/5 bg-[#0a0a0a]/50">
          <div className="flex items-center gap-3 mb-6">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-tr from-orange-500 to-amber-500 rounded-none opacity-20 blur group-hover:opacity-40 transition-opacity"></div>
              <div className="relative w-10 h-10 rounded-none bg-[#121212] border border-white/10 flex items-center justify-center text-orange-500 font-black">
                {profile?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || "?"}
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-[10px] font-black text-white uppercase truncate">{profile?.full_name || "Protocol Officer"}</p>
              <p className="text-[8px] font-black text-orange-500/60 uppercase tracking-widest">{profile?.role || "Sector Access"}</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-rose-500/10 border border-white/10 hover:border-rose-500/20 text-slate-400 hover:text-rose-500 text-[10px] font-black uppercase tracking-widest transition-all group"
          >
            <ArrowLeftOnRectangleIcon className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            <span>Terminate Session</span>
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-[100] bg-[#121212]/95 backdrop-blur-xl border-t border-white/10 flex items-center justify-around px-1 py-2 shadow-2xl">
        {[
          { label: 'Dashboard', icon: HomeIcon, href: '/dashboard' },
          { label: 'Classes', icon: BuildingOfficeIcon, href: '/dashboard/classes' },
          { label: 'Students', icon: UserGroupIcon, href: '/dashboard/students' },
          { label: 'Reports', icon: DocumentTextIcon, href: '/dashboard/reports' },
        ].map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1.5 transition-all p-2 ${isActive ? 'text-orange-500' : 'text-slate-500'}`}
            >
              <item.icon className={`w-5 h-5 ${isActive ? 'scale-110' : ''}`} />
              <span className="text-[7.5px] font-black uppercase tracking-[0.15em]">{item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={handleLogout}
          className="flex flex-col items-center gap-1.5 transition-all p-2 text-rose-500/60 hover:text-rose-500"
        >
          <ArrowLeftOnRectangleIcon className="w-5 h-5" />
          <span className="text-[7.5px] font-black uppercase tracking-[0.15em]">Sign Out</span>
        </button>
      </div>
    </>
  );
}
