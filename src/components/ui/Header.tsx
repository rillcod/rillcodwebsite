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
} from "@heroicons/react/24/outline";

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
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-700/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2 group">
            <Image
              src="https://res.cloudinary.com/dpigtwit0/image/upload/v1747032682/PhotoRoom-20250512_074926_zgudyt.png"
              alt="Rillcod Academy"
              width={160}
              height={40}
              unoptimized
              className="h-10 w-auto transition-transform duration-300 group-hover:scale-105"
            />
            <span className="text-xl md:text-2xl font-bold text-[#FF914D] transition-colors duration-300">
              Rillcod Academy
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-8">
            {navigation.main.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="font-semibold text-gray-700 dark:text-gray-300 hover:text-[#FF914D] transition-colors duration-200 relative group"
              >
                {link.label}
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-[#FF914D] transition-all duration-200 group-hover:w-full"></span>
              </Link>
            ))}

            <div className="relative">
              <button
                onClick={() => handleDropdownToggle('resources')}
                className="font-semibold text-gray-700 dark:text-gray-300 hover:text-[#FF914D] transition-colors duration-200 flex items-center space-x-1 group"
              >
                <span>Resources</span>
                <ChevronDownIcon className={`w-4 h-4 transition-transform duration-200 ${activeDropdown === 'resources' ? 'rotate-180' : ''}`} />
              </button>
              {activeDropdown === 'resources' && (
                <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-50">
                  {navigation.resources.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-[#FF914D] transition-colors duration-200"
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
                className="font-semibold text-gray-700 dark:text-gray-300 hover:text-[#FF914D] transition-colors duration-200 flex items-center space-x-1 group"
              >
                <span>Support</span>
                <ChevronDownIcon className={`w-4 h-4 transition-transform duration-200 ${activeDropdown === 'support' ? 'rotate-180' : ''}`} />
              </button>
              {activeDropdown === 'support' && (
                <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-50">
                  {navigation.support.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-[#FF914D] transition-colors duration-200"
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
                className="bg-[#FF914D] text-white px-4 py-2 rounded-lg font-semibold hover:bg-[#e67e3d] transition-colors duration-200 flex items-center space-x-2"
              >
                <span>Access Portal</span>
                <ChevronDownIcon className={`w-4 h-4 transition-transform duration-200 ${activeDropdown === 'portals' ? 'rotate-180' : ''}`} />
              </button>
              {activeDropdown === 'portals' && (
                <div className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-50">
                  {navigation.portals.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="flex items-center space-x-3 px-4 py-3 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-[#FF914D] transition-colors duration-200"
                      onClick={() => setActiveDropdown(null)}
                    >
                      <link.icon className="w-5 h-5" />
                      <span>{link.label}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </nav>

          <button
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <XMarkIcon className="h-6 w-6 text-gray-700 dark:text-gray-300" />
            ) : (
              <Bars3Icon className="h-6 w-6 text-gray-700 dark:text-gray-300" />
            )}
          </button>
        </div>

        {/* Mobile Navigation */}
        {menuOpen && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 top-16 bg-black/50 z-40 lg:hidden"
              onClick={closeMenu}
            />
            
            {/* Mobile Menu */}
            <div className="lg:hidden fixed inset-0 top-16 bg-white dark:bg-gray-900 z-50 overflow-y-auto">
              <nav className="flex flex-col p-6 space-y-4 max-h-screen">
                <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Main</h3>
                  {navigation.main.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="block text-gray-700 dark:text-gray-300 hover:text-[#FF914D] font-medium text-lg transition-all duration-200 py-2"
                      onClick={closeMenu}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>

                <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Resources</h3>
                  {navigation.resources.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="block text-gray-700 dark:text-gray-300 hover:text-[#FF914D] font-medium text-lg transition-all duration-200 py-2"
                      onClick={closeMenu}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>

                <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Support</h3>
                  {navigation.support.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="block text-gray-700 dark:text-gray-300 hover:text-[#FF914D] font-medium text-lg transition-all duration-200 py-2"
                      onClick={closeMenu}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>

                <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                  <Link
                    href="/careers"
                    className="block text-gray-700 dark:text-gray-300 hover:text-[#FF914D] font-medium text-lg transition-all duration-200 py-2"
                    onClick={closeMenu}
                  >
                    Careers
                  </Link>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Portal Access</h3>
                  {navigation.portals.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="flex items-center space-x-3 text-gray-700 dark:text-gray-300 hover:text-[#FF914D] font-medium text-lg transition-all duration-200 py-2"
                      onClick={closeMenu}
                    >
                      <link.icon className="w-5 h-5" />
                      <span>{link.label}</span>
                    </Link>
                  ))}
                </div>
              </nav>
            </div>
          </>
        )}
      </div>
    </header>
  );
} 