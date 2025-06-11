"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { 
  Menu, 
  X, 
  ChevronDown, 
  School, 
  Users, 
  BookOpen, 
  Calendar,
  MessageSquare,
  Settings,
  LogOut,
  User,
  Building2,
  Home,
  Info,
  Handshake,
  Phone,
  GraduationCap,
  Globe,
  Target,
  Award,
  BarChart3,
  FileText,
  Star,
  Heart,
  Shield
} from 'lucide-react';

const Navigation = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const pathname = usePathname();
  const { user, profile, signOut } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const mainNavItems = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/about', label: 'About', icon: Info },
  ];

  const educationItems = [
    { href: '/programs', label: 'Programs', icon: BookOpen },
    { href: '/curriculum', label: 'Curriculum', icon: GraduationCap },
    { href: '/testimonials', label: 'Testimonials', icon: Star },
  ];

  const businessItems = [
    { href: '/partnership', label: 'Partnership', icon: Handshake },
    { href: '/school-registration', label: 'Partner School', icon: Building2 },
  ];

  const supportItems = [
    { href: '/contact', label: 'Contact', icon: Phone },
    { href: '/faq', label: 'FAQ', icon: MessageSquare },
  ];

  const programsDropdown = [
    { href: '/programs', label: 'ICT Fundamentals', icon: '💻', description: 'Computer basics and digital literacy' },
    { href: '/programs', label: 'Scratch Programming', icon: '🎮', description: 'Visual programming for beginners' },
    { href: '/programs', label: 'HTML/CSS Programming', icon: '🌐', description: 'Web development fundamentals' },
    { href: '/programs', label: 'Python Programming', icon: '🐍', description: 'Advanced programming concepts' },
    { href: '/programs', label: 'Web Design', icon: '🎨', description: 'Creative web design skills' },
    { href: '/programs', label: 'Robotics Programming', icon: '🤖', description: 'Robotics and automation' }
  ];

  const isActive = (href: string) => pathname === href;

  const handleLogout = () => {
    signOut();
    setIsOpen(false);
  };

  const getUserDashboardLink = () => {
    if (!profile) return '/login';
    
    switch (profile.role) {
      case 'admin':
        return '/dashboard';
      case 'teacher':
        return '/dashboard';
      case 'student':
        return '/dashboard';
      default:
        return '/login';
    }
  };

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Admin';
      case 'teacher':
        return 'Teacher';
      case 'student':
        return 'Student';
      default:
        return role.replace('_', ' ').toUpperCase();
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800';
      case 'teacher':
        return 'bg-green-100 text-green-800';
      case 'student':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      isScrolled 
        ? 'bg-white/95 backdrop-blur-md shadow-lg border-b border-gray-200' 
        : 'bg-transparent'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-12">
        <div className="flex justify-between items-center h-16 lg:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-3">
            <div className="w-10 h-10 lg:w-12 lg:h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <School className="w-6 h-6 lg:w-7 lg:h-7 text-white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xl lg:text-2xl xl:text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Rillcod Academy
              </h1>
              <p className="text-xs lg:text-sm text-gray-600">Smart School Management</p>
            </div>
          </Link>

          {/* Desktop Navigation - Grouped */}
          <div className="hidden xl:flex items-center space-x-1">
            {/* Main Navigation */}
            {mainNavItems.map((item) => {
              const Icon = item.icon;
              return (
              <Link
                key={item.href}
                href={item.href}
                  className={`relative px-4 py-2 text-sm font-medium transition-all duration-200 rounded-lg flex items-center space-x-2 ${
                  isActive(item.href)
                      ? 'text-blue-600 bg-blue-50'
                    : isScrolled
                      ? 'text-gray-700 hover:text-blue-600 hover:bg-gray-50'
                      : 'text-white hover:text-blue-200 hover:bg-white/10'
                }`}
              >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                {isActive(item.href) && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
                )}
              </Link>
              );
            })}

            {/* Education Dropdown */}
            <div className="relative group">
              <button className={`flex items-center space-x-2 px-4 py-2 text-sm font-medium transition-all duration-200 rounded-lg ${
                pathname.startsWith('/programs') || pathname.startsWith('/curriculum') || pathname.startsWith('/testimonials')
                  ? 'text-blue-600 bg-blue-50'
                  : isScrolled
                  ? 'text-gray-700 hover:text-blue-600 hover:bg-gray-50'
                  : 'text-white hover:text-blue-200 hover:bg-white/10'
              }`}>
                <GraduationCap className="w-4 h-4" />
                <span>Education</span>
                <ChevronDown className="w-4 h-4 transition-transform group-hover:rotate-180" />
              </button>
              
              <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                <div className="p-4">
                  {/* Education Links */}
                  <div className="mb-4">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Learning</h3>
                    {educationItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="flex items-center space-x-3 px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors rounded-lg"
                        >
                          <Icon className="w-4 h-4" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                  
                  {/* Programs */}
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Programs</h3>
                  {programsDropdown.map((program) => (
                    <Link
                      key={program.href}
                      href={program.href}
                        className="flex items-start space-x-3 px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors rounded-lg group"
                      >
                        <span className="text-lg mt-0.5">{program.icon}</span>
                        <div>
                          <div className="font-medium">{program.label}</div>
                          <div className="text-xs text-gray-500 group-hover:text-blue-500">{program.description}</div>
                        </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
            </div>

            {/* Business Dropdown */}
            <div className="relative group">
              <button className={`flex items-center space-x-2 px-4 py-2 text-sm font-medium transition-all duration-200 rounded-lg ${
                pathname.startsWith('/partnership') || pathname.startsWith('/school-registration')
                  ? 'text-blue-600 bg-blue-50'
                  : isScrolled
                  ? 'text-gray-700 hover:text-blue-600 hover:bg-gray-50'
                  : 'text-white hover:text-blue-200 hover:bg-white/10'
              }`}>
                <Building2 className="w-4 h-4" />
                <span>Business</span>
                <ChevronDown className="w-4 h-4 transition-transform group-hover:rotate-180" />
              </button>
              
              <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                <div className="p-4">
                  {businessItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center space-x-3 px-3 py-3 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors rounded-lg"
                      >
                        <Icon className="w-4 h-4" />
                        <div>
                          <div className="font-medium">{item.label}</div>
                          {item.href === '/partnership' && (
                            <div className="text-xs text-gray-500">Partner with us</div>
                          )}
                          {item.href === '/school-registration' && (
                            <div className="text-xs text-gray-500">Register your school</div>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Support Links */}
            {supportItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative px-4 py-2 text-sm font-medium transition-all duration-200 rounded-lg flex items-center space-x-2 ${
                    isActive(item.href)
                      ? 'text-blue-600 bg-blue-50'
                      : isScrolled
                      ? 'text-gray-700 hover:text-blue-600 hover:bg-gray-50'
                      : 'text-white hover:text-blue-200 hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {isActive(item.href) && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Desktop Actions */}
          <div className="hidden lg:flex items-center space-x-4">
            {user ? (
              <div className="flex items-center space-x-4">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getRoleColor(profile?.role || '')}`}>
                  {getRoleDisplayName(profile?.role || '')}
                </span>
                <Link href={getUserDashboardLink()}>
                  <button className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200">
                    <User className="w-4 h-4 mr-2" />
                    Dashboard
                  </button>
                </Link>
                <button 
                  onClick={handleLogout}
                  className="p-2 text-gray-400 hover:text-gray-500 hover:bg-gray-100 rounded-lg transition-all duration-200"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                {/* Portal Access Dropdown */}
                <div className="relative group">
                  <button className={`flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                    isScrolled 
                      ? 'text-gray-700 hover:text-blue-600 hover:bg-gray-50' 
                      : 'text-white hover:text-blue-200 hover:bg-white/10'
                  }`}>
                    <User className="w-4 h-4" />
                    <span>Portal Access</span>
                    <ChevronDown className="w-4 h-4 transition-transform group-hover:rotate-180" />
                  </button>
                  
                  <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                    <div className="p-4">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Sign In As</h3>
                      
                      {/* Student Login */}
                      <Link href="/login?type=student" className="flex items-center space-x-3 px-3 py-3 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors rounded-lg group">
                        <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center">
                          <User className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <div className="font-medium">Student</div>
                          <div className="text-xs text-gray-500 group-hover:text-blue-500">Access learning dashboard</div>
                        </div>
                      </Link>

                      {/* Teacher Login */}
                      <Link href="/login?type=teacher" className="flex items-center space-x-3 px-3 py-3 text-sm text-gray-700 hover:bg-green-50 hover:text-green-600 transition-colors rounded-lg group">
                        <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
                          <School className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <div className="font-medium">Teacher</div>
                          <div className="text-xs text-gray-500 group-hover:text-green-500">Manage classes & lessons</div>
                        </div>
                      </Link>

                      {/* Admin Login */}
                      <Link href="/login?type=admin" className="flex items-center space-x-3 px-3 py-3 text-sm text-gray-700 hover:bg-red-50 hover:text-red-600 transition-colors rounded-lg group">
                        <div className="w-8 h-8 bg-gradient-to-r from-red-500 to-pink-500 rounded-full flex items-center justify-center">
                          <Shield className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <div className="font-medium">Admin</div>
                          <div className="text-xs text-gray-500 group-hover:text-red-500">School administration</div>
                        </div>
                      </Link>

                      <div className="border-t border-gray-200 my-3"></div>

                      {/* Quick Registration Links */}
                      <div className="space-y-2">
                        <Link href="/student-registration" className="flex items-center space-x-3 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 transition-colors rounded-lg">
                          <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                          <span>Register as Student</span>
                        </Link>
                        <Link href="/school-registration" className="flex items-center space-x-3 px-3 py-2 text-sm text-purple-600 hover:bg-purple-50 transition-colors rounded-lg">
                          <div className="w-1 h-1 bg-purple-500 rounded-full"></div>
                          <span>Partner School Registration</span>
                </Link>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Enhanced Partner School Button */}
                <div className="relative group">
                <Link href="/school-registration">
                    <button className="inline-flex items-center px-6 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200 group">
                    <Building2 className="w-4 h-4 mr-2" />
                    Partner School
                      <ChevronDown className="w-4 h-4 ml-2 transition-transform group-hover:rotate-180" />
                  </button>
                </Link>
                  
                  <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                    <div className="p-4">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Partner Options</h3>
                      
                      <Link href="/school-registration" className="flex items-center space-x-3 px-3 py-3 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors rounded-lg group">
                        <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <div className="font-medium">Register School</div>
                          <div className="text-xs text-gray-500 group-hover:text-blue-500">Become a partner school</div>
                        </div>
                      </Link>

                      <Link href="/partnership" className="flex items-center space-x-3 px-3 py-3 text-sm text-gray-700 hover:bg-green-50 hover:text-green-600 transition-colors rounded-lg group">
                        <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
                          <Handshake className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <div className="font-medium">Partnership Info</div>
                          <div className="text-xs text-gray-500 group-hover:text-green-500">Learn about partnership</div>
                        </div>
                      </Link>

                      <Link href="/partnerschool" className="flex items-center space-x-3 px-3 py-3 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-600 transition-colors rounded-lg group">
                        <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-violet-500 rounded-full flex items-center justify-center">
                          <Users className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <div className="font-medium">Partner Portal</div>
                          <div className="text-xs text-gray-500 group-hover:text-purple-500">Access partner dashboard</div>
                        </div>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="lg:hidden p-2 rounded-lg text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 transition-all duration-200"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation - Grouped */}
      {isOpen && (
        <div className="lg:hidden bg-white border-t border-gray-200">
          <div className="px-4 pt-2 pb-3 space-y-1">
            {/* Main Navigation */}
            {mainNavItems.map((item) => {
              const Icon = item.icon;
              return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                  className={`flex items-center space-x-3 px-3 py-3 rounded-lg text-base font-medium transition-all duration-200 ${
                  isActive(item.href)
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
              </Link>
              );
            })}
            
            {/* Education Section */}
            <div className="px-3 py-2">
              <div className="flex items-center space-x-3 text-sm font-medium text-gray-500 mb-2">
                <GraduationCap className="w-5 h-5" />
                <span>Education</span>
              </div>
              {educationItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className="flex items-center space-x-3 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-all duration-200"
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              
              {/* Mobile Programs */}
              <div className="px-3 py-2">
                <div className="text-xs font-medium text-gray-500 mb-2">Programs</div>
              {programsDropdown.map((program) => (
                <Link
                  key={program.href}
                  href={program.href}
                  onClick={() => setIsOpen(false)}
                    className="flex items-center space-x-3 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-all duration-200"
                >
                    <span className="text-lg">{program.icon}</span>
                    <span>{program.label}</span>
                </Link>
              ))}
              </div>
            </div>

            {/* Business Section */}
            <div className="px-3 py-2">
              <div className="flex items-center space-x-3 text-sm font-medium text-gray-500 mb-2">
                <Building2 className="w-5 h-5" />
                <span>Business</span>
              </div>
              {businessItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className="flex items-center space-x-3 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-all duration-200"
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Support Section */}
            {supportItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center space-x-3 px-3 py-3 rounded-lg text-base font-medium transition-all duration-200 ${
                    isActive(item.href)
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {/* Mobile Actions */}
            <div className="pt-4 pb-3 border-t border-gray-200">
              {user ? (
                <div className="space-y-2">
                  <div className="px-3 py-2">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getRoleColor(profile?.role || '')}`}>
                      {getRoleDisplayName(profile?.role || '')}
                    </span>
                  </div>
                  <Link
                    href={getUserDashboardLink()}
                    onClick={() => setIsOpen(false)}
                    className="flex items-center space-x-3 px-3 py-3 rounded-lg text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-all duration-200"
                  >
                    <User className="w-5 h-5" />
                    <span>Dashboard</span>
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex items-center space-x-3 w-full text-left px-3 py-3 rounded-lg text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-all duration-200"
                  >
                    <LogOut className="w-5 h-5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Portal Access Section */}
                  <div className="px-3 py-2">
                    <div className="flex items-center space-x-3 text-sm font-medium text-gray-500 mb-3">
                      <User className="w-5 h-5" />
                      <span>Portal Access</span>
                    </div>
                    
                    {/* Student Login */}
                    <Link
                      href="/login?type=student"
                      onClick={() => setIsOpen(false)}
                      className="flex items-center space-x-3 px-3 py-3 rounded-lg text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-all duration-200 mb-2"
                    >
                      <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="font-medium">Student Login</div>
                        <div className="text-xs text-gray-500">Access learning dashboard</div>
                      </div>
                    </Link>

                    {/* Teacher Login */}
                    <Link
                      href="/login?type=teacher"
                      onClick={() => setIsOpen(false)}
                      className="flex items-center space-x-3 px-3 py-3 rounded-lg text-sm text-gray-700 hover:bg-green-50 hover:text-green-600 transition-all duration-200 mb-2"
                    >
                      <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
                        <School className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="font-medium">Teacher Login</div>
                        <div className="text-xs text-gray-500">Manage classes & lessons</div>
                      </div>
                    </Link>

                    {/* Admin Login */}
                  <Link
                      href="/login?type=admin"
                    onClick={() => setIsOpen(false)}
                      className="flex items-center space-x-3 px-3 py-3 rounded-lg text-sm text-gray-700 hover:bg-red-50 hover:text-red-600 transition-all duration-200"
                    >
                      <div className="w-8 h-8 bg-gradient-to-r from-red-500 to-pink-500 rounded-full flex items-center justify-center">
                        <Shield className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="font-medium">Admin Login</div>
                        <div className="text-xs text-gray-500">School administration</div>
                      </div>
                  </Link>
                  </div>

                  {/* Partner School Section */}
                  <div className="px-3 py-2">
                    <div className="flex items-center space-x-3 text-sm font-medium text-gray-500 mb-3">
                      <Building2 className="w-5 h-5" />
                      <span>Partner School</span>
                    </div>
                    
                  <Link
                    href="/school-registration"
                    onClick={() => setIsOpen(false)}
                      className="flex items-center space-x-3 px-3 py-3 rounded-lg text-sm bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 transition-all duration-200 mb-2"
                    >
                      <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="font-medium">Register School</div>
                        <div className="text-xs text-white/80">Become a partner school</div>
                      </div>
                    </Link>

                    <Link
                      href="/partnership"
                      onClick={() => setIsOpen(false)}
                      className="flex items-center space-x-3 px-3 py-3 rounded-lg text-sm text-gray-700 hover:bg-green-50 hover:text-green-600 transition-all duration-200 mb-2"
                    >
                      <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
                        <Handshake className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="font-medium">Partnership Info</div>
                        <div className="text-xs text-gray-500">Learn about partnership</div>
                      </div>
                    </Link>

                    <Link
                      href="/partnerschool"
                      onClick={() => setIsOpen(false)}
                      className="flex items-center space-x-3 px-3 py-3 rounded-lg text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-600 transition-all duration-200"
                    >
                      <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-violet-500 rounded-full flex items-center justify-center">
                        <Users className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="font-medium">Partner Portal</div>
                        <div className="text-xs text-gray-500">Access partner dashboard</div>
                      </div>
                    </Link>
                  </div>

                  {/* Quick Registration Links */}
                  <div className="px-3 py-2 border-t border-gray-200">
                    <div className="text-xs font-medium text-gray-500 mb-2">Quick Registration</div>
                    <Link
                      href="/student-registration"
                      onClick={() => setIsOpen(false)}
                      className="flex items-center space-x-3 px-3 py-2 rounded-lg text-sm text-blue-600 hover:bg-blue-50 transition-all duration-200"
                    >
                      <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                      <span>Register as Student</span>
                  </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navigation; 