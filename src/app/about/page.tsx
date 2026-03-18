"use client";
import { useState } from "react";
import { Users, Target, Award, Heart, Lightbulb, Shield, Globe, BookOpen, ChevronDown, ChevronUp, CheckCircle, Building, Mail, Brain } from "lucide-react";
import Link from "next/link";

const values = [
  {
    icon: <Lightbulb className="w-12 h-12 text-yellow-500" />,
    title: "Innovation",
    description: "We foster creativity and innovative thinking in all our programs, encouraging students to think outside the box.",
    color: "from-yellow-400 to-orange-500"
  },
  {
    icon: <Shield className="w-12 h-12 text-green-500" />,
    title: "Quality",
    description: "We maintain the highest standards in technology education, ensuring every student receives world-class training.",
    color: "from-green-400 to-emerald-500"
  },
  {
    icon: <Heart className="w-12 h-12 text-red-500" />,
    title: "Passion",
    description: "Our passion for technology education drives us to inspire and empower the next generation of innovators.",
    color: "from-red-400 to-pink-500"
  },
  {
    icon: <Globe className="w-12 h-12 text-blue-500" />,
    title: "Global Perspective",
    description: "We prepare students for global opportunities with internationally recognized skills and knowledge.",
    color: "from-blue-400 to-cyan-500"
  }
];

const team = [
  {
    name: "Dr. Sarah Johnson",
    role: "Founder & CEO",
    bio: "A technology education pioneer with 15+ years of experience in curriculum development and AI integration.",
    expertise: ["AI Education", "Curriculum Design", "Educational Technology"],
    email: "sarah@rillcod.tech"
  },
  {
    name: "Michael Chen",
    role: "Head of Technology",
    bio: "Expert in software development and educational technology platforms with a focus on scalable solutions.",
    expertise: ["Software Development", "Platform Architecture", "IoT Integration"],
    email: "michael@rillcod.tech"
  },
  {
    name: "Prof. David Wilson",
    role: "Academic Director",
    bio: "Former university professor specializing in computer science education and student development.",
    expertise: ["Computer Science", "Student Development", "Research"],
    email: "david@rillcod.tech"
  },
  {
    name: "Lisa Rodriguez",
    role: "Head of Operations",
    bio: "Experienced in educational administration and ensuring smooth operations across all programs.",
    expertise: ["Operations Management", "Student Services", "Quality Assurance"],
    email: "lisa@rillcod.tech"
  }
];

const stats = [
  { number: "500+", label: "Students Enrolled", icon: <Users className="w-8 h-8" />, color: "text-blue-600" },
  { number: "12", label: "Years Curriculum", icon: <BookOpen className="w-8 h-8" />, color: "text-green-600" },
  { number: "95%", label: "Success Rate", icon: <Award className="w-8 h-8" />, color: "text-purple-600" },
  { number: "50+", label: "Partner Schools", icon: <Target className="w-8 h-8" />, color: "text-orange-600" }
];

const achievements = [
  {
    year: "2024",
    title: "Best Technology Academy Award",
    description: "Recognized as the leading technology education provider in Nigeria",
    icon: <Award className="w-6 h-6" />
  },
  {
    year: "2023",
    title: "500+ Students Milestone",
    description: "Successfully enrolled over 500 students across various programs",
    icon: <Users className="w-6 h-6" />
  },
  {
    year: "2023",
    title: "AI Integration Excellence",
    description: "Pioneered AI-integrated curriculum in Nigerian schools",
    icon: <Brain className="w-6 h-6" />
  },
  {
    year: "2022",
    title: "50+ Partner Schools",
    description: "Established partnerships with over 50 schools nationwide",
    icon: <Building className="w-6 h-6" />
  }
];

