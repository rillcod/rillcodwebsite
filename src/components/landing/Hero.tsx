"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Cpu } from 'lucide-react';
import { useFeaturedSpecialProgram } from '@/hooks/useFeaturedSpecialProgram';
import {
  SCHOOL_REGISTRATION_PATH,
  STUDENT_REGISTRATION_PATH,
} from '@/lib/registration/enrollment-types';

const stats = [
  { value: '500+', label: 'Students' },
  { id: 'schools', value: '25+', label: 'Schools' },
  { id: 'stem', value: '15+', label: 'STEM' },
  { id: 'success', value: '95%', label: 'Success' },
];

const Hero: React.FC = () => {
  const { cta } = useFeaturedSpecialProgram();

  return (
    <section
      id="home"
      className="relative min-h-[90svh] flex items-center bg-background overflow-hidden pt-24 pb-12 sm:pt-32 sm:pb-20"
    >
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute top-0 right-0 w-[50%] h-[50%] bg-primary/5 blur-[100px] rounded-xl" />
        <div className="absolute bottom-0 left-0 w-[40%] h-[40%] bg-primary/5 blur-[80px] rounded-xl" />
      </div>

      <div className="relative z-10 w-full max-w-screen-2xl mx-auto px-6 lg:px-20">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-foreground leading-[1.1] tracking-tight mb-6 uppercase">
              Empowering <br className="hidden sm:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary">
                Future Leaders
              </span>
              <br className="hidden sm:block" />
              Through Code.
            </h1>

            <p className="text-base sm:text-lg text-muted-foreground max-w-lg mb-8 font-medium leading-relaxed italic border-l-2 border-brand-red-600 pl-6">
              Empowering African learners and global students with hands-on coding, artificial intelligence, and world-class STEM education directly online and in partner schools.
            </p>

            {/* Two primary conversion CTAs — one path each */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto mb-4">
              <Link
                href={STUDENT_REGISTRATION_PATH}
                className="group w-full sm:w-auto flex items-center justify-center gap-2.5 px-8 py-5 bg-gradient-to-r from-amber-500 via-orange-500 to-orange-600 text-white font-black text-xs uppercase tracking-[0.2em] rounded-xl hover:opacity-95 transition-all shadow-xl shadow-orange-500/20 border-b-2 border-b-orange-700/60 hover:scale-[1.02]"
              >
                Enrol a Learner
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href={cta.registerHref}
                prefetch={false}
                className="group w-full sm:w-auto flex items-center justify-center gap-2.5 px-8 py-5 bg-card text-foreground font-black text-xs uppercase tracking-[0.2em] rounded-xl border-2 border-amber-500/50 hover:border-amber-500 hover:bg-amber-500/10 transition-all shadow-lg"
              >
                ☀️ Enroll Child Now
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform text-amber-600 dark:text-amber-400" />
              </Link>
            </div>

            <p className="text-[11px] sm:text-xs text-muted-foreground mb-10 max-w-md">
              <span className="font-bold text-amber-600 dark:text-amber-400">{cta.batchLabel}</span>
              {' · '}
              <span className="font-bold text-emerald-600 dark:text-emerald-400">In-person {cta.onsiteFeeLabel}</span>
              {' · '}Online {cta.onlineFeeLabel}
              {' · '}{cta.classDays}
              {cta.deadlineLabel ? (
                <> · Closes <span className="font-bold text-rose-600 dark:text-rose-400">{cta.deadlineLabel}</span></>
              ) : null}
            </p>

            {/* Secondary intents — no competition with primary CTAs */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-5 gap-y-2 mb-12 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              <Link href="/login" className="hover:text-foreground transition-colors underline-offset-4 hover:underline">
                Student Login
              </Link>
              <span className="text-border" aria-hidden>·</span>
              <Link href={SCHOOL_REGISTRATION_PATH} className="hover:text-foreground transition-colors underline-offset-4 hover:underline">
                Register School
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full">
              {stats.map((s) => (
                <div key={s.label} className="bg-card border border-border rounded-xl p-4 sm:p-5 border-t-2 border-t-brand-red-600/40">
                  <p className="text-2xl sm:text-3xl font-black text-foreground tracking-tighter">{s.value}</p>
                  <p className="text-[8px] sm:text-[9px] text-muted-foreground font-black uppercase tracking-widest mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative order-first lg:order-last">
            <div className="relative w-full aspect-square max-w-[500px] mx-auto group">
              <div className="absolute -top-4 -right-4 z-20 bg-card border border-border border-t-2 border-t-brand-red-600 rounded-xl p-3 sm:p-5 shadow-xl backdrop-blur-md">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary rounded-xl flex items-center justify-center mb-2">
                  <Cpu className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <p className="text-foreground font-black text-[8px] sm:text-[9px] uppercase tracking-widest">Robotics Hub</p>
              </div>

              <div className="relative z-10 w-full h-full rounded-xl overflow-hidden border border-border shadow-2xl bg-muted group-hover:-translate-y-1 transition-transform duration-500">
                <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-60 z-10" />
                <Image
                  src="/images/landing/hero.png"
                  alt="Rillcod Excellence"
                  fill
                  className="object-cover"
                  priority
                />
                <div className="absolute bottom-0 inset-x-0 z-20 p-4 sm:p-6">
                  <Link
                    href={cta.registerHref}
                    prefetch={false}
                    className="group/cta flex items-center justify-between w-full bg-background/95 backdrop-blur-sm border border-amber-500/40 hover:border-amber-500 px-5 py-4 hover:bg-amber-600 transition-all duration-300 shadow-2xl rounded-xl"
                  >
                    <div className="min-w-0 text-left">
                      <p className="text-[9px] font-black text-amber-600 dark:text-amber-400 group-hover/cta:text-white uppercase tracking-[0.25em] mb-0.5 transition-colors truncate">
                        ☀️ {cta.title}
                      </p>
                      <p className="text-sm font-black text-foreground group-hover/cta:text-white uppercase tracking-tight transition-colors">
                        Enroll Child Now
                      </p>
                      <p className="text-[10px] text-muted-foreground group-hover/cta:text-white/85 mt-1 font-bold transition-colors">
                        {cta.batchLabel} · In-person {cta.onsiteFeeLabel} · Online {cta.onlineFeeLabel}
                        {cta.deadlineLabel ? ` · Closes ${cta.deadlineLabel}` : ''}
                      </p>
                    </div>
                    <div className="w-9 h-9 bg-amber-500 group-hover/cta:bg-card flex items-center justify-center flex-shrink-0 transition-colors rounded-lg ml-3">
                      <ArrowRight className="w-4 h-4 text-white group-hover/cta:text-amber-600 group-hover/cta:translate-x-0.5 transition-all" />
                    </div>
                  </Link>
                </div>
              </div>

              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[110%] h-[110%] bg-primary/5 blur-[80px] rounded-xl -z-10" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;

