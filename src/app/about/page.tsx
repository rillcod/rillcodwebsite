"use client";
import { useState } from "react";
import { Users, Target, Award, Heart, Lightbulb, Shield, Globe2, BookOpen, CheckCircle2, Building2, Brain, Sparkles, ArrowRight } from "lucide-react";
import Link from "next/link";

const values = [
  {
    icon: <Lightbulb className="w-8 h-8 text-amber-500" />,
    title: "Innovation First",
    description: "We cultivate creative problem-solving and algorithmic thinking from early childhood through high school.",
  },
  {
    icon: <Shield className="w-8 h-8 text-emerald-500" />,
    title: "Academic Excellence",
    description: "Our 12-year session-based STEM curriculum meets international benchmarks for computer science education.",
  },
  {
    icon: <Globe2 className="w-8 h-8 text-blue-500" />,
    title: "Global Competitiveness",
    description: "Equipping young minds across Africa with industry-standard skills in AI, Web Development, and Robotics.",
  },
  {
    icon: <Heart className="w-8 h-8 text-rose-500" />,
    title: "Inclusive Access",
    description: "Partnering with primary & secondary schools to democratize high-tech education without upfront capital costs.",
  }
];

const leadership = [
  {
    name: "Leadership & Strategy",
    role: "Executive Directorate",
    bio: "Pioneering technology education across West Africa with over a decade of combined experience in STEM curriculum innovation and enterprise school partnerships.",
    tags: ["STEM Leadership", "Curriculum Strategy", "Educational Reform"],
  },
  {
    name: "Engineering & AI Labs",
    role: "Technology Architecture",
    bio: "Building robust learning platforms, hands-on robotics kits, and real-time student evaluation systems tailored for African schools.",
    tags: ["Platform Architecture", "AI Integration", "Robotics & IoT"],
  },
  {
    name: "Academic Quality & Pedagogy",
    role: "Academic Council",
    bio: "Supervising 36+ capstone project tracks, teacher training protocols, and continuous learning assessment across partner schools.",
    tags: ["Pedagogical Design", "Project Assessments", "Teacher Training"],
  }
];

const stats = [
  { number: "500+", label: "Active STEM Learners", icon: <Users className="w-6 h-6" /> },
  { number: "12-Year", label: "Structured Framework", icon: <BookOpen className="w-6 h-6" /> },
  { number: "95%", label: "Curriculum Mastery", icon: <Award className="w-6 h-6" /> },
  { number: "50+", label: "Partner Schools", icon: <Building2 className="w-6 h-6" /> }
];

const achievements = [
  {
    year: "2025",
    title: "Pan-African STEM Innovation Recognition",
    description: "Recognized as a leading technology education initiative integrating AI & Robotics into primary & secondary schools.",
    icon: <Award className="w-5 h-5 text-amber-500" />
  },
  {
    year: "2024",
    title: "500+ Active Learners Milestone",
    description: "Expanded live online and partner school cohorts across multiple states.",
    icon: <Users className="w-5 h-5 text-blue-500" />
  },
  {
    year: "2023",
    title: "Pioneered AI & Robotics Curriculum",
    description: "Embedded machine learning, Arduino robotics, and full-stack development into secondary school term tracks.",
    icon: <Brain className="w-5 h-5 text-purple-500" />
  },
  {
    year: "2022",
    title: "50+ Institutional Partnerships",
    description: "Formalized 70/30 revenue-sharing STEM partnership models with top private schools.",
    icon: <Building2 className="w-5 h-5 text-emerald-500" />
  }
];

