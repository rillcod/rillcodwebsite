"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { slugify } from "@/lib/utils";
import {
  ArrowRight,
  Clock,
  Users,
  Search,
  Filter,
  BookOpen,
  GraduationCap,
  MapPin,
  Sun,
  Calendar,
  ChevronDown,
  TrendingUp,
  Sparkles,
  Award,
  CheckCircle2,
} from "lucide-react";
import { useFeaturedSpecialProgram } from "@/hooks/useFeaturedSpecialProgram";
import { formatSpecialDate } from "@/lib/special-programs/types";
import { STUDENT_REGISTRATION_PATH } from "@/lib/registration/enrollment-types";

const LEVEL_MAP: Record<string, { label: string; color: string; bar: string }> = {
  beginner: {
    label: "Beginner",
    color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    bar: "from-emerald-400 to-emerald-600",
  },
  intermediate: {
    label: "Intermediate",
    color: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    bar: "from-amber-400 to-amber-600",
  },
  advanced: {
    label: "Advanced",
    color: "bg-brand-red-500/10 text-brand-red-500 border-brand-red-500/20",
    bar: "from-brand-red-500 to-rose-600",
  },
};

const nigerianStats = [
  { number: "500+", label: "STEM Scholars Trained", icon: <GraduationCap className="w-5 h-5" /> },
  { number: "25+", label: "Accredited Schools", icon: <MapPin className="w-5 h-5" /> },
  { number: "36+", label: "Hardware Capstones", icon: <Award className="w-5 h-5" /> },
  { number: "100%", label: "Practical Lab Projects", icon: <TrendingUp className="w-5 h-5" /> },
];

/**
 * What learners build, by stage — not who built it.
 *
 * This was three named students with quoted testimonials and named awards, each
 * laid over a photograph of a real, identifiable child from the events folder.
 * None of the three names exists in the database. Publishing invented praise and
 * invented prizes across the faces of actual children is not something a parent
 * should find on the site, and it is not a claim we could stand behind if one of
 * those parents asked.
 *
 * The projects below are the ones the curriculum actually produces, described by
 * stage. The photographs stay — they are real classrooms — but they illustrate
 * the work rather than impersonate a pupil.
 */
const studentOutcomes = [
  {
    project: "Voice-Controlled Obstacle Rover",
    stage: "Basic 4 – Basic 6",
    detail:
      "Learners assemble the chassis, wire ultrasonic distance sensors, and write the block code that steers it around what it detects.",
    discipline: "Robotics & Physical Computing",
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.02 PM.jpeg",
  },
  {
    project: "Smart Solar Irrigation Monitor",
    stage: "JSS 1 – JSS 3",
    detail:
      "Students programme a microcontroller to read soil moisture and open a valve on its own, then log what it did.",
    discipline: "IoT & Data",
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.29.56 PM.jpeg",
  },
  {
    project: "School Attendance Mobile App",
    stage: "SS 1 – SS 3",
    detail:
      "Senior students build, style and deploy a working cross-platform app in JavaScript that a school could actually run.",
    discipline: "Software Engineering",
    image: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.46.29 PM (1).jpeg",
  },
];

const levels = [
  { name: "All Levels", value: "all" },
  { name: "Beginner", value: "beginner" },
  { name: "Intermediate", value: "intermediate" },
  { name: "Advanced", value: "advanced" },
];

