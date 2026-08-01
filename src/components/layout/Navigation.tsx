// @refresh reset
"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import {
  Bars3Icon, XMarkIcon, ChevronDownIcon, BookOpenIcon,
  ChatBubbleOvalLeftIcon, ArrowLeftOnRectangleIcon, UserIcon,
  BuildingOffice2Icon, HomeIcon, InformationCircleIcon,
  PhoneIcon, AcademicCapIcon, Squares2X2Icon,
} from '@/lib/icons';
import { Command, ShieldCheck, Zap } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { useFeaturedSpecialProgram } from '@/hooks/useFeaturedSpecialProgram';

type NavIcon = React.ComponentType<{ className?: string }>;

/* ─── Nav data ─────────────────────────────────────────────── */
const mainLinksBase = [
  { href: '/', label: 'Home', icon: HomeIcon },
  { href: '/programs', label: 'Programs', icon: BookOpenIcon },
  { href: '/curriculum', label: 'Curriculum', icon: AcademicCapIcon },
  { href: '/about', label: 'About', icon: InformationCircleIcon },
];

const secondaryLinks = [
  { href: '/partnership', label: 'Become a Partner', icon: BuildingOffice2Icon, sub: 'For schools and organisations' },
  { href: '/testimonials', label: 'Success Stories', icon: ChatBubbleOvalLeftIcon, sub: 'Hear from our parents & students' },
  { href: '/contact', label: 'Support', icon: PhoneIcon, sub: 'Get in touch with our team' },
];

const LOGIN_HREF = '/login';

