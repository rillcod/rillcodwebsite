"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Monitor,
  Cpu,
  Code2,
  Puzzle,
  BrainCircuit,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Zap,
  BookOpen,
  Award,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { slugify } from "@/lib/utils";
import { STUDENT_REGISTRATION_PATH } from "@/lib/registration/enrollment-types";

const programs = [
  {
    id: "ict",
    title: "ICT Fundamentals",
    age: "Ages 5 – 10 (Basic 1 – 5)",
    description: "Building foundational digital literacy, typing mastery, UI/UX conceptual basics, and computer science essentials.",
    icon: Monitor,
    color: "emerald",
    tag: "Digital Foundations",
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.29.58 PM (2).jpeg",
    features: [
      "Typing & Keyboard Fluency",
      "Internet Safety & Digital Ethics",
      "Introductory UI/UX Design Concepts",
      "Productivity & Cloud Office Tools",
    ],
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-500",
  },
  {
    id: "scratch",
    title: "Creative Coding & Logic",
    age: "Ages 7 – 12 (Basic 3 – JSS 1)",
    description: "Bringing interactive animations, math logic, and games to life through block-based visual computational thinking.",
    icon: Puzzle,
    color: "amber",
    tag: "Visual Coding",
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.29.57 PM.jpeg",
    features: [
      "Block-Based Game Architecture",
      "Interactive Storytelling & Animations",
      "Algorithmic Logic & Loops",
      "Mathematical Coordinate Geometry",
    ],
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-500",
  },
  {
    id: "web",
    title: "Web & Software Engineering",
    age: "Ages 11 – 18 (JSS 1 – SS 3)",
    description: "Mastering frontend web engineering, responsive user interfaces, JavaScript algorithms, and interactive modern applications.",
    icon: Code2,
    color: "blue",
    tag: "Full-Stack Web",
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.03 PM (1).jpeg",
    features: [
      "Modern Semantic HTML5 & Modern CSS3",
      "JavaScript ES6+ Data Structures",
      "Responsive Mobile-First Interfaces",
      "Web Deployment & Git Version Control",
    ],
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    text: "text-primary",
  },
  {
    id: "python",
    title: "Python, Data & Applied AI",
    age: "Ages 12 – 18 (JSS 2 – SS 3)",
    description: "Diving into Python syntax, data science visualizations, machine learning principles, and intelligent automation systems.",
    icon: BrainCircuit,
    color: "violet",
    tag: "AI & Data Science",
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.29.56 PM.jpeg",
    features: [
      "Python Algorithmic Problem Solving",
      "Data Analysis & Chart Visualizations",
      "Machine Learning & Vision Concepts",
      "Backend APIs & Automation Scripts",
    ],
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    text: "text-purple-500",
  },
  {
    id: "robotics",
    title: "Robotics & Physical Hardware",
    age: "Ages 9 – 18 (Basic 5 – SS 3)",
    description: "Bridging software with the physical world through sensor integration, microcontrollers, breadboard circuitry, and rover chassis.",
    icon: Cpu,
    color: "red",
    tag: "Hardware & IoT",
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.02 PM.jpeg",
    features: [
      "Microcontroller Firmware & ESP32",
      "Ultrasonic & Infrared Sensor Integration",
      "Autonomous Obstacle-Avoiding Rovers",
      "Breadboard Circuit Logic & Schematics",
    ],
    bg: "bg-brand-red-600/10",
    border: "border-brand-red-500/30",
    text: "text-brand-red-500",
  },
];

