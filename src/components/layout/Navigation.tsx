"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import {
  Menu, X, ChevronDown, School, BookOpen,
  MessageSquare, LogOut, User, Building2, Home, Info,
  Phone, GraduationCap, Shield, LayoutDashboard,
} from 'lucide-react';

/* ─── Nav data ─────────────────────────────────────────────── */
const mainLinks = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/about', label: 'About', icon: Info },
  { href: '/contact', label: 'Contact', icon: Phone },
];

const educationLinks = [
  { href: '/programs', label: 'Programs', icon: BookOpen, sub: 'Explore our curriculum' },
  { href: '/curriculum', label: 'Curriculum', icon: GraduationCap, sub: 'What students learn' },
  { href: '/testimonials', label: 'Testimonials', icon: MessageSquare, sub: 'Hear from our students' },
];

// Partner dropdown: the 3 key actions
const partnerLinks = [
  { href: '/student-registration', label: 'Register a Student', icon: GraduationCap, sub: 'Enroll your child in our STEM programme' },
  { href: '/school-registration', label: 'Register a School', icon: Building2, sub: 'Become a partner school' },
  { href: '/login', label: 'Sign in to Portal', icon: Shield, sub: 'Access your dashboard' },
];

// Single unified sign-in — all roles go to /login
const loginHref = '/login';