/* ─── Main component ──────────────────────────────────────────── */
const Navigation = () => {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { cta } = useFeaturedSpecialProgram();
  const mainLinks = [
    mainLinksBase[0],
    { href: cta.href, label: cta.button_label || '☀️ Special Programme', icon: BookOpenIcon },
    ...mainLinksBase.slice(1),
  ];

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => { setIsOpen(false); }, [pathname]);

  useEffect(() => {
    const handleCloseMenu = () => {
      setIsOpen(false);
    };
    window.addEventListener('rillcod-open-summer-school-popup', handleCloseMenu);
    return () => {
      window.removeEventListener('rillcod-open-summer-school-popup', handleCloseMenu);
    };
  }, []);

  const isHiddenRoute =
    pathname?.startsWith('/dashboard') ||
    pathname?.startsWith('/login') ||
    pathname?.startsWith('/student-registration') ||
    pathname?.startsWith('/school-registration');

  if (isHiddenRoute) return null;

  const isActive = (href: string) => pathname === href;

  const handleLogout = () => { window.location.href = '/api/auth/signout'; };

  const navLinkCls = (href: string) =>
    `flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all rounded-xl ${isActive(href)
      ? 'text-primary bg-muted shadow-sm border-l-2 border-l-brand-red-600'
      : 'text-muted-foreground hover:text-foreground hover:bg-muted shadow-sm'
    }`;

  return (
    <>
      <nav
        suppressHydrationWarning
        className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-300 border-b no-print capacitor-safe-top ${
          isScrolled
            ? 'bg-background/95 backdrop-blur-md border-border shadow-2xl py-2'
            : 'bg-background/95 backdrop-blur-sm border-border py-4'
        }`}
      >
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10">
          <div className="flex items-center justify-between gap-2 h-16">

            {/* ── Brand ── */}
            <Link href="/" className="flex items-center gap-2 sm:gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl p-0.5">
              <div className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl overflow-hidden group-hover:scale-105 transition-all bg-white/80 dark:bg-white shrink-0">
                <Image src="/images/logo.png" alt="Rillcod Technologies" width={36} height={36} className="w-[85%] h-[85%] object-contain" />
              </div>
              <div className="text-foreground leading-none">
                <span className="text-2xl sm:text-3xl font-black uppercase tracking-tight block leading-tight italic">
                   RILLCOD<span className="text-brand-red-600 not-italic">.</span>
                </span>
                <span className="flex items-center gap-1.5 mt-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                  <span className="relative flex h-1.5 w-1.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                  </span>
                  STEM Academy · Live Sync
                </span>
              </div>
            </Link>

            {/* ── Desktop Nav ── */}
            <div className="hidden lg:flex items-center gap-1">
              {mainLinks.map(({ href, label, icon: Icon }) => {
                const isSummer = href === cta.href || href.startsWith('/special/') || href === '/summer-school';
                return (
                  <Link
                    suppressHydrationWarning
                    key={href}
                    href={href}
                    className={`${navLinkCls(href)} focus-visible:ring-2 focus-visible:ring-primary ${
                      isSummer && !isActive(href)
                        ? 'border border-amber-500/20 text-amber-600 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10'
                        : ''
                    }`}
                  >
                    {isSummer && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse mr-0.5" />
                    )}
                    {label}
                  </Link>
                );
              })}

              {/* Secure Dropdown */}
              <div className="relative group ml-4">
                 <button aria-label="More navigation options" className="flex items-center gap-3 px-6 py-2.5 bg-card shadow-sm border border-border text-[10px] font-black uppercase tracking-widest text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary transition-all rounded-xl">
                    More <ChevronDownIcon className="w-3 h-3 group-hover:rotate-180 transition-transform" />
                 </button>
                 <div className="absolute top-full right-0 mt-2 w-64 bg-card border border-border rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 p-2">
                    {secondaryLinks.map(({ href, label, icon: Icon, sub }) => (
                      <Link key={href} href={href} className="flex flex-col p-4 hover:bg-muted shadow-sm transition-colors border-l-2 border-l-transparent hover:border-l-brand-red-600 focus-visible:ring-2 focus-visible:ring-primary rounded-lg">
                         <span className="text-[10px] font-black text-foreground uppercase tracking-widest">{label}</span>
                         <span className="text-[8px] text-muted-foreground font-bold uppercase mt-1">{sub}</span>
                      </Link>
                    ))}
                 </div>
              </div>
            </div>

            {/* ── Actions ── */}
            <div suppressHydrationWarning className="flex items-center gap-2">
              <ThemeToggle />

              {/* Primary action CTA — desktop only on mobile header to declutter */}
              {mounted && !authLoading && user ? (
                <Link
                  href="/dashboard"
                  className="hidden sm:inline-flex items-center gap-2 min-h-11 px-6 py-3 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:opacity-95 focus-visible:ring-2 focus-visible:ring-primary transition-all shadow-md shadow-primary/20"
                >
                  <Squares2X2Icon className="w-4 h-4 shrink-0" />
                  <span>Dashboard</span>
                </Link>
              ) : (
                <>
                  <Link
                    href="/student-registration"
                    className="inline-flex items-center justify-center gap-1.5 min-h-11 px-3.5 sm:px-6 py-2 sm:py-3 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:opacity-95 focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98] transition-all shadow-md shadow-primary/20 touch-manipulation"
                    aria-label="Enrol a learner"
                  >
                    <AcademicCapIcon className="w-4 h-4 shrink-0 sm:hidden" />
                    <span className="sm:hidden">Enrol</span>
                    <span className="hidden sm:inline">Register Student</span>
                  </Link>
                  <Link
                    href={LOGIN_HREF}
                    className="hidden sm:inline-flex items-center min-h-11 px-4 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-widest hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary rounded-xl transition-colors"
                  >
                    Login
                  </Link>
                </>
              )}

              {/* Strategic Primary Mobile Menu Button */}
              <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="lg:hidden inline-flex items-center justify-center gap-2 min-h-11 min-w-11 px-4 py-2.5 bg-primary/10 border border-primary/30 text-primary font-black text-xs uppercase tracking-widest rounded-xl hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-primary active:scale-95 transition-all touch-manipulation shadow-md shadow-primary/10"
                aria-label={isOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={isOpen}
              >
                {isOpen ? <XMarkIcon className="w-5 h-5 shrink-0" /> : <Bars3Icon className="w-5 h-5 shrink-0" />}
                <span className="font-black tracking-wider">{isOpen ? 'Close' : 'Menu'}</span>
              </button>
            </div>

          </div>
        </div>

        {/* ── Mobile Menu ── */}
        {mounted && isOpen && (
          <div className="lg:hidden border-t border-border/80 bg-background/95 backdrop-blur-2xl overflow-y-auto overflow-x-clip max-h-[calc(100dvh-var(--app-header-height,4rem))] rounded-b-3xl shadow-2xl">
             <div className="p-5 sm:p-8 space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                {/* Native drag handle */}
                <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto -mt-1 mb-2" />
                <div className="flex items-center justify-between pb-2 border-b border-border/60">
                   <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.3em]">Navigation Menu</p>
                   <ThemeToggle />
                </div>
                 <div className="grid gap-1.5">
                    {[...mainLinks, ...secondaryLinks].map(({ href, label, icon: Icon }) => {
                      const isSummer = href === cta.href || href.startsWith('/special/') || href === '/summer-school';
                      return (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setIsOpen(false)}
                          className={`text-sm sm:text-base font-black uppercase tracking-wide transition-all min-h-11 py-3 px-4 rounded-xl flex items-center gap-3 touch-active-scale ${
                            isActive(href)
                              ? 'text-primary bg-primary/10 border border-primary/20'
                              : isSummer
                              ? 'text-amber-600 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-400 bg-amber-500/10 border border-amber-500/20'
                              : 'text-foreground hover:text-primary hover:bg-muted'
                          }`}
                        >
                          {Icon && <Icon className="w-4 h-4 text-primary shrink-0" />}
                          {isSummer && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />}
                          <span>{label}</span>
                        </Link>
                      );
                    })}
                 </div>

                <div className="pt-4 border-t border-border space-y-4">
                   <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.3em]">Student &amp; School Portals</p>
                   {user ? (
                     <Link href="/dashboard" onClick={() => setIsOpen(false)} className="flex items-center justify-center gap-3 w-full py-4 bg-primary text-white text-xs font-black uppercase tracking-[0.2em] rounded-xl shadow-xl shadow-primary/20">
                        <Zap className="w-4 h-4" /> Enter Dashboard
                      </Link>
                   ) : (
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <Link
                          href="/student-registration"
                          onClick={() => setIsOpen(false)}
                          className="flex items-center justify-center gap-2 w-full py-3.5 bg-primary text-white text-xs font-black uppercase tracking-[0.15em] rounded-xl shadow-lg shadow-primary/20 touch-manipulation"
                        >
                           <AcademicCapIcon className="w-4 h-4" />
                           Enrol Student
                        </Link>
                        <Link href="/school-registration" onClick={() => setIsOpen(false)} className="flex items-center justify-center py-3.5 bg-foreground text-background text-xs font-black uppercase tracking-[0.15em] rounded-xl shadow-md touch-manipulation">
                           Partner School
                        </Link>
                        <Link href={LOGIN_HREF} onClick={() => setIsOpen(false)} className="sm:col-span-2 flex items-center justify-center py-3 bg-card border border-border text-foreground text-xs font-black uppercase tracking-[0.15em] rounded-xl touch-manipulation">
                           Portal Login
                        </Link>
                     </div>
                   )}
                </div>
             </div>
          </div>
        )}
      </nav>
    </>
  );
};

export default Navigation;