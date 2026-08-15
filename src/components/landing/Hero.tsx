"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, Play, X } from "lucide-react";
import { useFeaturedSpecialProgram } from "@/hooks/useFeaturedSpecialProgram";
import { HeroSlideshow } from "./HeroSlideshow";
import {
  SCHOOL_REGISTRATION_PATH,
  STUDENT_REGISTRATION_PATH,
} from "@/lib/registration/enrollment-types";

const stats = [
  { value: "500+", label: "STEM Scholars", hint: "Active learners enrolled" },
  { value: "25+", label: "Partner Schools", hint: "Turnkey delivery" },
  { value: "100%", label: "Turnkey Setup", hint: "Facilitators + Kits" },
  { value: "₦0", label: "School CapEx", hint: "Zero upfront cost" },
];

export const Hero: React.FC = () => {
  const { cta, open: specialOpen } = useFeaturedSpecialProgram();
  const [videoOpen, setVideoOpen] = useState(false);

  return (
    <section
      id="home"
      className="relative flex min-h-[calc(100svh-var(--public-nav-height))] items-center overflow-x-clip bg-background px-0 pb-12 pt-6 sm:pb-20 sm:pt-10"
    >
      {/* Background Ambient Glow */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[55%] h-[55%] bg-primary/8 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 left-0 w-[45%] h-[45%] bg-brand-red-600/8 blur-[100px] rounded-full" />
      </div>

      <div className="relative z-10 w-full max-w-screen-2xl mx-auto px-4 sm:px-8 lg:px-20">
        {/* Top Trust & Accreditation Badge */}
        <div className="flex justify-center lg:justify-start mb-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-card/90 border border-border/80 px-4 py-1.5 shadow-sm backdrop-blur-md">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-muted-foreground">
              Accredited STEM &amp; AI Provider · UK &amp; West Africa Benchmarks
            </span>
          </div>
        </div>

        <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* Left Column: Heading, Pitch, CTAs, Stats (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left">
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-foreground leading-[1.06] tracking-tight mb-6 uppercase">
              Engineering <br className="hidden sm:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-red-600 via-primary to-brand-red-500">
                Future Leaders
              </span>{' '}
              {/*
                The space above is load-bearing. This <br> is hidden below `sm`,
                and JSX drops the newline whitespace around it, so on a phone
                "Future Leaders" ran straight into the next word — the headline
                read "LeadersThrough". Desktop never showed it because the line
                broke there anyway. At the end of a line the space collapses, so
                the wrapped layout is unchanged.
              */}
              <br className="hidden sm:block" />
              Through Code &amp; Robotics.
            </h1>

            <p className="text-base sm:text-lg text-muted-foreground max-w-xl mb-8 font-medium leading-relaxed border-l-2 border-brand-red-600 pl-4 sm:pl-6 text-left">
              Turnkey robotics hardware, certified facilitators, and progressive AI curriculum deployed directly into primary &amp; secondary schools — empowering learners with verified coding portfolios and zero equipment expenditure from the school.
            </p>

            {/* Primary Conversion CTAs */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto mb-4">
              <Link
                href={STUDENT_REGISTRATION_PATH}
                className="group w-full sm:w-auto flex items-center justify-center gap-2.5 px-8 py-4.5 bg-gradient-to-r from-brand-red-600 via-primary to-brand-red-500 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl hover:opacity-95 transition-all shadow-xl shadow-brand-red-600/25 hover:scale-[1.02] active:scale-[0.98] min-h-[48px] cursor-pointer"
              >
                <span>Enrol a Learner</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>

              <Link
                href={SCHOOL_REGISTRATION_PATH}
                className="group w-full sm:w-auto flex items-center justify-center gap-2.5 px-7 py-4.5 bg-card text-foreground font-black text-xs uppercase tracking-[0.2em] rounded-2xl border-2 border-border hover:border-brand-red-600/80 hover:bg-brand-red-600/5 transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98] min-h-[48px] cursor-pointer"
              >
                <span>Partner Your School</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform text-brand-red-600 dark:text-brand-red-500" />
              </Link>
            </div>

            {/* Subtext info */}
            {specialOpen ? (
              <p className="text-[11px] sm:text-xs text-muted-foreground font-medium mb-8 text-center lg:text-left max-w-xl">
                {cta.batchLabel ? (
                  <>
                    <span className="font-bold text-brand-red-600 dark:text-brand-red-500">{cta.batchLabel}</span>
                    {" · "}
                  </>
                ) : null}
                <span className="font-bold text-foreground">In-person {cta.onsiteFeeLabel}</span>
                {" · "}Online {cta.onlineFeeLabel}
                {cta.classDays ? <>{" · "}{cta.classDays}</> : null}
                {cta.deadlineLabel ? (
                  <> · Closes <span className="font-bold text-brand-red-600 dark:text-brand-red-500">{cta.deadlineLabel}</span></>
                ) : null}
              </p>
            ) : (
              <p className="text-[11px] sm:text-xs text-muted-foreground font-medium mb-8 text-center lg:text-left max-w-xl">
                Coding · Robotics · Artificial Intelligence
                {" · "}
                <span className="font-bold text-foreground">Primary through Secondary (Grade 1 – 12)</span>
                {" · "}Online &amp; In-School
              </p>
            )}

            {/* Metrics Counter Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 w-full">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="w-full bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-5 border-t-2 border-t-brand-red-600 shadow-xl hover:scale-[1.03] transition-all text-left"
                >
                  <p className="text-2xl sm:text-3xl font-black text-foreground tracking-tight tabular-nums">
                    {s.value}
                  </p>
                  <p className="text-[10px] font-black text-foreground uppercase tracking-wider mt-0.5">
                    {s.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate font-medium">
                    {s.hint}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Hero Real Media Carousel (5 Cols) */}
          <div className="lg:col-span-5 relative order-first lg:order-last w-full lg:pt-1">
            <div className="relative w-full aspect-[4/3] sm:aspect-square max-w-[540px] mx-auto group">
              {/*
                A "Real Build Labs · Authentic Classroom Media" badge used to float
                here. Two reasons it is gone.

                It collided: pinned to -top-3.5 -right-3.5 it landed directly on
                the slideshow's own video button at top-4 right-4, so on a phone
                two panels overlapped in the same corner.

                And a photograph that has to announce it is authentic invites the
                doubt it is trying to answer. These are real classrooms; showing
                them is the claim.
              */}

              {/* Main Slideshow Frame */}
              <div className="relative z-10 w-full h-full rounded-3xl overflow-hidden border border-border/80 shadow-2xl bg-muted group-hover:-translate-y-1 transition-transform duration-500">
                <HeroSlideshow
                  dotsRaised={specialOpen}
                  onOpenVideo={() => setVideoOpen(true)}
                />

                {specialOpen && (
                  <div className="absolute bottom-0 inset-x-0 z-20 p-3.5 sm:p-5">
                    <Link
                      href={cta.registerHref}
                      prefetch={false}
                      className="group/cta flex items-center justify-between w-full bg-slate-950/90 backdrop-blur-md border border-amber-500/40 hover:border-amber-500 p-4 hover:bg-amber-600 transition-all duration-300 shadow-2xl rounded-2xl"
                    >
                      <div className="min-w-0 text-left">
                        <p className="text-[10px] font-black text-amber-400 group-hover/cta:text-white uppercase tracking-wider mb-0.5 transition-colors truncate">
                          ☀️ {cta.title}
                        </p>
                        <p className="text-xs sm:text-sm font-black text-white uppercase tracking-tight transition-colors">
                          View Program Intake
                        </p>
                        <p className="text-[10px] text-slate-300 group-hover/cta:text-white/90 mt-0.5 font-semibold transition-colors truncate">
                          {cta.batchLabel ? `${cta.batchLabel} · ` : ""}
                          In-person {cta.onsiteFeeLabel} · Online {cta.onlineFeeLabel}
                        </p>
                      </div>
                      <div className="w-8 h-8 bg-amber-500 group-hover/cta:bg-white flex items-center justify-center flex-shrink-0 transition-colors rounded-xl ml-3">
                        <ArrowRight className="w-4 h-4 text-slate-950 group-hover/cta:text-amber-600 group-hover/cta:translate-x-0.5 transition-all" />
                      </div>
                    </Link>
                  </div>
                )}
              </div>

              {/* Ambient Glow */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[110%] h-[110%] bg-primary/10 blur-[90px] rounded-3xl -z-10" />
            </div>
          </div>
        </div>
      </div>

      {/* Video Modal Lightbox for Real Student Demo */}
      {videoOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in"
          onClick={() => setVideoOpen(false)}
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
                    Student Robotics Demonstration
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Live classroom footage from Rillcod Academy partner school
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVideoOpen(false)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative aspect-video bg-black flex items-center justify-center">
              <video
                src="/images/EVENTS/WhatsApp Video 2026-08-14 at 7.46.27 PM (1).mp4"
                controls
                autoPlay
                className="w-full h-full object-contain"
              >
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default Hero;

