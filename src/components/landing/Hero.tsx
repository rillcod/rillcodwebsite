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
            <div className="inline-flex items-center gap-2 border border-white/20 bg-white/5 text-white/70 text-xs font-bold uppercase tracking-widest px-4 py-1.5 mb-8">
              <Zap className="w-3 h-3 text-[#FF914D]" />
              Nigeria&apos;s Leading STEM Academy
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl xl:text-7xl font-extrabold text-white leading-[1.05] tracking-tight mb-6">
              Building{' '}
              <span className="text-[#FF914D]">Nigeria&apos;s</span>{' '}
              Next Generation<br className="hidden sm:block" /> of Tech Leaders
            </h1>

            <p className="text-lg text-white/60 max-w-xl mx-auto lg:mx-0 mb-10 leading-relaxed">
              Rillcod Academy empowers Nigerian kids from JSS1 to SS3 with hands-on coding,
              robotics, and STEM skills — inside their own schools, taught by expert tutors.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-14">
              <Link
                href="/school-registration"
                className="group inline-flex items-center justify-center gap-2 px-7 py-4 bg-[#FF914D] text-black font-bold text-base border-2 border-black shadow-[4px_4px_0_0_rgba(0,0,0,1)] hover:shadow-[6px_6px_0_0_rgba(0,0,0,1)] hover:-translate-x-[2px] hover:-translate-y-[2px] transition-all"
              >
                <School className="w-5 h-5" />
                Register My School
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>

              <Link
                href="/student-registration"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 bg-white text-black font-bold text-base border-2 border-black shadow-[4px_4px_0_0_rgba(0,0,0,1)] hover:shadow-[6px_6px_0_0_rgba(0,0,0,1)] hover:-translate-x-[2px] hover:-translate-y-[2px] transition-all"
              >
                <Users className="w-5 h-5" />
                Start Coding Journey
              </Link>

              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 bg-transparent text-white/80 font-bold text-base border-2 border-white/30 hover:border-white hover:text-white transition-all"
              >
                <LogIn className="w-5 h-5" />
                Portal Login
              </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {stats.map((s) => (
                <div key={s.label} className="border border-white/10 bg-white/5 p-4 text-center">
                  <p className="text-2xl sm:text-3xl font-extrabold text-white">{s.value}</p>
                  <p className="text-xs text-white/50 mt-1 font-medium uppercase tracking-wider">{s.label}</p>
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
                className="border-2 border-white/10 bg-white/5 p-6 flex flex-col items-start gap-3 hover:bg-white/10 transition-colors"
              >
                <div className={`w-10 h-10 flex items-center justify-center ${bg}`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <p className="text-white font-bold text-sm">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;