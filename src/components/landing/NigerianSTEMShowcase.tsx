// @refresh reset
'use client'

import React from 'react'
import {
  CodeBracketIcon,
  CpuChipIcon,
  RocketLaunchIcon,
  BeakerIcon,
  TrophyIcon,
  StarIcon,
  GlobeAltIcon,
  BookOpenIcon,
  UserGroupIcon,
  LightBulbIcon,
  ComputerDesktopIcon,
} from '@/lib/icons'

const achievements = [
  { id: 1, title: 'National Coding Competition', description: 'Students from Lagos State Model College won first place in the 2024 National Youth Coding Challenge.', icon: CodeBracketIcon, location: 'Lagos, Nigeria', date: 'March 2024', participants: 15, badge: '1st Place', color: 'bg-[#FF914D]' },
  { id: 2, title: 'Robotics Innovation Award', description: 'Young inventors from Abuja created a solar-powered irrigation system for local farmers.', icon: CpuChipIcon, location: 'Abuja, Nigeria', date: 'February 2024', participants: 8, badge: 'Innovation Award', color: 'bg-blue-600' },
  { id: 3, title: 'Science Fair Excellence', description: 'Port Harcourt Academy students presented groundbreaking environmental research.', icon: BeakerIcon, location: 'Port Harcourt, Nigeria', date: 'January 2024', participants: 12, badge: 'Excellence Award', color: 'bg-green-600' },
  { id: 4, title: 'Mobile App Development', description: 'Kids created apps solving local community problems like waste management and navigation.', icon: ComputerDesktopIcon, location: 'Kano, Nigeria', date: 'December 2023', participants: 20, badge: 'Community Impact', color: 'bg-purple-600' },
  { id: 5, title: '3D Printing Workshop', description: 'Students designed and printed prototypes for local businesses — hands-on engineering.', icon: RocketLaunchIcon, location: 'Ibadan, Nigeria', date: 'November 2023', participants: 18, badge: 'Skills Dev', color: 'bg-pink-600' },
  { id: 6, title: 'AI & Machine Learning', description: 'Introduction to artificial intelligence with practical, real-world applications.', icon: LightBulbIcon, location: 'Enugu, Nigeria', date: 'October 2023', participants: 25, badge: 'Future Ready', color: 'bg-teal-600' },
]

const testimonials = [
  { id: 1, name: 'Amina Hassan', age: 14, school: 'Lagos State Model College', quote: 'Coding has opened up a whole new world for me. I can now create apps that help my community!', achievement: 'National Coding Winner' },
  { id: 2, name: 'Chukwu Okoro', age: 13, school: 'Abuja International School', quote: 'Building robots taught me that anything is possible with determination and creativity.', achievement: 'Robotics Award Winner' },
  { id: 3, name: 'Fatima Adebayo', age: 15, school: 'Port Harcourt Academy', quote: 'STEM education has given me the confidence to pursue my dreams in technology.', achievement: 'Science Fair Excellence' },
]

