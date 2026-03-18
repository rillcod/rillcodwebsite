// @refresh reset
"use client";
import React from 'react';
import Link from 'next/link';
import {
  EnvelopeIcon,
  PhoneIcon,
  MapPinIcon,
  ArrowUpIcon,
  AcademicCapIcon,
} from '@/lib/icons';

/* ── Inline SVGs for social icons (heroicons has no social icons) ── */
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
    </svg>
  );
}
function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
    </svg>
  );
}
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd" />
    </svg>
  );
}
function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}
function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path fillRule="evenodd" d="M19.812 5.418c.861.23 1.538.907 1.768 1.768C21.998 8.746 22 12 22 12s0 3.255-.418 4.814a2.504 2.504 0 0 1-1.768 1.768c-1.56.419-7.814.419-7.814.419s-6.255 0-7.814-.419a2.505 2.505 0 0 1-1.768-1.768C2 15.255 2 12 2 12s0-3.255.417-4.814a2.507 2.507 0 0 1 1.768-1.768C5.744 5 11.998 5 11.998 5s6.255 0 7.814.418ZM15.194 12 10 15V9l5.194 3Z" clipRule="evenodd" />
    </svg>
  );
}

const Footer = () => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const [currentYear, setCurrentYear] = React.useState(2024);
  React.useEffect(() => { setCurrentYear(new Date().getFullYear()); }, []);

  const quickLinks = [
    { href: '/', label: 'Home' },
    { href: '/about', label: 'About Us' },
    { href: '/programs', label: 'Programs' },
    { href: '/curriculum', label: 'Curriculum' },
    { href: '/contact', label: 'Contact' },
  ];

  const programs = [
    { href: '/programs', label: 'Python Programming' },
    { href: '/programs', label: 'Web Architecture' },
    { href: '/programs', label: 'Robotics & IoT' },
    { href: '/programs', label: 'AI & Data Science' },
  ];

  return (
    <footer className="bg-[#0a0a0a] text-white border-t border-white/5 py-24 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-blue-600/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-orange-600/5 blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-16 mb-24">
          
          {/* Brand Info */}
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-orange-500 flex items-center justify-center rounded-none shadow-xl shadow-orange-500/20">
                <AcademicCapIcon className="w-7 h-7 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter leading-none">
                  Rillcod <br />
                  <span className="text-orange-500">Technologies.</span>
                </h3>
              </div>
            </div>
            
            <p className="text-sm text-slate-500 font-bold italic leading-relaxed border-l-2 border-orange-500 pl-6">
              Engineering the next generation of African tech leaders through standardized curriculum and AI-powered learning architectures.
            </p>

            <div className="space-y-4 pt-4">
               <div className="flex items-start gap-4 group">
                  <MapPinIcon className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest leading-relaxed">
                    No 26 Ogiesoba Aveune <br />
                    Off Airport Road, <br />
                    Benin City, Edo State.
                  </p>
               </div>
               <div className="flex items-center gap-4 group">
                  <PhoneIcon className="w-5 h-5 text-orange-500 flex-shrink-0" />
                  <p className="text-xs font-black text-white uppercase tracking-widest">08116600091</p>
               </div>
               <div className="flex items-center gap-4 group">
                  <EnvelopeIcon className="w-5 h-5 text-orange-500 flex-shrink-0" />
                  <p className="text-xs font-black text-white lowercase tracking-widest">info@rillcod.tech</p>
               </div>
            </div>
          </div>

          {/* Navigation */}
          <div>
            <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] mb-10 pb-4 border-b border-white/5">Quick Protocols</h4>
            <ul className="space-y-4">
              {quickLinks.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-xs font-black text-slate-400 hover:text-orange-500 transition-colors uppercase tracking-widest flex items-center gap-3 group">
                    <span className="w-1.5 h-1.5 bg-orange-500 rounded-none opacity-0 group-hover:opacity-100 transition-all" />
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Academic Paths */}
          <div>
            <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] mb-10 pb-4 border-b border-white/5">Academic Sectors</h4>
            <ul className="space-y-4">
              {programs.map((p) => (
                <li key={p.label}>
                  <Link href={p.href} className="text-xs font-black text-slate-400 hover:text-orange-500 transition-colors uppercase tracking-widest flex items-center gap-3 group">
                    <span className="w-1.5 h-1.5 bg-orange-500 rounded-none opacity-0 group-hover:opacity-100 transition-all" />
                    {p.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Newsletter / CTA */}
          <div>
            <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] mb-10 pb-4 border-b border-white/5">Initialize Uplink</h4>
            <p className="text-xs font-bold text-slate-500 italic mb-8">
              Stay synchronized with our latest technological deployment and curriculum updates.
            </p>
            <Link href="/student-registration" className="block w-full py-5 bg-orange-500 text-white text-[10px] font-black uppercase tracking-[0.4em] text-center rounded-none shadow-xl shadow-orange-500/20 hover:bg-orange-600 transition-all">
              Initialize Enrollment
            </Link>
          </div>

        </div>

        {/* Legal & Social */}
        <div className="pt-12 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-10">
          <div className="flex flex-wrap justify-center md:justify-start gap-8">
            <Link href="/privacy" className="text-[9px] font-black text-slate-600 hover:text-white uppercase tracking-widest transition-colors">Privacy Protocol</Link>
            <Link href="/terms" className="text-[9px] font-black text-slate-600 hover:text-white uppercase tracking-widest transition-colors">Terms of Service</Link>
          </div>

          <p className="text-[9px] font-black text-slate-700 uppercase tracking-[0.3em]" suppressHydrationWarning>
            © {currentYear} RILLCOD TECHNOLOGIES. ALL SYSTEMS OPERATIONAL.
          </p>

          <button onClick={scrollToTop} className="flex items-center gap-4 text-xs font-black text-orange-500 uppercase tracking-widest hover:text-white transition-all group">
            Top <ArrowUpIcon className="w-4 h-4 group-hover:-translate-y-1 transition-transform" />
          </button>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
