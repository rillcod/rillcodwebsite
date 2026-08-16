// @refresh reset
"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import {
  Bars3Icon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  BookOpenIcon,
  ChatBubbleOvalLeftIcon,
  ArrowLeftOnRectangleIcon,
  UserIcon,
  BuildingOffice2Icon,
  HomeIcon,
  InformationCircleIcon,
  PhoneIcon,
  AcademicCapIcon,
  Squares2X2Icon,
  MagnifyingGlassIcon,
  PhotoIcon,
  DocumentCheckIcon,
} from '@/lib/icons';
import {
  Sparkles,
  Zap,
  ShieldCheck,
  ArrowRight,
  Compass,
  Rocket,
  ExternalLink,
  MessageCircle,
  Award,
  Layers,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ThemeToggle from '@/components/ThemeToggle';
import { useFeaturedSpecialProgram } from '@/hooks/useFeaturedSpecialProgram';
import { isAppUtilityRoute } from '@/lib/layout/public-route-policy';
import { brandContact } from '@/config/brand';

/* ─── Nav data ─────────────────────────────────────────────── */
const mainLinksBase = [
  { href: '/', label: 'Home', icon: HomeIcon, desc: 'Overview & engineering labs' },
  { href: '/programs', label: 'Programs', icon: BookOpenIcon, desc: 'Primary & secondary tracks' },
  { href: '/curriculum', label: 'Curriculum', icon: AcademicCapIcon, desc: '12-Year STEM & AI pathway' },
  { href: '/about', label: 'About', icon: InformationCircleIcon, desc: 'Our mission & leadership' },
];

const secondaryLinks = [
  { href: '/partnership', label: 'Partner Your School', icon: BuildingOffice2Icon, desc: 'Turnkey robotics & ₦0 CapEx' },
  { href: '/testimonials', label: 'Success Stories', icon: ChatBubbleOvalLeftIcon, desc: 'Hear from parents & schools' },
  { href: '/gallery', label: 'Exhibition Gallery', icon: PhotoIcon, desc: 'Classroom & summit photos' },
  { href: '/result-check', label: 'Verify Report Card', icon: DocumentCheckIcon, desc: 'Parent report & result lookup' },
  { href: '/contact', label: 'Support & Help', icon: PhoneIcon, desc: 'Get in touch with our team' },
];

const LOGIN_HREF = '/login';

export const Navigation = () => {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const { cta, open: specialOpen } = useFeaturedSpecialProgram();

  const mainLinks = useMemo(
    () =>
      specialOpen
        ? [
            mainLinksBase[0],
            {
              href: cta.href,
              label: cta.button_label || '☀️ Special Programme',
              icon: Rocket,
              desc: `${cta.title} · Now Enrolling`,
            },
            ...mainLinksBase.slice(1),
          ]
        : mainLinksBase,
    [specialOpen, cta.href, cta.button_label, cta.title],
  );

  /*
    Everything the drawer's search can match.

    Memoised because it is the dependency of the filter below, and a fresh array
    every render makes that memo do the work every render anyway.
  */
  const allNavItems = useMemo(
    () => [
      ...mainLinks.map((l) => ({ ...l, category: 'Academics & Syllabus' })),
      ...secondaryLinks.map((l) => ({ ...l, category: 'School & Institutional' })),
      { href: '/student-registration', label: 'Enrol a Learner', icon: AcademicCapIcon, desc: 'Register student for coding & robotics', category: 'Portals' },
      { href: '/school-registration', label: 'School Partnership Intake', icon: BuildingOffice2Icon, desc: 'Onboard partner school', category: 'Portals' },
      { href: LOGIN_HREF, label: 'Portal Login', icon: UserIcon, desc: 'Staff, School & Student LMS login', category: 'Portals' },
    ],
    [mainLinks],
  );

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    return allNavItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q) ||
        item.href.toLowerCase().includes(q)
    );
  }, [searchQuery, allNavItems]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [isOpen]);

  useEffect(() => {
    setIsOpen(false);
    setSearchQuery('');
  }, [pathname]);

  useEffect(() => {
    const handleCloseMenu = () => setIsOpen(false);
    window.addEventListener('rillcod-open-summer-school-popup', handleCloseMenu);
    return () => {
      window.removeEventListener('rillcod-open-summer-school-popup', handleCloseMenu);
    };
  }, []);

  /*
    Every hook must already have run by the time we get here.

    This early return used to sit above the drawer's `useMemo`, which meant the
    component called one fewer hook on an app-utility route than on a public
    one. React counts hooks per render and throws when the count drops —
    "Rendered fewer hooks than expected" — which reached the user as
    "Application error: a client-side exception has occurred".

    It fired on exactly the links most likely to be used: /login,
    /student-registration, /school-registration and /result-check are all
    utility routes, and all four are in this drawer. Opening the menu and
    tapping almost anything in the Portals group crashed the page.

    So the guard stays last. Anything added to this component belongs above it.
  */
  const isHiddenRoute = isAppUtilityRoute(pathname);
  if (isHiddenRoute) return null;

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const navLinkCls = (href: string) =>
    `flex min-h-10 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${
      isActive(href)
        ? 'bg-primary/10 text-primary'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    }`;

  const triggerHaptic = (ms = 8) => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(ms);
      }
    } catch {}
  };

  const whatsappHref = `https://wa.me/2348116600091?text=${encodeURIComponent(
    'Hello Rillcod Technologies, I would like to inquire about your STEM, Robotics and AI programs.'
  )}`;

  return (
    <>
      {/* ── Top Header Navigation ── */}
      <nav
        suppressHydrationWarning
        className={`sticky top-0 z-[100] min-h-[var(--public-nav-height)] border-b no-print capacitor-safe-top transition-[background-color,border-color,box-shadow] duration-200 ${
          isScrolled || isOpen
            ? 'bg-background/98 backdrop-blur-2xl border-border shadow-sm'
            : 'bg-background/95 backdrop-blur-xl border-border'
        }`}
      >
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
          <div className="flex min-h-[4.5rem] items-center justify-between gap-3">
            {/* ── Brand Logo & Mobile Back Button ── */}
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              {mounted && pathname !== '/' && !isOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(8);
                    router.back();
                  }}
                  className="lg:hidden flex h-9 w-9 items-center justify-center rounded-xl bg-card border border-border text-foreground hover:bg-muted active:scale-90 transition-transform shrink-0"
                  aria-label="Go back to previous page"
                >
                  <ChevronLeftIcon className="w-5 h-5" />
                </button>
              ) : null}
              <Link
                href="/"
                onClick={() => {
                  triggerHaptic(6);
                  setIsOpen(false);
                }}
                className="flex items-center gap-2.5 sm:gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl p-0.5"
              >
                <div className="h-10 w-10 sm:h-11 sm:w-11 flex items-center justify-center rounded-xl overflow-hidden group-hover:scale-105 transition-all bg-white/90 dark:bg-white shrink-0 shadow-sm border border-border/40">
                  <Image
                    src="/images/logo.png"
                    alt="Rillcod Technologies"
                    width={36}
                    height={36}
                    className="w-[85%] h-[85%] object-contain"
                  />
                </div>
                <div className="text-foreground leading-none">
                  <span className="block text-lg font-black leading-tight tracking-tight sm:text-xl">
                    RILLCOD<span className="text-brand-red-600 not-italic">.</span>
                  </span>
                  <span className="mt-0.5 block text-[9px] font-black tracking-[0.14em] text-muted-foreground uppercase">
                    TECHNOLOGIES
                  </span>
                </div>
              </Link>
            </div>

            {/* ── Desktop Nav Links ── */}
            <div className="hidden lg:flex items-center gap-1">
              {mainLinks.map(({ href, label, icon: Icon }) => {
                const isSpecial =
                  href === cta.href ||
                  href.startsWith('/special/') ||
                  href === '/summer-school';
                return (
                  <Link
                    suppressHydrationWarning
                    key={href}
                    href={href}
                    className={`${navLinkCls(href)} focus-visible:ring-2 focus-visible:ring-primary ${
                      isSpecial && !isActive(href)
                        ? 'border border-amber-500/20 text-amber-600 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10'
                        : ''
                    }`}
                  >
                    {isSpecial && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse mr-0.5" />
                    )}
                    {label}
                  </Link>
                );
              })}

              {/* More Dropdown */}
              <div className="relative group ml-2">
                <button
                  aria-label="More navigation options"
                  className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
                >
                  More{' '}
                  <ChevronDownIcon className="w-3 h-3 group-hover:rotate-180 transition-transform" />
                </button>
                <div className="absolute top-full right-0 mt-2 w-72 bg-card border border-border rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 p-2">
                  {secondaryLinks.map(({ href, label, icon: Icon, desc }) => (
                    <Link
                      key={href}
                      href={href}
                      className="flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                        {Icon && <Icon className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-bold text-foreground block truncate">
                          {label}
                        </span>
                        <span className="text-xs text-muted-foreground block truncate">
                          {desc}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Top Header Actions ── */}
            <div suppressHydrationWarning className="flex items-center gap-2">
              <ThemeToggle />

              {/* Desktop Auth CTAs */}
              {mounted && !authLoading && user ? (
                <Link
                  href="/dashboard"
                  className="hidden min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary sm:inline-flex"
                >
                  <Squares2X2Icon className="w-4 h-4 shrink-0" />
                  <span>Dashboard</span>
                </Link>
              ) : (
                <>
                  <Link
                    href="/student-registration"
                    className="hidden min-h-11 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-red-600 via-primary to-brand-red-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-brand-red-600/20 transition-all hover:opacity-95 focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98] sm:inline-flex sm:px-5"
                    aria-label="Enrol a learner"
                  >
                    <AcademicCapIcon className="w-4 h-4 shrink-0" />
                    <span>Register Student</span>
                  </Link>
                  <Link
                    href={LOGIN_HREF}
                    className="hidden min-h-11 items-center rounded-xl px-3.5 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary sm:inline-flex"
                  >
                    Login
                  </Link>
                </>
              )}

              {/* Mobile Top Menu Button */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(8);
                  setIsOpen(!isOpen);
                }}
                className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-black uppercase tracking-wider transition-all active:scale-95 lg:hidden ${
                  isOpen
                    ? 'bg-primary text-white border-primary shadow-md'
                    : 'border-border bg-card text-foreground shadow-sm hover:bg-muted'
                }`}
                aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={isOpen}
              >
                {isOpen ? (
                  <XMarkIcon className="w-5 h-5 shrink-0" />
                ) : (
                  <Bars3Icon className="w-5 h-5 shrink-0 text-brand-red-600 dark:text-brand-red-500" />
                )}
                <span>{isOpen ? 'Close' : 'Menu'}</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/*
        ── Full-Screen Mobile Slide-Down Drawer ──

        A sibling of the header, not a child of it, and that placement is the
        whole reason it fills the screen.

        The header carries `backdrop-blur`, and an element with a backdrop-filter
        becomes the containing block for any `position: fixed` inside it. While
        the drawer lived in there, `top-[var(--public-nav-height)] bottom-0`
        resolved against the 97px header rather than the viewport, so the menu
        opened as a 25px sliver: the button flipped to "Close", the body scroll
        locked, and there was nothing to see. Measured at 390x844 — the drawer's
        own bottom edge came out at 97px, exactly the header's height.
      */}
      <AnimatePresence>
          {mounted && isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              /*
                Above the bottom dock, not under it.

                The drawer was `z-50` and the dock below is `z-[95]`, so the dock
                painted over the drawer's last 65px — the end of the link list
                sat behind it, and tapping there hit the dock instead of the
                link under the finger. The header is `z-[100]`; the drawer opens
                beneath it by design, so `z-[96]` puts it above the dock and
                still below the bar it hangs from.
              */
              className="lg:hidden fixed top-[var(--public-nav-height)] inset-x-0 bottom-0 z-[96] border-t border-border/80 bg-background/98 backdrop-blur-3xl overflow-y-auto overscroll-contain shadow-2xl"
              style={{
                paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
              }}
            >
              <div className="mx-auto max-w-lg px-4 py-5 space-y-6">
                {/* Search Inset Bar */}
                <div className="relative">
                  <MagnifyingGlassIcon className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search programs, syllabus, portals…"
                    aria-label="Search pages"
                    className="h-11 w-full rounded-2xl border border-border bg-card pe-9 ps-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none shadow-sm"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute end-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Filtered search results */}
                {filteredItems ? (
                  <div className="space-y-2">
                    <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground px-1">
                      Search Results ({filteredItems.length})
                    </p>
                    {filteredItems.length === 0 ? (
                      <div className="py-12 text-center text-muted-foreground">
                        <p className="text-sm font-semibold">No matching pages</p>
                        <p className="text-xs mt-1">Try searching &quot;programs&quot;, &quot;robotics&quot;, or &quot;partner&quot;</p>
                      </div>
                    ) : (
                      filteredItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => {
                              triggerHaptic(6);
                              setIsOpen(false);
                            }}
                            className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border/80 hover:border-primary/50 transition-all active:scale-[0.98]"
                          >
                            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                              {Icon && <Icon className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-foreground truncate">{item.label}</p>
                              <p className="text-[11px] text-muted-foreground truncate">{item.desc}</p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                          </Link>
                        );
                      })
                    )}
                  </div>
                ) : (
                  <>
                    {/* Primary User / Auth Conversion Cards */}
                    {user ? (
                      <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/25 flex items-center justify-between gap-3 shadow-sm">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                            Signed In
                          </p>
                          <p className="text-sm font-black text-foreground truncate">
                            {profile?.full_name || user.email}
                          </p>
                          <p className="text-[11px] text-muted-foreground capitalize">
                            {profile?.role || 'Member'}
                          </p>
                        </div>
                        <Link
                          href="/dashboard"
                          onClick={() => {
                            triggerHaptic(8);
                            setIsOpen(false);
                          }}
                          className="px-4 py-2.5 rounded-xl bg-primary text-white font-black text-xs uppercase tracking-wider shadow-md hover:bg-primary/90 shrink-0 flex items-center gap-1.5 active:scale-95"
                        >
                          <Zap className="w-3.5 h-3.5 fill-current" />
                          <span>Dashboard</span>
                        </Link>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2.5">
                        <Link
                          href="/student-registration"
                          onClick={() => {
                            triggerHaptic(8);
                            setIsOpen(false);
                          }}
                          className="p-4 rounded-2xl bg-gradient-to-br from-brand-red-600 via-primary to-brand-red-500 text-white flex flex-col justify-between shadow-lg shadow-brand-red-600/20 active:scale-[0.98] transition-transform"
                        >
                          <AcademicCapIcon className="w-6 h-6 text-white/90 mb-3" />
                          <div>
                            <p className="text-xs font-black uppercase tracking-wider leading-tight">
                              Enrol Learner
                            </p>
                            <p className="text-[10px] text-white/80 mt-0.5">Coding &amp; AI intake</p>
                          </div>
                        </Link>

                        <Link
                          href="/school-registration"
                          onClick={() => {
                            triggerHaptic(8);
                            setIsOpen(false);
                          }}
                          className="p-4 rounded-2xl bg-card border-2 border-border text-foreground flex flex-col justify-between shadow-sm active:scale-[0.98] transition-transform hover:border-brand-red-600/60"
                        >
                          <BuildingOffice2Icon className="w-6 h-6 text-brand-red-600 dark:text-brand-red-500 mb-3" />
                          <div>
                            <p className="text-xs font-black uppercase tracking-wider leading-tight">
                              Partner School
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">₦0 CapEx delivery</p>
                          </div>
                        </Link>
                      </div>
                    )}

                    {/* Section 1: Academic Hub */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">
                        Academics &amp; Syllabus
                      </p>
                      <div className="rounded-2xl border border-border bg-card/80 divide-y divide-border/60 overflow-hidden">
                        {mainLinks.map(({ href, label, icon: Icon, desc }) => {
                          const isSpecial =
                            href === cta.href ||
                            href.startsWith('/special/') ||
                            href === '/summer-school';
                          return (
                            <Link
                              key={href}
                              href={href}
                              onClick={() => {
                                triggerHaptic(6);
                                setIsOpen(false);
                              }}
                              className={`flex items-center justify-between p-3.5 transition-colors active:bg-muted ${
                                isActive(href) ? 'bg-primary/5 text-primary' : 'hover:bg-muted/50'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                    isActive(href)
                                      ? 'bg-primary text-white shadow-sm'
                                      : isSpecial
                                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                      : 'bg-muted text-muted-foreground'
                                  }`}
                                >
                                  {Icon && <Icon className="w-4 h-4" />}
                                </div>
                                <div className="min-w-0">
                                  <p
                                    className={`text-sm font-bold truncate ${
                                      isActive(href) ? 'text-primary' : 'text-foreground'
                                    }`}
                                  >
                                    {label}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground truncate">{desc}</p>
                                </div>
                              </div>
                              <ArrowRight className="w-4 h-4 text-muted-foreground/60 shrink-0" />
                            </Link>
                          );
                        })}
                      </div>
                    </div>

                    {/* Section 2: Institutional & Trust */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">
                        Schools, Trust &amp; Portals
                      </p>
                      <div className="rounded-2xl border border-border bg-card/80 divide-y divide-border/60 overflow-hidden">
                        {secondaryLinks.map(({ href, label, icon: Icon, desc }) => (
                          <Link
                            key={href}
                            href={href}
                            onClick={() => {
                              triggerHaptic(6);
                              setIsOpen(false);
                            }}
                            className={`flex items-center justify-between p-3.5 transition-colors active:bg-muted ${
                              isActive(href) ? 'bg-primary/5 text-primary' : 'hover:bg-muted/50'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                  isActive(href)
                                    ? 'bg-primary text-white'
                                    : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {Icon && <Icon className="w-4 h-4" />}
                              </div>
                              <div className="min-w-0">
                                <p
                                  className={`text-sm font-bold truncate ${
                                    isActive(href) ? 'text-primary' : 'text-foreground'
                                  }`}
                                >
                                  {label}
                                </p>
                                <p className="text-[11px] text-muted-foreground truncate">{desc}</p>
                              </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-muted-foreground/60 shrink-0" />
                          </Link>
                        ))}
                      </div>
                    </div>

                    {/* Direct WhatsApp Helpline */}
                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => triggerHaptic(8)}
                      className="flex items-center justify-between p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 active:scale-[0.98] transition-transform"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-md">
                          <MessageCircle className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase tracking-wider">
                            Chat on WhatsApp
                          </p>
                          <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80 font-medium">
                            {brandContact.phone} · Instant Admissions
                          </p>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 shrink-0" />
                    </a>

                    {/* Portal Login or Sign Out */}
                    <div className="pt-1">
                      {!user ? (
                        <Link
                          href={LOGIN_HREF}
                          onClick={() => {
                            triggerHaptic(6);
                            setIsOpen(false);
                          }}
                          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-card border border-border text-foreground font-bold text-xs uppercase tracking-wider shadow-sm active:scale-95"
                        >
                          <UserIcon className="w-4 h-4 text-muted-foreground" />
                          <span>Staff, School &amp; Parent Login</span>
                        </Link>
                      ) : (
                        <a
                          href="/api/auth/signout"
                          onClick={() => triggerHaptic(8)}
                          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 font-bold text-xs uppercase tracking-wider active:scale-95"
                        >
                          <ArrowLeftOnRectangleIcon className="w-4 h-4" />
                          <span>Sign Out</span>
                        </a>
                      )}
                    </div>

                    {/* Accreditation Footer */}
                    <div className="text-center pt-2 pb-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                        {brandContact.registeredName} · {brandContact.rcNumber}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
      </AnimatePresence>
    </>
  );
};

export default Navigation;