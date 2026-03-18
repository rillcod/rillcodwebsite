"use client";

import React from 'react';
import { Target, Lightbulb, TrendingUp, Users, Award, ShieldCheck, Sparkles, Command } from 'lucide-react';

const pillars = [
  {
    icon: Target,
    title: 'Modern Mastery',
    desc: 'Moving beyond theory to hands-on engineering and software development.',
    color: 'text-orange-500',
    bg: 'bg-orange-500/10'
  },
  {
    icon: Lightbulb,
    title: 'Creative Logic',
    desc: 'Teaching kids to solve complex problems through code and robotics.',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10'
  },
  {
    icon: Award,
    title: 'Global Standards',
    desc: 'Curriculum designed to meet international STEM benchmarks.',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10'
  },
];

const About: React.FC = () => {
  return (
    <section id="about" className="py-24 bg-[#121212] relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
      
      <div className="max-w-screen-2xl mx-auto px-6 lg:px-20 relative z-10">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          
          {/* CONTENT */}
          <div>
            <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 bg-white/5 border border-border rounded-none">
               <Command className="w-4 h-4 text-orange-500" />
               <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Our Mission</span>
            </div>
            
            <h2 className="text-3xl sm:text-6xl font-black text-white leading-[1.05] tracking-tight mb-8 uppercase">
              REVOLUTIONIZING <br />
              <span className="text-white/40 italic">STEM EDUCATION.</span>
            </h2>
            
            <p className="text-sm sm:text-lg text-slate-400 leading-relaxed mb-12 font-medium italic border-l-2 border-orange-500 pl-6">
              At Rillcod, we don't just teach kids how to use technology — we teach them how to build it. Our mission is to transform Nigerian schools into world-class tech hubs.
            </p>

            <div className="grid sm:grid-cols-3 gap-6">
              {pillars.map((p) => (
                <div key={p.title} className="group p-6 bg-white/[0.02] border border-border rounded-none hover:bg-white/[0.04] transition-all border-b-2 border-b-transparent hover:border-b-orange-500">
                  <div className={`w-12 h-12 ${p.bg} ${p.color} rounded-none flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                    <p.icon className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-black text-white uppercase tracking-widest mb-2">{p.title}</h4>
                  <p className="text-[11px] text-slate-500 font-bold leading-relaxed">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* STATS / VISUAL */}
          <div className="relative">
             <div className="bg-[#1a1a1a] border border-border rounded-none p-10 md:p-16 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 rounded-none blur-[100px] pointer-events-none" />
                
                <div className="space-y-12 relative z-10">
                   <div>
                      <p className="text-4xl sm:text-5xl font-black text-white tracking-tighter mb-2">25+</p>
                      <p className="text-[10px] font-black text-orange-500 uppercase tracking-[0.4em]">Partner Schools</p>
                      <div className="w-full h-1 bg-white/5 rounded-none mt-4 overflow-hidden">
                         <div className="w-[85%] h-full bg-orange-500 rounded-none" />
                      </div>
                   </div>
                   <div>
                      <p className="text-4xl sm:text-5xl font-black text-white tracking-tighter mb-2">500+</p>
                      <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.4em]">Active Students</p>
                      <div className="w-full h-1 bg-white/5 rounded-none mt-4 overflow-hidden">
                         <div className="w-[92%] h-full bg-blue-500 rounded-none" />
                      </div>
                   </div>
                   <div>
                      <p className="text-4xl sm:text-5xl font-black text-white tracking-tighter mb-2">1,200+</p>
                      <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.4em]">Hours Taught</p>
                      <div className="w-full h-1 bg-white/5 rounded-none mt-4 overflow-hidden">
                         <div className="w-[100%] h-full bg-emerald-500 rounded-none" />
                      </div>
                   </div>
                </div>

                {/* Decorative Sharp Accent */}
                <div className="absolute -bottom-6 -right-6 bg-white/5 border border-border p-6 rounded-none backdrop-blur-md">
                   <Target className="w-8 h-8 text-orange-500/20" />
                </div>
             </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default About;