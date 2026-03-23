"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Clock, Users, BookOpen, CheckCircle,
  MapPin, ChevronRight, Layers, Star,
} from "lucide-react";

const LEVEL_MAP: Record<string, { label: string; accent: string; bar: string; border: string }> = {
  beginner:     { label: "Beginner",     accent: "text-emerald-400", bar: "bg-emerald-500", border: "border-emerald-500/40" },
  intermediate: { label: "Intermediate", accent: "text-amber-400",   bar: "bg-amber-500",   border: "border-amber-500/40" },
  advanced:     { label: "Advanced",     accent: "text-rose-400",    bar: "bg-rose-500",    border: "border-rose-500/40" },
};

export default function ProgramPage() {
  const params = useParams();
  const id = params?.id as string;

  const [program, setProgram]   = useState<any | null>(null);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/programs/${id}`, { cache: "no-store" })
      .then(r => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then(json => {
        if (!json) return;
        setProgram(json.data ?? null);
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !program) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-black text-foreground mb-4 uppercase tracking-tight">Program Not Found</h1>
          <p className="text-muted-foreground mb-6 font-medium italic">
            The program you&apos;re looking for doesn&apos;t exist.
          </p>
          <Link
            href="/programs"
            className="bg-orange-500 text-white px-8 py-4 rounded-none font-black text-xs uppercase tracking-widest hover:bg-orange-600 transition-colors"
          >
            View All Programs
          </Link>
        </div>
      </div>
    );
  }

  const level      = program.difficulty_level ?? "beginner";
  const lm         = LEVEL_MAP[level] ?? LEVEL_MAP.beginner;
  const courses: any[] = program.courses ?? [];
  const activeCourses  = courses.filter(c => c.is_active !== false);

  return (
    <div className="min-h-screen bg-background font-sans">
      {/* Decorative blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-orange-500/10 to-purple-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* Breadcrumb */}
        <div className="mb-8">
          <Link href="/programs" className="flex items-center gap-2 text-muted-foreground hover:text-orange-500 transition-colors text-xs font-black uppercase tracking-widest">
            <ArrowLeft className="w-4 h-4" />
            Back to Programs
          </Link>
        </div>

        {/* Hero card */}
        <div className="bg-card border border-border rounded-none shadow-2xl border-t-4 border-t-orange-500 p-8 sm:p-12 mb-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 blur-[100px] pointer-events-none" />
          <div className="relative z-10">
            <div className="flex flex-wrap items-center gap-3 mb-5">
              <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 border rounded-none ${lm.border} ${lm.accent}`}>
                {lm.label}
              </span>
              {program.duration_weeks && (
                <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 border border-border text-muted-foreground">
                  {program.duration_weeks} Weeks
                </span>
              )}
              {activeCourses.length > 0 && (
                <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 border border-border text-muted-foreground">
                  {activeCourses.length} Course{activeCourses.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            <h1 className="text-3xl sm:text-5xl font-black text-foreground uppercase tracking-tight leading-none mb-4">
              {program.name}
            </h1>
            <div className="w-16 h-1 bg-orange-500 mb-6" />
            <p className="text-sm sm:text-base text-muted-foreground max-w-3xl font-medium italic leading-relaxed mb-8">
              {program.description}
            </p>

            {/* Quick stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              {program.duration_weeks && (
                <div className="bg-background border border-border p-4 text-center">
                  <div className="text-2xl font-black text-foreground italic">{program.duration_weeks}</div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mt-1">Weeks</div>
                </div>
              )}
              {program.price > 0 && (
                <div className="bg-background border border-border p-4 text-center">
                  <div className="text-xl font-black text-orange-500 italic">₦{Number(program.price).toLocaleString()}</div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mt-1">Price</div>
                </div>
              )}
              {program.max_students && (
                <div className="bg-background border border-border p-4 text-center">
                  <div className="text-2xl font-black text-foreground italic">{program.max_students}</div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mt-1">Max Students</div>
                </div>
              )}
              <div className="bg-background border border-border p-4 text-center">
                <div className="text-2xl font-black text-foreground italic">{activeCourses.length}</div>
                <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mt-1">Courses</div>
              </div>
            </div>

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href={`/student-registration?program_id=${id}`}
                className="bg-orange-500 text-white px-10 py-4 rounded-none font-black text-xs uppercase tracking-widest hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20 text-center"
              >
                Enrol Now
              </Link>
              <Link
                href="/contact"
                className="border border-border text-muted-foreground px-10 py-4 rounded-none font-black text-xs uppercase tracking-widest hover:border-orange-500 hover:text-orange-500 transition-all text-center"
              >
                Get More Info
              </Link>
            </div>
          </div>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left — main content */}
          <div className="lg:col-span-2 space-y-8">

            {/* Courses in Program */}
            <div className="bg-card border border-border rounded-none shadow-lg overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-background">
                <BookOpen className="w-5 h-5 text-orange-500" />
                <h2 className="text-xs font-black uppercase tracking-widest text-foreground">Courses in This Program</h2>
              </div>
              <div className="p-6">
                {activeCourses.length === 0 ? (
                  <p className="text-muted-foreground italic text-sm font-medium">
                    Courses for this program are being prepared. Check back soon!
                  </p>
                ) : (
                  <div className="space-y-3">
                    {activeCourses.map((course: any, idx: number) => (
                      <div
                        key={course.id}
                        className="flex items-start gap-4 p-4 bg-background border border-border hover:border-orange-500/40 transition-all group"
                      >
                        <div className="w-8 h-8 bg-orange-500 text-white flex items-center justify-center text-xs font-black flex-shrink-0">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-sm text-foreground uppercase tracking-tight">{course.title}</p>
                          {course.description && (
                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2 font-medium italic">
                              {course.description}
                            </p>
                          )}
                        </div>
                        {course.duration_hours && (
                          <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-black text-muted-foreground uppercase">
                            <Clock className="w-3.5 h-3.5" />{course.duration_hours}h
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* What You'll Learn */}
            {activeCourses.length > 0 && (
              <div className="bg-card border border-border rounded-none shadow-lg overflow-hidden">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-background">
                  <Star className="w-5 h-5 text-orange-500" />
                  <h2 className="text-xs font-black uppercase tracking-widest text-foreground">What You&apos;ll Learn</h2>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activeCourses.slice(0, 8).map((c: any) => (
                      <div key={c.id} className="flex items-center gap-3">
                        <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        <span className="text-sm text-muted-foreground font-medium">{c.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right — sidebar */}
          <div className="space-y-6">

            {/* Program Details */}
            <div className="bg-card border border-border rounded-none shadow-lg overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-background">
                <Layers className="w-5 h-5 text-orange-500" />
                <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Program Details</h3>
              </div>
              <div className="p-6 space-y-5">
                {program.duration_weeks && (
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Duration</div>
                      <div className="font-black text-sm text-foreground">{program.duration_weeks} Weeks</div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <BookOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Total Courses</div>
                    <div className="font-black text-sm text-foreground">{activeCourses.length} course{activeCourses.length !== 1 ? "s" : ""}</div>
                  </div>
                </div>
                {program.max_students && (
                  <div className="flex items-center gap-3">
                    <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Class Size</div>
                      <div className="font-black text-sm text-foreground">Max {program.max_students} students</div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Level</div>
                    <div className={`font-black text-sm ${lm.accent}`}>{lm.label}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Course Overview */}
            {activeCourses.length > 0 && (
              <div className="bg-card border border-border rounded-none shadow-lg overflow-hidden">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-background">
                  <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Quick Course Overview</h3>
                </div>
                <div className="p-6 space-y-2.5">
                  {activeCourses.map((c: any, idx: number) => (
                    <div key={c.id} className="flex items-start gap-2 text-sm text-muted-foreground group">
                      <ChevronRight className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                      <span className="font-medium italic text-xs">Course {idx + 1}: {c.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA */}
            <div className="bg-card border border-border border-t-4 border-t-orange-500 rounded-none shadow-lg p-6 text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 blur-3xl pointer-events-none" />
              <div className="relative z-10">
                <h3 className="text-base font-black text-foreground uppercase tracking-tight mb-2">Ready to Start?</h3>
                <p className="text-xs text-muted-foreground mb-5 font-medium italic">
                  Join this program and unlock your tech potential!
                </p>
                <Link
                  href={`/student-registration?program_id=${id}`}
                  className="block bg-orange-500 text-white px-6 py-4 rounded-none font-black text-xs uppercase tracking-widest hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20"
                >
                  Enrol Now
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
