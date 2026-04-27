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

type NavIcon = React.ComponentType<{ className?: string }>;

/* ─── Nav data ─────────────────────────────────────────────── */
const mainLinks = [
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
        className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-300 border-b ${
          isScrolled
            ? 'bg-background/95 backdrop-blur-md border-border shadow-2xl py-2'
            : 'bg-background/95 backdrop-blur-sm border-border py-4'
        }`}
      >
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-10">
          <div className="flex items-center justify-between h-16">

            {/* ── Brand ── */}
            <Link href="/" className="flex items-center gap-2 sm:gap-3 group focus:outline-none">
              <div className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl overflow-hidden group-hover:scale-105 transition-all dark:bg-white shrink-0">
                <Image src="/images/logo.png" alt="Rillcod Technologies" width={36} height={36} className="w-[85%] h-[85%] object-contain" />
              </div>
              <div className="text-foreground leading-none">
                <span className="text-2xl sm:text-3xl font-black uppercase tracking-tight block leading-tight italic">
                   RILLCOD<span className="text-brand-red-600 not-italic">.</span>
                </span>
                <span className="text-xs sm:text-sm font-black uppercase tracking-[0.15em] block text-muted-foreground">
                  Technologies
                </span>
              </div>
            </Link>

            {/* ── Desktop Nav ── */}
            <div className="hidden lg:flex items-center gap-1">
              {mainLinks.map(({ href, label, icon: Icon }) => (
                <Link suppressHydrationWarning key={href} href={href} className={navLinkCls(href)}>
                   {label}
                </Link>
              ))}

              {/* Secure Dropdown */}
              <div className="relative group ml-4">
                 <button className="flex items-center gap-3 px-6 py-2.5 bg-card shadow-sm border border-border text-[10px] font-black uppercase tracking-widest text-foreground hover:bg-muted transition-all rounded-xl">
                    More <ChevronDownIcon className="w-3 h-3 group-hover:rotate-180 transition-transform" />
                 </button>
                 <div className="absolute top-full right-0 mt-2 w-64 bg-card border border-border rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 p-2">
                    {secondaryLinks.map(({ href, label, icon: Icon, sub }) => (
                      <Link key={href} href={href} className="flex flex-col p-4 hover:bg-muted shadow-sm transition-colors border-l-2 border-l-transparent hover:border-l-brand-red-600">
                         <span className="text-[10px] font-black text-foreground uppercase tracking-widest">{label}</span>
                         <span className="text-[8px] text-muted-foreground font-bold uppercase mt-1">{sub}</span>
                      </Link>
                    ))}
                 </div>
              </div>
            </div>

            {/* ── Actions ── */}
            <div suppressHydrationWarning className="flex items-center gap-4">
              <div className="hidden sm:block">
                <ThemeToggle />
              </div>
              {mounted && !authLoading && (
                user ? (
                  <Link href="/dashboard"
                    className="hidden sm:flex items-center gap-3 px-8 py-3 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-primary transition-all shadow-xl shadow-primary/10">
                    <Squares2X2Icon className="w-4 h-4" /> Dashboard
                  </Link>
                ) : (
                  <div className="hidden sm:flex items-center gap-3">
                    <Link href={LOGIN_HREF}
                      className="px-6 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-widest hover:text-foreground transition-colors">
                      Portal Login
                    </Link>
                    <Link href="/student-registration"
                      className="px-8 py-3 bg-foreground text-background text-[10px] font-black uppercase tracking-widest rounded-xl hover:opacity-90 transition-all shadow-xl">
                      Register Student
                    </Link>
                  </div>
                )
              )}

              {/* Mobile Burger */}
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="lg:hidden p-3 bg-card shadow-sm border border-border text-foreground rounded-xl hover:bg-muted transition-all"
              >
                {isOpen ? <XMarkIcon className="w-6 h-6" /> : <Bars3Icon className="w-6 h-6" />}
              </button>
            </div>

          </div>
        </div>

        {/* ── Mobile Menu ── */}
        {mounted && isOpen && (
          <div className="lg:hidden border-t border-border bg-background overflow-y-auto max-h-[calc(100vh-72px)]">
             <div className="p-8 space-y-10 animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="flex items-center justify-between">
                   <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.4em]">Command Center</p>
                   <ThemeToggle />
                </div>
                <div className="grid gap-2">
                   {[...mainLinks, ...secondaryLinks].map(({ href, label }) => (
                     <Link key={href} href={href} className="text-lg sm:text-xl font-black text-foreground uppercase tracking-tight hover:text-primary transition-colors py-2 italic">
                        {label}
                     </Link>
                   ))}
                </div>

                <div className="pt-10 border-t border-border space-y-6">
                   <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.4em]">System Uplink</p>
                   {user ? (
                     <Link href="/dashboard" className="flex items-center justify-center gap-3 w-full py-6 bg-primary text-white text-xs font-black uppercase tracking-[0.2em] rounded-xl shadow-2xl shadow-primary/20">
                        <Zap className="w-4 h-4" /> Enter Dashboard
                     </Link>
                   ) : (
                     <div className="grid gap-4">
                        <Link href="/student-registration" className="flex items-center justify-center py-6 bg-primary text-white text-xs font-black uppercase tracking-[0.2em] rounded-xl shadow-xl shadow-primary/10">
                           Register Student
                        </Link>
                        <Link href="/school-registration" className="flex items-center justify-center py-6 bg-foreground text-background text-xs font-black uppercase tracking-[0.2em] rounded-xl shadow-xl">
                           Register School
                        </Link>
                        <Link href={LOGIN_HREF} className="flex items-center justify-center py-6 bg-card shadow-sm border border-border text-foreground text-xs font-black uppercase tracking-[0.2em] rounded-xl">
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