export default function ProgramExplorer() {
  const [activeTab, setActiveTab] = useState(programs[0].id);
  const activeProgram = programs.find((p) => p.id === activeTab) || programs[0];

  return (
    <section id="programs" className="py-16 sm:py-24 bg-background relative overflow-hidden font-sans">
      {/* Background Decorative Glows */}
      <div className="absolute top-1/4 -right-48 w-96 h-96 bg-primary/6 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 -left-48 w-96 h-96 bg-brand-red-600/6 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-8 lg:px-20 relative z-10 space-y-12">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-xl space-y-3">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-card/90 backdrop-blur-md border border-border/80 rounded-full shadow-sm">
              <span className="w-2 h-2 rounded-full bg-brand-red-500 animate-ping" />
              <span className="text-[10px] font-black text-foreground uppercase tracking-widest">
                12-Year Progressive Curriculum
              </span>
            </div>
            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black text-foreground uppercase tracking-tight leading-tight">
              Discover Your <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-red-600 via-primary to-brand-red-500">
                Tech Journey.
              </span>
            </h2>
          </div>
          <p className="text-xs sm:text-base text-muted-foreground font-medium max-w-sm border-l-2 border-brand-red-600 pl-4 sm:pl-6 leading-relaxed">
            Tailored, hands-on tracks designed to progress seamlessly with your child from Basic 1 through secondary school graduation.
          </p>
        </div>

        {/* Browser-style Unified Container */}
        <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col lg:flex-row">
          
          {/* LEFT: Sidebar / Mobile Horizontal Tabs */}
          <div className="w-full lg:w-[320px] bg-muted/20 border-b lg:border-b-0 lg:border-r border-border/80 p-4 sm:p-6 lg:p-8 shrink-0 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                  Select Track
                </span>
                <span className="text-[10px] font-bold text-primary lg:hidden">
                  Swipe horizontal →
                </span>
              </div>

              {/* Mobile: Horizontal kinetic scroll; Desktop: Vertical list */}
              <div className="flex lg:flex-col gap-2.5 overflow-x-auto pb-2 lg:pb-0 no-scrollbar touch-pan-x">
                {programs.map((p) => {
                  const Icon = p.icon;
                  const isActive = activeTab === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setActiveTab(p.id)}
                      className={`group shrink-0 w-auto lg:w-full flex items-center gap-3 p-3 sm:p-3.5 rounded-2xl transition-all relative text-left min-h-[48px] cursor-pointer ${
                        isActive
                          ? "bg-brand-red-600 text-white shadow-lg shadow-brand-red-950/30"
                          : "bg-card text-foreground hover:bg-muted/60 border border-border/70"
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                          isActive
                            ? "bg-white/20 text-white"
                            : "bg-muted text-foreground group-hover:text-primary"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>

                      <div className="min-w-0 pr-2">
                        <p
                          className={`text-xs font-black uppercase tracking-tight truncate ${
                            isActive ? "text-white" : "text-foreground"
                          }`}
                        >
                          {p.title}
                        </p>
                        <p
                          className={`text-[10px] font-semibold truncate ${
                            isActive ? "text-white/80" : "text-muted-foreground"
                          }`}
                        >
                          {p.age}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Desktop Quick Note */}
            <div className="mt-8 p-4 rounded-2xl bg-brand-red-600/5 border border-brand-red-600/15 hidden lg:block space-y-2">
              <div className="flex items-center gap-1.5 text-brand-red-600">
                <Zap className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-wider">Turnkey Setup</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                All software, hardware kits, and certified facilitators are supplied directly to partner schools at ₦0 CapEx.
              </p>
            </div>
          </div>

          {/* RIGHT: Content Stage with Media Card */}
          <div className="flex-1 p-6 sm:p-8 lg:p-12 relative overflow-hidden flex flex-col justify-between">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                className="space-y-8"
              >
                {/* Track Header & Visual Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  
                  {/* Left Column: Track Info */}
                  <div className="lg:col-span-7 space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border ${activeProgram.bg} ${activeProgram.border} ${activeProgram.text}`}>
                        {activeProgram.tag}
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground px-3 py-1 rounded-full bg-muted/60 border border-border/80">
                        {activeProgram.age}
                      </span>
                    </div>

                    <h3 className="text-2xl sm:text-4xl font-black text-foreground uppercase tracking-tight leading-tight">
                      {activeProgram.title}
                    </h3>

                    <p className="text-xs sm:text-sm text-muted-foreground font-medium leading-relaxed border-l-2 border-brand-red-600 pl-4">
                      {activeProgram.description}
                    </p>

                    {/* Features List */}
                    <div className="space-y-2.5 pt-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Core Competencies &amp; Projects:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {activeProgram.features.map((feature, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2.5 p-3 rounded-2xl bg-card border border-border/80 shadow-sm"
                          >
                            <CheckCircle2 className="w-4 h-4 text-brand-red-500 shrink-0" />
                            <span className="text-xs font-bold text-foreground leading-tight">
                              {feature}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Real Event Photo Preview */}
                  <div className="lg:col-span-5">
                    <div className="relative aspect-[4/3] rounded-3xl overflow-hidden border border-border/80 bg-slate-950 shadow-xl group">
                      <Image
                        src={activeProgram.image}
                        alt={activeProgram.title}
                        fill
                        sizes="(max-width: 1024px) 100vw, 400px"
                        className="object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      <div className="absolute bottom-3 left-3 right-3 text-white space-y-0.5">
                        <div className="flex items-center gap-1.5 text-brand-red-400 text-[10px] font-black uppercase tracking-wider">
                          <Award className="w-3.5 h-3.5" />
                          <span>Classroom Evidence</span>
                        </div>
                        <p className="text-xs font-black uppercase truncate">{activeProgram.title} Lab</p>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Bottom Action Strip */}
                <div className="pt-6 border-t border-border/80 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                  <Link
                    href={`${STUDENT_REGISTRATION_PATH}?program=${encodeURIComponent(activeProgram.title)}&type=online`}
                    className="flex items-center justify-center gap-2 px-8 py-3.5 bg-brand-red-600 hover:bg-brand-red-500 text-white font-black text-xs uppercase tracking-wider rounded-2xl transition-all shadow-xl shadow-brand-red-950/40 min-h-[48px]"
                  >
                    <span>Enroll Student in Track</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>

                  <Link
                    href={`/programs/${slugify(activeProgram.title)}`}
                    className="flex items-center justify-center gap-2 px-6 py-3.5 bg-card border border-border text-foreground hover:bg-muted font-bold text-xs uppercase tracking-wider rounded-2xl transition-all min-h-[48px]"
                  >
                    <BookOpen className="w-4 h-4 text-brand-red-500" />
                    <span>View Track Syllabus</span>
                  </Link>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

        </div>

        {/* Accreditation & Quality Badges */}
        <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-12 pt-4 opacity-60 text-xs">
          <div className="flex items-center gap-2 font-black uppercase tracking-widest text-foreground">
            <Sparkles className="w-4 h-4 text-brand-red-500" />
            <span>UK &amp; West Africa Standards</span>
          </div>
          <div className="flex items-center gap-2 font-black uppercase tracking-widest text-foreground">
            <Zap className="w-4 h-4 text-primary" />
            <span>₦0 School Hardware CapEx</span>
          </div>
          <div className="flex items-center gap-2 font-black uppercase tracking-widest text-foreground">
            <Award className="w-4 h-4 text-emerald-500" />
            <span>Termly Summits &amp; Awards</span>
          </div>
        </div>

      </div>
    </section>
  );
}