export default function About() {
  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden transition-colors duration-300">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/3" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-3xl pointer-events-none translate-y-1/2 -translate-x-1/3" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 relative z-10">
        
        {/* Hero Section */}
        <div className="text-center mb-16 sm:mb-20 bg-card border border-border p-8 sm:p-16 rounded-3xl shadow-xl border-t-4 border-t-primary relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest mb-4">
            <Sparkles className="w-3.5 h-3.5" /> Institutional STEM Excellence
          </div>
          
          <h1 className="text-3xl sm:text-5xl font-black text-foreground mb-4 uppercase tracking-tight">
            About <span className="text-primary">Rillcod Technologies</span>
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-3xl mx-auto font-medium leading-relaxed">
            Empowering the next generation of world-class innovators through an accredited, 12-year progressive STEM curriculum that blends Artificial Intelligence, Robotics, and Software Engineering.
          </p>
        </div>

        {/* Key Performance Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 mb-16">
          {stats.map((stat, index) => (
            <div key={index} className="bg-card border border-border rounded-2xl p-6 text-center hover:border-primary/50 transition-all duration-300 shadow-md">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                {stat.icon}
              </div>
              <div className="text-2xl sm:text-3xl font-black text-foreground mb-1 tracking-tight">{stat.number}</div>
              <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Mission, Vision, Objectives */}
        <div className="bg-card border border-border rounded-3xl p-8 sm:p-14 mb-16 shadow-xl relative overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-12 relative z-10">
            <div className="space-y-3 border-l-4 border-l-primary pl-6">
              <div className="flex items-center gap-2 text-primary font-black text-xs uppercase tracking-widest">
                <Target className="w-4 h-4" /> Our Mission
              </div>
              <h3 className="text-lg font-black text-foreground uppercase">Transform STEM Education</h3>
              <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                To replace rote memory learning with project-driven, computational thinking—fostering creativity, analytical reasoning, and software engineering capabilities in primary and secondary school learners.
              </p>
            </div>
            
            <div className="space-y-3 border-l-4 border-l-blue-500 pl-6">
              <div className="flex items-center gap-2 text-blue-500 font-black text-xs uppercase tracking-widest">
                <Globe2 className="w-4 h-4" /> Our Vision
              </div>
              <h3 className="text-lg font-black text-foreground uppercase">Africa’s Tech Leadership</h3>
              <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                To equip every young learner with internationally competitive skills, positioning West Africa as a primary exporter of technology talent and innovation.
              </p>
            </div>
            
            <div className="space-y-3 border-l-4 border-l-emerald-500 pl-6">
              <div className="flex items-center gap-2 text-emerald-500 font-black text-xs uppercase tracking-widest">
                <Brain className="w-4 h-4" /> Our Methodology
              </div>
              <h3 className="text-lg font-black text-foreground uppercase">12-Year Continuous Path</h3>
              <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                A seamless progression from Basic 1 to SS3 covering Scratch, Python, Web & App Development, Robotics & IoT, and Applied AI with 36+ real-world capstone projects.
              </p>
            </div>
          </div>
        </div>

        {/* Core Values */}
        <div className="mb-16">
          <div className="text-center mb-12">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Foundational Pillars</p>
            <h2 className="text-2xl sm:text-3xl font-black text-foreground uppercase tracking-tight mt-1">Our Core Values</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((val, index) => (
              <div key={index} className="bg-card border border-border rounded-2xl p-6 sm:p-8 hover:border-primary/50 transition-all duration-300 shadow-md">
                <div className="p-3 rounded-xl bg-muted w-fit mb-6">
                  {val.icon}
                </div>
                <h3 className="text-base font-black text-foreground mb-2 uppercase tracking-tight">{val.title}</h3>
                <p className="text-xs text-muted-foreground font-medium leading-relaxed">{val.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Institutional Leadership & Advisory */}
        <div className="mb-16">
          <div className="text-center mb-12">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Academic Standards</p>
            <h2 className="text-2xl sm:text-3xl font-black text-foreground uppercase tracking-tight mt-1">Leadership & Advisory Council</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {leadership.map((member, idx) => (
              <div key={idx} className="bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-md hover:border-primary/50 transition-all flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black text-lg mb-6">
                    0{idx + 1}
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">{member.role}</p>
                  <h3 className="text-lg font-black text-foreground uppercase tracking-tight mb-3">{member.name}</h3>
                  <p className="text-xs text-muted-foreground font-medium leading-relaxed mb-6">{member.bio}</p>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-4 border-t border-border/60">
                  {member.tags.map((tag, i) => (
                    <span key={i} className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border/60">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Milestones & Achievements */}
        <div className="bg-card border border-border rounded-3xl p-8 sm:p-12 mb-16 shadow-xl">
          <div className="text-center mb-10">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Track Record</p>
            <h2 className="text-2xl font-black text-foreground uppercase tracking-tight mt-1">Key Milestones</h2>
          </div>
          <div className="space-y-4">
            {achievements.map((item, index) => (
              <div key={index} className="p-6 rounded-2xl bg-muted/30 border border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-card border border-border shrink-0 mt-0.5">
                    {item.icon}
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                      {item.year}
                    </span>
                    <h3 className="text-base font-black text-foreground mt-2 uppercase tracking-tight">{item.title}</h3>
                    <p className="text-xs text-muted-foreground font-medium mt-1">{item.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Call to Action Banner */}
        <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-transparent border border-primary/30 rounded-3xl p-8 sm:p-12 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
          <div>
            <h3 className="text-xl sm:text-2xl font-black text-foreground uppercase tracking-tight">Ready to Partner Your School?</h3>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 font-medium">Adopt Rillcod’s progressive STEM curriculum with zero upfront hardware costs.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto shrink-0">
            <Link
              href="/school-registration"
              className="px-6 py-3.5 bg-primary text-white text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 text-center"
            >
              Partner School Signup
            </Link>
            <Link
              href="/contact"
              className="px-6 py-3.5 bg-card border border-border text-foreground text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-muted transition-colors text-center"
            >
              Contact Advisory Team
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}