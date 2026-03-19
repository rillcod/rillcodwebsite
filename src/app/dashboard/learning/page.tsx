// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
  RocketLaunchIcon, BookOpenIcon, ClockIcon,
  AcademicCapIcon, PlayCircleIcon, CheckBadgeIcon,
  SparklesIcon, ArrowRightIcon, TrophyIcon,
  FireIcon, BoltIcon, ChartBarIcon, StarIcon,
  PlayIcon, MapPinIcon, LockClosedIcon,
  ShieldCheckIcon,
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import CodeVisualizer, { CodeData, VisualizationType } from '@/components/visualizer/CodeVisualizer';

const GREETINGS = ['Welcome back', 'Keep it up', 'Ready to study?', 'Looking sharp', 'Innovate today'];

export default function StudentLearningPage() {
  const { profile, loading: authLoading } = useAuth();
  const [lessons, setLessons] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [stats, setStats] = useState({
    avgScore: 0,
    lessonsDone: 0,
    streak: 0,
    xp: 0
  });
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiInsight, setAiInsight] = useState<{strengths: string, growth: string} | null>(null);
  const [generatingInsight, setGeneratingInsight] = useState(false);
  const [nextLesson, setNextLesson] = useState<any>(null);
  
  // Visual Insight State
  const [visualStep, setVisualStep] = useState(0);
  const [visualType] = useState<VisualizationType>('sorting');
  const visualData: CodeData = {
    step: visualStep,
    totalSteps: 10,
    variables: { i: visualStep, comparison: 'Active' },
    visualizationState: {
      array: [24, 12, 5, 42, 1, 9, 33, 15],
      comparing: [visualStep % 8, (visualStep + 1) % 8]
    }
  };
  
  const [greeting] = useState(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);

  async function loadData() {
    if (!profile) return;
    setLoading(true);
    const db = createClient();
    
    try {
      // 1. Fetch Enrollments & Programs
      const { data: enr } = await db.from('enrollments')
        .select('*, programs(*)')
        .eq('user_id', profile.id);
      
      const enrolledPrograms = enr?.map(e => ({
        ...(e.programs as any || {}),
        progress_pct: e.progress_pct || 0,
        enrollment_date: e.enrollment_date,
        status: e.status
      })) || [];
      setPrograms(enrolledPrograms);

      const pIds = enrolledPrograms.map(p => p.id);

      // 2. Fetch Real Stats
      const [pointsRes, progressRes, subsRes] = await Promise.all([
        db.from('user_points').select('*').eq('portal_user_id', profile.id).maybeSingle(),
        db.from('lesson_progress').select('id', { count: 'exact' }).eq('portal_user_id', profile.id).eq('status', 'completed'),
        db.from('assignment_submissions').select('grade, assignments(max_points)').eq('portal_user_id', profile.id).not('grade', 'is', null)
      ]);

      const avgScore = subsRes.data?.length 
        ? Math.round(subsRes.data.reduce((s, sub: any) => s + (sub.grade / (sub.assignments?.max_points || 100)) * 100, 0) / subsRes.data.length)
        : 0;

      setStats({
        avgScore,
        lessonsDone: progressRes.count || 0,
        streak: pointsRes.data?.current_streak || 0,
        xp: pointsRes.data?.total_points || 0
      });

      // 3. Fetch Featured Lessons
      if (pIds.length) {
        // First find courses in these programs
        const { data: courses } = await db.from('courses').select('id').in('program_id', pIds);
        const cIds = courses?.map(c => c.id) || [];
        
        if (cIds.length) {
          const { data } = await db.from('lessons')
            .select('*, courses(title)')
            .in('course_id', cIds)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(6);
          setLessons(data || []);
        }
      }

      // 4. Fetch Leaderboard
      const { data: lpRes } = await db
        .from('user_points')
        .select('portal_user_id, total_points, achievement_level, portal_users(full_name)')
        .order('total_points', { ascending: false })
        .limit(3);
      
      setLeaderboard((lpRes ?? []).map((item: any, idx: number) => ({
        rank: idx + 1,
        name: item.portal_users?.full_name || 'Anonymous',
        pts: item.total_points,
        level: item.achievement_level,
        isMe: item.portal_user_id === profile.id
      })));

      // 5. Logic: Determine Next Objective
      if (pIds.length) {
        // Find first incomplete lesson for current program
        const { data: firstProgramLessons } = await db
          .from('lessons')
          .select('id, title, course_id')
          .in('course_id', 
            (await db.from('courses').select('id').eq('program_id', pIds[0])).data?.map(c => c.id) || []
          )
          .order('id', { ascending: true });
        
        const { data: completedIds } = await db
          .from('lesson_progress')
          .select('lesson_id')
          .eq('portal_user_id', profile.id)
          .eq('status', 'completed');
        
        const doneSet = new Set(completedIds?.map(c => c.lesson_id));
        const next = firstProgramLessons?.find(l => !doneSet.has(l.id));
        setNextLesson(next || firstProgramLessons?.[0]);
      }

    } catch (err) {
      console.error('Error loading learning data:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading && profile) {
      loadData();

      // Enable Realtime Synchronization
      const db = createClient();
      const channel = db.channel(`user-stats-${profile.id}`)
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'user_points',
          filter: `portal_user_id=eq.${profile.id}`
        }, (payload: any) => {
          if (payload.new) {
            setStats(prev => ({
              ...prev,
              xp: payload.new.total_points,
              streak: payload.new.current_streak
            }));
          }
        })
        .subscribe();
      
      return () => {
        db.removeChannel(channel);
      };
    }
  }, [profile?.id, authLoading]);

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <div className="w-12 h-12 border-4 border-orange-600 border-t-transparent animate-spin" />
        <p className="text-white/30 text-[10px] font-black tracking-[0.4em] uppercase">Initializing Learning Center</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white selection:bg-orange-600/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Unified Hero Section */}
        <div className="relative overflow-hidden bg-[#0d0d0d] border border-white/5 p-8 sm:p-14 group">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-orange-600/5 blur-[150px] -mr-64 -mt-64 pointer-events-none group-hover:bg-orange-600/8 transition-all duration-1000" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-600/5 blur-[120px] -ml-48 -mb-48 pointer-events-none" />
          
          <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-12">
            <div className="space-y-6 text-center lg:text-left flex-1">
              <div className="inline-flex items-center gap-2.5 px-4 py-2 bg-orange-600/10 border border-orange-600/20 text-[9px] font-black uppercase tracking-[0.4em] text-orange-500">
                <SparklesIcon className="w-4 h-4" /> Sector: Academy HQ
              </div>
              <h1 className="text-4xl sm:text-7xl font-black tracking-tighter leading-[0.9] italic">
                {greeting},<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500">
                  {profile?.full_name?.split(' ')[0]}!
                </span>
              </h1>
              <p className="text-sm sm:text-base text-white/30 max-w-xl font-medium leading-relaxed">
                Your portal to mastering Robotics, AI, and Creative Technologies. 
                Everything you need to build the future is right here in the vault.
              </p>
              
              <div className="flex flex-wrap gap-4 pt-4 justify-center lg:justify-start">
                <div className="flex items-center gap-4 px-6 py-4 bg-white/[0.02] border border-white/5 backdrop-blur-md">
                   <FireIcon className="w-6 h-6 text-orange-600" />
                   <div>
                      <p className="text-2xl font-black tabular-nums leading-none">{stats.streak} DAYS</p>
                      <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mt-1">Activity Streak</p>
                   </div>
                </div>
                <div className="flex items-center gap-4 px-6 py-4 bg-white/[0.02] border border-white/5 backdrop-blur-md">
                   <TrophyIcon className="w-6 h-6 text-amber-500" />
                   <div>
                      <p className="text-2xl font-black tabular-nums leading-none">{stats.xp.toLocaleString()}</p>
                      <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mt-1">Performance XP</p>
                   </div>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full lg:w-auto">
               <div className="bg-[#0a0a0a] border border-white/10 p-8 text-center flex flex-col items-center justify-center min-w-[200px] group/card hover:border-blue-500/30 transition-all">
                  <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-4 transition-transform group-hover/card:scale-110">
                     <ChartBarIcon className="w-7 h-7" />
                  </div>
                  <p className="text-4xl font-black tabular-nums">{stats.avgScore}%</p>
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/20 mt-2">Avg Proficiency</p>
               </div>
               <div className="bg-[#0a0a0a] border border-white/10 p-8 text-center flex flex-col items-center justify-center min-w-[200px] group/card hover:border-emerald-500/30 transition-all">
                  <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 transition-transform group-hover/card:scale-110">
                     <CheckBadgeIcon className="w-7 h-7" />
                  </div>
                  <p className="text-4xl font-black tabular-nums">{stats.lessonsDone}</p>
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/20 mt-2">Lessons Finished</p>
               </div>
            </div>
          </div>
        </div>

        {/* AI Performance Insights Component */}
        <section className="bg-indigo-600/5 border border-indigo-500/20 p-8 sm:p-12 overflow-hidden relative group">
          <div className="absolute -right-24 -top-24 w-64 h-64 bg-indigo-500/10 blur-[80px] rounded-full group-hover:bg-indigo-500/20 transition-all duration-700" />
          <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
            <div className="shrink-0">
               <div className="w-20 h-20 bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 relative">
                  <SparklesIcon className="w-10 h-10" />
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
               </div>
            </div>
            <div className="flex-1 space-y-4 text-center md:text-left">
               <div className="flex flex-col gap-1">
                 <p className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.4em]">Neural Analyst Interface</p>
                 <h3 className="text-2xl font-black tracking-tight text-white uppercase italic">Strategic Insights</h3>
               </div>
               <p className="text-sm text-white/30 font-medium max-w-2xl leading-relaxed">
                 Our AI engine has analyzed your recent technical activities in the vault. 
                 Synthesize a real-time performance audit and tactical roadmap for your next objective.
               </p>
               <div className="flex flex-wrap items-center gap-4 justify-center md:justify-start pt-2">
                  <button 
                    disabled={generatingInsight}
                    onClick={async () => {
                      setGeneratingInsight(true);
                      try {
                        const res = await fetch('/api/ai/generate', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            type: 'report-feedback',
                            studentName: profile?.full_name,
                            topic: programs[0]?.name || 'STEM Curriculum',
                            attendance: 'Stable',
                            assignments: `${stats.lessonsDone} Labs Synced`
                          })
                        });
                        const d = await res.json();
                        if (d.data) {
                          setAiInsight({
                            strengths: d.data.key_strengths,
                            growth: d.data.areas_for_growth
                          });
                        }
                      } finally {
                        setGeneratingInsight(false);
                      }
                    }}
                    className="px-8 py-4 bg-indigo-600 disabled:bg-indigo-900/50 hover:bg-indigo-500 text-white font-black uppercase text-[10px] tracking-[0.2em] transition-all"
                  >
                    {generatingInsight ? 'Synthesizing Neural Data...' : 'Initiate Segment Analysis'}
                  </button>
                  <span className="text-[9px] font-black text-white/10 uppercase tracking-widest italic flex items-center gap-2">
                    <ShieldCheckIcon className="w-3.5 h-3.5" /> Security Clearance Level 2
                  </span>
               </div>

               {aiInsight && (
                 <motion.div 
                   initial={{ opacity: 0, y: 10 }}
                   animate={{ opacity: 1, y: 0 }}
                   className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6 p-6 bg-[#0a0a0a] border border-white/5"
                 >
                   <div>
                     <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mb-2">Strengths</p>
                     <p className="text-xs text-white/60 leading-relaxed italic">"{aiInsight.strengths}"</p>
                   </div>
                   <div>
                     <p className="text-[8px] font-black text-orange-500 uppercase tracking-widest mb-2">Roadmap</p>
                     <p className="text-xs text-white/60 leading-relaxed italic">"{aiInsight.growth}"</p>
                   </div>
                 </motion.div>
               )}
            </div>
          </div>
        </section>

        {/* Student Journey Map (Gamification 2.0) */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <p className="text-[9px] font-black text-orange-500 uppercase tracking-[0.4em]">Phase Tracking</p>
              <h2 className="text-2xl font-black flex items-center gap-4 uppercase italic">
                Journey Map
              </h2>
            </div>
            <div className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] hidden sm:block">
              Progress: <span className="text-orange-500">{stats.xp.toLocaleString()} XP collected</span>
            </div>
          </div>

          <div className="relative bg-[#0d0d0d] border border-white/5 p-8 sm:p-12 overflow-hidden group">
            <div className="absolute inset-0 bg-[url(/images/grid.svg)] bg-center opacity-[0.02] pointer-events-none" />
            
            <div className="relative overflow-x-auto pb-8 custom-scrollbar scroll-smooth">
              <div className="flex items-center gap-12 min-w-max px-8">
                {programs.length > 0 ? (
                  programs.slice(0, 1).map((prog) => (
                    <div key={prog.id} className="flex items-center gap-12">
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((nodeIdx) => {
                        const progress = prog.progress_pct || 0;
                        const nodeProgress = nodeIdx * 12.5; 
                        const isCompleted = progress >= nodeProgress;
                        const isActive = progress < nodeProgress && progress >= (nodeProgress - 12.5);
                        
                        return (
                          <div key={nodeIdx} className="flex items-center">
                            {nodeIdx > 1 && (
                              <div className={`h-0.5 w-20 sm:w-32 transition-colors duration-1000 ${isCompleted ? 'bg-orange-600 shadow-[0_0_15px_rgba(234,88,12,0.3)]' : 'bg-white/5'}`} />
                            )}
                            
                            <motion.div 
                              whileHover={{ scale: 1.05, y: -2 }}
                              className="relative flex flex-col items-center"
                            >
                              <div className={`w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center border transition-all duration-500 z-10 ${
                                isCompleted ? 'bg-orange-600 border-orange-500 text-white shadow-lg shadow-orange-600/20' :
                                isActive ? 'bg-orange-600/10 border-orange-600 text-orange-500 animate-pulse' :
                                'bg-white/5 border-white/10 text-white/10 grayscale'
                              }`}>
                                {isCompleted ? <CheckBadgeIcon className="w-8 h-8" /> : 
                                 isActive ? <RocketLaunchIcon className="w-8 h-8" /> : 
                                 <LockClosedIcon className="w-5 h-5" />}
                                
                                {isActive && (
                                  <div className="absolute -top-12 bg-orange-600 text-white text-[8px] font-black uppercase px-3 py-1.5 shadow-xl whitespace-nowrap tracking-widest">
                                    Current Sector
                                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-orange-600 rotate-45" />
                                  </div>
                                )}
                              </div>
                              
                              <div className="mt-4 text-center">
                                <p className={`text-[9px] font-black uppercase tracking-[0.2em] ${isActive ? 'text-orange-500' : 'text-white/20'}`}>
                                  Phase {nodeIdx}
                                </p>
                              </div>
                            </motion.div>
                          </div>
                        );
                      })}
                    </div>
                  ))
                ) : (
                  <div className="flex-1 text-center py-10 opacity-20 text-[10px] uppercase font-black tracking-widest">
                    No active journey data available.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-6 pt-8 border-t border-white/5">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-orange-600" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Active Link</span>
                </div>
                <div className="flex items-center gap-2">
                   <div className="w-2 h-2 bg-white/5 border border-white/10" />
                   <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Encrypted Sector</span>
                </div>
              </div>
              <Link 
                href={nextLesson ? `/dashboard/lessons/${nextLesson.id}` : '/dashboard/lessons'}
                className="px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black uppercase tracking-[0.25em] transition-all"
              >
                {nextLesson ? `Sync: ${nextLesson.title}` : 'Sync Next Objective'}
              </Link>
            </div>
          </div>
        </section>

        {/* Visual Intelligence Matrix Section */}
        <section className="space-y-6">
          <div className="flex flex-col gap-1">
             <p className="text-[9px] font-black text-cyan-500 uppercase tracking-[0.4em]">Visual Intelligence Matrix</p>
             <h2 className="text-2xl font-black uppercase italic">Neural Insight: Array Sorter</h2>
          </div>
          <div className="bg-[#0d0d0d] border border-white/5 overflow-hidden">
             <CodeVisualizer 
                visualizationType={visualType}
                codeData={visualData}
                onStepChange={setVisualStep}
                className="border-none shadow-none"
             />
          </div>
        </section>

        {/* Learning Content Sections */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
           
           <div className="xl:col-span-2 space-y-12">
              
              {/* Programs: The "My Courses" replacement */}
              <section className="space-y-6">
                <div className="flex flex-col gap-1">
                  <p className="text-[9px] font-black text-blue-500 uppercase tracking-[0.4em]">Core Curriculum</p>
                  <h2 className="text-2xl font-black uppercase italic">
                    Enrolled Programs
                  </h2>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {programs.map((prog) => (
                    <div key={prog.id} className="group relative bg-[#0d0d0d] border border-white/5 p-6 hover:border-blue-500/30 transition-all overflow-hidden">
                       <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-blue-500/10 transition-all" />
                       
                       <div className="flex items-center gap-4 mb-6 relative z-10">
                         <div className="w-12 h-12 bg-gradient-to-br from-orange-600 to-orange-400 flex items-center justify-center text-white shadow-lg">
                            <BookOpenIcon className="w-6 h-6" />
                         </div>
                         <div className="min-w-0">
                            <h3 className="text-sm font-black text-white group-hover:text-blue-500 transition-colors truncate uppercase tracking-tight">{prog.name}</h3>
                            <p className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">{prog.difficulty_level || 'General'} · {prog.duration_weeks || 12} Weeks</p>
                         </div>
                       </div>
                       
                       <p className="text-[11px] text-white/30 line-clamp-2 mb-6 font-medium leading-relaxed">
                          {prog.description || 'Master the concepts of ' + prog.name + ' through hands-on projects and expert-led sessions.'}
                       </p>
                       
                       <div className="space-y-2 relative z-10">
                          <div className="flex items-center justify-between text-[9px] font-black text-white/20 uppercase tracking-widest">
                             <span>Sector Progress</span>
                             <span className="text-blue-500">{prog.progress_pct || 0}%</span>
                          </div>
                          <div className="h-1 w-full bg-white/5 overflow-hidden">
                             <div className="h-full bg-gradient-to-r from-orange-600 to-orange-400 transition-all duration-1000" style={{ width: `${prog.progress_pct || 0}%` }} />
                          </div>
                       </div>
                       
                       <div className="mt-8 flex items-center justify-between relative z-10 pt-4 border-t border-white/5">
                          <Link href={`/dashboard/lessons?program=${prog.id}`} className="flex items-center gap-2 text-[9px] font-black text-white/20 hover:text-white transition-colors group/btn uppercase tracking-widest">
                             Syllabus <ArrowRightIcon className="w-3 h-3 group-hover/btn:translate-x-1 transition-transform" />
                          </Link>
                          {prog.status !== 'completed' && (
                            <Link href={`/dashboard/lessons?program=${prog.id}`} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-[9px] font-black uppercase tracking-[0.2em] transition-all">
                              Continue
                            </Link>
                          )}
                       </div>
                    </div>
                  ))}
                  {programs.length === 0 && (
                    <div className="md:col-span-2 py-16 bg-white/[0.01] border border-dashed border-white/10 text-center">
                       <AcademicCapIcon className="w-10 h-10 mx-auto text-white/10 mb-4" />
                       <p className="text-white/20 text-[10px] font-black uppercase tracking-[0.3em]">No Active Enrollments</p>
                       <Link href="/dashboard/library" className="mt-4 inline-block text-blue-500 hover:text-white text-[9px] font-black uppercase tracking-widest transition-colors">Access Library Data →</Link>
                    </div>
                  )}
                </div>
              </section>

              {/* Featured Lessons */}
              <section className="space-y-6">
                 <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <p className="text-[9px] font-black text-orange-500 uppercase tracking-[0.4em]">Recent Uplinks</p>
                      <h2 className="text-2xl font-black uppercase italic">
                        Featured Lessons
                      </h2>
                    </div>
                    <Link href="/dashboard/lessons" className="text-[9px] font-black text-orange-500 hover:text-white uppercase tracking-[0.2em] transition-colors">
                      All Lessons →
                    </Link>
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {lessons.map(lesson => (
                      <Link key={lesson.id} href={`/dashboard/lessons/${lesson.id}`} className="group relative bg-[#0d0d0d] border border-white/5 p-6 hover:border-orange-500/30 transition-all">
                         <div className="flex justify-between items-start mb-6">
                            <div className="w-10 h-10 bg-orange-600/10 border border-orange-600/20 flex items-center justify-center text-orange-500 group-hover:bg-orange-600 group-hover:text-white transition-all duration-300">
                               <PlayIcon className="w-5 h-5 ml-0.5" />
                            </div>
                            <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 border border-white/10 text-white/30">
                               {lesson.lesson_type || 'Lesson'}
                            </span>
                         </div>
                         <h3 className="text-base font-black text-white mb-2 leading-tight group-hover:text-orange-500 transition-colors uppercase tracking-tight">{lesson.title}</h3>
                         <div className="flex items-center gap-4 mt-6 pt-4 border-t border-white/5">
                            <div className="flex items-center gap-2">
                               <AcademicCapIcon className="w-3.5 h-3.5 text-blue-400" />
                               <span className="text-[9px] font-black text-white/20 uppercase tracking-widest truncate max-w-[120px]">{lesson.courses?.title}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[9px] font-black text-white/20 ml-auto uppercase">
                               <ClockIcon className="w-3.5 h-3.5" /> {lesson.duration_minutes || '45'}M
                            </div>
                         </div>
                      </Link>
                    ))}
                 </div>
              </section>
           </div>

           {/* Dashboard Sidebar: Leaderboard & Progress Hub */}
           <div className="space-y-10">
              
              {/* Profile Overview */}
              <div className="bg-gradient-to-br from-orange-600/10 from-orange-600 to-orange-400/10 border border-border rounded-[3rem] p-8 shadow-3xl text-center">
                 <div className="relative w-24 h-24 mx-auto mb-6">
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-500 from-orange-600 to-orange-400 rounded-none rotate-6 animate-pulse opacity-50" />
                    <div className="relative w-full h-full bg-[#0a0c1f] border border-border rounded-none flex items-center justify-center text-3xl font-black text-foreground shadow-2xl">
                       {profile?.full_name?.[0].toUpperCase()}
                    </div>
                 </div>
                 <h3 className="text-xl font-black text-foreground">{profile?.full_name}</h3>
                 <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-1">Academy Member · {profile?.school_name || 'Rillcod'}</p>
                 
                 <div className="grid grid-cols-2 gap-3 mt-8">
                    <div className="p-4 bg-card shadow-sm rounded-[1.5rem] border border-border">
                       <p className="text-lg font-black">{stats.xp > 1000 ? (stats.xp/1000).toFixed(1) + 'k' : stats.xp}</p>
                       <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">XP</p>
                    </div>
                    <div className="p-4 bg-card shadow-sm rounded-[1.5rem] border border-border">
                       <p className="text-lg font-black">{stats.lessonsDone}</p>
                       <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Done</p>
                    </div>
                 </div>
              </div>

              {/* Dynamic Leaderborad Sidebar */}
              <div className="bg-[#0a0b18] border border-border rounded-[3rem] p-8 shadow-3xl">
                 <div className="flex items-center justify-between mb-8">
                    <h3 className="font-black flex items-center gap-3">
                       <TrophyIcon className="w-6 h-6 text-amber-500" />
                       Leaderboard
                    </h3>
                    <div className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[8px] font-black uppercase tracking-widest border border-emerald-500/20 rounded-full animate-pulse">Live</div>
                 </div>
                 
                 <div className="space-y-4">
                    {leaderboard.map(member => (
                       <div key={member.name} className={`flex items-center justify-between p-4 rounded-none border ${member.isMe ? 'bg-orange-600/10 border-orange-500/20' : 'bg-white/[0.02] border-border hover:bg-card shadow-sm'} transition-all`}>
                          <div className="flex items-center gap-3 min-w-0">
                             <div className={`w-8 h-8 rounded-none ${member.rank===1?'bg-amber-500':member.rank===2?'bg-orange-600':'bg-slate-400'} flex items-center justify-center text-[10px] font-black text-foreground shadow-lg`}>
                                {member.rank}
                             </div>
                             <p className={`text-xs font-bold truncate ${member.isMe ? 'text-foreground' : 'text-muted-foreground'}`}>{member.name} {member.isMe && '(You)'}</p>
                          </div>
                          <span className={`text-[10px] font-black tabular-nums ${member.rank===1?'text-amber-500':'text-muted-foreground'}`}>{member.pts.toLocaleString()} XP</span>
                       </div>
                    ))}
                    {leaderboard.length === 0 && (
                      <p className="text-center py-4 text-xs text-muted-foreground italic">No rankings available yet.</p>
                    )}
                 </div>
                 
                 <Link href="/dashboard/leaderboard" className="mt-8 block py-4 text-center text-[10px] font-black text-muted-foreground hover:text-foreground uppercase tracking-widest bg-card shadow-sm border border-border rounded-none transition-all">
                    View Full Rankings →
                 </Link>
              </div>

              {/* Action Banner */}
              <div className="relative group bg-gradient-to-br from-[#7a0606] to-[#af0a0a] rounded-[3rem] p-8 text-center shadow-3xl overflow-hidden hover:scale-[1.02] transition-transform">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-muted blur-2xl rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-1000" />
                 <BoltIcon className="w-12 h-12 text-foreground mx-auto mb-4 drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]" />
                 <h4 className="text-xl font-black text-foreground mb-2 tracking-tight">Practice Arena</h4>
                 <p className="text-xs text-muted-foreground mb-6 leading-relaxed font-medium">Step into the coding playground to experiment with hardware and software projects.</p>
                 <Link href="/dashboard/playground" className="block w-full py-4 bg-white text-[#7a0606] font-black rounded-[1.5rem] text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95">
                    Launch Playground
                 </Link>
              </div>
           </div>

        </div>

      </div>
    </div>
  );
}
