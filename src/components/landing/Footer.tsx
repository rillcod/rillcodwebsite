import Link from "next/link";
import { Facebook, Twitter, Instagram, Linkedin, Youtube, Mail, Phone, MapPin, School, Heart, ArrowRight } from "lucide-react";
import { brandColors, contactInfo, socialLinks } from '@/config/brand';

const year = new Date().getFullYear();

const footerSocialLinks = [
  { name: "Facebook", href: socialLinks.facebook, icon: Facebook, label: "Facebook" },
  { name: "Twitter", href: socialLinks.twitter, icon: Twitter, label: "Twitter" },
  { name: "Instagram", href: socialLinks.instagram, icon: Instagram, label: "Instagram" },
  { name: "LinkedIn", href: socialLinks.linkedin, icon: Linkedin, label: "LinkedIn" },
  { name: "YouTube", href: socialLinks.youtube, icon: Youtube, label: "YouTube" },
];

const quickLinks = [
  { name: "About", href: "/about" },
  { name: "Programs", href: "/programs" },
  { name: "Contact", href: "/contact" },
  { name: "FAQ", href: "/faq" },
  { name: "Terms", href: "/terms-of-service" },
];

export default function Footer() {
  return (
    <footer className="bg-[#0a0a0f] text-white relative overflow-hidden">
      {/* Subtle top separator */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8">
        {/* Main grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">

          {/* Brand Column */}
          <div className="lg:col-span-2 space-y-6">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 bg-[#FF914D] rounded-xl flex items-center justify-center transition-transform group-hover:rotate-3">
                <School className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-xl font-black uppercase tracking-tight block leading-none">Rillcod Academy</span>
                <span className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Next-Gen STEM Education</span>
              </div>
            </Link>
            <p className="text-white/40 text-sm leading-relaxed max-w-sm">
              Empowering Nigeria&apos;s future through technology education. We partner with schools to deliver world-class programming and technology courses to young minds across the nation.
            </p>
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3 text-sm text-white/50 hover:text-white transition-colors">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                  <Phone className="w-3.5 h-3.5 text-[#FF914D]" />
                </div>
                <span>{contactInfo.phone}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-white/50 hover:text-white transition-colors">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                  <Mail className="w-3.5 h-3.5 text-[#FF914D]" />
                </div>
                <span>{contactInfo.email}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-white/50 hover:text-white transition-colors">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                  <MapPin className="w-3.5 h-3.5 text-[#FF914D]" />
                </div>
                <span>{contactInfo.address}</span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-6">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#FF914D]">Quick Links</h3>
            <ul className="space-y-4">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-white/40 hover:text-[#FF914D] transition-all text-sm font-bold uppercase tracking-widest flex items-center gap-2 group"
                  >
                    <ArrowRight className="w-3 h-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-[#FF914D]" />
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Social + Newsletter */}
          <div className="space-y-8">
            <div className="space-y-6">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#FF914D]">Follow Socials</h3>
              <div className="flex gap-2.5 flex-wrap">
                {footerSocialLinks.map((s) => {
                  const Icon = s.icon;
                  return (
                    <a
                      key={s.name}
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={s.label}
                      className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-[#FF914D] hover:shadow-lg hover:shadow-orange-500/20 transition-all border border-white/5"
                    >
                      <Icon className="w-4 h-4" />
                    </a>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#FF914D]">Newsletter</h3>
              <div className="flex p-1.5 bg-white/5 border border-white/10 rounded-2xl overflow-hidden focus-within:border-white/20 transition-colors">
                <input
                  type="email"
                  placeholder="Your email"
                  className="flex-1 bg-transparent px-3 text-sm text-white placeholder-white/20 focus:outline-none"
                />
                <button className="px-5 py-2.5 bg-[#FF914D] text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-orange-500 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-orange-500/10">
                  Go
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-6 text-[10px] font-bold text-white/20 uppercase tracking-[0.1em]">
          <div className="flex items-center gap-2">
            <span>&copy; {year} Rillcod Academy</span>
            <span className="w-1 h-1 bg-white/10 rounded-full" />
            <span className="flex items-center gap-1.5">
              Made with <Heart className="w-3 h-3 text-rose-500 animate-pulse" /> in Nigeria
            </span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/terms-of-service" className="hover:text-white transition-colors">Terms of Service</Link>
            <Link href="/faq" className="hover:text-white transition-colors">Help Center</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}