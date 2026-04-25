"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowRight, Clock, Users, Search, Filter, BookOpen,
  GraduationCap, MapPin, Sun, Calendar, ChevronDown, TrendingUp,
} from "lucide-react";
import SummerSchoolPopup from "@/components/SummerSchoolPopup";

const LEVEL_MAP: Record<string, { label: string; color: string; bar: string }> = {
  beginner:     { label: "Beginner",     color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", bar: "from-emerald-400 to-emerald-600" },
  intermediate: { label: "Intermediate", color: "bg-amber-500/20 text-amber-400 border-amber-500/30",   bar: "from-amber-400 to-amber-600" },
  advanced:     { label: "Advanced",     color: "bg-rose-500/20 text-rose-400 border-rose-500/30",       bar: "from-rose-400 to-rose-600" },
};

const nigerianStats = [
  { number: "500+", label: "Students Trained",  icon: <GraduationCap className="w-6 h-6" /> },
  { number: "50+",  label: "Schools Partnered", icon: <MapPin className="w-6 h-6" /> },
  { number: "15+",  label: "States Covered",    icon: <MapPin className="w-6 h-6" /> },
  { number: "95%",  label: "Success Rate",      icon: <TrendingUp className="w-6 h-6" /> },
];

const successStories = [
  { name: "Amina Hassan",     location: "Lagos",  story: "From computer basics to building websites for local businesses", achievement: "Now runs her own web design business", image: "👩‍💻" },
  { name: "Chinedu Okonkwo",  location: "Enugu",  story: "Created educational games about Nigerian culture",               achievement: "Won national coding competition",         image: "👨‍💻" },
  { name: "Fatima Yusuf",     location: "Kano",   story: "Developed apps to help market vendors go digital",               achievement: "Featured in local tech magazines",        image: "👩‍🎨" },
];

const levels = [
  { name: "All Levels",   value: "all" },
  { name: "Beginner",     value: "beginner" },
  { name: "Intermediate", value: "intermediate" },
  { name: "Advanced",     value: "advanced" },
];

export default function Programs() {
  const [programs, setPrograms]               = useState<any[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [searchTerm, setSearchTerm]           = useState("");
  const [selectedLevel, setSelectedLevel]     = useState("all");
  const [expandedId, setExpandedId]           = useState<string | null>(null);
  const [showSummerSchoolPopup, setShowSummerSchoolPopup] = useState(false);

  useEffect(() => {
    fetch("/api/programs?is_active=true", { cache: "no-store" })
      .then(r => r.json())
      .then(json => setPrograms(json.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = programs.filter(p => {
    const matchSearch =
      (p.name ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.description ?? "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchLevel = selectedLevel === "all" || p.difficulty_level === selectedLevel;
    return matchSearch && matchLevel;
  });

  const toggle = (id: string) => setExpandedId(expandedId === id ? null : id);

  return (
    <div className="min-h-screen bg-background font-sans">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-primary/10 to-purple-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

        {/* Hero */}
        <div className="text-center py-16 bg-card border border-border rounded-none shadow-lg mb-16 px-4">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-background border border-border rounded-none flex items-center justify-center shadow-sm">
              <BookOpen className="w-8 h-8 sm:w-10 sm:h-10 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-foreground mb-6 uppercase tracking-tight">
            Our Learning Programs
          </h1>
          <p className="text-sm sm:text-lg text-muted-foreground max-w-3xl mx-auto mb-8 font-medium italic">
            Discover our comprehensive range of technology education programs for students from{" "}
            <strong>kids to professionals</strong> — covering coding, robotics, AI, data science,
            UI/UX, and more.
          </p>
          <div className="w-20 h-1 bg-primary mx-auto rounded-none" />
        </div>

        {/* Summer School Banner */}
        <div className="bg-card border border-border rounded-none shadow-2xl border-t-4 border-t-yellow-500 p-8 mb-16 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-none -translate-y-32 translate-x-32 blur-3xl" />
          <div className="relative z-10">
            <div className="flex flex-col lg:flex-row items-center justify-between">
              <div className="flex-1 text-foreground mb-6 lg:mb-0">
                <div className="flex items-center space-x-2 mb-4">
                  <Sun className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-500" />
                  <span className="text-xl sm:text-2xl font-black uppercase tracking-tight">Summer School 2026</span>
                  <div className="bg-yellow-500/20 border border-yellow-500/20 px-3 py-1 rounded-none text-[10px] font-black uppercase tracking-widest text-yellow-500">
                    Limited Time
                  </div>
                </div>
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-black mb-4 uppercase leading-tight">
                  Accelerate Your Tech Journey This Summer!
                </h2>
                <p className="text-sm sm:text-base mb-6 text-muted-foreground font-medium italic">
                  Intensive programs for JSS3 students starting <strong>June 15th, 2026</strong> and other
                  classes from <strong>July 25th, 2026</strong>. Both online and onsite options available.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                  {[
                    { icon: <Calendar className="w-4 h-4 text-yellow-500" />, text: "JSS3: June 15th 2026 - 6 weeks" },
                    { icon: <Calendar className="w-4 h-4 text-yellow-500" />, text: "Others: July 25th 2026 - 4 weeks" },
                    { icon: <MapPin className="w-4 h-4 text-yellow-500" />,   text: "Online & Onsite available" },
                    { icon: <Users className="w-4 h-4 text-yellow-500" />,    text: "Small class sizes (8–15 students)" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center space-x-2 text-xs sm:text-sm font-bold uppercase tracking-wide text-muted-foreground">
                      {item.icon}<span>{item.text}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setShowSummerSchoolPopup(true)}
                  className="w-full sm:w-auto bg-yellow-500 text-white px-10 py-5 rounded-none font-black text-xs uppercase tracking-[0.4em] hover:bg-yellow-600 transition-all shadow-xl shadow-yellow-500/20"
                >
                  Register Now
                </button>
              </div>
              <div className="flex-shrink-0 hidden lg:block">
                <div className="w-32 h-32 bg-background border border-border rounded-none flex items-center justify-center shadow-sm">
                  <GraduationCap className="w-16 h-16 text-yellow-500" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Nigerian Impact Stats */}
        <div className="bg-card border border-border rounded-none shadow-lg p-8 mb-16">
          <h2 className="text-xl sm:text-2xl font-black text-center text-foreground mb-12 uppercase tracking-tight italic">
            Our Impact Across Nigeria
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
            {nigerianStats.map((stat, i) => (
              <div key={i} className="text-center group">
                <div className="w-12 h-12 bg-background border border-border rounded-none flex items-center justify-center mx-auto mb-6 transition-all group-hover:border-primary shadow-sm">
                  <div className="text-muted-foreground group-hover:text-primary transition-colors">{stat.icon}</div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-foreground mb-1 tracking-tighter italic">{stat.number}</div>
                <div className="text-[10px] sm:text-[11px] font-black text-muted-foreground uppercase tracking-widest">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Success Stories */}
        <div className="bg-card border border-border rounded-none shadow-lg p-8 mb-16">
          <h2 className="text-xl sm:text-2xl font-black text-center text-foreground mb-12 uppercase tracking-tight italic">
            Success Stories
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {successStories.map((story, i) => (
              <div key={i} className="bg-background rounded-none p-8 border border-border hover:border-primary transition-all group shadow-sm">
                <div className="text-4xl mb-6 grayscale group-hover:grayscale-0 transition-all">{story.image}</div>
                <h3 className="text-lg font-black text-foreground mb-1 uppercase tracking-tight">{story.name}</h3>
                <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-4">{story.location}</p>
                <p className="text-sm text-muted-foreground mb-6 font-medium italic leading-relaxed">"{story.story}"</p>
                <div className="bg-card border border-border px-4 py-2 rounded-none text-[10px] font-black uppercase tracking-widest text-muted-foreground inline-block shadow-sm">
                  {story.achievement}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Search & Filter */}
        <div className="bg-card border border-border rounded-none p-10 mb-16 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[100px] pointer-events-none" />
          <div className="flex flex-col lg:flex-row gap-8 items-center justify-between relative z-10">
            {/* Search */}
            <div className="flex-1 max-w-md w-full">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-4 italic">Search Programs:</p>
              <div className="relative group">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-primary transition-colors w-4 h-4 z-10" />
                <input
                  type="text"
                  placeholder="SEARCH PROGRAMS..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-14 pr-6 py-5 bg-background border border-border rounded-none text-[10px] font-black uppercase tracking-widest text-foreground placeholder:text-muted-foreground/20 focus:outline-none focus:border-primary transition-all shadow-inner"
                />
              </div>
            </div>
            {/* Level Filter */}
            <div className="flex items-center gap-3 w-full lg:w-auto">
              <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="relative w-full lg:w-48 group">
                <select
                  value={selectedLevel}
                  onChange={e => setSelectedLevel(e.target.value)}
                  className="w-full pl-6 pr-10 py-5 bg-background border border-border rounded-none text-[10px] font-black uppercase tracking-widest text-foreground focus:outline-none focus:border-primary transition-all cursor-pointer appearance-none shadow-sm"
                >
                  {levels.map(l => (
                    <option key={l.value} value={l.value}>{l.name.toUpperCase()}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {/* Programs Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 mb-16">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="bg-card border border-border rounded-none h-80 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 bg-card border border-border mb-16">
            <BookOpen className="w-12 h-12 mx-auto text-muted-foreground/20 mb-4" />
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
              No programs match your search
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 mb-16">
            {filtered.map(program => {
              const lvl = LEVEL_MAP[program.difficulty_level] ?? LEVEL_MAP.beginner;
              const courseCount = program.courses?.length ?? 0;
              const activeCourses = (program.courses ?? []).filter((c: any) => c.is_active !== false);
              const isExpanded = expandedId === program.id;

              return (
                <div key={program.id} className="bg-card rounded-none shadow-lg border border-border overflow-hidden hover:shadow-xl transition-all group flex flex-col">
                  {/* Color bar */}
                  <div className={`h-1.5 bg-gradient-to-r ${lvl.bar}`} />

                  {/* Header */}
                  <div className="p-8 bg-background border-b border-border relative overflow-hidden flex-shrink-0">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-none -translate-y-16 translate-x-16 rotate-45" />
                    <div className="relative z-10">
                      <div className="flex items-start justify-between mb-6">
                        <div className="w-12 h-12 bg-card border border-border rounded-none flex items-center justify-center shadow-sm group-hover:border-primary transition-all">
                          <BookOpen className="w-6 h-6 text-primary" />
                        </div>
                        <div className="text-right">
                          {program.price > 0 ? (
                            <>
                              <div className="text-xl font-black text-foreground tracking-tighter italic">
                                ₦{Number(program.price).toLocaleString()}
                              </div>
                              <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Base Rate</div>
                            </>
                          ) : (
                            <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest px-2 py-1 bg-emerald-500/10 border border-emerald-500/20">
                              Enquire
                            </div>
                          )}
                        </div>
                      </div>

                      <h3 className="text-xl font-black text-foreground uppercase tracking-tight mb-1">
                        {program.name}
                      </h3>
                      <p className="text-xs text-muted-foreground font-medium italic mb-4 line-clamp-2">
                        {program.description}
                      </p>

                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 border rounded-none ${lvl.color}`}>
                          {lvl.label}
                        </span>
                        {courseCount > 0 && (
                          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 border border-blue-500/20 bg-blue-500/10 text-blue-400 rounded-none">
                            {courseCount} Course{courseCount !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="p-8 flex-1 flex flex-col">
                    <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-6">
                      {program.duration_weeks && (
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-primary" />
                          <span>{program.duration_weeks} weeks</span>
                        </div>
                      )}
                      {program.max_students && (
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-blue-500" />
                          <span>Max {program.max_students}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="mt-auto space-y-3">
                      <button
                        onClick={() => toggle(program.id)}
                        className="w-full bg-transparent border border-border text-muted-foreground py-4 rounded-none text-[10px] font-black uppercase tracking-widest hover:border-primary hover:text-primary transition-all shadow-sm"
                      >
                        {isExpanded ? "CLOSE COURSE LIST" : "VIEW COURSES"}
                      </button>
                      <Link
                        href="/student-registration"
                        className="flex items-center justify-center w-full bg-background border border-border text-foreground hover:text-white py-5 rounded-none text-[10px] font-black uppercase tracking-[0.4em] hover:bg-primary hover:border-primary transition-all shadow-sm"
                      >
                        JOIN PROGRAM
                      </Link>
                    </div>

                    {/* Expanded Courses */}
                    {isExpanded && (
                      <div className="mt-8 space-y-3 pt-8 border-t border-border animate-in fade-in slide-in-from-top-4 duration-300">
                        <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                          <BookOpen className="w-3.5 h-3.5 text-primary" />
                          Courses in This Program
                        </h4>
                        {activeCourses.length === 0 ? (
                          <p className="text-[10px] text-muted-foreground/40 font-black uppercase tracking-widest italic">
                            Courses coming soon
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {activeCourses.map((course: any, idx: number) => (
                              <div key={course.id} className="flex items-center gap-3 text-xs font-bold text-muted-foreground">
                                <span className="w-5 h-5 flex-shrink-0 bg-primary/10 border border-primary/20 text-primary text-[9px] font-black flex items-center justify-center rounded-none">
                                  {idx + 1}
                                </span>
                                <span className="capitalize italic">{course.title}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <Link
                          href={`/programs/${program.id}`}
                          className="flex items-center gap-1.5 text-[9px] font-black text-primary hover:text-primary uppercase tracking-widest mt-4 transition-colors"
                        >
                          Full Program Details <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* CTA */}
        <div className="bg-card border border-border border-t-4 border-t-primary rounded-none p-12 text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[100px] pointer-events-none" />
          <h2 className="text-2xl sm:text-4xl font-black mb-6 uppercase tracking-tight">
            Ready to Start Your <span className="text-primary italic">Tech Journey?</span>
          </h2>
          <p className="text-sm sm:text-lg mb-10 opacity-60 max-w-2xl mx-auto font-medium italic text-muted-foreground">
            Join thousands of Nigerian students already building their future with technology.
            Secure your spot in our upcoming cohort today.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Link
              href="/contact"
              className="px-12 py-5 bg-primary text-white font-black text-xs uppercase tracking-[0.4em] rounded-none hover:bg-primary transition-all shadow-xl shadow-primary/20"
            >
              Contact Us
            </Link>
            <Link
              href="/curriculum"
              className="px-12 py-5 bg-transparent border border-border text-foreground font-black text-xs uppercase tracking-[0.4em] rounded-none hover:bg-foreground hover:text-background transition-all shadow-sm"
            >
              View Curriculum
            </Link>
          </div>
        </div>
      </div>

      <SummerSchoolPopup
        isOpen={showSummerSchoolPopup}
        onClose={() => setShowSummerSchoolPopup(false)}
      />
    </div>
  );
}
