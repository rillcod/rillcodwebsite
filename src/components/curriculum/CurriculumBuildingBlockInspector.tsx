'use client';

import { useState } from 'react';
import {
  AcademicCapIcon, BookOpenIcon, CalendarDaysIcon,
  UserGroupIcon, ChevronRightIcon, InformationCircleIcon,
  CheckCircleIcon, SparklesIcon, TagIcon
} from '@/lib/icons';

interface CurriculumBuildingBlockInspectorProps {
  programs: any[];
  courses: any[];
  curricula: any[];
  onSelectCourse: (program: any, course: any) => void;
}

export function CurriculumBuildingBlockInspector({
  programs,
  courses,
  curricula,
  onSelectCourse,
}: CurriculumBuildingBlockInspectorProps) {
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  const activeProgram = programs.find((p) => p.id === selectedProgramId) || programs[0] || null;
  const programCourses = activeProgram
    ? courses.filter((c) => c.program_id === activeProgram.id)
    : courses;

  const activeCourse = courses.find((c) => c.id === selectedCourseId) || programCourses[0] || null;
  const courseCurricula = activeCourse
    ? curricula.filter((curr) => curr.course_id === activeCourse.id)
    : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Sleek Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600/10 via-primary/10 to-purple-600/10 border border-primary/20 p-6 backdrop-blur-xl shadow-lg">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                <SparklesIcon className="w-3.5 h-3.5" />
                Building Block Inspector
              </span>
              <span className="text-xs font-bold text-muted-foreground bg-background/60 px-3 py-1 rounded-full border border-border">
                5-Tier Dependency Map
              </span>
            </div>
            <h1 className="text-2xl font-black text-foreground uppercase tracking-tight">
              Curriculum Building Blocks &amp; Hierarchy
            </h1>
            <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
              Step-by-step visual dependency tree connecting <strong className="text-foreground">Program ➔ Course ➔ Academic Term ➔ Weeks &amp; Lessons ➔ Linked Classes</strong> in plain English.
            </p>
          </div>
        </div>
      </div>

      {/* Step 1: Program Selector */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-primary text-primary-foreground flex items-center justify-center text-xs font-black shadow-md">
            1
          </div>
          <h2 className="text-sm font-black text-foreground uppercase tracking-wider">
            Select Academic Program ({programs.length} Available)
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {programs.map((prog) => {
            const isSelected = activeProgram?.id === prog.id;
            const courseCount = courses.filter((c) => c.program_id === prog.id).length;

            return (
              <button
                key={prog.id}
                type="button"
                onClick={() => {
                  setSelectedProgramId(prog.id);
                  const firstCourse = courses.find((c) => c.program_id === prog.id);
                  if (firstCourse) setSelectedCourseId(firstCourse.id);
                }}
                className={`group text-left p-4 rounded-2xl border transition-all duration-300 ${
                  isSelected
                    ? 'bg-primary/10 border-primary shadow-lg ring-2 ring-primary/20'
                    : 'bg-card border-border hover:border-primary/40 hover:shadow-md'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2 rounded-xl transition-colors ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground group-hover:text-foreground'}`}>
                    <AcademicCapIcon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 bg-muted/80 rounded-full border border-border">
                    {courseCount} Course(s)
                  </span>
                </div>
                <p className="text-sm font-black text-foreground truncate">{prog.name}</p>
                <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
                  {prog.description || 'Standard Academic Track'}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2 & 3: Course & Term Breakdown */}
      {activeProgram && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4 border-t border-border">
          {/* Left Column: Courses in this program */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-primary text-primary-foreground flex items-center justify-center text-xs font-black shadow-md">
                2
              </div>
              <h3 className="text-sm font-black text-foreground uppercase tracking-wider truncate">
                Courses in &quot;{activeProgram.name}&quot;
              </h3>
            </div>

            <div className="space-y-2 max-h-[550px] overflow-y-auto custom-scrollbar pr-1">
              {programCourses.length === 0 ? (
                <div className="p-6 border border-dashed border-border rounded-2xl text-center space-y-1">
                  <p className="text-xs text-muted-foreground font-bold">No courses assigned to this program yet.</p>
                </div>
              ) : (
                programCourses.map((c) => {
                  const isSelected = activeCourse?.id === c.id;
                  const currs = curricula.filter((curr) => curr.course_id === c.id);

                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCourseId(c.id)}
                      className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 ${
                        isSelected
                          ? 'bg-primary/10 border-primary shadow-md'
                          : 'bg-card border-border hover:border-primary/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-black text-foreground truncate">{c.title}</p>
                        <ChevronRightIcon className={`w-4 h-4 transition-transform ${isSelected ? 'text-primary translate-x-1' : 'text-muted-foreground/40'}`} />
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] font-bold text-muted-foreground">
                          {currs.length} Curriculum Copy(ies)
                        </span>
                        {currs.some((curr) => curr.is_visible_to_school) && (
                          <span className="text-[8px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            Published
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Middle & Right Column: Term Building Blocks for Selected Course */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-primary text-primary-foreground flex items-center justify-center text-xs font-black shadow-md">
                  3
                </div>
                <h3 className="text-sm font-black text-foreground uppercase tracking-wider truncate">
                  Academic Terms &amp; Weeks ({activeCourse?.title || 'Selected Course'})
                </h3>
              </div>

              {activeCourse && (
                <button
                  type="button"
                  onClick={() => onSelectCourse(activeProgram, activeCourse)}
                  className="px-4 py-2 bg-primary text-primary-foreground text-xs font-black uppercase tracking-wider rounded-xl hover:bg-primary/90 transition shadow-md flex items-center gap-1.5"
                >
                  <SparklesIcon className="w-3.5 h-3.5" /> Open in Builder &rarr;
                </button>
              )}
            </div>

            {courseCurricula.length === 0 ? (
              <div className="p-10 border border-dashed border-border rounded-2xl text-center space-y-4 shadow-inner">
                <BookOpenIcon className="w-12 h-12 text-muted-foreground/30 mx-auto" />
                <div className="space-y-1">
                  <p className="text-base font-black text-foreground">No Curriculum Generated for {activeCourse?.title}</p>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                    This course does not have a generated syllabus yet. Click &quot;Open in Builder&quot; above to create a 3-term academic curriculum for this course.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {courseCurricula.map((curr) => {
                  const terms = curr.content?.terms ?? [];

                  return (
                    <div key={curr.id} className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border">
                        <div>
                          <span className="text-[10px] font-black text-brand-red-600 uppercase tracking-widest bg-brand-red-600/10 px-2.5 py-0.5 rounded-full border border-brand-red-600/20">
                            Curriculum Version {curr.version ?? 1}
                          </span>
                          <h4 className="text-base font-black text-foreground mt-1">
                            {curr.content?.description || curr.courses?.title || 'Course Syllabus'}
                          </h4>
                        </div>
                        <span
                          className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border shadow-sm ${
                            curr.is_visible_to_school
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}
                        >
                          {curr.is_visible_to_school ? '✓ Visible to Schools' : '🔒 Hidden (Draft)'}
                        </span>
                      </div>

                      {/* Terms Breakdown */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[1, 2, 3].map((termNum) => {
                          const termObj = terms.find((t: any) => t.term === termNum);
                          const termLabel =
                            termNum === 1 ? 'First Term (Foundations)' : termNum === 2 ? 'Second Term (Application)' : 'Third Term (Innovation)';

                          return (
                            <div
                              key={termNum}
                              className={`p-4 rounded-2xl border space-y-3 transition-all ${
                                termObj
                                  ? 'bg-muted/20 border-border hover:border-primary/40 shadow-sm'
                                  : 'bg-muted/5 border-dashed border-border/60 opacity-60'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-primary uppercase tracking-wider">
                                  {termLabel}
                                </span>
                                {termObj && <CheckCircleIcon className="w-4 h-4 text-emerald-400" />}
                              </div>

                              {termObj ? (
                                <>
                                  <p className="text-xs font-bold text-foreground">
                                    {(termObj.weeks ?? []).length} Weekly Sessions
                                  </p>
                                  <div className="text-[11px] text-muted-foreground space-y-1 pt-2 border-t border-border/40 max-h-32 overflow-y-auto custom-scrollbar">
                                    {(termObj.weeks ?? []).slice(0, 4).map((w: any) => (
                                      <div key={w.week} className="truncate">
                                        <span className="font-bold text-foreground">W{w.week}:</span> {w.topic || w.type}
                                      </div>
                                    ))}
                                  </div>
                                </>
                              ) : (
                                <p className="text-[10px] text-muted-foreground font-bold italic pt-2">
                                  Term content pending generation
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
