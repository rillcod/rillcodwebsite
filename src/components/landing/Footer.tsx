"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Twitter, Instagram, Linkedin, Mail, Phone, Heart, ShieldCheck } from "lucide-react";
import { contactInfo, socialLinks } from '@/config/brand';

const year = new Date().getFullYear();

const footerSocialLinks = [
  { name: "Twitter", href: socialLinks.twitter, icon: Twitter },
  { name: "Instagram", href: socialLinks.instagram, icon: Instagram },
  { name: "LinkedIn", href: socialLinks.linkedin, icon: Linkedin },
];

const quickLinks = [
  { name: "About Story", href: "/#about" },
  { name: "Core Programs", href: "/#programs" },
  { name: "Partner With Us", href: "/school-registration" },
  { name: "Secure Portal", href: "/login" },
];

export default function Footer() {
  return (
    <footer className="bg-card text-foreground relative overflow-hidden border-t border-border mt-auto font-sans">
      {/* Sharp Accent Line */}
      <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-brand-red-600 via-primary to-transparent" />

      <div className="max-w-screen-2xl mx-auto px-6 lg:px-20 pt-20 pb-12 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-16 lg:gap-24 mb-20">
          
          {/* Brand Col */}
          <div className="lg:col-span-5 space-y-8">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 flex items-center justify-center rounded-xl overflow-hidden group-hover:scale-105 transition-transform dark:bg-white shrink-0 border border-border dark:border-transparent">
                <Image src="/images/logo.png" alt="Rillcod Technologies" width={28} height={28} className="w-[85%] h-[85%] object-contain" />
              </div>
              <div className="leading-none">
                <span className="text-2xl font-black uppercase tracking-tight block leading-tight italic text-foreground">RILLCOD<span className="text-brand-red-600 not-italic">.</span></span>
                <span className="text-xs font-black uppercase tracking-[0.15em] block text-muted-foreground mt-0.5">Technologies</span>
              </div>
            </Link>
            
            <p className="text-muted-foreground text-sm leading-relaxed max-w-sm italic border-l border-border pl-5">
              Delivering elite STEM programs and curriculum across partner schools in Nigeria. From first lines of code to advanced robotics engineering.
            </p>

            <div className="flex items-center gap-3">
               {footerSocialLinks.map((s) => (
                 <Link key={s.name} href="#" className="w-10 h-10 border border-border flex items-center justify-center rounded-xl hover:bg-muted hover:border-primary transition-all text-muted-foreground hover:text-primary shadow-sm">
                    <s.icon className="w-4 h-4" />
                 </Link>
               ))}
            </div>
          </div>

          {/* Links Grid */}
          <div className="lg:col-span-3 space-y-6">
              <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.4em] opacity-60">Main Hub</h4>
              <ul className="space-y-4">
                {quickLinks.map((l) => (
                   <li key={l.name}>
                     <Link href={l.href} className="text-xs text-muted-foreground hover:text-primary transition-colors uppercase font-bold tracking-widest">{l.name}</Link>
                   </li>
                ))}
              </ul>
          </div>

          {/* Contact Detail */}
          <div className="lg:col-span-4 space-y-6">
              <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.4em] opacity-60">Communications</h4>
              <div className="space-y-5">
                 <div className="flex items-start gap-4 group">
                    <div className="w-9 h-9 border border-primary/10 flex items-center justify-center bg-primary/5 group-hover:bg-primary/10 transition-colors rounded-xl shadow-sm">
                       <Phone className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                       <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Direct Line</p>
                       <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{contactInfo.phone}</p>
                    </div>
                 </div>
                 <div className="flex items-start gap-4 group">
                    <div className="w-9 h-9 border border-primary/10 flex items-center justify-center bg-primary/5 group-hover:bg-primary/10 transition-colors rounded-xl shadow-sm">
                       <Mail className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                       <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Secure Email</p>
                       <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{contactInfo.email}</p>
                    </div>
                 </div>
              </div>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="pt-12 border-t border-border flex flex-col md:flex-row items-center justify-between gap-8">
           <div className="flex flex-col md:flex-row items-center gap-6">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                 © {year} RILLCOD TECHNOLOGIES. ALL RIGHTS RESERVED.
              </p>
              <span className="hidden md:block w-1.5 h-1.5 bg-primary/20 rounded-xl shadow-sm" />
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                 Built with <Heart className="w-3 h-3 text-rose-500" /> in Benin City @ 2026
              </p>
           </div>
           
           <div className="flex items-center gap-6 px-6 py-2 bg-muted border border-border rounded-xl shadow-sm">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              <span className="text-[8px] font-black text-muted-foreground uppercase tracking-[0.3em]">Official Verified Node</span>
           </div>
        </div>
      </div>
    </footer>
  );
}