export default function NigerianSTEMShowcase() {
  return (
    <section className="py-24 bg-[#0a0a0f] relative overflow-hidden">
      {/* Background accents */}
      <div className="absolute top-1/4 right-0 w-96 h-96 bg-blue-600/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 left-0 w-96 h-96 bg-[#FF914D]/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-16 gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FF914D]/10 border border-[#FF914D]/20 text-[#FF914D] text-[10px] font-black uppercase tracking-widest mb-4">
              <TrophyIcon className="w-3 h-3" />
              Student Achievements
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-white leading-tight tracking-tight">
              Nigerian Kids Making<br />Waves in STEM
            </h2>
          </div>
          <p className="text-white/50 max-w-sm text-sm leading-relaxed font-medium">
            Our students are not just learning — they&apos;re innovating and creating high-impact solutions for tomorrow&apos;s challenges.
          </p>
        </div>

        {/* Achievement cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-24">
          {achievements.map(({ id, title, description, icon: Icon, location, date, participants, badge, color }) => (
            <div
              key={id}
              className="group bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-[2rem] p-10 hover:bg-white/[0.06] hover:border-white/20 transition-all duration-300 shadow-xl shadow-black/20"
            >
              <div className="flex items-start justify-between mb-8">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${color} bg-opacity-20 group-hover:scale-110 transition-transform`}>
                  <Icon className={`h-7 w-7 ${color.replace('bg-', 'text-')}`} />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest bg-white/5 border border-white/10 px-4 py-1.5 rounded-full text-white/60">
                  {badge}
                </span>
              </div>

              <h3 className="text-2xl font-bold text-white mb-4 leading-tight tracking-tight">{title}</h3>
              <p className="text-white/40 text-sm mb-8 leading-relaxed line-clamp-3 font-medium">{description}</p>

              <div className="pt-8 border-t border-white/5 space-y-3 text-[10px] text-white/30 font-black uppercase tracking-[0.2em]">
                <div className="flex items-center gap-3">
                  <GlobeAltIcon className="h-4 w-4 text-blue-400/50" />
                  {location}
                </div>
                <div className="flex items-center gap-3">
                  <StarIcon className="h-4 w-4 text-yellow-400/50" />
                  {date}
                </div>
                <div className="flex items-center gap-3">
                  <UserGroupIcon className="h-4 w-4 text-emerald-400/50" />
                  {participants} participants
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Testimonials */}
        <div className="mb-24">
          <div className="text-center mb-16">
            <h3 className="text-4xl font-black text-white uppercase tracking-tighter">
              Student Success Stories
            </h3>
            <div className="w-20 h-1.5 bg-[#FF914D] mx-auto mt-6 rounded-full" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map(({ id, name, age, school, quote, achievement }) => (
              <div
                key={id}
                className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-10 relative overflow-hidden group hover:bg-white/[0.04] transition-all duration-300"
              >
                <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                  <StarIcon className="w-20 h-20 text-white" />
                </div>

                <div className="flex items-center gap-6 mb-8">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF914D] to-orange-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-orange-500/20">
                    <span className="text-white font-black text-2xl">{name[0]}</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-lg tracking-tight">{name}</h4>
                    <p className="text-xs text-white/40 font-bold uppercase tracking-widest mt-1">Age {age} • {school}</p>
                  </div>
                </div>

                <blockquote className="text-white/70 text-base italic leading-relaxed mb-10 relative font-medium">
                  <span className="absolute -top-6 -left-4 text-6xl text-[#FF914D]/20 font-serif leading-none">&ldquo;</span>
                  {quote}
                  <span className="absolute -bottom-10 -right-4 text-6xl text-[#FF914D]/20 font-serif leading-none text-right">&rdquo;</span>
                </blockquote>

                <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-2xl border border-white/5 w-fit">
                  <TrophyIcon className="h-5 w-5 text-[#FF914D]" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/50">{achievement}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Bar */}
        <div className="relative bg-gradient-to-br from-gray-900 to-[#0e0e16] border border-white/10 rounded-[3rem] p-12 md:p-20 overflow-hidden shadow-2xl group">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#FF914D]/10 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-[#FF914D]/15 transition-all duration-700" />
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-600/5 blur-[120px] rounded-full translate-y-1/2 -translate-x-1/2" />

          <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-12 text-center lg:text-left">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-[#FF914D] mb-6">Join the Movement</p>
              <h3 className="text-4xl md:text-5xl font-extrabold text-white leading-tight tracking-tighter">
                Empower the next generation of<br className="hidden md:block" /> Nigerian tech leaders
              </h3>
            </div>
            <a
              href="/school-registration"
              className="flex-shrink-0 flex items-center gap-4 px-12 py-6 bg-[#FF914D] text-white font-black text-sm rounded-2xl hover:bg-orange-500 hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-orange-500/30 uppercase tracking-[0.2em]"
            >
              Get Started Today
              <RocketLaunchIcon className="w-6 h-6" />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}