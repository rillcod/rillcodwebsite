// @refresh reset
import Link from 'next/link';
import {
  HomeIcon,
  AcademicCapIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
  ArrowLeftIcon,
  ExclamationTriangleIcon
} from '@/lib/icons';

export default function NotFound() {
  const quickLinks = [
    { href: '/', label: 'Home', icon: HomeIcon },
    { href: '/programs', label: 'Programs', icon: AcademicCapIcon },
    { href: '/schools', label: 'Partner Schools', icon: BuildingOfficeIcon },
    { href: '/contact', label: 'Contact Us', icon: UserGroupIcon },
  ];

  return (
    <div className="min-h-screen bg-background font-sans relative overflow-hidden flex items-center justify-center">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-orange-500/10 to-purple-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          {/* 404 Protocol Error */}
          <div className="mb-12">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-card border border-border rounded-none mb-8 shadow-2xl relative group">
              <div className="absolute inset-0 bg-orange-500/10 group-hover:bg-orange-500/20 transition-all duration-300"></div>
              <ExclamationTriangleIcon className="w-12 h-12 text-orange-500 relative z-10 animate-pulse" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500"></div>
              <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-blue-500"></div>
            </div>
            <h1 className="text-[120px] md:text-[180px] font-black leading-none text-foreground mb-4 tracking-tighter italic">404<span className="text-orange-500">.</span></h1>
            <h2 className="text-xl md:text-2xl font-black text-muted-foreground uppercase tracking-[0.5em] mb-8 italic border-y border-border py-4 inline-block">
              Sector Not Found // <span className="text-orange-500">Protocol 404</span>
            </h2>
            <p className="text-xs md:text-sm text-muted-foreground mb-12 max-w-lg mx-auto font-bold italic leading-relaxed uppercase tracking-widest opacity-60">
              The requested data stream could not be located in the Rillcod mainframes. It might have been relocated or purged from the central database.
            </p>
          </div>

          {/* Action Protocols */}
          <div className="flex flex-col sm:flex-row gap-8 justify-center mb-20 relative">
            <Link
              href="/"
              className="inline-flex items-center justify-center px-12 py-5 bg-foreground text-background rounded-none hover:bg-orange-500 hover:text-white transition-all duration-300 font-black text-[10px] uppercase tracking-[0.4em] shadow-2xl group"
            >
              <ArrowLeftIcon className="w-4 h-4 mr-3 group-hover:-translate-x-1 transition-transform" />
              REVERT TO BASE
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center px-12 py-5 border border-border text-foreground rounded-none hover:border-orange-500 transition-all duration-300 font-black text-[10px] uppercase tracking-[0.4em] group"
            >
              OPEN SUPPORT UPLINK
            </Link>
          </div>

          {/* Quick Nav Grid */}
          <div className="bg-card border border-border rounded-none p-10 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rotate-45 transform translate-x-16 -translate-y-16"></div>
            <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em] mb-8 italic">Alternative Access Points:</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex flex-col items-center justify-center p-6 bg-background border border-border rounded-none hover:border-orange-500/50 hover:bg-orange-500/5 transition-all duration-300 group"
                >
                  <link.icon className="w-6 h-6 text-muted-foreground group-hover:text-orange-500 transition-colors mb-3" />
                  <span className="text-[9px] font-black uppercase tracking-widest">{link.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 