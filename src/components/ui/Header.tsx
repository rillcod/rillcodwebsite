// @refresh reset
"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { 
  Bars3Icon, 
  XMarkIcon, 
  ChevronDownIcon,
  AcademicCapIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
  ComputerDesktopIcon
} from "@/lib/icons";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [menuOpen]);

  const navigation = {
    main: [
      { href: "/", label: "Home" },
      { href: "/about", label: "About Us" },
      { href: "/programs", label: "Programs" },
      { href: "/schools", label: "Partner Schools" },
    ],
    resources: [
      { href: "/blog", label: "Blog" },
      { href: "/events", label: "Events" },
      { href: "/gallery", label: "Gallery" },
      { href: "/student-projects", label: "Student Projects" },
    ],
    support: [
      { href: "/testimonials", label: "Testimonials" },
      { href: "/team", label: "Our Team" },
      { href: "/faq", label: "FAQ" },
      { href: "/contact", label: "Contact" },
    ],
    portals: [
      { href: "/student/login", label: "Student Portal", icon: ComputerDesktopIcon },
      { href: "/teacher/login", label: "Teacher Portal", icon: UserGroupIcon },
      { href: "/partner/login", label: "School Portal", icon: BuildingOfficeIcon },
      { href: "/admin/login", label: "Admin Portal", icon: AcademicCapIcon },
    ]
  };

  const handleDropdownToggle = (dropdown: string) => {
    setActiveDropdown(activeDropdown === dropdown ? null : dropdown);
  };

  const closeMenu = () => {
    setMenuOpen(false);
    setActiveDropdown(null);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#121212]/95 backdrop-blur-xl border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2 group">
            <Image
              src="/images/logo.png"
              alt="Rillcod Technologies"
              width={140}
              height={40}
              unoptimized
              className="h-10 w-auto object-contain transition-transform duration-300 group-hover:scale-105 mix-blend-multiply"
            />
            <span className="text-xl md:text-2xl font-black text-white transition-colors duration-300 uppercase tracking-tight italic">
              Rillcod <span className="text-orange-500">Technologies</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-8">
            {navigation.main.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[10px] font-black text-slate-400 hover:text-orange-500 uppercase tracking-widest transition-colors duration-200 relative group"
              >
                {link.label}
                <span className="absolute -bottom-1 left-0 w-0 h-px bg-orange-500 transition-all duration-200 group-hover:w-full"></span>
              </Link>
            ))}

            <div className="relative">
              <button
                onClick={() => handleDropdownToggle('resources')}
                className="text-[10px] font-black text-slate-400 hover:text-orange-500 uppercase tracking-widest transition-colors duration-200 flex items-center gap-2 group"
              >
                <span>Resources</span>
                <ChevronDownIcon className={`w-3 h-3 transition-transform duration-200 ${activeDropdown === 'resources' ? 'rotate-180' : ''}`} />
              </button>
              {activeDropdown === 'resources' && (
                <div className="absolute top-full left-0 mt-4 w-56 bg-[#1a1a1a] border border-white/10 rounded-none shadow-2xl py-3 z-50">
                  {navigation.resources.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="block px-6 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-white/5 hover:text-orange-500 transition-colors"
                      onClick={() => setActiveDropdown(null)}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => handleDropdownToggle('support')}
                className="text-[10px] font-black text-slate-400 hover:text-orange-500 uppercase tracking-widest transition-colors duration-200 flex items-center gap-2 group"
              >
                <span>Support</span>
                <ChevronDownIcon className={`w-3 h-3 transition-transform duration-200 ${activeDropdown === 'support' ? 'rotate-180' : ''}`} />
              </button>
              {activeDropdown === 'support' && (
                <div className="absolute top-full left-0 mt-4 w-56 bg-[#1a1a1a] border border-white/10 rounded-none shadow-2xl py-3 z-50">
                  {navigation.support.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="block px-6 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-white/5 hover:text-orange-500 transition-colors"
                      onClick={() => setActiveDropdown(null)}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <Link
              href="/careers"
              className="font-semibold text-gray-700 dark:text-gray-300 hover:text-[#FF914D] transition-colors duration-200"
            >
              Careers
            </Link>

            <div className="relative">
              <button
                onClick={() => handleDropdownToggle('portals')}
                className="bg-orange-500 text-white px-8 py-3 rounded-none text-[10px] font-black uppercase tracking-[0.3em] hover:bg-orange-600 transition-all flex items-center gap-3 shadow-xl shadow-orange-500/20"
              >
                <span>Login Hub</span>
                <ChevronDownIcon className={`w-3 h-3 transition-transform duration-200 ${activeDropdown === 'portals' ? 'rotate-180' : ''}`} />
              </button>
              {activeDropdown === 'portals' && (
                <div className="absolute top-full right-0 mt-4 w-64 bg-[#1a1a1a] border border-white/10 rounded-none shadow-2xl py-3 z-50">
                  <div className="px-6 py-2 border-b border-white/5 mb-2">
                     <span className="text-[8px] font-black text-slate-600 uppercase tracking-[0.3em]">Access Protocols</span>
                  </div>
                  {navigation.portals.map((link) => {
                    const Icon = link.icon;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="flex items-center gap-4 px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
                        onClick={() => setActiveDropdown(null)}
                      >
                        <Icon className="w-4 h-4 text-orange-500" />
                        <span>{link.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>

          <button
            className="lg:hidden p-4 bg-white/5 border border-white/10 text-white transition-colors"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <XMarkIcon className="h-6 w-6" />
            ) : (
              <Bars3Icon className="h-6 w-6" />
            )}
          </button>
        </div>

        {/* Mobile Navigation */}
        {menuOpen && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 top-16 bg-black/80 backdrop-blur-md z-40 lg:hidden"
              onClick={closeMenu}
            />
            
            {/* Mobile Menu */}
            <div className="lg:hidden fixed inset-0 top-16 bg-[#121212] z-50 overflow-y-auto border-t border-white/5">
              <nav className="flex flex-col p-8 space-y-2">
                <div className="mb-8">
                  <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-[0.4em] mb-6">Navigation</h3>
                  {navigation.main.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="block text-xl font-black text-white uppercase italic tracking-tighter hover:text-orange-500 transition-colors py-4 border-b border-white/5"
                      onClick={closeMenu}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-px bg-white/5 border border-white/10 mb-8">
                   <div className="bg-[#1a1a1a] p-6">
                      <h3 className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-4">Resources</h3>
                      {navigation.resources.map((link) => (
                        <Link key={link.href} href={link.href} onClick={closeMenu} className="block text-[10px] font-black text-slate-400 uppercase tracking-widest py-3 hover:text-white">
                           {link.label}
                        </Link>
                      ))}
                   </div>
                   <div className="bg-[#1a1a1a] p-6">
                      <h3 className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-4">Support</h3>
                      {navigation.support.map((link) => (
                        <Link key={link.href} href={link.href} onClick={closeMenu} className="block text-[10px] font-black text-slate-400 uppercase tracking-widest py-3 hover:text-white">
                           {link.label}
                        </Link>
                      ))}
                   </div>
                </div>

                <div className="pt-8">
                  <h3 className="text-[10px] font-black text-orange-500 uppercase tracking-[0.4em] mb-6">Secure Access</h3>
                  <div className="grid grid-cols-1 gap-4">
                    {navigation.portals.map((link) => {
                      const Icon = link.icon;
                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          className="flex items-center gap-4 bg-white/5 border border-white/10 p-5 text-[10px] font-black uppercase tracking-widest text-white hover:border-orange-500 transition-all"
                          onClick={closeMenu}
                        >
                          <Icon className="w-4 h-4 text-orange-500" />
                          <span>{link.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </nav>
            </div>
          </>
        )}
      </div>
    </header>
  );
} 