"use client";

import React from 'react';
import Link from 'next/link';
import { School, Users, ArrowRight, Code2, Cpu, Zap, LogIn } from 'lucide-react';

const stats = [
  { value: '500+', label: 'Students Trained' },
  { value: '25+', label: 'Partner Schools' },
  { value: '15+', label: 'STEM Programs' },
  { value: '95%', label: 'Success Rate' },
];

const Hero: React.FC = () => {
  return (
    <section
      id="home"
      className="relative min-h-screen flex items-center bg-[#0a0a0f] overflow-hidden"
    >
      {/* Grid background */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      {/* Accent blobs */}
      <div className="absolute top-[-10%] left-[-5%] w-96 h-96 bg-[#FF914D] opacity-20 blur-[120px] rounded-full z-0" />
      <div className="absolute bottom-[-5%] right-[-5%] w-80 h-80 bg-blue-600 opacity-20 blur-[100px] rounded-full z-0" />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-28 md:py-36">
        <div className="flex flex-col lg:flex-row items-center gap-16">

          {/* LEFT: Copy */}
          <div className="flex-1 text-center lg:text-left">
            {/* Pill tag */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FF914D]/10 border border-[#FF914D]/20 text-[#FF914D] text-[10px] font-black uppercase tracking-widest mb-8">
              <Zap className="w-3 h-3" />
              Nigeria&apos;s Leading STEM Academy
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl xl:text-7xl font-extrabold text-white leading-[1.05] tracking-tight mb-6">
              Building{' '}
              <span className="text-[#FF914D]">Nigeria&apos;s</span>{' '}
              Next Generation<br className="hidden sm:block" /> of Tech Leaders
            </h1>

            <p className="text-lg text-white/50 max-w-xl mx-auto lg:mx-0 mb-10 leading-relaxed font-medium">
              Rillcod Academy empowers Nigerian kids from JSS1 to SS3 with hands-on coding,
              robotics, and STEM skills — inside their own schools, taught by expert tutors.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-14">
              <Link
                href="/school-registration"
                className="group inline-flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-[#FF914D] to-orange-600 text-white font-black text-sm uppercase tracking-widest rounded-2xl shadow-xl shadow-orange-500/20 hover:scale-105 active:scale-95 transition-all"
              >
                <School className="w-5 h-5" />
                Partner My School
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="/student-registration"
                className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-white/[0.05] backdrop-blur-md text-white font-black text-sm uppercase tracking-widest rounded-2xl border border-white/10 hover:bg-white/10 hover:scale-105 active:scale-95 transition-all"
              >
                <Users className="w-5 h-5" />
                Join as Student
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 text-white/40 font-bold text-xs uppercase tracking-widest hover:text-white transition-all hover:underline underline-offset-4"
              >
                <LogIn className="w-4 h-4" />
                Portal Login
              </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {stats.map((s) => (
                <div key={s.label} className="bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-3xl p-6 text-center shadow-xl">
                  <p className="text-3xl font-black text-white tracking-tighter">{s.value}</p>
                  <p className="text-[10px] text-white/40 mt-1 font-black uppercase tracking-widest">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: Feature cards */}
          <div className="flex-1 hidden lg:grid grid-cols-2 gap-4 w-full max-w-md">
            {[
              { icon: Code2, label: 'Python & JavaScript', bg: 'bg-[#FF914D]' },
              { icon: Cpu, label: 'Robotics & AI', bg: 'bg-blue-600' },
              { icon: School, label: 'In-School Classes', bg: 'bg-green-500' },
              { icon: Zap, label: 'Competitions & Awards', bg: 'bg-purple-600' },
            ].map(({ icon: Icon, label, bg }) => (
              <div
                key={label}
                className="bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-3xl p-8 flex flex-col items-start gap-4 hover:bg-white/[0.06] hover:border-white/20 transition-all duration-300 shadow-2xl group"
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${bg} bg-opacity-20 group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-6 h-6 ${bg.replace('bg-', 'text-')}`} />
                </div>
                <p className="text-white font-bold text-sm tracking-tight leading-tight">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;