"use client";
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import {
  Menu, X, ChevronDown, BookOpen,
  MessageSquare, LogOut, User, Building2, Home, Info,
  Phone, GraduationCap, LayoutDashboard,
  type LucideIcon,
} from 'lucide-react';

/* ─── Nav data ─────────────────────────────────────────────── */
const mainLinks = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/programs', label: 'Programs', icon: BookOpen },
  { href: '/curriculum', label: 'Curriculum', icon: GraduationCap },
  { href: '/about', label: 'About', icon: Info },
];

const secondaryLinks = [
  { href: '/partnership', label: 'Become a Partner', icon: Building2, sub: 'For schools and organisations' },
  { href: '/testimonials', label: 'Success Stories', icon: MessageSquare, sub: 'Hear from our parents & students' },
  { href: '/contact', label: 'Support', icon: Phone, sub: 'Get in touch with our team' },
];

// Unified destination
const LOGIN_HREF = '/login';

/* ─── Dropdown ───────────────────────────────────────────────── */
function Dropdown({ label, icon: Icon, isScrolled, children }: {
  label: string; icon: LucideIcon; isScrolled: boolean; children: React.ReactNode;
}) {
  return (
    <div className="relative group">
      <button className={`flex items-center gap-1.5 px-3 py-2 text-sm font-bold transition-colors
        ${isScrolled ? 'text-gray-800 hover:text-[#FF914D]' : 'text-white/85 hover:text-white'}`}>
        <Icon className="w-4 h-4" />
        {label}
        <ChevronDown className="w-3 h-3 transition-transform group-hover:rotate-180" />
      </button>
      <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-2xl border border-gray-100 shadow-2xl shadow-black/10 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50 overflow-hidden transform translate-y-1 group-hover:translate-y-0 text-left">
        {children}
      </div>
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────── */
const Navigation = () => {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Close mobile menu on route change
  useEffect(() => { setIsOpen(false); }, [pathname]);

  const isHiddenRoute =
    pathname?.startsWith('/dashboard') ||
    pathname?.startsWith('/login') ||
    pathname?.startsWith('/student-registration') ||
    pathname?.startsWith('/school-registration');

  if (isHiddenRoute) return null;

  const isActive = (href: string) => pathname === href;

  const handleLogout = () => { window.location.href = '/api/auth/signout'; };

  const navLinkCls = (href: string) =>
    `flex items-center gap-2 px-3 py-2 text-sm font-bold rounded-lg transition-colors ${isActive(href)
      ? 'text-[#FF914D]'
      : isScrolled
        ? 'text-gray-800 hover:text-[#FF914D]'
        : 'text-white/85 hover:text-white'
    }`;

  return (
    <nav suppressHydrationWarning className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled
      ? 'bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-sm'
      : 'bg-gray-950/80 backdrop-blur-md border-b border-white/5'
      }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-[72px]">

          {/* ── Logo ── */}
          <Link href="/" className="flex items-center gap-3">
            <Image src="/images/logo.png" alt="Rillcod Academy" width={48} height={48} className="object-contain rounded-md" />
            <div className="hidden sm:block">
              <span className={`text-base font-extrabold uppercase tracking-tight leading-none block
                ${isScrolled ? 'text-gray-900' : 'text-white'}`}>
                Rillcod Academy
              </span>
              <p className={`text-[10px] font-semibold uppercase tracking-widest leading-none mt-0.5
                ${isScrolled ? 'text-gray-400' : 'text-white/50'}`}>
                STEM Education
              </p>
            </div>
          </Link>

          {/* ── Desktop nav ── */}
          <div className="hidden lg:flex items-center gap-2">
            {mainLinks.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={navLinkCls(href)}>
                <Icon className="w-4 h-4" /> {label}
              </Link>
            ))}

            <Dropdown label="More" icon={Menu} isScrolled={isScrolled}>
              <div className="p-3 grid gap-1">
                {secondaryLinks.map(({ href, label, icon: Icon, sub }) => (
                  <Link key={href} href={href}
                    className="flex items-start gap-3 p-3 rounded-xl hover:bg-orange-50 transition-colors group">
                    <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-[#FF914D] transition-colors">
                      <Icon className="w-4 h-4 text-[#FF914D] group-hover:text-white" />
                    </div>
                    <div>
                      <div className="font-bold text-gray-900 text-sm">{label}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5 leading-snug">{sub}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </Dropdown>
          </div>

          {/* ── Desktop CTA ── */}
          <div className="hidden lg:flex items-center gap-3">
            {!authLoading && (
              user ? (
                <div className="flex items-center gap-3 bg-black/5 p-1 rounded-2xl">
                  <Link href="/dashboard"
                    className="flex items-center gap-2 px-5 py-2 text-sm font-bold rounded-xl bg-[#FF914D] text-white hover:bg-orange-500 transition-all shadow-lg shadow-orange-500/10">
                    <LayoutDashboard className="w-4 h-4" /> My Dashboard
                  </Link>
                  <button onClick={handleLogout}
                    title="Sign Out"
                    className={`p-2 rounded-xl transition-all
                      ${isScrolled ? 'text-gray-400 hover:text-rose-500 hover:bg-rose-50' : 'text-white/40 hover:text-white hover:bg-white/10'}`}>
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <Link href={LOGIN_HREF}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all
                      ${isScrolled ? 'text-gray-700 hover:bg-gray-100' : 'text-white/85 hover:bg-white/10'}`}>
                    <User className="w-4 h-4" /> Portal Login
                  </Link>
                  <Link href="/student-registration"
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl bg-white text-black hover:bg-gray-100 transition-all border border-black/10 shadow-sm">
                    Join as Student
                  </Link>
                </>
              )
            )}
          </div>

          {/* ── Mobile burger ── */}
          <button onClick={() => setIsOpen(!isOpen)}
            aria-expanded={isOpen}
            aria-controls="mobile-menu"
            className={`lg:hidden p-2 rounded-xl transition-all
              ${isScrolled ? 'text-gray-700 hover:bg-gray-100' : 'text-white hover:bg-white/10'}`}>
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* ── Mobile menu (portal so it appears above page content) ── */}
      {isOpen && mounted && typeof document !== 'undefined' && createPortal(
        <>
          <div className="lg:hidden fixed inset-0 top-16 bg-black/60 backdrop-blur-sm z-[9998]" onClick={() => setIsOpen(false)} aria-hidden="true" />
          <div id="mobile-menu" role="dialog" aria-modal="true" aria-label="Mobile menu" className="lg:hidden fixed inset-x-0 top-16 bottom-0 bg-[#0f0f1a] text-white border-t border-white/5 z-[9999] overflow-y-auto animate-fade-in shadow-2xl">
            <div className="p-6 space-y-8">
              <div className="grid gap-2">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40 mb-2">Main Menu</p>
                {[...mainLinks, ...secondaryLinks].map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href}
                    className={`flex items-center gap-4 px-5 py-4 rounded-2xl text-base font-bold transition-all
                    ${isActive(href) ? 'bg-[#FF914D]/10 text-[#FF914D]' : 'text-white/80 hover:bg-white/5 active:bg-white/10'}`}>
                    <Icon className={`w-5 h-5 ${isActive(href) ? 'text-[#FF914D]' : 'text-white/40'}`} />
                    {label}
                  </Link>
                ))}
              </div>

              <div className="pt-6 border-t border-white/10">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40 mb-4">Account & Access</p>
                {user ? (
                  <div className="space-y-3">
                    <Link href="/dashboard"
                      className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl text-base font-bold bg-[#FF914D] text-white shadow-xl shadow-orange-500/20">
                      <LayoutDashboard className="w-5 h-5" /> Open My Dashboard
                    </Link>
                    <button onClick={handleLogout}
                      className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl text-base font-bold text-white/60 hover:text-rose-500 transition-colors">
                      <LogOut className="w-5 h-5" /> Sign Out
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Link href="/student-registration"
                      className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl text-base font-bold bg-[#FF914D] text-white shadow-xl shadow-orange-500/20">
                      Student Registration
                    </Link>
                    <Link href={LOGIN_HREF}
                      className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl text-base font-bold text-gray-300 bg-white/5 border border-white/10 hover:bg-white/10">
                      <User className="w-5 h-5" /> Portal Login
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </nav>
  );
};

export default Navigation;

export default Navigation;