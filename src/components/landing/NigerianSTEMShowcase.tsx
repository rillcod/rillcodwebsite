// @refresh reset
'use client'

import React from 'react'
import {
  Trophy,
  Globe,
  Star,
  ArrowRight,
  Code,
  Cpu,
  Rocket,
  Beaker,
  Monitor,
  Lightbulb,
  ChevronRight,
  Sparkles,
  Command
} from 'lucide-react'

const achievements = [
  { id: 1, title: 'National Coding Competition', description: 'Students from Lagos State Model College won first place in the 2024 National Youth Coding Challenge.', icon: Code, badge: '1st Place', color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  { id: 2, title: 'Robotics Innovation Award', description: 'Young inventors from Abuja created a solar-powered irrigation system for local farmers.', icon: Cpu, badge: 'Innovation', color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  { id: 3, title: 'Science Fair Excellence', description: 'Port Harcourt Academy students presented groundbreaking environmental research.', icon: Beaker, badge: 'Excellence', color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { id: 4, title: 'Mobile App Development', description: 'Kids created apps solving local community problems like waste management and navigation.', icon: Monitor, badge: 'Community', color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  { id: 5, title: '3D Printing Workshop', description: 'Students designed and printed prototypes for local businesses — hands-on engineering.', icon: Rocket, badge: 'Skills Dev', color: 'text-pink-500', bg: 'bg-pink-500/10', border: 'border-pink-500/20' },
  { id: 6, title: 'AI & Machine Learning', description: 'Introduction to artificial intelligence with practical, real-world applications.', icon: Lightbulb, badge: 'Future Ready', color: 'text-teal-500', bg: 'bg-teal-500/10', border: 'border-teal-500/20' },
]

const testimonials = [
  { id: 1, name: 'Amina Hassan', age: 14, school: 'Lagos Model College', quote: 'Coding has opened up a whole new world for me. I can now create apps that help my community!', achievement: 'National Winner' },
  { id: 2, name: 'Chukwu Okoro', age: 13, school: 'Abuja International', quote: 'Building robots taught me that anything is possible with determination and creativity.', achievement: 'Robotics Lead' },
  { id: 3, name: 'Fatima Adebayo', age: 15, school: 'PH Academy', quote: 'STEM education has given me the confidence to pursue my dreams in technology.', achievement: 'Science Fellow' },
]

export default function NigerianSTEMShowcase() {
  return (
    <section className="py-24 bg-[#121212] relative overflow-hidden">
      {/* Grid Pattern Background */}
      <div className="absolute inset-0 opacity-[0.05] pointer-events-none" 
           style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '50px 50px' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-blue-600/5 blur-[150px] rounded-none" />

      <div className="max-w-screen-2xl mx-auto px-6 lg:px-20 relative z-10">

        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-16 gap-10">
          <div>
            <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 bg-orange-500/10 border border-orange-500/20 rounded-none">
               <Trophy className="w-4 h-4 text-orange-500" />
               <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Global Impact</span>
            </div>
            <h3 className="text-4xl sm:text-6xl font-black text-white leading-[1.05] tracking-tight uppercase">
              MAKING <br />
              <span className="text-white/40 italic">GLOBAL WAVES.</span>
            </h3>
          </div>
          <p className="text-slate-400 text-lg font-medium leading-relaxed max-w-sm italic border-l-2 border-orange-500 pl-6">
             Our methodology isn't just about code — it's about producing world-class talent right here in Nigeria.
          </p>
        </div>

        {/* Achievement Grid - Sharp Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-32">
          {achievements.map((item) => (
            <div
              key={item.id}
              className="group relative bg-white/[0.02] border border-border rounded-none p-8 transition-all hover:bg-white/[0.04] shadow-xl border-t-2 border-t-transparent hover:border-t-orange-500"
            >
              <div className="absolute top-6 right-8">
                 <span className={`text-[10px] font-black uppercase tracking-widest ${item.color} bg-white/5 px-4 py-1.5 rounded-none border border-border`}>{item.badge}</span>
              </div>
              
              <div className={`w-14 h-14 ${item.bg} rounded-none flex items-center justify-center mb-6 border ${item.border} group-hover:scale-110 transition-transform`}>
                 <item.icon className={`w-7 h-7 ${item.color}`} />
              </div>

              <h4 className="text-xl font-black text-white mb-4 leading-tight tracking-tight uppercase group-hover:text-orange-500 transition-colors">{item.title}</h4>
              <p className="text-slate-400 text-sm mb-10 leading-relaxed font-medium line-clamp-3">"{item.description}"</p>

              <div className="flex items-center gap-3 text-[10px] font-black text-orange-500 uppercase tracking-[0.2em] group-hover:translate-x-2 transition-transform">
                 Explore Project <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          ))}
        </div>

        {/* Success Stories */}
        <div className="mb-40">
          <div className="flex items-center gap-8 mb-20 text-center">
             <div className="h-px flex-1 bg-white/10" />
             <h4 className="text-sm font-black text-white uppercase tracking-[0.6em] flex items-center gap-4">
               <Sparkles className="w-5 h-5 text-orange-500" /> SCHOLAR VOICES
             </h4>
             <div className="h-px flex-1 bg-white/10" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div
                key={t.id}
                className="bg-[#1a1a1a] border border-border rounded-none p-10 hover:bg-[#1c2032]/40 transition-all relative group shadow-2xl border-l border-l-orange-500/20 hover:border-l-orange-500"
              >
                <div className="flex items-center gap-5 mb-8">
                  <div className="w-14 h-14 rounded-none bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-xl font-black text-orange-500">
                    {t.name[0]}
                  </div>
                  <div>
                    <h5 className="font-black text-white uppercase text-sm tracking-widest">{t.name}</h5>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-tight">{t.school}</p>
                  </div>
                </div>

                <p className="text-lg font-bold text-slate-300 leading-relaxed italic mb-8">
                  "{t.quote}"
                </p>

                <div className="inline-flex items-center gap-3 px-5 py-2 bg-white/5 border border-border rounded-none">
                   <Trophy className="w-4 h-4 text-orange-400" />
                   <span className="text-[10px] font-black uppercase text-orange-400 tracking-[0.3em] font-mono">{t.achievement}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* High-Contrast Unified CTA */}
        <div className="relative bg-[#1a1a1a] border border-border rounded-none p-10 md:p-20 overflow-hidden group shadow-2xl border-t-4 border-t-orange-500">
           <div className="absolute top-0 right-0 w-[50%] h-[150%] bg-blue-600/5 rotate-12 -translate-y-1/2 pointer-events-none" />
           
           <div className="relative z-10 grid lg:grid-cols-2 gap-12 items-center text-center lg:text-left">
              <div>
                <div className="inline-flex items-center gap-3 mb-6 px-5 py-2 bg-orange-500/10 border border-orange-500/20 rounded-none">
                    <Command className="w-4 h-4 text-orange-500" />
                    <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">System Uplink</span>
                </div>
                <h4 className="text-4xl sm:text-6xl font-black text-white leading-[1] tracking-tight uppercase">
                   Transform your school into a <br />
                   <span className="text-orange-500 italic">TECH HUB.</span>
                </h4>
              </div>
              <div className="flex justify-center lg:justify-end">
                <a
                  href="/school-registration"
                  className="flex items-center gap-6 px-12 py-6 bg-orange-500 text-white font-black text-xs uppercase rounded-none hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 tracking-[0.4em]"
                >
                  Join Network
                  <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-2" />
                </a>
              </div>
           </div>
        </div>
      </div>
    </section>
  )
}