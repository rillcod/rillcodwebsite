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
import { isAppUtilityRoute } from '@/lib/layout/public-route-policy';

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

  const isHiddenRoute = isAppUtilityRoute(pathname);

  if (isHiddenRoute) return null;

  const isActive = (href: string) => pathname === href;

  const handleLogout = () => { window.location.href = '/api/auth/signout'; };

  const navLinkCls = (href: string) =>
    `flex min-h-10 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${isActive(href)
      ? 'bg-primary/10 text-primary'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    }`;

  return (
    <>
      <nav
        suppressHydrationWarning
        className={`sticky top-0 z-[100] min-h-[var(--public-nav-height)] border-b no-print capacitor-safe-top transition-[background-color,border-color,box-shadow] duration-200 ${
          isScrolled
            ? 'bg-background/95 backdrop-blur-xl border-border shadow-sm'
            : 'bg-background/95 backdrop-blur-xl border-border'
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-[4.5rem] items-center justify-between gap-3">

            {/* ── Brand ── */}
            <Link href="/" className="flex items-center gap-2 sm:gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl p-0.5">
              <div className="h-10 w-10 sm:h-11 sm:w-11 flex items-center justify-center rounded-xl overflow-hidden group-hover:scale-105 transition-all bg-white/80 dark:bg-white shrink-0">
                <Image src="/images/logo.png" alt="Rillcod Technologies" width={36} height={36} className="w-[85%] h-[85%] object-contain" />
              </div>
              <div className="text-foreground leading-none">
                <span className="block text-lg font-bold leading-tight tracking-tight sm:text-xl">
                  RILLCOD<span className="text-brand-red-600 not-italic">.</span>
                </span>
                <span className="mt-0.5 block text-[9px] font-semibold tracking-[0.12em] text-muted-foreground">
                  TECHNOLOGIES
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
              <div className="relative group ml-2">
                 <button aria-label="More navigation options" className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary">
                    More <ChevronDownIcon className="w-3 h-3 group-hover:rotate-180 transition-transform" />
                 </button>
                 <div className="absolute top-full right-0 mt-2 w-64 bg-card border border-border rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 p-2">
                    {secondaryLinks.map(({ href, label, icon: Icon, sub }) => (
                      <Link key={href} href={href} className="flex flex-col rounded-lg p-3.5 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary">
                         <span className="text-sm font-semibold text-foreground">{label}</span>
                         <span className="mt-1 text-xs text-muted-foreground">{sub}</span>
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
                  className="hidden min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary sm:inline-flex"
                >
                  <Squares2X2Icon className="w-4 h-4 shrink-0" />
                  <span>Dashboard</span>
                </Link>
              ) : (
                <>
                  <Link
                    href="/student-registration"
                    className="hidden min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98] sm:inline-flex sm:px-5"
                    aria-label="Enrol a learner"
                  >
                    <AcademicCapIcon className="w-4 h-4 shrink-0 sm:hidden" />
                    <span className="sm:hidden">Enrol</span>
                    <span className="hidden sm:inline">Register Student</span>
                  </Link>
                  <Link
                    href={LOGIN_HREF}
                    className="hidden min-h-11 items-center rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary sm:inline-flex"
                  >
                    Login
                  </Link>
                </>
              )}

              {/* Strategic Primary Mobile Menu Button */}
              <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary active:scale-95 lg:hidden"
                aria-label={isOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={isOpen}
              >
                {isOpen ? <XMarkIcon className="w-5 h-5 shrink-0" /> : <Bars3Icon className="w-5 h-5 shrink-0" />}
                <span className="font-semibold">{isOpen ? 'Close' : 'Menu'}</span>
              </button>
            </div>

          </div>
        </div>

        {/* ── Mobile Menu ── */}
        {mounted && isOpen && (
          <div className="lg:hidden border-t border-border/80 bg-background/95 backdrop-blur-2xl overflow-y-auto overflow-x-clip max-h-[calc(100dvh-var(--public-nav-height))] rounded-b-3xl shadow-2xl">
             <div className="p-5 sm:p-8 space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                {/* Native drag handle */}
                <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto -mt-1 mb-2" />
                <div className="flex items-center justify-between pb-2 border-b border-border/60">
                   <p className="text-xs font-semibold text-muted-foreground">Navigation Menu</p>
                </div>
                 <div className="grid gap-1.5">
                    {[...mainLinks, ...secondaryLinks].map(({ href, label, icon: Icon }) => {
                      const isSummer = href === cta.href || href.startsWith('/special/') || href === '/summer-school';
                      return (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setIsOpen(false)}
                          className={`text-base font-semibold transition-all min-h-11 py-3 px-4 rounded-xl flex items-center gap-3 touch-active-scale ${
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
                   <p className="text-xs font-semibold text-muted-foreground">Student &amp; School Portals</p>
                   {user ? (
                     <Link href="/dashboard" onClick={() => setIsOpen(false)} className="flex items-center justify-center gap-3 w-full py-4 bg-primary text-white text-sm font-semibold rounded-xl shadow-xl shadow-primary/20">
                        <Zap className="w-4 h-4" /> Enter Dashboard
                      </Link>
                   ) : (
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <Link
                          href="/student-registration"
                          onClick={() => setIsOpen(false)}
                          className="flex items-center justify-center gap-2 w-full py-3.5 bg-primary text-white text-sm font-semibold rounded-xl shadow-lg shadow-primary/20 touch-manipulation"
                        >
                           <AcademicCapIcon className="w-4 h-4" />
                           Enrol Student
                        </Link>
                        <Link href="/school-registration" onClick={() => setIsOpen(false)} className="flex items-center justify-center py-3.5 bg-foreground text-background text-sm font-semibold rounded-xl shadow-md touch-manipulation">
                           Partner School
                        </Link>
                        <Link href={LOGIN_HREF} onClick={() => setIsOpen(false)} className="sm:col-span-2 flex items-center justify-center py-3 bg-card border border-border text-foreground text-sm font-semibold rounded-xl touch-manipulation">
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