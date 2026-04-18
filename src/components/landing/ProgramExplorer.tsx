"use client";

import React, { useState } from 'react';
import { 
  Monitor, 
  Cpu, 
  Code2, 
  Puzzle, 
  BrainCircuit, 
  ArrowRight, 
  CheckCircle2,
  Sparkles,
  Layers,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const programs = [
  {
    id: 'ict',
    title: 'ICT Fundamentals',
    age: 'Ages 5-10',
    description: 'Building a solid foundation in digital literacy and computer science essentials.',
    icon: Monitor,
    color: 'emerald',
    features: ['Typing Mastery', 'Digital Safety', 'UI/UX Basics', 'Office Tools'],
    gradient: 'from-emerald-400 to-emerald-600',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20'
  },
  {
    id: 'scratch',
    title: 'Creative Coding',
    age: 'Ages 7-12',
    description: 'Bringing stories and games to life through block-based visual programming.',
    icon: Puzzle,
    color: 'orange',
    features: ['Game Design', 'Animation', 'Logic Thinking', 'Storytelling'],
    gradient: 'from-orange-400 to-orange-600',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20'
  },
  {
    id: 'web',
    title: 'Web Engineering',
    age: 'Ages 11-18',
    description: 'Mastering the technologies that power modern internet experiences.',
    icon: Code2,
    color: 'blue',
    features: ['HTML5 & CSS3', 'JavaScript ES6', 'Responsive Design', 'React Basics'],
    gradient: 'from-blue-400 to-blue-600',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20'
  },
  {
    id: 'python',
    title: 'Python & AI',
    age: 'Ages 12-18',
    description: 'Diving deep into data science, artificial intelligence, and automation.',
    icon: BrainCircuit,
    color: 'violet',
    features: ['Python Syntax', 'Data Analysis', 'Intro to ML', 'Backend Dev'],
    gradient: 'from-violet-400 to-violet-600',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20'
  },
  {
    id: 'robotics',
    title: 'Robotics & IoT',
    age: 'Ages 9-18',
    description: 'Bridging the gap between software and the physical world through hardware.',
    icon: Cpu,
    color: 'pink',
    features: ['Arduino/ESP32', 'Sensor Logic', 'Circuit Design', 'Smart Systems'],
    gradient: 'from-pink-400 to-pink-600',
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/20'
  }
];

const ProgramExplorer: React.FC = () => {
  const [activeTab, setActiveTab] = useState(programs[0].id);
  const activeProgram = programs.find(p => p.id === activeTab)!;

  return (
    <section id="programs" className="py-24 bg-background relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full opacity-[0.02] pointer-events-none z-0">
        <div className="absolute top-1/2 left-1/4 w-[500px] h-[500px] bg-orange-500 blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-blue-600 blur-[100px] rounded-full" />
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 lg:px-20 relative z-10">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-8">
          <div className="max-w-xl">
             <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 bg-card border border-border rounded-none">
                <Layers className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Learning Tracks</span>
             </div>
             <h2 className="text-4xl md:text-6xl font-black text-foreground leading-tight uppercase tracking-tight">
               Discover Your <br />
               <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">Tech Journey.</span>
             </h2>
          </div>
          <p className="text-muted-foreground text-lg italic border-l-2 border-orange-500 pl-6 max-w-sm">
            Tailored curriculum designed to evolve with your child from primary school through secondary graduation.
          </p>
        </div>

        {/* Desktop Browser-style Container */}
        <div className="bg-card border border-border rounded-none shadow-2xl overflow-hidden min-h-[500px] flex flex-col lg:flex-row">
          
          {/* LEFT: Sidebar Tabs */}
          <div className="w-full lg:w-[320px] bg-muted/30 border-r border-border p-6 lg:p-8 shrink-0">
            <h3 className="text-[10px] font-black text-foreground/40 uppercase tracking-[0.4em] mb-8">Select Track</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
              {programs.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActiveTab(p.id)}
                  className={`group flex items-center gap-4 p-4 transition-all relative overflow-hidden ${
                    activeTab === p.id 
                    ? 'bg-orange-500 text-white shadow-xl translate-x-1 lg:translate-x-2' 
                    : 'bg-card text-foreground hover:bg-muted border border-border'
                  }`}
                >
                  <p.icon className={`w-5 h-5 ${activeTab === p.id ? 'text-white' : 'text-orange-500'} shrink-0`} />
                  <div className="text-left">
                    <p className={`text-xs font-black uppercase tracking-widest ${activeTab === p.id ? 'text-white' : 'text-foreground'}`}>
                      {p.title}
                    </p>
                    <p className={`text-[9px] font-bold ${activeTab === p.id ? 'text-white/70' : 'text-muted-foreground'}`}>
                      {p.age}
                    </p>
                  </div>
                  {activeTab === p.id && (
                    <motion.div 
                      layoutId="active-indicator"
                      className="absolute right-0 top-0 bottom-0 w-1 bg-white" 
                    />
                  )}
                </button>
              ))}
            </div>
            
            <div className="mt-12 p-6 bg-orange-500/5 border border-orange-500/10 hidden lg:block">
               <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-orange-500" />
                  <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Enrollment open</span>
               </div>
               <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Register today and secure a spot for the next session at one of our partner schools.
               </p>
            </div>
          </div>

          {/* RIGHT: Content Area */}
          <div className="flex-1 p-8 md:p-12 lg:p-20 relative overflow-hidden">
             {/* Background Decoration */}
             <div className="absolute -top-24 -right-24 w-64 h-64 bg-orange-500 opacity-[0.03] blur-[100px] -z-10" />
             
             <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="h-full flex flex-col"
                >
                  <div className="flex flex-col md:flex-row md:items-center gap-6 mb-10">
                    <div className={`w-20 h-20 ${activeProgram.bg} border ${activeProgram.border} flex items-center justify-center p-4 shadow-inner`}>
                      <activeProgram.icon className={`w-10 h-10 ${activeProgram.id === 'scratch' ? 'text-orange-500' : 
                        activeProgram.id === 'ict' ? 'text-emerald-500' :
                        activeProgram.id === 'web' ? 'text-blue-500' :
                        activeProgram.id === 'python' ? 'text-violet-500' : 'text-pink-500'}`} />
                    </div>
                    <div>
                      <span className={`text-[10px] font-black uppercase tracking-[0.4em] px-3 py-1 bg-muted border border-border mb-2 inline-block`}>
                        {activeProgram.age}
                      </span>
                      <h3 className="text-3xl md:text-5xl font-black text-foreground uppercase tracking-tight leading-none">
                        {activeProgram.title}
                      </h3>
                    </div>
                  </div>

                  <p className="text-lg md:text-xl text-muted-foreground font-medium leading-relaxed mb-12 max-w-2xl border-l border-border pl-8">
                    {activeProgram.description}
                  </p>

                  <div className="grid sm:grid-cols-2 gap-4 md:gap-8 mb-12">
                    {activeProgram.features.map((f, i) => (
                      <div key={i} className="flex items-start gap-4 p-5 bg-muted/40 border border-border/50 group hover:border-orange-500/30 transition-colors">
                        <CheckCircle2 className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                        <span className="text-sm font-bold text-foreground leading-tight">{f}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-auto flex flex-col sm:flex-row items-center gap-6">
                    <a
                      href="/student-registration"
                      className="w-full sm:w-auto flex items-center justify-center gap-4 px-10 py-5 bg-orange-500 text-white font-black text-xs uppercase tracking-[0.3em] hover:bg-orange-600 transition-all shadow-xl shadow-orange-950/20"
                    >
                      Enroll Child
                      <ArrowRight className="w-5 h-5" />
                    </a>
                    <a
                      href={`/programs/${activeProgram.id}`}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em] hover:text-orange-500 transition-colors"
                    >
                      Full Curriculum Docs
                      <Sparkles className="w-4 h-4 text-orange-500" />
                    </a>
                  </div>
                </motion.div>
             </AnimatePresence>
          </div>
        </div>

        {/* Trust Badge Bar */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-12 gap-y-6 opacity-30 grayscale hover:grayscale-0 transition-all duration-500">
           <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              <span className="text-xs font-black uppercase tracking-widest text-foreground">Future Proof</span>
           </div>
           <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-orange-500" />
              <span className="text-xs font-black uppercase tracking-widest text-foreground">Industry Linked</span>
           </div>
           <div className="flex items-center gap-2">
              <BrainCircuit className="w-5 h-5" />
              <span className="text-xs font-black uppercase tracking-widest text-foreground">AI Integrated</span>
           </div>
        </div>
      </div>
    </section>
  );
};

export default ProgramExplorer;
