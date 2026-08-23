// @refresh reset
"use client";

import React, { useState, useEffect, useMemo } from 'react';
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
  UserIcon,
  BuildingOffice2Icon,
  HomeIcon,
  InformationCircleIcon,
  PhoneIcon,
  AcademicCapIcon,
  Squares2X2Icon,
  PhotoIcon,
  DocumentCheckIcon,
} from '@/lib/icons';
import { ArrowRight, Rocket } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ThemeToggle from '@/components/ThemeToggle';
import { useFeaturedSpecialProgram } from '@/hooks/useFeaturedSpecialProgram';
import { isAppUtilityRoute } from '@/lib/layout/public-route-policy';
import {
  SCHOOL_REGISTRATION_PATH,
  STUDENT_REGISTRATION_PATH,
} from '@/lib/registration/enrollment-types';

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
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
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
    What the drawer lists, split by weight rather than by category.

    The menu used to carry two labelled sections of full-width rows plus a
    search field. Eleven destinations do not need searching — they need to be
    visible — so they are split instead into the handful somebody came here for
    and the rest, which sit two-up and take a quarter of the room.

    Partnering is promoted out of the secondary list: for a school proprietor it
    is the point of the site, not an also-ran.
  */
  const drawerPrimary = useMemo(() => [...mainLinks, secondaryLinks[0]], [mainLinks]);
  const drawerSecondary = useMemo(() => secondaryLinks.slice(1), []);

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
    } catch {
      // Haptics are decorative and throw on iOS Safari and under some permission
      // policies. Nothing about navigation depends on the buzz landing.
    }
  };

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
              {/*
                One screen, no scrolling.

                This drawer used to open onto a search field, three stacked
                conversion cards and eleven list rows carrying an icon, a label,
                a description and a chevron each — about 130px per destination,
                so reaching "Contact" meant scrolling through roughly three
                screens of menu. A navigation menu with eleven destinations does
                not need a search field to find them; it needs to show them.

                So: descriptions dropped, rows at 48px, secondary destinations in
                a two-column grid, and the whole thing measured to land inside
                the shortest phone we support. It still scrolls if a special
                programme adds a row on a very small screen — that is a safety
                valve, not the design.
              */}
              <div className="mx-auto max-w-lg px-4 pt-3.5 pb-2 flex flex-col gap-3">
                {/* The two things a visitor is most likely here to do. */}
                <div className="grid grid-cols-2 gap-2.5">
                  <Link
                    href={STUDENT_REGISTRATION_PATH}
                    onClick={() => triggerHaptic()}
                    className="flex flex-col justify-center rounded-2xl bg-gradient-to-br from-brand-red-600 via-primary to-brand-red-500 px-3.5 py-3 text-white shadow-lg shadow-brand-red-600/20 active:scale-[0.98] transition-transform min-h-[60px]"
                  >
                    <span className="text-sm font-black leading-tight">Enrol a Learner</span>
                    <span className="text-[10px] font-semibold text-white/80 mt-0.5">Coding &amp; AI intake</span>
                  </Link>
                  <Link
                    href={SCHOOL_REGISTRATION_PATH}
                    onClick={() => triggerHaptic()}
                    className="flex flex-col justify-center rounded-2xl border border-border bg-card px-3.5 py-3 text-foreground shadow-sm active:scale-[0.98] transition-transform min-h-[60px]"
                  >
                    <span className="text-sm font-black leading-tight">Partner School</span>
                    <span className="text-[10px] font-semibold text-muted-foreground mt-0.5">₦0 CapEx delivery</span>
                  </Link>
                </div>

                {/* The main destinations, one tap each. */}
                <nav
                  aria-label="Main"
                  className="rounded-2xl border border-border bg-card/70 overflow-hidden divide-y divide-border/60"
                >
                  {drawerPrimary.map(({ href, label, icon: Icon }) => {
                    const active = isActive(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => triggerHaptic()}
                        aria-current={active ? 'page' : undefined}
                        className={`flex items-center gap-3 px-3.5 min-h-12 py-2.5 transition-colors ${
                          active ? 'bg-primary/10' : 'active:bg-muted'
                        }`}
                      >
                        <Icon
                          className={`h-5 w-5 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`}
                        />
                        <span
                          className={`flex-1 text-[15px] font-bold truncate ${
                            active ? 'text-primary' : 'text-foreground'
                          }`}
                        >
                          {label}
                        </span>
                        <ChevronLeftIcon className="h-4 w-4 shrink-0 rotate-180 text-muted-foreground/50" />
                      </Link>
                    );
                  })}
                </nav>

                {/* Everything else, two up — present without taking a row each. */}
                <div>
                  <p className="px-1 pb-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">
                    More
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {drawerSecondary.map(({ href, label, icon: Icon }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => triggerHaptic()}
                        className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 min-h-11 py-2 text-xs font-bold text-foreground active:bg-muted transition-colors"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{label}</span>
                      </Link>
                    ))}
                  </div>
                </div>

                {/* The portal, last: the people who need it know they need it. */}
                <Link
                  href={LOGIN_HREF}
                  onClick={() => triggerHaptic()}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-muted/50 min-h-12 px-4 text-sm font-black text-foreground active:bg-muted transition-colors"
                >
                  <UserIcon className="h-4 w-4" />
                  {user ? 'My Dashboard' : 'Portal Login'}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </motion.div>
          )}
      </AnimatePresence>
    </>
  );
};

export default Navigation;