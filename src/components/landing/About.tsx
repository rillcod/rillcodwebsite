"use client";

import React from "react";
import Image from "next/image";
import {
  Target,
  Lightbulb,
  Award,
  ShieldCheck,
  Cpu,
  GraduationCap,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

const pillars = [
  {
    icon: Target,
    title: "Engineering Mastery",
    desc: "Hands-on robotics hardware, breadboard electronics, and software development in every session.",
    color: "text-brand-red-500",
    bg: "bg-brand-red-500/10",
    border: "border-brand-red-500/20",
  },
  {
    icon: Lightbulb,
    title: "Algorithmic Thinking",
    desc: "Progressive coding from block-based Scratch to Python, full-stack web, and AI machine learning.",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
  },
  {
    icon: Award,
    title: "Global Benchmarks",
    desc: "Curriculum mapped directly to UK and international Computer Science education frameworks.",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
];

export const About: React.FC = () => {
  return (
    <section id="about" className="py-20 sm:py-28 bg-background relative overflow-hidden font-sans">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
      <div className="absolute top-1/3 -right-48 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 -left-48 w-96 h-96 bg-brand-red-600/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-8 lg:px-20 relative z-10">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Left Column: Mission Content (6 Cols) */}
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-card/90 backdrop-blur-md border border-border/80 rounded-full shadow-sm">
              <span className="w-2 h-2 rounded-full bg-brand-red-500 animate-ping" />
              <span className="text-[10px] font-black text-foreground uppercase tracking-widest">
                Our Institutional Framework
              </span>
            </div>

            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black text-foreground leading-[1.08] tracking-tight uppercase">
              Transforming <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-red-600 to-primary">
                STEM Education
              </span>
              <br />
              Across Africa.
            </h2>

            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed font-medium border-l-2 border-brand-red-600 pl-4 sm:pl-6 text-left">
              Rillcod Technologies partners with forward-thinking primary and secondary schools to deliver complete, turnkey STEM ecosystems. We provide certified in-person instructors, robotics equipment kits, and a 12-year progressive curriculum with <strong>zero upfront equipment cost</strong> to the institution.
            </p>

            {/* 3 Core Pillars */}
            <div className="grid sm:grid-cols-3 gap-3.5 sm:gap-4 pt-2">
              {pillars.map((p) => (
                <div
                  key={p.title}
                  className="group p-4 sm:p-5 bg-card/90 backdrop-blur-xl border border-border/80 rounded-3xl hover:bg-card transition-all border-t-2 border-t-brand-red-600 shadow-xl"
                >
                  <div
                    className={`w-10 h-10 ${p.bg} ${p.color} border ${p.border} rounded-2xl flex items-center justify-center mb-3.5 group-hover:scale-110 transition-transform shadow-inner`}
                  >
                    <p.icon className="w-5 h-5" />
                  </div>
                  <h4 className="text-xs font-black text-foreground uppercase tracking-wider mb-1.5">
                    {p.title}
                  </h4>
                  <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                    {p.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Real Event Media Collage & Stats (6 Cols) */}
          <div className="lg:col-span-6 space-y-6">
            {/* Visual Media Composition */}
            <div className="relative group">
              {/* Main Exhibition Photo */}
              <div className="relative overflow-hidden rounded-3xl border border-border/80 shadow-2xl aspect-[16/10] bg-slate-950">
                <Image
                  src="/images/EVENTS/WhatsApp Image 2026-08-14 at 7.46.27 PM.jpeg"
                  alt="Rillcod STEM Summit and Annual Exhibition with school leadership"
                  fill
                  sizes="(max-width: 1024px) 100vw, 600px"
                  className="object-cover object-center transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent pointer-events-none" />

                <div className="absolute bottom-4 left-4 right-4 z-10 flex items-center justify-between">
                  <div className="text-white">
                    <p className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      Annual STEM Exhibition
                    </p>
                    <p className="text-[10px] text-slate-300 font-medium">
                      Student capstone demos &amp; awards with school proprietors
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-1 text-[10px] font-black text-emerald-300 backdrop-blur-md">
                    Verified
                  </span>
                </div>
              </div>

              {/* Floating Overlapping Inset: Electronics & Hardware Bench */}
              <div className="absolute -bottom-6 -left-4 sm:-bottom-8 sm:-left-6 z-20 w-44 sm:w-56 aspect-[4/3] rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-slate-950 hidden xs:block">
                <Image
                  src="/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.00 PM (1).jpeg"
                  alt="Facilitator teaching breadboard electronics"
                  fill
                  sizes="220px"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute bottom-2 left-2.5 right-2 text-white">
                  <p className="text-[9px] font-black uppercase tracking-wider">Live Electronics Lab</p>
                  <p className="text-[8px] text-slate-300">1 Facilitator : 15 Learners</p>
                </div>
              </div>
            </div>

            {/* Institutional Stats Strip */}
            <div className="bg-card/90 border border-border/80 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl mt-8">
              <div className="grid grid-cols-3 gap-4 sm:gap-6 relative z-10 text-center">
                <div>
                  <p className="text-2xl sm:text-4xl font-black text-foreground tracking-tight mb-1">
                    25+
                  </p>
                  <p className="text-[9px] sm:text-[10px] font-black text-brand-red-600 uppercase tracking-widest">
                    Partner Schools
                  </p>
                  <div className="w-full h-1 bg-muted rounded-full mt-2.5 overflow-hidden">
                    <div className="w-[88%] h-full bg-brand-red-600 rounded-full" />
                  </div>
                </div>

                <div>
                  <p className="text-2xl sm:text-4xl font-black text-foreground tracking-tight mb-1">
                    500+
                  </p>
                  <p className="text-[9px] sm:text-[10px] font-black text-primary uppercase tracking-widest">
                    Active Scholars
                  </p>
                  <div className="w-full h-1 bg-muted rounded-full mt-2.5 overflow-hidden">
                    <div className="w-[94%] h-full bg-primary rounded-full" />
                  </div>
                </div>

                <div>
                  <p className="text-2xl sm:text-4xl font-black text-foreground tracking-tight mb-1">
                    100%
                  </p>
                  <p className="text-[9px] sm:text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
                    Turnkey Kits
                  </p>
                  <div className="w-full h-1 bg-muted rounded-full mt-2.5 overflow-hidden">
                    <div className="w-full h-full bg-emerald-500 rounded-full" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;