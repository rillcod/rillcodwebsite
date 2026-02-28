import Link from "next/link";
import { Facebook, Twitter, Instagram, Linkedin, Youtube, Mail, Phone, MapPin, School, Heart } from "lucide-react";
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
    <footer className="bg-[#0a0a0f] text-white border-t-4 border-[#FF914D]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Main grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0 divide-x divide-y divide-white/10 border-b border-white/10">

          {/* Brand */}
          <div className="lg:col-span-2 p-8 md:p-10">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-[#FF914D] border-2 border-white flex items-center justify-center">
                <School className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-extrabold uppercase tracking-tight">Rillcod Academy</span>
            </div>
            <p className="text-white/50 text-sm leading-relaxed mb-6 max-w-sm">
              Empowering Nigeria&apos;s future through technology education. We partner with schools to deliver world-class programming and technology courses to young minds.
            </p>
            <div className="space-y-2 text-sm text-white/50">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#FF914D] flex-shrink-0" />
                <span>{contactInfo.phone}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#FF914D] flex-shrink-0" />
                <span>{contactInfo.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#FF914D] flex-shrink-0" />
                <span>{contactInfo.address}</span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="p-8 md:p-10">
            <h3 className="text-xs font-black uppercase tracking-widest text-[#FF914D] mb-6">Quick Links</h3>
            <ul className="space-y-3">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-white/50 hover:text-white transition-colors text-sm font-bold uppercase tracking-wide flex items-center gap-2 group"
                  >
                    <span className="w-2 h-2 bg-[#FF914D] opacity-0 group-hover:opacity-100 transition-opacity" />
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Social + Newsletter */}
          <div className="p-8 md:p-10">
            <h3 className="text-xs font-black uppercase tracking-widest text-[#FF914D] mb-6">Follow Us</h3>
            <div className="flex gap-3 flex-wrap mb-8">
              {footerSocialLinks.map((s) => {
                const Icon = s.icon;
                return (
                  <a
                    key={s.name}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    className="w-9 h-9 border border-white/20 flex items-center justify-center text-white/50 hover:text-white hover:border-[#FF914D] hover:bg-[#FF914D]/10 transition-all"
                  >
                    <Icon className="w-4 h-4" />
                  </a>
                );
              })}
            </div>

            <h3 className="text-xs font-black uppercase tracking-widest text-[#FF914D] mb-4">Stay Updated</h3>
            <div className="flex border-2 border-white/20 overflow-hidden">
              <input
                type="email"
                placeholder="Your email"
                className="flex-1 px-3 py-2 bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
              />
              <button className="px-4 py-2 bg-[#FF914D] text-black text-sm font-black uppercase tracking-wide hover:bg-[#e87d3a] transition-colors flex-shrink-0">
                Go
              </button>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="py-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/30">
          <span className="flex items-center gap-1.5">
            &copy; {year} Rillcod Academy. All rights reserved.
            <span className="mx-1">•</span>
            Made with
            <Heart className="w-3 h-3 text-[#FF914D] inline" />
            in Nigeria
          </span>
          <div className="flex items-center gap-5">
            <Link href="/privacy-policy" className="hover:text-white transition-colors uppercase font-bold tracking-wide">Privacy</Link>
            <Link href="/terms-of-service" className="hover:text-white transition-colors uppercase font-bold tracking-wide">Terms</Link>
            <Link href="/faq" className="hover:text-white transition-colors uppercase font-bold tracking-wide">FAQ</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}