import Link from 'next/link';

/**
 * Keep this page dependency-light. Importing the shared icons barrel (or other
 * large client graphs) has broken `/_not-found` static prerender in production builds.
 */
export default function NotFound() {
  const quickLinks = [
    { href: '/', label: 'Home' },
    { href: '/programs', label: 'Programs' },
    { href: '/schools', label: 'Partner Schools' },
    { href: '/contact', label: 'Contact Us' },
  ];

  return (
    <div className="min-h-screen bg-background font-sans relative overflow-hidden flex items-center justify-center">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-primary/10 to-brand-red-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-brand-red-600/10 to-primary/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <div className="mb-12">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl mb-8 shadow-2xl relative">
              <span className="text-3xl font-black text-brand-red-600" aria-hidden>
                !
              </span>
            </div>
            <h1 className="text-[120px] md:text-[180px] font-black leading-none text-foreground mb-4 tracking-tighter italic">
              404<span className="text-brand-red-600">.</span>
            </h1>
            <h2 className="text-xl md:text-2xl font-black text-muted-foreground uppercase tracking-[0.5em] mb-8 italic border-y border-border py-4 inline-block">
              Sector Not Found // <span className="text-brand-red-600">Protocol 404</span>
            </h2>
            <p className="text-xs md:text-sm text-muted-foreground mb-12 max-w-lg mx-auto font-bold italic leading-relaxed uppercase tracking-widest opacity-60">
              The requested data stream could not be located in the Rillcod mainframes. It might have been relocated or purged from the central database.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center mb-20 relative">
            <Link
              href="/"
              className="inline-flex items-center justify-center px-8 py-4 bg-primary text-white rounded-2xl hover:opacity-95 transition-all duration-300 font-black text-[10px] uppercase tracking-[0.25em] shadow-lg shadow-primary/20 min-h-11"
            >
              ← Return to homepage
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center px-8 py-4 bg-card border border-border text-foreground rounded-2xl hover:bg-muted transition-all duration-300 font-black text-[10px] uppercase tracking-[0.25em] min-h-11"
            >
              Contact support team
            </Link>
          </div>

          <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-6 sm:p-10 shadow-xl relative overflow-hidden">
            <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em] mb-8 italic">
              Alternative Access Points:
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex flex-col items-center justify-center p-6 bg-background border border-border hover:border-primary/50 hover:bg-primary/5 rounded-2xl transition-all duration-300"
                >
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
