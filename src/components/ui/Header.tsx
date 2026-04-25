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
      { href: "/student-registration", label: "Register Student" },
      { href: "/school-registration", label: "Register School" },
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
      { href: "/student-registration", label: "Register Student", icon: UserGroupIcon },
      { href: "/school-registration", label: "Register School", icon: BuildingOfficeIcon },
      { type: 'divider' },
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
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-4 group">
            <div className="w-14 h-14 bg-primary flex items-center justify-center rounded-none shadow-xl shadow-primary/20 group-hover:scale-110 transition-transform duration-300">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-white"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 3.741-3.342" /></svg>
            </div>
            <div>
                <h3 className="text-xl font-black text-foreground uppercase tracking-tight block leading-none italic">
                    RILLCOD<span className="text-primary not-italic">.</span>
                </h3>
                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.4em] leading-none mt-1.5 whitespace-nowrap">STEM Excellence</p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-8">
            {navigation.main.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[10px] font-black text-muted-foreground hover:text-primary uppercase tracking-widest transition-colors duration-200 relative group"
              >
                {link.label}
                <span className="absolute -bottom-1 left-0 w-0 h-px bg-primary transition-all duration-200 group-hover:w-full"></span>
              </Link>
            ))}

            <div className="relative">
              <button
                onClick={() => handleDropdownToggle('portals')}
                className="bg-primary text-primary-foreground px-8 py-3 rounded-none text-[10px] font-black uppercase tracking-[0.3em] hover:bg-primary/90 transition-all flex items-center gap-3 shadow-xl shadow-primary/20"
              >
                <span>Access Hub</span>
                <ChevronDownIcon className={`w-3 h-3 transition-transform duration-200 ${activeDropdown === 'portals' ? 'rotate-180' : ''}`} />
              </button>
              {activeDropdown === 'portals' && (
                <div className="absolute top-full right-0 mt-4 w-64 bg-card border border-border rounded-none shadow-2xl py-3 z-50">
                  <div className="px-6 py-2 border-b border-border mb-2">
                     <span className="text-[8px] font-black text-muted-foreground uppercase tracking-[0.3em]">Operational Protocols</span>
                  </div>
                  {navigation.portals.map((link, idx) => {
                    if ('type' in link && link.type === 'divider') return <div key={idx} className="h-px bg-border mx-6 my-2" />;
                    
                    const item = link as { href: string; label: string; icon: any };
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-4 px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        onClick={() => setActiveDropdown(null)}
                      >
                        <Icon className="w-4 h-4 text-primary fill-none" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>

          <button
            className="lg:hidden p-4 bg-muted border border-border text-foreground transition-colors"
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
              className="fixed inset-0 top-20 bg-background/90 backdrop-blur-xl z-[55] lg:hidden"
              onClick={closeMenu}
            />
            
            {/* Mobile Menu */}
            <div className="lg:hidden fixed inset-0 top-20 bg-background z-[60] overflow-y-auto border-t border-border h-[calc(100vh-80px)] shadow-2xl">
              <nav className="flex flex-col p-8 space-y-2">
                <div className="mb-8">
                  <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em] mb-6">Navigation</h3>
                  {navigation.main.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="block text-xl font-black text-foreground uppercase italic tracking-tighter hover:text-primary transition-colors py-4 border-b border-border"
                      onClick={closeMenu}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-px bg-muted border border-border mb-8">
                   <div className="bg-card p-6">
                      <h3 className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-4">Resources</h3>
                      {navigation.resources.map((link) => (
                        <Link key={link.href} href={link.href} onClick={closeMenu} className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest py-3 hover:text-foreground">
                           {link.label}
                        </Link>
                      ))}
                   </div>
                   <div className="bg-card p-6">
                      <h3 className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-4">Support</h3>
                      {navigation.support.map((link) => (
                        <Link key={link.href} href={link.href} onClick={closeMenu} className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest py-3 hover:text-foreground">
                           {link.label}
                        </Link>
                      ))}
                   </div>
                </div>

                <div className="pt-8">
                  <h3 className="text-[10px] font-black text-primary uppercase tracking-[0.4em] mb-6">Secure Access Hub</h3>
                  <div className="grid grid-cols-1 gap-4">
                    {navigation.portals.map((link, idx) => {
                      if ('type' in link && link.type === 'divider') return <div key={idx} className="h-px bg-border my-2" />;
                      
                      const item = link as { href: string; label: string; icon: any };
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="flex items-center gap-4 bg-muted border border-border p-5 text-[10px] font-black uppercase tracking-widest text-foreground hover:border-primary transition-all font-black"
                          onClick={closeMenu}
                        >
                          <Icon className="w-4 h-4 text-primary fill-none" />
                          <span>{item.label}</span>
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