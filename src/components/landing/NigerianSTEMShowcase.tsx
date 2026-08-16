"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Trophy,
  ArrowRight,
  Code,
  Cpu,
  Rocket,
  Beaker,
  Monitor,
  Lightbulb,
  Sparkles,
  Play,
  X,
  Building2,
  CheckCircle2,
} from "lucide-react";
import { SCHOOL_REGISTRATION_PATH } from "@/lib/registration/enrollment-types";

const achievements = [
  {
    id: 1,
    title: "National Coding Challenge",
    description: "Rillcod scholars developed full-stack web and Python applications solving community challenges across partner schools.",
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.29.56 PM.jpeg",
    icon: Code,
    badge: "1st Place Winner",
    color: "text-brand-red-500",
    bg: "bg-brand-red-500/10",
    border: "border-brand-red-500/20",
  },
  {
    id: 2,
    title: "Robotics Hardware Innovation",
    description: "Young engineers built autonomous obstacle-avoiding rovers and solar sensor circuits using Arduino microcontrollers.",
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.02 PM.jpeg",
    icon: Cpu,
    badge: "Hardware Prize",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
  },
  {
    id: 3,
    title: "Annual STEM Summit & Exhibition",
    description: "Inter-school science and technology exhibition where students demonstrated capstones directly to proprietors and parents.",
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.46.27 PM.jpeg",
    icon: Beaker,
    badge: "Grand Summit",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  {
    id: 4,
    title: "Community Solutions & Apps",
    description: "Students shipped real mobile and desktop applications — from school attendance loggers to waste management tools.",
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.46.29 PM (1).jpeg",
    icon: Monitor,
    badge: "Community Award",
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
  },
  {
    id: 5,
    title: "3D Design & Physical Computing",
    description: "End-to-end hardware prototyping — students engineered sensor chassis and circuit breadboards with certified facilitators.",
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.00 PM (1).jpeg",
    icon: Rocket,
    badge: "Engineering Track",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
  {
    id: 6,
    title: "AI & Machine Learning Readiness",
    description: "Hands-on introduction to neural networks, computer vision, and predictive logic tailored for secondary school scholars.",
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.03 PM (1).jpeg",
    icon: Lightbulb,
    badge: "AI Frontier",
    color: "text-teal-500",
    bg: "bg-teal-500/10",
    border: "border-teal-500/20",
  },
];

const scholarVoices = [
  {
    id: 1,
    name: "Amina Hassan",
    school: "Rillcod Partner School · Benin City",
    quote: "Building autonomous robots and writing Python code gave me the confidence to design software that solves problems in our community!",
    badge: "National Coding Winner",
  },
  {
    id: 2,
    name: "Chukwu Okoro",
    school: "Rillcod Partner School · Secondary Cohort",
    quote: "Working with real circuit breadboards and Arduino microcontrollers helped me understand engineering better than any textbook.",
    badge: "Robotics Team Lead",
  },
  {
    id: 3,
    name: "Fatima Adebayo",
    school: "Rillcod Primary STEM Track",
    quote: "I created my first interactive animated game in Scratch and demoed it to my parents at the annual school STEM exhibition.",
    badge: "Junior Scholar Fellow",
  },
];

export default function NigerianSTEMShowcase() {
  const [activeVideo, setActiveVideo] = useState<string | null>(null);

  return (
    <section className="py-20 sm:py-28 bg-background relative overflow-hidden font-sans">
      {/* Ambient Grid Pattern Background */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none dark:opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-primary/5 blur-[160px] rounded-full pointer-events-none" />

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-8 lg:px-20 relative z-10">
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-14 lg:mb-18 gap-6 sm:gap-10">
          <div>
            <div className="inline-flex items-center gap-2 mb-4 sm:mb-6 px-4 py-1.5 bg-card/90 backdrop-blur-md border border-border/80 rounded-full shadow-sm">
              <span className="w-2 h-2 rounded-full bg-brand-red-500 animate-ping" />
              <span className="text-[10px] font-black text-foreground uppercase tracking-widest">
                Tangible Student Outcomes
              </span>
            </div>
            <h3 className="text-3xl sm:text-5xl lg:text-6xl font-black text-foreground leading-[1.08] tracking-tight uppercase">
              Proven Impact. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-red-600 via-primary to-emerald-500">
                Verified Inventions.
              </span>
            </h3>
          </div>
          <p className="text-muted-foreground text-sm sm:text-base font-medium leading-relaxed max-w-md border-l-2 border-brand-red-600 pl-4 sm:pl-6 text-left">
            Every Rillcod scholar completes verified capstone builds with real hardware kits and code repositories — presented at termly exhibitions with automated digital parent reports.
          </p>
        </div>

        {/* Achievement Grid with Authentic Real Photos */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-24">
          {achievements.map((item) => (
            <div
              key={item.id}
              className="group relative bg-card/90 backdrop-blur-xl border border-border/80 rounded-3xl overflow-hidden shadow-xl hover:bg-card transition-all hover:-translate-y-1 border-t-2 border-t-brand-red-600 flex flex-col"
            >
              {/* Card Photo Frame */}
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-950">
                <Image
                  src={item.image}
                  alt={item.title}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 400px"
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />

                {/* Badge overlay */}
                <div className="absolute top-3.5 right-3.5">
                  <span
                    className={`text-[9px] font-black uppercase tracking-wider ${item.color} bg-slate-950/90 border border-white/15 px-3 py-1 rounded-full shadow-lg backdrop-blur-md`}
                  >
                    {item.badge}
                  </span>
                </div>

                <div className="absolute bottom-3 left-4 flex items-center gap-2 text-white">
                  <div
                    className={`w-8 h-8 ${item.bg} ${item.color} border ${item.border} rounded-xl flex items-center justify-center backdrop-blur-md`}
                  >
                    <item.icon className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-black uppercase tracking-wider">
                    {item.title}
                  </span>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                <p className="text-muted-foreground text-xs sm:text-sm font-medium leading-relaxed">
                  {item.description}
                </p>

                <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                  <Link
                    href="/curriculum"
                    className="inline-flex items-center gap-2 text-[10px] font-black text-primary uppercase tracking-widest group-hover:translate-x-1.5 transition-transform"
                  >
                    <span>View Curriculum Spine</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>

                  <button
                    type="button"
                    onClick={() =>
                      setActiveVideo(
                        "/images/EVENTS/WhatsApp Video 2026-08-14 at 7.46.27 PM.mp4"
                      )
                    }
                    className="inline-flex items-center gap-1.5 text-[10px] font-black text-brand-red-500 uppercase tracking-wider hover:underline"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Watch Clip</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Scholar Voices Testimonial Section */}
        <div className="mb-24">
          <div className="flex items-center gap-6 mb-12 text-center">
            <div className="h-px flex-1 bg-border/80" />
            <h4 className="text-xs sm:text-sm font-black text-foreground uppercase tracking-[0.4em] flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-brand-red-500" />
              <span>Scholar &amp; Leadership Testimonials</span>
            </h4>
            <div className="h-px flex-1 bg-border/80" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {scholarVoices.map((t) => (
              <div
                key={t.id}
                className="bg-card/90 backdrop-blur-xl border border-border/80 rounded-3xl p-6 sm:p-8 hover:bg-card transition-all relative group shadow-2xl border-l-2 border-l-brand-red-600 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-brand-red-600/10 border border-brand-red-500/20 flex items-center justify-center text-sm font-black text-brand-red-500 shadow-inner">
                      {t.name[0]}
                    </div>
                    <div className="min-w-0">
                      <h5 className="font-black text-foreground uppercase text-xs sm:text-sm tracking-wider">
                        {t.name}
                      </h5>
                      <p className="text-[10px] text-muted-foreground font-semibold truncate mt-0.5">
                        {t.school}
                      </p>
                    </div>
                  </div>

                  <p className="text-sm font-medium text-foreground/90 leading-relaxed italic">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-border/60">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-muted/60 border border-border rounded-xl">
                    <Trophy className="w-3.5 h-3.5 text-brand-red-500" />
                    <span className="text-[9px] font-black uppercase text-foreground tracking-wider font-mono">
                      {t.badge}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Turnkey Institutional Network CTA */}
        <div className="relative bg-card border border-border rounded-3xl p-8 sm:p-14 lg:p-16 overflow-hidden group shadow-2xl border-t-4 border-t-brand-red-600">
          <div className="absolute top-0 right-0 w-[50%] h-[150%] bg-primary/5 rotate-12 -translate-y-1/2 pointer-events-none" />

          <div className="relative z-10 grid lg:grid-cols-12 gap-8 items-center text-center lg:text-left">
            <div className="lg:col-span-8 space-y-3">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-muted/80 border border-border rounded-full shadow-sm">
                <Building2 className="w-3.5 h-3.5 text-brand-red-500" />
                <span className="text-[10px] font-black text-foreground uppercase tracking-widest">
                  School Proprietors &amp; Principals
                </span>
              </div>
              <h4 className="text-2xl sm:text-4xl lg:text-5xl font-black text-foreground leading-[1.1] tracking-tight uppercase">
                Deploy STEM &amp; AI in your school with <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-red-600 to-primary">
                  Zero Equipment CapEx.
                </span>
              </h4>
              <p className="text-xs sm:text-sm text-muted-foreground font-medium max-w-xl">
                We provide dedicated facilitators, robotics kits, termly parent progress reports, and a 30% direct profit share to the school.
              </p>
            </div>

            <div className="lg:col-span-4 flex justify-center lg:justify-end">
              <Link
                href={SCHOOL_REGISTRATION_PATH}
                className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4.5 bg-gradient-to-r from-brand-red-600 via-primary to-brand-red-500 text-white font-black text-xs uppercase rounded-2xl hover:opacity-95 transition-all shadow-xl shadow-brand-red-600/25 tracking-[0.2em] hover:scale-[1.02] active:scale-[0.98] min-h-[48px] cursor-pointer"
              >
                <span>Partner Your School</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Video Demo Lightbox Modal */}
      {activeVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in"
          onClick={() => setActiveVideo(null)}
        >
          <div
            className="relative w-full max-w-3xl overflow-hidden rounded-3xl bg-slate-950 border border-slate-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/60">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-brand-red-600 flex items-center justify-center text-white">
                  <Play className="w-3.5 h-3.5 fill-current" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
                    Student Robotics Inventions
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Live classroom footage from Rillcod Technologies partner school
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveVideo(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative aspect-video bg-black flex items-center justify-center">
              <video src={activeVideo} controls autoPlay className="w-full h-full object-contain">
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}