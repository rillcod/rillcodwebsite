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
    `flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all rounded-none ${isActive(href)
      ? 'text-orange-500 bg-white/5'
      : 'text-slate-300 hover:text-white hover:bg-white/5'
    }`;

  return (
    <>
      <nav
        suppressHydrationWarning
        className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-300 border-b ${isScrolled
          ? 'bg-[#121212]/95 backdrop-blur-md border-white/10 shadow-2xl py-2'
          : 'bg-transparent border-transparent py-4'
          }`}
      >
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-10">
          <div className="flex items-center justify-between h-16">

            {/* ── Brand ── */}
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-12 h-12 bg-[#f8f8f8] border border-white/20 flex items-center justify-center rounded-none group-hover:scale-105 transition-all ring-1 ring-orange-500/50 ring-offset-2 ring-offset-[#121212]">
                <Image src="/images/logo.png" alt="Rillcod Academy" width={32} height={32} className="object-contain" />
              </div>
              <div className="hidden sm:block text-white">
                <span className="text-xl font-black uppercase tracking-tight block leading-none italic">
                  RILLCOD<span className="text-orange-500 not-italic">.</span>
                </span>
                <p className="text-[8px] font-black text-white/30 uppercase tracking-[0.4em] leading-none mt-1">
                  TECHNOLOGIES
                </p>
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
                 <button className="flex items-center gap-3 px-6 py-2.5 bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10 transition-all rounded-none">
                    Protocol <ChevronDownIcon className="w-3 h-3 group-hover:rotate-180 transition-transform" />
                 </button>
                 <div className="absolute top-full right-0 mt-2 w-64 bg-[#1a1a1a] border border-white/10 rounded-none shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 p-2">
                    {secondaryLinks.map(({ href, label, icon: Icon, sub }) => (
                      <Link key={href} href={href} className="flex flex-col p-4 hover:bg-white/5 transition-colors border-l-2 border-l-transparent hover:border-l-orange-500">
                         <span className="text-[10px] font-black text-white uppercase tracking-widest">{label}</span>
                         <span className="text-[8px] text-slate-500 font-bold uppercase mt-1">{sub}</span>
                      </Link>
                    ))}
                 </div>
              </div>
            </div>

            {/* ── Actions ── */}
            <div suppressHydrationWarning className="flex items-center gap-4">
              {mounted && !authLoading && (
                user ? (
                  <Link href="/dashboard"
                    className="hidden sm:flex items-center gap-3 px-8 py-3 bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest rounded-none hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/10">
                    <Squares2X2Icon className="w-4 h-4" /> Dashboard
                  </Link>
                ) : (
                  <div className="hidden sm:flex items-center gap-3">
                    <Link href={LOGIN_HREF}
                      className="px-6 py-3 text-[10px] font-black text-slate-300 uppercase tracking-widest hover:text-white transition-colors">
                      Portal Login
                    </Link>
                    <Link href="/student-registration"
                      className="px-8 py-3 bg-white text-black text-[10px] font-black uppercase tracking-widest rounded-none hover:bg-slate-200 transition-all shadow-xl">
                      Register Student
                    </Link>
                  </div>
                )
              )}

              {/* Mobile Burger */}
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="lg:hidden p-3 bg-white/5 border border-white/10 text-white rounded-none hover:bg-white/10 transition-all"
              >
                {isOpen ? <XMarkIcon className="w-6 h-6" /> : <Bars3Icon className="w-6 h-6" />}
              </button>
            </div>

          </div>
        </div>

        {/* ── Mobile Menu ── */}
        {mounted && isOpen && (
          <div className="fixed inset-0 top-[72px] z-[90] lg:hidden bg-[#121212]/98 backdrop-blur-xl border-t border-white/5 overflow-y-auto">
             <div className="p-8 space-y-10">
                <div className="grid gap-2">
                   <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.4em] mb-4">Command Center</p>
                   {[...mainLinks, ...secondaryLinks].map(({ href, label }) => (
                     <Link key={href} href={href} className="text-lg sm:text-xl font-black text-white uppercase tracking-tight hover:text-orange-500 transition-colors py-2">
                        {label}
                     </Link>
                   ))}
                </div>

                <div className="pt-10 border-t border-white/5 space-y-6">
                   <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.4em]">System Uplink</p>
                   {user ? (
                     <Link href="/dashboard" className="flex items-center justify-center gap-3 w-full py-6 bg-orange-500 text-white text-xs font-black uppercase tracking-[0.2em] rounded-none shadow-2xl shadow-orange-500/20">
                        <Zap className="w-4 h-4" /> Enter Dashboard
                     </Link>
                   ) : (
                     <div className="grid gap-4">
                        <Link href="/school-registration" className="flex items-center justify-center py-6 bg-white text-black text-xs font-black uppercase tracking-[0.2em] rounded-none shadow-xl">
                           Register School
                        </Link>
                        <Link href={LOGIN_HREF} className="flex items-center justify-center py-6 bg-white/5 border border-white/10 text-white text-xs font-black uppercase tracking-[0.2em] rounded-none">
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