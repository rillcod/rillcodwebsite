"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { School, Users, ArrowRight, Code2, Cpu, Zap, LogIn, TrendingUp, Sparkles, Orbit } from 'lucide-react';

const stats = [
  { value: '500+', label: 'Students' },
  { id: 'schools', value: '25+', label: 'Schools' },
  { id: 'stem', value: '15+', label: 'STEM' },
  { id: 'success', value: '95%', label: 'Success' },
];

const Hero: React.FC = () => {
  return (
    <section
      id="home"
      className="relative min-h-[90svh] flex items-center bg-background overflow-hidden pt-24 pb-12 sm:pt-32 sm:pb-20"
    >
      {/* Background Orbs */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute top-0 right-0 w-[50%] h-[50%] bg-blue-600/5 blur-[100px] rounded-none" />
        <div className="absolute bottom-0 left-0 w-[40%] h-[40%] bg-primary/5 blur-[80px] rounded-none" />
      </div>

      <div className="relative z-10 w-full max-w-screen-2xl mx-auto px-6 lg:px-20">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          
          {/* LEFT: Copy */}
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-card border border-border backdrop-blur-sm mb-6 rounded-none">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                STEM Excellence Nigeria
              </span>
            </div>

            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-foreground leading-[1.1] tracking-tight mb-6 uppercase">
              Empowering <br className="hidden sm:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary">
                Future Leaders
              </span>
              <br className="hidden sm:block" />
              Through Code.
            </h1>

            <p className="text-base sm:text-lg text-muted-foreground max-w-lg mb-10 font-medium leading-relaxed italic border-l-2 border-brand-red-600 pl-6">
              Empowering Nigerian students with hands-on coding, robotics, and future-forward STEM skills directly within your school.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto mb-12">
              <Link
                href="/login"
                className="group flex items-center justify-center gap-2.5 px-10 py-5 bg-primary text-white font-black text-xs uppercase tracking-[0.2em] rounded-none hover:bg-primary transition-all shadow-lg"
              >
                Student Login
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="/school-registration"
                className="flex items-center justify-center gap-2.5 px-10 py-5 bg-card text-foreground font-black text-xs uppercase tracking-[0.2em] rounded-none border border-border hover:bg-muted transition-all"
              >
                Register School
              </Link>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full">
              {stats.map((s) => (
                <div key={s.label} className="bg-card border border-border rounded-none p-4 sm:p-5 border-t-2 border-t-brand-red-600/40">
                  <p className="text-2xl sm:text-3xl font-black text-foreground tracking-tighter">{s.value}</p>
                  <p className="text-[8px] sm:text-[9px] text-muted-foreground font-black uppercase tracking-widest mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: Visual Side */}
          <div className="relative order-first lg:order-last">
            <div className="relative w-full aspect-square max-w-[500px] mx-auto group">
              {/* Floating Accent */}
              <div className="absolute -top-4 -right-4 z-20 bg-card border border-border rounded-none p-3 sm:p-5 shadow-xl backdrop-blur-md">
                 <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary rounded-none flex items-center justify-center mb-2">
                    <Cpu className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                 </div>
                 <p className="text-foreground font-black text-[8px] sm:text-[9px] uppercase tracking-widest">Robotics Hub</p>
              </div>

              {/* Image with Sharp Frame */}
              <div className="relative z-10 w-full h-full rounded-none overflow-hidden border border-border shadow-2xl bg-muted group-hover:-translate-y-1 transition-transform duration-500">
                <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-60 z-10" />
                <Image
                   src="/images/landing/hero.png"
                   alt="Rillcod Excellence"
                   fill
                   className="object-cover"
                />
                {/* Student Registration CTA overlay */}
                <div className="absolute bottom-0 inset-x-0 z-20 p-4 sm:p-6">
                  <Link
                    href="/student-registration"
                    className="group/cta flex items-center justify-between w-full bg-background/90 backdrop-blur-sm border border-primary/40 px-5 py-4 hover:bg-primary transition-all duration-300 shadow-2xl"
                  >
                    <div>
                      <p className="text-[9px] font-black text-primary group-hover/cta:text-white uppercase tracking-[0.25em] mb-0.5 transition-colors">New Student?</p>
                      <p className="text-sm font-black text-foreground group-hover/cta:text-white uppercase tracking-tight transition-colors">Register Now</p>
                    </div>
                    <div className="w-9 h-9 bg-primary group-hover/cta:bg-card flex items-center justify-center flex-shrink-0 transition-colors">
                      <ArrowRight className="w-4 h-4 text-white group-hover/cta:text-primary group-hover/cta:translate-x-0.5 transition-all" />
                    </div>
                  </Link>
                </div>
              </div>

              {/* Halo */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[110%] h-[110%] bg-blue-600/5 blur-[80px] rounded-none -z-10" />
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default Hero;