export default function About() {
  const [selectedTeamMember, setSelectedTeamMember] = useState<string | null>(null);

  const toggleTeamMember = (memberName: string) => {
    setSelectedTeamMember(selectedTeamMember === memberName ? null : memberName);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Hero Section */}
        <div className="text-center py-16 bg-[#1a1a1a] border border-white/10 rounded-none shadow-lg mb-16 px-4 border-t-4 border-t-orange-500">
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-white mb-6 uppercase tracking-tight">About RILLCOD Academy</h1>
          <p className="text-sm sm:text-lg text-slate-400 max-w-3xl mx-auto mb-8 font-medium italic">
            Empowering the next generation of world-class professionals through innovative, AI-integrated STEM education.
          </p>
          <div className="w-20 h-1 bg-orange-500 mx-auto rounded-none"></div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
          {stats.map((stat, index) => (
            <div key={index} className="bg-[#1a1a1a] border border-white/10 rounded-none p-8 text-center hover:border-orange-500 transition-all border-b-2 border-b-transparent">
              <div className={`flex justify-center mb-6 text-orange-500`}>
                {stat.icon}
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white mb-1 tracking-tighter">{stat.number}</div>
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Mission, Vision, Objective */}
        <div className="bg-[#1a1a1a] border border-white/10 rounded-none p-12 mb-16 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-none blur-[100px] pointer-events-none"></div>
          <div className="space-y-16 relative z-10">
            <div className="text-left border-l-2 border-orange-500 pl-8">
              <h2 className="text-xl font-black text-white mb-4 uppercase tracking-widest">Our Mission</h2>
              <p className="text-sm sm:text-base text-slate-400 max-w-4xl font-medium italic leading-relaxed">
                To transform Nigeria&apos;s educational landscape by shifting from memory-based learning to a system that fosters critical thinking, creativity, and global competitiveness in AI, robotics, and digital skills.
              </p>
            </div>
            
            <div className="text-left border-l-2 border-blue-500 pl-8">
              <h2 className="text-xl font-black text-white mb-4 uppercase tracking-widest">Our Vision</h2>
              <p className="text-sm sm:text-base text-slate-400 max-w-4xl font-medium italic leading-relaxed">
                To equip every student with the skills to thrive in the AI-driven future, positioning Nigeria as a leader in Africa&apos;s digital transformation.
              </p>
            </div>
            
            <div className="text-left border-l-2 border-emerald-500 pl-8">
              <h2 className="text-xl font-black text-white mb-4 uppercase tracking-widest">Our Objective</h2>
              <p className="text-sm sm:text-base text-slate-400 max-w-4xl font-medium italic leading-relaxed">
                To deliver a 12-year, session-based curriculum that integrates AI, robotics, and traditional programming, ensuring students from Basic 1 to SS3 graduate with advanced mobile development skills, AI literacy, robotics expertise, and professional portfolios.
              </p>
            </div>
          </div>
      </div>

        {/* Core Values */}
      <div className="mb-16">
          <h2 className="text-xl font-black text-white mb-12 text-center uppercase tracking-widest italic">Our Core Values</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value, index) => (
              <div key={index} className="bg-[#1a1a1a] border border-white/10 rounded-none p-8 hover:border-orange-500 transition-all border-b-2 border-b-transparent group">
                <div className={`w-12 h-12 bg-white/5 rounded-none flex items-center justify-center mb-8 group-hover:scale-110 transition-transform`}>
                  {value.icon}
                </div>
                <h3 className="text-sm font-black text-white mb-4 uppercase tracking-widest">{value.title}</h3>
                <p className="text-xs text-slate-500 font-bold leading-relaxed">{value.description}</p>
              </div>
            ))}
          </div>
      </div>

        {/* Executive Summary */}
        <div className="bg-[#1a1a1a] border border-white/10 rounded-none p-12 mb-16 shadow-2xl border-t-4 border-t-orange-500">
        <h2 className="text-xl font-black text-white mb-8 uppercase tracking-widest text-left">Executive Summary</h2>
          <p className="text-sm sm:text-base text-slate-400 mb-12 italic font-medium leading-relaxed max-w-4xl">
            Transform your school into a premier AI and technology powerhouse with RILLCOD TECHNOLOGIES&apos;s 12-year, session-based program. This revolutionary curriculum blends traditional programming with cutting-edge artificial intelligence and robotics, preparing students for the Fourth Industrial Revolution while generating substantial revenue for your institution.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-6">
              {[
                { h: "Complete AI-Integrated Journey", p: "Structured progression from Basic 1 to SS3, with AI and robotics embedded in every term." },
                { h: "36+ Capstone Projects", p: "Real-world solutions like smart agriculture systems, AI-powered analytics, and mobile apps." },
                { h: "Guaranteed Revenue", p: "30% profit share with termly fees starting at ₦20,000, no upfront costs." }
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-4">
                  <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-[10px] font-black text-white uppercase tracking-widest mb-1">{item.h}</h4>
                    <p className="text-[11px] text-slate-500 font-bold">{item.p}</p>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="space-y-6">
              {[
                { h: "Modern Infrastructure", p: "Interactive boards, robotics kits, AI development platforms, and laptops provided by RILLCOD." },
                { h: "African Market Leadership", p: "Position your school as a pioneer in Nigeria's booming digital economy." },
                { h: "Industry 4.0 Readiness", p: "Graduates equipped for high-paying careers in AI, IoT, and tech entrepreneurship." }
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-4">
                  <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-[10px] font-black text-white uppercase tracking-widest mb-1">{item.h}</h4>
                    <p className="text-[11px] text-slate-500 font-bold">{item.p}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Achievements Timeline */}
        <div className="bg-[#1a1a1a] border border-white/10 rounded-none p-12 mb-16 shadow-2xl">
          <h2 className="text-xl font-black text-white mb-12 text-center uppercase tracking-widest italic">Our Achievements</h2>
          <div className="space-y-4">
            {achievements.map((achievement, index) => (
              <div key={index} className="flex items-center gap-8 p-8 bg-[#121212] border border-white/5 rounded-none hover:border-orange-500 transition-all group">
                <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-none flex items-center justify-center text-orange-500 font-black text-xl group-hover:bg-orange-500 group-hover:text-white transition-all shrink-0">
                  {achievement.year.slice(-2)}
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-black text-white uppercase tracking-widest mb-1">{achievement.title}</h3>
                  <p className="text-xs text-slate-500 font-bold italic">{achievement.description}</p>
                </div>
                <div className="text-white/20 group-hover:text-orange-500 transition-colors">
                  {achievement.icon}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Team Section */}
        <div className="mb-16">
          <h2 className="text-xl font-black text-white mb-12 text-center uppercase tracking-widest italic">Leadership Cadre</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {team.map((member, index) => (
              <div key={index} className="bg-[#1a1a1a] border border-white/10 rounded-none overflow-hidden hover:border-orange-500 transition-all flex flex-col">
                <div className="h-48 bg-[#121212] flex items-center justify-center relative overflow-hidden group">
                  <div className="absolute inset-0 bg-orange-500/5 rotate-45 translate-x-12 translate-y-12 rounded-none"></div>
                  <div className="z-10 text-center">
                    <div className="w-20 h-20 bg-white/5 border border-white/10 rounded-none flex items-center justify-center mx-auto mb-4 group-hover:border-orange-500 transition-all">
                      <span className="text-white font-black text-2xl tracking-tighter italic">{member.name.split(' ').map(n => n[0]).join('')}</span>
                    </div>
                  </div>
                </div>
                <div className="p-8 flex-1 flex flex-col">
                  <p className="text-[9px] font-black text-orange-500 uppercase tracking-[0.3em] mb-1">{member.role}</p>
                  <h3 className="text-lg font-black text-white uppercase tracking-tight mb-4">{member.name}</h3>
                  <p className="text-xs text-slate-500 font-bold mb-8 italic flex-1 leading-relaxed">{member.bio}</p>
                  
                  <button
                    onClick={() => toggleTeamMember(member.name)}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-[#121212] border border-white/5 text-[9px] font-black text-white uppercase tracking-widest hover:border-orange-500 transition-all"
                  >
                    {selectedTeamMember === member.name ? 'CLOSE LOGS' : 'SPECIFICATIONS'}
                  </button>
                  
                  {selectedTeamMember === member.name && (
                    <div className="mt-8 pt-8 border-t border-white/5 animate-in fade-in duration-300">
                      <h4 className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-4 italic">Core Expertise:</h4>
                      <div className="flex flex-wrap gap-2 mb-6">
                        {member.expertise.map((skill, idx) => (
                          <span key={idx} className="bg-white/5 text-[9px] font-black text-white px-2 py-1.5 rounded-none uppercase tracking-widest border border-white/10">
                            {skill}
                          </span>
                        ))}
                      </div>
                      <a href={`mailto:${member.email}`} className="flex items-center gap-3 text-[10px] font-black text-orange-500 uppercase tracking-widest hover:text-white transition-colors">
                        <Mail className="w-3.5 h-3.5" />
                        UPLINK
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center bg-[#1a1a1a] border border-white/10 border-t-4 border-t-orange-500 rounded-none p-16 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 blur-[100px] pointer-events-none"></div>
          <h2 className="text-2xl sm:text-4xl font-black mb-6 uppercase tracking-tight text-white">Ready to Transform <span className="text-orange-500 italic">Education?</span></h2>
          <p className="text-sm sm:text-lg mb-12 opacity-60 max-w-2xl mx-auto font-medium italic text-slate-400 leading-relaxed">
            Join us in revolutionizing technology education and preparing students for the future of work.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Link
              href="/school-registration"
              className="inline-flex items-center justify-center px-12 py-5 bg-orange-500 text-white font-black text-xs uppercase tracking-[0.4em] rounded-none hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20"
            >
              <Building className="w-4 h-4 mr-4" />
              Partner Now
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center px-12 py-5 bg-transparent border border-white/10 text-white font-black text-xs uppercase tracking-[0.4em] rounded-none hover:bg-white hover:text-black transition-all"
            >
              <Mail className="w-4 h-4 mr-4" />
              Contact Us
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 