export default function ProgramsPage() {
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { cta, open: specialOpen } = useFeaturedSpecialProgram();
  const [featuredMeta, setFeaturedMeta] = useState<{
    starts_on?: string | null;
    ends_on?: string | null;
    registration_deadline?: string | null;
    title?: string;
  }>({});

  useEffect(() => {
    fetch("/api/programs?is_active=true", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setPrograms(json.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch("/api/special-programs/featured", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.data) {
          setFeaturedMeta({
            starts_on: j.data.starts_on,
            ends_on: j.data.ends_on,
            registration_deadline: j.data.registration_deadline,
            title: j.data.title,
          });
        }
      })
      .catch(() => {});
  }, []);

  const filtered = programs.filter((p) => {
    const matchSearch =
      (p.name ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.description ?? "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchLevel = selectedLevel === "all" || p.difficulty_level === selectedLevel;
    return matchSearch && matchLevel;
  });

  const toggle = (id: string) => setExpandedId(expandedId === id ? null : id);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans public-page-root overflow-x-clip">
      {/* Glow Effects */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/8 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-1/3 -left-64 w-[400px] h-[400px] bg-brand-red-600/8 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20 space-y-12">
        {/* Hero */}
        <div className="text-center py-12 sm:py-16 bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl shadow-xl px-6 relative overflow-hidden">
          <div className="relative z-10 space-y-4">
            <span className="inline-block px-4 py-1.5 bg-brand-red-600 text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-sm">
              Accredited STEM &amp; AI Pathways
            </span>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-foreground uppercase tracking-tight leading-tight">
              Our Learning <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-red-600 to-primary">Programs</span>
            </h1>
            <p className="text-xs sm:text-base text-muted-foreground max-w-2xl mx-auto font-medium leading-relaxed">
              Explore our 12-year progressive STEM curriculum bridging Primary School, Secondary School, and Professional Certifications — covering Robotics, Applied AI, Python Coding, and Physical Hardware Engineering.
            </p>
          </div>
        </div>

        {/* Summer / Special Program Banner */}
        {specialOpen && (
          <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl shadow-2xl border-t-4 border-t-amber-500 p-6 sm:p-10 relative overflow-hidden">
            <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-6">
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <Sun className="w-5 h-5 text-amber-500" />
                  <span className="text-lg sm:text-xl font-black uppercase text-foreground">{featuredMeta.title || cta.title}</span>
                  <span className="bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase text-amber-500">
                    Open Intake
                  </span>
                </div>
                <h2 className="text-xl sm:text-3xl font-black uppercase text-foreground">
                  Accelerate Your Tech Journey This Term!
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground font-medium">
                  Hands-on cohort starting <strong>{formatSpecialDate(featuredMeta.starts_on || null)}</strong>. Both in-person school lab sessions and interactive online cohorts available.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {[
                    { icon: <Calendar className="w-4 h-4 text-amber-500" />, text: `Cohort: ${formatSpecialDate(featuredMeta.starts_on || null)}` },
                    { icon: <MapPin className="w-4 h-4 text-amber-500" />, text: "School Lab & Live Interactive Online" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                      {item.icon}<span>{item.text}</span>
                    </div>
                  ))}
                </div>
                <div className="pt-2">
                  <Link
                    href={cta.href}
                    className="inline-flex items-center justify-center px-8 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 min-h-[44px]"
                  >
                    Register for Cohort
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Institutional Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
          {nigerianStats.map((stat, i) => (
            <div key={i} className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-5 sm:p-6 text-center shadow-lg hover:border-brand-red-500/40 transition-all">
              <div className="w-10 h-10 rounded-2xl bg-brand-red-600/10 text-brand-red-500 flex items-center justify-center mx-auto mb-3">
                {stat.icon}
              </div>
              <div className="text-2xl sm:text-3xl font-black text-foreground mb-1 tracking-tight">{stat.number}</div>
              <div className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Success Stories with Real Event Photography */}
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-red-500">What Students Build</span>
            <h2 className="text-2xl sm:text-3xl font-black text-foreground uppercase tracking-tight">Capstone Projects by Stage</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {studentOutcomes.map((story, i) => (
              <div key={i} className="bg-card/90 backdrop-blur-2xl rounded-3xl border border-border/80 overflow-hidden shadow-xl hover:border-brand-red-500/40 transition-all flex flex-col justify-between">
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-950">
                  <Image
                    src={story.image}
                    alt={`Rillcod students at work — ${story.discipline}`}
                    fill
                    sizes="(max-width: 768px) 100vw, 400px"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3 text-white">
                    <p className="text-xs font-black uppercase">{story.project}</p>
                    <p className="text-[10px] text-slate-300 font-medium">{story.stage}</p>
                  </div>
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  {/* Not italicised and not in quotation marks: this describes the
                      build, and nothing here is being put in a child's mouth. */}
                  <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                    {story.detail}
                  </p>
                  <div className="pt-3 border-t border-border/60">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-brand-red-600/10 text-brand-red-500 text-[10px] font-black uppercase tracking-wider">
                      <CheckCircle2 className="w-3 h-3" />
                      {story.discipline}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Search & Filter Strip */}
        <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            {/* Search Input */}
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <input
                type="text"
                placeholder="Search programs by title or topic..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-background border border-border rounded-2xl text-xs sm:text-sm font-bold text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-brand-red-500 transition-all shadow-sm"
              />
            </div>

            {/* Level Filter */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="relative w-full sm:w-48">
                <select
                  value={selectedLevel}
                  onChange={(e) => setSelectedLevel(e.target.value)}
                  className="w-full pl-4 pr-10 py-3 bg-background border border-border rounded-2xl text-xs font-bold uppercase tracking-wider text-foreground focus:outline-none focus:border-brand-red-500 transition-all cursor-pointer appearance-none shadow-sm"
                >
                  {levels.map((l) => (
                    <option key={l.value} value={l.value}>{l.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {/* Programs Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-card border border-border rounded-3xl h-80 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-card/90 border border-border rounded-3xl p-12 text-center shadow-xl">
            <Search className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-lg font-black uppercase text-foreground mb-2">No programs found</h3>
            <p className="text-xs text-muted-foreground">Try adjusting your search criteria or difficulty filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((program) => {
              const lvl = LEVEL_MAP[program.difficulty_level?.toLowerCase()] ?? {
                label: program.difficulty_level || "All Levels",
                color: "bg-muted text-muted-foreground border-border",
                bar: "from-primary to-brand-red-600",
              };
              const isExpanded = expandedId === program.id;
              const activeCourses = (program.courses ?? []).filter((c: any) => c.is_active !== false);
              const courseCount = activeCourses.length;

              return (
                <div
                  key={program.id}
                  className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl overflow-hidden shadow-xl hover:border-brand-red-500/40 transition-all flex flex-col justify-between"
                >
                  <div className="p-6 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 border rounded-full ${lvl.color}`}>
                        {lvl.label}
                      </span>
                      {courseCount > 0 && (
                        <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                          {courseCount} Module{courseCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    <h3 className="text-base sm:text-lg font-black text-foreground uppercase tracking-tight leading-snug">
                      {program.name}
                    </h3>
                    <p className="text-xs text-muted-foreground font-medium leading-relaxed line-clamp-3">
                      {program.description || "Comprehensive hands-on curriculum with practical hardware and software projects."}
                    </p>

                    <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground pt-2">
                      {program.duration_weeks && (
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-brand-red-500" />
                          <span>{program.duration_weeks} weeks</span>
                        </div>
                      )}
                      {program.max_students && (
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-primary" />
                          <span>Max {program.max_students}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-6 pt-0 space-y-2.5">
                    <button
                      type="button"
                      onClick={() => toggle(program.id)}
                      className="w-full py-3 bg-muted/40 hover:bg-muted text-foreground rounded-2xl text-xs font-bold uppercase tracking-wider transition-all min-h-[42px] cursor-pointer"
                    >
                      {isExpanded ? "Close Course Modules" : "View Course Modules"}
                    </button>

                    <Link
                      href={`${STUDENT_REGISTRATION_PATH}?program=${encodeURIComponent(program.name)}&program_id=${encodeURIComponent(program.id)}&type=online`}
                      className="flex items-center justify-center gap-2 w-full py-3.5 bg-brand-red-600 hover:bg-brand-red-500 text-white rounded-2xl text-xs font-black uppercase tracking-[0.15em] transition-all shadow-md shadow-brand-red-950/40 min-h-[46px]"
                    >
                      <span>Enroll in Track</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>

                    {isExpanded && (
                      <div className="mt-4 space-y-2 pt-4 border-t border-border/80 animate-in fade-in duration-300">
                        <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5 text-brand-red-500" />
                          Modules in Track
                        </h4>
                        {activeCourses.length === 0 ? (
                          <p className="text-xs text-muted-foreground/60 italic">Course modules updated termly.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {activeCourses.map((c: any, idx: number) => (
                              <div key={c.id || idx} className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                                <span className="w-5 h-5 rounded-full bg-brand-red-600/10 text-brand-red-500 text-[10px] font-black flex items-center justify-center shrink-0">
                                  {idx + 1}
                                </span>
                                <span className="truncate">{c.title}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <Link
                          href={`/programs/${slugify(program.name)}`}
                          className="inline-flex items-center gap-1 text-[11px] font-black text-brand-red-500 hover:underline pt-2 uppercase tracking-wider"
                        >
                          Full Syllabus Overview ↗
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom CTA Banner */}
        <div className="bg-card/90 backdrop-blur-2xl border border-border/80 border-t-4 border-t-brand-red-600 rounded-3xl p-8 sm:p-12 text-center shadow-2xl relative overflow-hidden space-y-6">
          <div className="max-w-2xl mx-auto space-y-3">
            <h2 className="text-2xl sm:text-4xl font-black uppercase text-foreground tracking-tight">
              Ready to Equip Your <span className="text-brand-red-500">Learners?</span>
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground font-medium">
              Join dozens of accredited schools across Nigeria delivering internationally benchmarked STEM education.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/school-registration"
              className="px-8 py-4 bg-brand-red-600 hover:bg-brand-red-500 text-white font-black text-xs uppercase tracking-wider rounded-2xl transition-all shadow-xl shadow-brand-red-950/40 min-h-[48px] flex items-center justify-center"
            >
              Partner Your School (70/30)
            </Link>
            <Link
              href="/curriculum"
              className="px-8 py-4 bg-card border border-border text-foreground hover:bg-muted font-black text-xs uppercase tracking-wider rounded-2xl transition-all min-h-[48px] flex items-center justify-center"
            >
              Explore 12-Year Curriculum
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