/* ─── Dropdown ───────────────────────────────────────────────── */
function Dropdown({ label, icon: Icon, isScrolled, children }: {
  label: string; icon: any; isScrolled: boolean; children: React.ReactNode;
}) {
  return (
    <div className="relative group">
      <button className={`flex items-center gap-1.5 px-3 py-2 text-sm font-bold transition-colors
        ${isScrolled ? 'text-gray-800 hover:text-[#FF914D]' : 'text-white/85 hover:text-white'}`}>
        <Icon className="w-4 h-4" />
        {label}
        <ChevronDown className="w-3 h-3 transition-transform group-hover:rotate-180" />
      </button>
      <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl border border-gray-100 shadow-xl shadow-black/10 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────── */
const Navigation = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const pathname = usePathname();
  const { user, profile, signOut, loading: authLoading } = useAuth();

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Hide on dashboard / auth pages
  const isHiddenRoute =
    pathname?.startsWith('/dashboard') ||
    pathname?.startsWith('/login') ||
    pathname?.startsWith('/student-registration') ||
    pathname?.startsWith('/school-registration');

  if (isHiddenRoute) return null;

  const isActive = (href: string) => pathname === href;

  const handleLogout = () => { window.location.href = '/api/auth/signout'; };

  const navLinkCls = (href?: string) =>
    `flex items-center gap-2 px-3 py-2 text-sm font-bold rounded-lg transition-colors ${href && isActive(href)
      ? 'text-[#FF914D]'
      : isScrolled
        ? 'text-gray-800 hover:text-[#FF914D] hover:bg-orange-50'
        : 'text-white/85 hover:text-white hover:bg-white/10'
    }`;

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled
      ? 'bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-sm'
      : 'bg-gray-950/80 backdrop-blur-md border-b border-white/5'
      }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-[72px]">

          {/* ── Logo ── */}
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center
              ${isScrolled ? 'bg-[#FF914D]' : 'bg-[#FF914D]'}`}>
              <School className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className={`text-base font-extrabold uppercase tracking-tight leading-none block
                ${isScrolled ? 'text-gray-900' : 'text-white'}`}>
                Rillcod Academy
              </span>
              <p className={`text-[10px] font-semibold uppercase tracking-widest leading-none
                ${isScrolled ? 'text-gray-400' : 'text-white/50'}`}>
                STEM Education
              </p>
            </div>
          </Link>

          {/* ── Desktop nav ── */}
          <div className="hidden lg:flex items-center gap-0.5">
            {mainLinks.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={navLinkCls(href)}>
                <Icon className="w-4 h-4" /> {label}
              </Link>
            ))}

            {/* Education dropdown */}
            <Dropdown label="Education" icon={GraduationCap} isScrolled={isScrolled}>
              <div className="p-2">
                {educationLinks.map(({ href, label, icon: Icon, sub }) => (
                  <Link key={href} href={href}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-orange-50 transition-colors group">
                    <div className="w-7 h-7 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-[#FF914D] transition-colors">
                      <Icon className="w-3.5 h-3.5 text-[#FF914D] group-hover:text-white" />
                    </div>
                    <div>
                      <div className="font-bold text-gray-900 text-sm">{label}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </Dropdown>

            {/* Partner dropdown */}
            <Dropdown label="Partner" icon={Building2} isScrolled={isScrolled}>
              <div className="p-2">
                {partnerLinks.map(({ href, label, icon: Icon, sub }) => (
                  <Link key={href} href={href}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-orange-50 transition-colors group">
                    <div className="w-7 h-7 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-[#FF914D] transition-colors">
                      <Icon className="w-3.5 h-3.5 text-[#FF914D] group-hover:text-white" />
                    </div>
                    <div>
                      <div className="font-bold text-gray-900 text-sm">{label}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </Dropdown>
          </div>

          {/* ── Desktop CTA ── */}
          <div className="hidden lg:flex items-center gap-2">
            {!authLoading && (
              user ? (
                <>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full
                    ${isScrolled
                      ? 'bg-orange-100 text-[#FF914D]'
                      : 'bg-white/10 text-white'}`}>
                    {profile?.full_name?.split(' ')[0] ?? profile?.role ?? 'User'}
                  </span>
                  <Link href="/dashboard"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl bg-[#FF914D] text-white hover:bg-orange-500 transition-all shadow-sm shadow-orange-300/30">
                    <LayoutDashboard className="w-4 h-4" /> Dashboard
                  </Link>
                  <button onClick={handleLogout}
                    className={`p-2 rounded-xl transition-all
                      ${isScrolled
                        ? 'text-gray-600 hover:bg-gray-100'
                        : 'text-white/70 hover:bg-white/10'}`}>
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  {/* Single Sign In link — all roles land on /login which has role selector */}
                  <Link href={loginHref}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all
                      ${isScrolled
                        ? 'text-gray-700 hover:bg-gray-100'
                        : 'text-white/85 hover:bg-white/10'}`}>
                    <User className="w-4 h-4" /> Sign In
                  </Link>
                  <Link href="/student-registration"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl bg-[#FF914D] text-white hover:bg-orange-500 transition-all shadow-sm shadow-orange-300/30">
                    Register Free
                  </Link>
                </>
              )
            )}
          </div>

          {/* ── Mobile burger ── */}
          <button onClick={() => setIsOpen(!isOpen)}
            className={`lg:hidden p-2 rounded-xl transition-all
              ${isScrolled
                ? 'text-gray-700 hover:bg-gray-100'
                : 'text-white hover:bg-white/10'}`}>
            {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* ── Mobile menu ── */}
      {isOpen && (
        <div className="lg:hidden bg-white border-t border-gray-100 shadow-xl">
          <div className="max-w-7xl mx-auto px-4 py-4 space-y-1">

            {/* Main */}
            {mainLinks.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors
                  ${isActive(href) ? 'bg-orange-50 text-[#FF914D]' : 'text-gray-800 hover:bg-gray-50'}`}>
                <Icon className="w-4 h-4" /> {label}
              </Link>
            ))}

            {/* Education */}
            <div className="pt-2">
              <p className="px-4 text-xs font-black uppercase tracking-widest text-gray-400 mb-1">Education</p>
              {educationLinks.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                  <Icon className="w-4 h-4 text-[#FF914D]" /> {label}
                </Link>
              ))}
            </div>

            {/* Partner */}
            <div className="pt-2">
              <p className="px-4 text-xs font-black uppercase tracking-widest text-gray-400 mb-1">Partner</p>
              {partnerLinks.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                  <Icon className="w-4 h-4 text-[#FF914D]" /> {label}
                </Link>
              ))}
            </div>

            {/* Auth — deduplicated */}
            <div className="pt-3 border-t border-gray-100 space-y-2">
              {user ? (
                <>
                  <Link href="/dashboard" onClick={() => setIsOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold bg-[#FF914D] text-white">
                    <LayoutDashboard className="w-4 h-4" /> Go to Dashboard
                  </Link>
                  <button onClick={handleLogout}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 w-full transition-colors">
                    <LogOut className="w-4 h-4" /> Sign Out
                  </button>
                </>
              ) : (
                <>
                  <Link href={loginHref} onClick={() => setIsOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors">
                    <User className="w-4 h-4 text-[#FF914D]" /> Sign In to Portal
                  </Link>
                  <Link href="/student-registration" onClick={() => setIsOpen(false)}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold bg-[#FF914D] text-white hover:bg-orange-500 transition-colors">
                    Register as Student — Free
                  </Link>
                </>
              )}
            </div>

          </div>
        </div>
      )}
    </nav>
  );
};

export default Navigation;