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
} from '@heroicons/react/24/outline'

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
    <section className="py-24 bg-white border-t-4 border-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-16 gap-4">
          <div>
            <span className="inline-block text-xs font-black uppercase tracking-widest text-[#FF914D] border-2 border-[#FF914D] px-3 py-1 mb-3">
              Student Achievements
            </span>
            <h2 className="text-4xl md:text-5xl font-extrabold text-black leading-tight">
              Nigerian Kids Making<br />Waves in STEM
            </h2>
          </div>
          <p className="text-gray-500 max-w-xs text-sm leading-relaxed">
            Our students are not just learning — they&apos;re innovating and creating solutions for tomorrow.
          </p>
        </div>

        {/* Achievement cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-20">
          {achievements.map(({ id, title, description, icon: Icon, location, date, participants, badge, color }) => (
            <div
              key={id}
              className="border-2 border-black shadow-[4px_4px_0_0_rgba(0,0,0,1)] p-6 bg-white hover:shadow-[6px_6px_0_0_rgba(0,0,0,1)] hover:-translate-x-[2px] hover:-translate-y-[2px] transition-all"
            >
              <div className="flex items-start justify-between mb-5">
                <div className={`w-10 h-10 flex items-center justify-center flex-shrink-0 ${color}`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <span className="text-xs font-black uppercase tracking-widest border-2 border-black px-2 py-0.5">
                  {badge}
                </span>
              </div>

              <h3 className="text-lg font-extrabold text-black mb-2 leading-tight">{title}</h3>
              <p className="text-gray-600 text-sm mb-5 leading-relaxed">{description}</p>

              <div className="space-y-1.5 text-xs text-gray-400 font-bold uppercase tracking-wider">
                <div className="flex items-center gap-2">
                  <GlobeAltIcon className="h-3.5 w-3.5" />
                  {location}
                </div>
                <div className="flex items-center gap-2">
                  <BookOpenIcon className="h-3.5 w-3.5" />
                  {date}
                </div>
                <div className="flex items-center gap-2">
                  <UserGroupIcon className="h-3.5 w-3.5" />
                  {participants} participants
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Testimonials */}
        <div className="mb-20">
          <h3 className="text-3xl font-extrabold text-black uppercase tracking-tight mb-10 text-center">
            Student Success Stories
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {testimonials.map(({ id, name, age, school, quote, achievement }) => (
              <div
                key={id}
                className="border-2 border-black shadow-[4px_4px_0_0_rgba(0,0,0,1)] p-6"
              >
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-12 h-12 bg-[#FF914D] border-2 border-black flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-black text-lg">{name[0]}</span>
                  </div>
                  <div>
                    <h4 className="font-extrabold text-black text-sm">{name}</h4>
                    <p className="text-xs text-gray-500 font-bold">Age {age} • {school}</p>
                  </div>
                </div>

                <blockquote className="text-gray-700 text-sm italic leading-relaxed mb-5 border-l-4 border-[#FF914D] pl-4">
                  &ldquo;{quote}&rdquo;
                </blockquote>

                <div className="flex items-center gap-2">
                  <TrophyIcon className="h-4 w-4 text-[#FF914D]" />
                  <span className="text-xs font-black uppercase tracking-widest text-gray-600">{achievement}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Bar */}
        <div className="border-2 border-black shadow-[6px_6px_0_0_rgba(0,0,0,1)] bg-black text-white p-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-[#FF914D] mb-2">Join the Movement</p>
            <h3 className="text-2xl md:text-3xl font-extrabold">
              Empower the next generation of<br className="hidden md:block" /> Nigerian tech leaders
            </h3>
          </div>
          <a
            href="/school-registration"
            className="flex-shrink-0 flex items-center gap-2 px-8 py-4 bg-[#FF914D] text-black font-black text-sm border-2 border-[#FF914D] shadow-[3px_3px_0_0_rgba(255,145,77,0.5)] hover:shadow-[5px_5px_0_0_rgba(255,145,77,0.5)] hover:-translate-x-[2px] hover:-translate-y-[2px] transition-all uppercase tracking-wide"
          >
            Get Started Today
          </a>
        </div>
      </div>
    </section>
  )
}