"use client";
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Menu, X, User, School, Users, GraduationCap, BookOpen, Info, HelpCircle, LogIn, ChevronDown, Shield, UserCheck, Facebook, Twitter, Instagram, Linkedin, Youtube, ChevronRight } from 'lucide-react';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';
import { brandColors, contactInfo, socialLinks } from '../config/brand';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoginDropdownOpen, setIsLoginDropdownOpen] = useState(false);
  const [isAboutDropdownOpen, setIsAboutDropdownOpen] = useState(false);
  const loginDropdownRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Get theme context safely
  let themeContext;
  let mounted = false;
  let theme = 'light';
  
  try {
    const { useTheme } = require('@/contexts/theme-context');
    themeContext = useTheme();
    theme = themeContext.theme;
    mounted = themeContext.mounted;
  } catch (error) {
    // If theme context is not available, use defaults
    themeContext = { theme: 'light', mounted: false, toggleTheme: () => {} };
    theme = 'light';
    mounted = false;
  }

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
  const toggleDropdown = () => setIsDropdownOpen(!isDropdownOpen);
  const toggleAboutDropdown = () => setIsAboutDropdownOpen(!isAboutDropdownOpen);
  const toggleLoginDropdown = () => setIsLoginDropdownOpen(!isLoginDropdownOpen);

  // Close mobile menu when clicking on a link
  const closeMobileMenu = () => {
    setIsMenuOpen(false);
    setIsDropdownOpen(false);
    setIsAboutDropdownOpen(false);
  };

  // Close login dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (loginDropdownRef.current && !loginDropdownRef.current.contains(event.target as Node)) {
        setIsLoginDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        closeMobileMenu();
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  // Close mobile menu on route change
  useEffect(() => {
    const handleRouteChange = () => {
      closeMobileMenu();
    };

    // Listen for route changes (Next.js router events)
    window.addEventListener('popstate', handleRouteChange);
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMenuOpen]);

  // Prevent hydration mismatch by not rendering theme-dependent content until mounted
  if (!mounted) {
    return (
      <header className="bg-white shadow-lg sticky top-0 z-50">
        {/* Top Bar with Social Media Icons */}
        <div className={`bg-gradient-to-r ${brandColors.primary.gradient} text-white`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-10">
              {/* Contact Info */}
              <div className="hidden sm:flex items-center space-x-4 text-sm">
                <span>📧 {contactInfo.email}</span>
                <span>📞 {contactInfo.phone}</span>
              </div>
              
              {/* Social Media Icons */}
              <div className="flex items-center space-x-3">
                <Link href={socialLinks.facebook} className="text-white hover:text-blue-200 transition-colors duration-200">
                  <Facebook className="w-4 h-4" />
                </Link>
                <Link href={socialLinks.twitter} className="text-white hover:text-blue-200 transition-colors duration-200">
                  <Twitter className="w-4 h-4" />
                </Link>
                <Link href={socialLinks.instagram} className="text-white hover:text-blue-200 transition-colors duration-200">
                  <Instagram className="w-4 h-4" />
                </Link>
                <Link href={socialLinks.linkedin} className="text-white hover:text-blue-200 transition-colors duration-200">
                  <Linkedin className="w-4 h-4" />
                </Link>
                <Link href={socialLinks.youtube} className="text-white hover:text-blue-200 transition-colors duration-200">
                  <Youtube className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Main Header Navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex-shrink-0">
              <Link href="/" className="flex items-center hover:scale-105 transition-transform duration-200">
                <Logo size="lg" />
              </Link>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-8">
              {/* Programs Dropdown */}
              <div className="relative group">
                <button className="flex items-center space-x-1 text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                  <BookOpen className="w-4 h-4" />
                  <span>Programs</span>
                </button>
                <div className="absolute left-0 mt-2 w-48 bg-white rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <div className="py-1">
                    <Link href="/programs" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">All Programs</Link>
                    <Link href="/curriculum" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Curriculum</Link>
                    <Link href="/student-journey" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Student Journey</Link>
                  </div>
                </div>
              </div>

              {/* About Dropdown */}
              <div className="relative group">
                <button className="flex items-center space-x-1 text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                  <Info className="w-4 h-4" />
                  <span>About</span>
                </button>
                <div className="absolute left-0 mt-2 w-48 bg-white rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <div className="py-1">
                    <Link href="/about" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">About Us</Link>
                    <Link href="/team" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Our Team</Link>
                    <Link href="/testimonials" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Testimonials</Link>
                    <Link href="/gallery" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Gallery</Link>
                  </div>
                </div>
              </div>

              {/* Support */}
              <Link href="/faq" className="flex items-center space-x-1 text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                <HelpCircle className="w-4 h-4" />
                <span>Support</span>
              </Link>

              {/* Contact */}
              <Link href="/contact" className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                Contact
              </Link>

              {/* Theme Toggle - Show placeholder until mounted */}
              <div className="w-8 h-8 bg-gray-200 rounded-md animate-pulse"></div>

              {/* Portal Access Dropdown */}
              <div className="relative" ref={loginDropdownRef}>
                <button
                  onClick={toggleLoginDropdown}
                  className="inline-flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Portal Access</span>
                  <ChevronDown className="w-4 h-4" />
                </button>
                
                {isLoginDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg z-50 border border-gray-200">
                    <div className="py-1">
                      <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                        Choose Your Portal
                      </div>
                      
                      {/* Admin Portal */}
                      <Link 
                        href="/login?type=admin" 
                        className="flex items-center space-x-3 px-4 py-3 text-sm text-gray-700 hover:bg-red-50 hover:text-red-600 transition-colors"
                        onClick={() => setIsLoginDropdownOpen(false)}
                      >
                        <Shield className="w-4 h-4" />
                        <div>
                          <div className="font-medium">Admin Portal</div>
                          <div className="text-xs text-gray-500">System administration & management</div>
                        </div>
                      </Link>

                      {/* Teacher Portal */}
                      <Link 
                        href="/login?type=teacher" 
                        className="flex items-center space-x-3 px-4 py-3 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-600 transition-colors"
                        onClick={() => setIsLoginDropdownOpen(false)}
                      >
                        <UserCheck className="w-4 h-4" />
                        <div>
                          <div className="font-medium">Teacher Portal</div>
                          <div className="text-xs text-gray-500">Manage classes & student progress</div>
                        </div>
                      </Link>

                      {/* Student/Parent Portal */}
                      <Link 
                        href="/login?type=student" 
                        className="flex items-center space-x-3 px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        onClick={() => setIsLoginDropdownOpen(false)}
                      >
                        <GraduationCap className="w-4 h-4" />
                        <div>
                          <div className="font-medium">Student & Parent Portal</div>
                          <div className="text-xs text-gray-500">Access courses & monitor progress</div>
                        </div>
                      </Link>

                      {/* Registration Section */}
                      <div className="border-t border-gray-100">
                        <Link 
                          href="/student-registration" 
                          className="flex items-center space-x-3 px-4 py-3 text-sm text-green-600 hover:bg-green-50 transition-colors"
                          onClick={() => setIsLoginDropdownOpen(false)}
                        >
                          <User className="w-4 h-4" />
                          <div>
                            <div className="font-medium">New Student Registration</div>
                            <div className="text-xs text-gray-500">Join our programs</div>
                          </div>
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </nav>

            {/* Mobile menu button */}
            <div className="md:hidden">
              <button
                onClick={toggleMenu}
                className="text-gray-700 hover:text-blue-600 p-2 rounded-md transition-colors"
                aria-label="Toggle menu"
              >
                <Menu className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden" ref={mobileMenuRef}>
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 max-h-[calc(100vh-4rem)] overflow-y-auto">
              {/* Programs Dropdown */}
              <div className="relative">
                <button
                  onClick={toggleDropdown}
                  className="flex items-center justify-between w-full text-left px-3 py-3 text-base font-medium text-gray-700 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <BookOpen className="w-4 h-4" />
                    <span>Programs</span>
                  </div>
                  <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isDropdownOpen ? 'rotate-90' : ''}`} />
                </button>
                {isDropdownOpen && (
                  <div className="pl-8 space-y-1 mt-1">
                    <Link 
                      href="/programs" 
                      onClick={closeMobileMenu}
                      className="block px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                    >
                      All Programs
                    </Link>
                    <Link 
                      href="/curriculum" 
                      onClick={closeMobileMenu}
                      className="block px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                    >
                      Curriculum
                    </Link>
                    <Link 
                      href="/student-journey" 
                      onClick={closeMobileMenu}
                      className="block px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                    >
                      Student Journey
                    </Link>
                  </div>
                )}
              </div>

              {/* About Dropdown */}
              <div className="relative">
                <button
                  onClick={toggleAboutDropdown}
                  className="flex items-center justify-between w-full text-left px-3 py-3 text-base font-medium text-gray-700 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Info className="w-4 h-4" />
                    <span>About</span>
                  </div>
                  <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isAboutDropdownOpen ? 'rotate-90' : ''}`} />
                </button>
                {isAboutDropdownOpen && (
                  <div className="pl-8 space-y-1 mt-1">
                    <Link 
                      href="/about" 
                      onClick={closeMobileMenu}
                      className="block px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                    >
                      About Us
                    </Link>
                    <Link 
                      href="/team" 
                      onClick={closeMobileMenu}
                      className="block px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                    >
                      Our Team
                    </Link>
                    <Link 
                      href="/testimonials" 
                      onClick={closeMobileMenu}
                      className="block px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                    >
                      Testimonials
                    </Link>
                    <Link 
                      href="/gallery" 
                      onClick={closeMobileMenu}
                      className="block px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                    >
                      Gallery
                    </Link>
                  </div>
                )}
              </div>

              {/* Support */}
              <Link 
                href="/faq" 
                onClick={closeMobileMenu}
                className="flex items-center space-x-2 px-3 py-3 text-base font-medium text-gray-700 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                <HelpCircle className="w-4 h-4" />
                <span>Support</span>
              </Link>

              {/* Contact */}
              <Link 
                href="/contact" 
                onClick={closeMobileMenu}
                className="block px-3 py-3 text-base font-medium text-gray-700 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                Contact
              </Link>

              {/* Theme Toggle for Mobile */}
              <div className="flex items-center justify-between px-3 py-3 border-t border-gray-200 dark:border-gray-700">
                <span className="text-base font-medium text-gray-700 dark:text-gray-400">
                  Theme: {theme === 'system' ? 'System' : theme === 'dark' ? 'Dark' : 'Light'}
                </span>
                <ThemeToggle />
              </div>

              {/* Portal Access */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
                <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Portal Access
                </div>
                <Link 
                  href="/login?type=admin" 
                  onClick={closeMobileMenu}
                  className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                >
                  <Shield className="w-4 h-4" />
                  <span>Admin Portal</span>
                </Link>
                <Link 
                  href="/login?type=teacher" 
                  onClick={closeMobileMenu}
                  className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-md transition-colors"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Teacher Portal</span>
                </Link>
                <Link 
                  href="/login?type=student" 
                  onClick={closeMobileMenu}
                  className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                >
                  <GraduationCap className="w-4 h-4" />
                  <span>Student & Parent Portal</span>
                </Link>
                <Link 
                  href="/student-registration" 
                  onClick={closeMobileMenu}
                  className="flex items-center space-x-2 px-3 py-2 text-sm text-green-600 dark:text-green-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md transition-colors"
                >
                  <User className="w-4 h-4" />
                  <span>New Student Registration</span>
                </Link>
              </div>

              {/* Quick Actions */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
                <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Quick Actions
                </div>
                <Link 
                  href="/school-registration" 
                  onClick={closeMobileMenu}
                  className="flex items-center space-x-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                >
                  <School className="w-4 h-4" />
                  <span>Register My School</span>
                </Link>
                <button
                  onClick={() => {
                    // This would trigger the summer school popup
                    closeMobileMenu();
                    // You might want to add a global state or context to trigger the popup
                  }}
                  className="flex items-center space-x-2 w-full text-left px-3 py-2 text-sm text-orange-600 dark:text-orange-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-md transition-colors"
                >
                  <GraduationCap className="w-4 h-4" />
                  <span>Summer School Registration</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </header>
    );
  }

  return (
    <header className="bg-white dark:bg-gray-900 shadow-lg sticky top-0 z-50">
      {/* Top Bar with Social Media Icons */}
      <div className={`bg-gradient-to-r ${brandColors.primary.gradient} text-white`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-10">
            {/* Contact Info */}
            <div className="hidden sm:flex items-center space-x-4 text-sm">
              <span>📧 {contactInfo.email}</span>
              <span>📞 {contactInfo.phone}</span>
            </div>
            
            {/* Social Media Icons */}
            <div className="flex items-center space-x-3">
              <Link href={socialLinks.facebook} className="text-white hover:text-blue-200 transition-colors duration-200">
                <Facebook className="w-4 h-4" />
              </Link>
              <Link href={socialLinks.twitter} className="text-white hover:text-blue-200 transition-colors duration-200">
                <Twitter className="w-4 h-4" />
              </Link>
              <Link href={socialLinks.instagram} className="text-white hover:text-blue-200 transition-colors duration-200">
                <Instagram className="w-4 h-4" />
              </Link>
              <Link href={socialLinks.linkedin} className="text-white hover:text-blue-200 transition-colors duration-200">
                <Linkedin className="w-4 h-4" />
              </Link>
              <Link href={socialLinks.youtube} className="text-white hover:text-blue-200 transition-colors duration-200">
                <Youtube className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Header Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex-shrink-0">
            <Link href="/" className="flex items-center hover:scale-105 transition-transform duration-200">
              <Logo size="lg" />
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            {/* Programs Dropdown */}
            <div className="relative group">
              <button className="flex items-center space-x-1 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                <BookOpen className="w-4 h-4" />
                <span>Programs</span>
              </button>
              <div className="absolute left-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <div className="py-1">
                  <Link href="/programs" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">All Programs</Link>
                  <Link href="/curriculum" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Curriculum</Link>
                  <Link href="/student-journey" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Student Journey</Link>
                </div>
              </div>
            </div>

            {/* About Dropdown */}
            <div className="relative group">
              <button className="flex items-center space-x-1 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                <Info className="w-4 h-4" />
                <span>About</span>
              </button>
              <div className="absolute left-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <div className="py-1">
                  <Link href="/about" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">About Us</Link>
                  <Link href="/team" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Our Team</Link>
                  <Link href="/testimonials" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Testimonials</Link>
                  <Link href="/gallery" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Gallery</Link>
                </div>
              </div>
            </div>

            {/* Support */}
            <Link href="/faq" className="flex items-center space-x-1 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-2 rounded-md text-sm font-medium transition-colors">
              <HelpCircle className="w-4 h-4" />
              <span>Support</span>
            </Link>

            {/* Contact */}
            <Link href="/contact" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-2 rounded-md text-sm font-medium transition-colors">
              Contact
            </Link>

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Portal Access Dropdown */}
            <div className="relative" ref={loginDropdownRef}>
              <button
                onClick={toggleLoginDropdown}
                className="inline-flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span>Portal Access</span>
                <ChevronDown className="w-4 h-4" />
              </button>
              
              {isLoginDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-md shadow-lg z-50 border border-gray-200">
                  <div className="py-1">
                    <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                      Choose Your Portal
                    </div>
                    
                    {/* Admin Portal */}
                    <Link 
                      href="/login?type=admin" 
                      className="flex items-center space-x-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      onClick={() => setIsLoginDropdownOpen(false)}
                    >
                      <Shield className="w-4 h-4" />
                      <div>
                        <div className="font-medium">Admin Portal</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">System administration & management</div>
                      </div>
                    </Link>

                    {/* Teacher Portal */}
                    <Link 
                      href="/login?type=teacher" 
                      className="flex items-center space-x-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                      onClick={() => setIsLoginDropdownOpen(false)}
                    >
                      <UserCheck className="w-4 h-4" />
                      <div>
                        <div className="font-medium">Teacher Portal</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Manage classes & student progress</div>
                      </div>
                    </Link>

                    {/* Student/Parent Portal */}
                    <Link 
                      href="/login?type=student" 
                      className="flex items-center space-x-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      onClick={() => setIsLoginDropdownOpen(false)}
                    >
                      <GraduationCap className="w-4 h-4" />
                      <div>
                        <div className="font-medium">Student & Parent Portal</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Access courses & monitor progress</div>
                      </div>
                    </Link>

                    {/* Registration Section */}
                    <div className="border-t border-gray-100 dark:border-gray-700">
                      <Link 
                        href="/student-registration" 
                        className="flex items-center space-x-3 px-4 py-3 text-sm text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                        onClick={() => setIsLoginDropdownOpen(false)}
                      >
                        <User className="w-4 h-4" />
                        <div>
                          <div className="font-medium">New Student Registration</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Join our programs</div>
                        </div>
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </nav>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={toggleMenu}
              className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 p-2 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden" ref={mobileMenuRef}>
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 max-h-[calc(100vh-4rem)] overflow-y-auto">
              {/* Programs Dropdown */}
              <div className="relative">
                <button
                  onClick={toggleDropdown}
                  className="flex items-center justify-between w-full text-left px-3 py-3 text-base font-medium text-gray-700 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <BookOpen className="w-4 h-4" />
                    <span>Programs</span>
                  </div>
                  <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isDropdownOpen ? 'rotate-90' : ''}`} />
                </button>
                {isDropdownOpen && (
                  <div className="pl-8 space-y-1 mt-1">
                    <Link 
                      href="/programs" 
                      onClick={closeMobileMenu}
                      className="block px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                    >
                      All Programs
                    </Link>
                    <Link 
                      href="/curriculum" 
                      onClick={closeMobileMenu}
                      className="block px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                    >
                      Curriculum
                    </Link>
                    <Link 
                      href="/student-journey" 
                      onClick={closeMobileMenu}
                      className="block px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                    >
                      Student Journey
                    </Link>
                  </div>
                )}
              </div>

              {/* About Dropdown */}
              <div className="relative">
                <button
                  onClick={toggleAboutDropdown}
                  className="flex items-center justify-between w-full text-left px-3 py-3 text-base font-medium text-gray-700 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Info className="w-4 h-4" />
                    <span>About</span>
                  </div>
                  <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isAboutDropdownOpen ? 'rotate-90' : ''}`} />
                </button>
                {isAboutDropdownOpen && (
                  <div className="pl-8 space-y-1 mt-1">
                    <Link 
                      href="/about" 
                      onClick={closeMobileMenu}
                      className="block px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                    >
                      About Us
                    </Link>
                    <Link 
                      href="/team" 
                      onClick={closeMobileMenu}
                      className="block px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                    >
                      Our Team
                    </Link>
                    <Link 
                      href="/testimonials" 
                      onClick={closeMobileMenu}
                      className="block px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                    >
                      Testimonials
                    </Link>
                    <Link 
                      href="/gallery" 
                      onClick={closeMobileMenu}
                      className="block px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                    >
                      Gallery
                    </Link>
                  </div>
                )}
              </div>

              {/* Support */}
              <Link 
                href="/faq" 
                onClick={closeMobileMenu}
                className="flex items-center space-x-2 px-3 py-3 text-base font-medium text-gray-700 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                <HelpCircle className="w-4 h-4" />
                <span>Support</span>
              </Link>

              {/* Contact */}
              <Link 
                href="/contact" 
                onClick={closeMobileMenu}
                className="block px-3 py-3 text-base font-medium text-gray-700 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                Contact
              </Link>

              {/* Theme Toggle for Mobile */}
              <div className="flex items-center justify-between px-3 py-3 border-t border-gray-200 dark:border-gray-700">
                <span className="text-base font-medium text-gray-700 dark:text-gray-400">
                  Theme: {theme === 'system' ? 'System' : theme === 'dark' ? 'Dark' : 'Light'}
                </span>
                <ThemeToggle />
              </div>

              {/* Portal Access */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
                <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Portal Access
                </div>
                <Link 
                  href="/login?type=admin" 
                  onClick={closeMobileMenu}
                  className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                >
                  <Shield className="w-4 h-4" />
                  <span>Admin Portal</span>
                </Link>
                <Link 
                  href="/login?type=teacher" 
                  onClick={closeMobileMenu}
                  className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-md transition-colors"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Teacher Portal</span>
                </Link>
                <Link 
                  href="/login?type=student" 
                  onClick={closeMobileMenu}
                  className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                >
                  <GraduationCap className="w-4 h-4" />
                  <span>Student & Parent Portal</span>
                </Link>
                <Link 
                  href="/student-registration" 
                  onClick={closeMobileMenu}
                  className="flex items-center space-x-2 px-3 py-2 text-sm text-green-600 dark:text-green-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md transition-colors"
                >
                  <User className="w-4 h-4" />
                  <span>New Student Registration</span>
                </Link>
              </div>

              {/* Quick Actions */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
                <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Quick Actions
                </div>
                <Link 
                  href="/school-registration" 
                  onClick={closeMobileMenu}
                  className="flex items-center space-x-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                >
                  <School className="w-4 h-4" />
                  <span>Register My School</span>
                </Link>
                <button
                  onClick={() => {
                    // This would trigger the summer school popup
                    closeMobileMenu();
                    // You might want to add a global state or context to trigger the popup
                  }}
                  className="flex items-center space-x-2 w-full text-left px-3 py-2 text-sm text-orange-600 dark:text-orange-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-md transition-colors"
                >
                  <GraduationCap className="w-4 h-4" />
                  <span>Summer School Registration</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
} 