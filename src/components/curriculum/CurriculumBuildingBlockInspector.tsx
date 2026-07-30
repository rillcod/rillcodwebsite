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
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
            Building Block Inspector
          </span>
          <span className="text-xs text-muted-foreground font-bold">
            Program ➔ Course / Subject ➔ Academic Term ➔ Lessons
          </span>
        </div>
        <h2 className="text-lg font-black text-foreground uppercase tracking-tight">
          Curriculum Building Blocks &amp; Dependency Tree
        </h2>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          See exactly how academic programs link to courses, terms, and lesson plans. Understand the full structure before making edits.
        </p>
      </div>

      {/* Step 1: Program Selector */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-black">
            1
          </div>
          <h3 className="text-sm font-black text-foreground uppercase tracking-wider">
            Select Academic Program ({programs.length} Available)
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                className={`text-left p-4 rounded-xl border transition-all ${
                  isSelected
                    ? 'bg-primary/10 border-primary shadow-sm'
                    : 'bg-card border-border hover:border-primary/40'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <AcademicCapIcon className={`w-5 h-5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-muted rounded">
                    {courseCount} Course(s)
                  </span>
                </div>
                <p className="text-sm font-black text-foreground truncate">{prog.name}</p>
                <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">
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
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-black">
                2
              </div>
              <h3 className="text-sm font-black text-foreground uppercase tracking-wider">
                Courses in &quot;{activeProgram.name}&quot;
              </h3>
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar">
              {programCourses.length === 0 ? (
                <div className="p-4 border border-dashed border-border rounded-xl text-center">
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
                      className={`w-full text-left p-3.5 rounded-xl border transition ${
                        isSelected
                          ? 'bg-primary/10 border-primary'
                          : 'bg-card border-border hover:border-primary/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-black text-foreground truncate">{c.title}</p>
                        <ChevronRightIcon className={`w-4 h-4 ${isSelected ? 'text-primary' : 'text-muted-foreground/40'}`} />
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] font-bold text-muted-foreground">
                          {currs.length} Curriculum Copy(ies)
                        </span>
                        {currs.some((curr) => curr.is_visible_to_school) && (
                          <span className="text-[8px] font-black text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
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
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-black">
                  3
                </div>
                <h3 className="text-sm font-black text-foreground uppercase tracking-wider">
                  Academic Terms &amp; Weeks ({activeCourse?.title || 'Selected Course'})
                </h3>
              </div>

              {activeCourse && (
                <button
                  type="button"
                  onClick={() => onSelectCourse(activeProgram, activeCourse)}
                  className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-black uppercase tracking-wider rounded-xl hover:bg-primary/90 transition"
                >
                  Open in Generator &rarr;
                </button>
              )}
            </div>

            {courseCurricula.length === 0 ? (
              <div className="p-8 border border-dashed border-border rounded-xl text-center space-y-3">
                <BookOpenIcon className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                <p className="text-sm font-bold text-foreground">No Curriculum Generated for {activeCourse?.title}</p>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  This course does not have a generated syllabus yet. Click &quot;Open in Generator&quot; above to create a 3-term academic curriculum for this course.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {courseCurricula.map((curr) => {
                  const terms = curr.content?.terms ?? [];

                  return (
                    <div key={curr.id} className="bg-card border border-border rounded-xl p-5 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border">
                        <div>
                          <span className="text-[10px] font-black text-brand-red-600 uppercase tracking-widest">
                            Curriculum Version {curr.version ?? 1}
                          </span>
                          <h4 className="text-sm font-black text-foreground">
                            {curr.content?.description || curr.courses?.title || 'Course Syllabus'}
                          </h4>
                        </div>
                        <span
                          className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${
                            curr.is_visible_to_school
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}
                        >
                          {curr.is_visible_to_school ? '✓ Visible to Schools' : '🔒 Hidden (Draft)'}
                        </span>
                      </div>

                      {/* Terms Breakdown */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {[1, 2, 3].map((termNum) => {
                          const termObj = terms.find((t: any) => t.term === termNum);
                          const termLabel =
                            termNum === 1 ? 'First Term (Foundations)' : termNum === 2 ? 'Second Term (Application)' : 'Third Term (Innovation)';

                          return (
                            <div
                              key={termNum}
                              className={`p-3.5 rounded-xl border space-y-2 ${
                                termObj ? 'bg-muted/20 border-border' : 'bg-muted/5 border-dashed border-border/60 opacity-60'
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
                                    {(termObj.weeks ?? []).length} Weeks Configured
                                  </p>
                                  <div className="text-[10px] text-muted-foreground space-y-1 pt-1 border-t border-border/40">
                                    {(termObj.weeks ?? []).slice(0, 3).map((w: any) => (
                                      <div key={w.week} className="truncate">
                                        <span className="font-bold text-foreground">W{w.week}:</span> {w.topic || w.type}
                                      </div>
                                    ))}
                                  </div>
                                </>
                              ) : (
                                <p className="text-[10px] text-muted-foreground font-bold italic pt-2">
                                  Term content not generated yet
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
