"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Facebook, Twitter, Instagram, Linkedin, Youtube, Mail, Phone, MapPin, School, Heart, ArrowRight, Sparkles, ShieldCheck } from "lucide-react";
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
    <footer className="bg-[#121212] text-white relative overflow-hidden border-t border-border">
      {/* Sharp Accent Line */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 via-orange-500 to-transparent opacity-50" />

      <div className="max-w-screen-2xl mx-auto px-6 lg:px-20 pt-20 pb-12 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-16 lg:gap-24 mb-20">
          
          {/* Brand Col */}
          <div className="lg:col-span-5 space-y-8">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 bg-white/5 border border-border flex items-center justify-center rounded-none group-hover:scale-105 transition-transform ring-1 ring-white/20 ring-offset-2 ring-offset-[#121212]">
                <Image src="/images/logo.png" alt="Rillcod Technologies" width={28} height={28} className="object-contain" />
              </div>
              <div className="leading-none">
                <span className="text-2xl font-black uppercase tracking-tight block leading-tight italic text-white">RILLCOD<span className="text-orange-500 not-italic">.</span></span>
                <span className="text-2xl font-black uppercase tracking-tight block leading-tight italic text-orange-500">TECHNOLOGIES</span>
              </div>
            </Link>
            
            <p className="text-slate-400 text-sm leading-relaxed max-w-sm italic border-l border-border pl-5">
              Deploying elite STEM infrastructure and curriculum across partner schools in Nigeria. From first lines of code to advanced robotics engineering.
            </p>

            <div className="flex items-center gap-3">
               {footerSocialLinks.map((s) => (
                 <Link key={s.name} href="#" className="w-10 h-10 border border-border flex items-center justify-center rounded-none hover:bg-white/5 hover:border-orange-500 transition-all text-slate-400 hover:text-orange-500">
                    <s.icon className="w-4 h-4" />
                 </Link>
               ))}
            </div>
          </div>

          {/* Links Grid */}
          <div className="lg:col-span-3 space-y-6">
              <h4 className="text-[10px] font-black text-orange-500/50 uppercase tracking-[0.4em]">Main Hub</h4>
              <ul className="space-y-4">
                {quickLinks.map((l) => (
                  <li key={l.name}>
                    <Link href={l.href} className="text-xs text-slate-500 hover:text-orange-500 transition-colors uppercase font-bold tracking-widest">{l.name}</Link>
                  </li>
                ))}
              </ul>
          </div>

          {/* Contact Detail */}
          <div className="lg:col-span-4 space-y-6">
              <h4 className="text-[10px] font-black text-orange-500/50 uppercase tracking-[0.4em]">Communications</h4>
              <div className="space-y-5">
                 <div className="flex items-start gap-4 group">
                    <div className="w-9 h-9 border border-orange-500/10 flex items-center justify-center bg-orange-500/5 group-hover:bg-orange-500/10 transition-colors rounded-none">
                       <Phone className="w-4 h-4 text-orange-500" />
                    </div>
                    <div>
                       <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-0.5">Direct Line</p>
                       <p className="text-sm font-bold text-white group-hover:text-orange-500 transition-colors">{contactInfo.phone}</p>
                    </div>
                 </div>
                 <div className="flex items-start gap-4 group">
                    <div className="w-9 h-9 border border-blue-500/10 flex items-center justify-center bg-blue-500/5 group-hover:bg-blue-500/10 transition-colors rounded-none">
                       <Mail className="w-4 h-4 text-blue-500" />
                    </div>
                    <div>
                       <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-0.5">Secure Email</p>
                       <p className="text-sm font-bold text-white group-hover:text-blue-500 transition-colors">{contactInfo.email}</p>
                    </div>
                 </div>
              </div>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="pt-12 border-t border-border flex flex-col md:flex-row items-center justify-between gap-8">
           <div className="flex flex-col md:flex-row items-center gap-6">
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                 © {year} RILLCOD TECHNOLOGIES. ALL RIGHTS RESERVED.
              </p>
              <span className="hidden md:block w-1.5 h-1.5 bg-orange-500/20 rounded-none" />
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-2">
                 Built with <Heart className="w-3 h-3 text-rose-500" /> in Benin City @ 2026
              </p>
           </div>
           
           <div className="flex items-center gap-6 px-6 py-2 bg-white/5 border border-border rounded-none">
              <ShieldCheck className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.3em]">Official Verified Node</span>
           </div>
        </div>
      </div>
    </footer>
  );
}