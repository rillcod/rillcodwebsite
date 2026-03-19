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
} from '@/lib/icons';
import { motion } from 'framer-motion';

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
    <div className="min-h-screen bg-[#050610] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm font-bold tracking-widest uppercase">Initializing Learning Center...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050610] text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
        
        {/* Unified Hero Section */}
        <div className="relative overflow-hidden bg-[#0a0c1f] border border-border rounded-[3rem] p-8 sm:p-14 shadow-3xl group">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-orange-600/10 blur-[150px] -mr-64 -mt-64 pointer-events-none group-hover:bg-orange-600/20 transition-all duration-1000" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-600/10 blur-[120px] -ml-48 -mb-48 pointer-events-none" />
          
          <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-12">
            <div className="space-y-6 text-center lg:text-left flex-1">
              <div className="inline-flex items-center gap-2.5 px-4 py-2 bg-orange-500/10 border border-orange-500/20 rounded-none text-[10px] font-black uppercase tracking-[0.3em] text-orange-400">
                <SparklesIcon className="w-4 h-4" /> Academy HQ
              </div>
              <h1 className="text-4xl sm:text-7xl font-black tracking-tighter leading-[0.9]">
                {greeting},<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-blue-400 from-orange-600 to-orange-400">
                  {profile?.full_name?.split(' ')[0]}!
                </span>
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground max-w-xl font-medium leading-relaxed">
                Your portal to mastering Robotics, AI, and Creative Technologies. 
                Everything you need to build the future is right here.
              </p>
              
              <div className="flex flex-wrap gap-4 pt-4 justify-center lg:justify-start">
                <div className="flex items-center gap-3 px-6 py-4 bg-white/[0.03] rounded-none border border-border backdrop-blur-md shadow-2xl">
                   <FireIcon className="w-6 h-6 text-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,0.5)]" />
                   <div>
                      <p className="text-xl font-black tabular-nums leading-none">{stats.streak} DAYS</p>
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-1">Activity Streak</p>
                   </div>
                </div>
                <div className="flex items-center gap-3 px-6 py-4 bg-white/[0.03] rounded-none border border-border backdrop-blur-md shadow-2xl">
                   <TrophyIcon className="w-6 h-6 text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                   <div>
                      <p className="text-xl font-black tabular-nums leading-none">{stats.xp.toLocaleString()}</p>
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-1">Total XP Points</p>
                   </div>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full lg:w-auto">
               <div className="bg-card shadow-sm backdrop-blur-xl border border-border rounded-[2.5rem] p-8 text-center flex flex-col items-center justify-center min-w-[180px] shadow-2xl hover:bg-muted transition-all">
                  <div className="w-12 h-12 bg-blue-500/20 rounded-none flex items-center justify-center text-blue-400 mb-4">
                     <ChartBarIcon className="w-7 h-7" />
                  </div>
                  <p className="text-4xl font-black tabular-nums">{stats.avgScore}%</p>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mt-2">Avg Proficiency</p>
               </div>
               <div className="bg-card shadow-sm backdrop-blur-xl border border-border rounded-[2.5rem] p-8 text-center flex flex-col items-center justify-center min-w-[180px] shadow-2xl hover:bg-muted transition-all">
                  <div className="w-12 h-12 bg-emerald-500/20 rounded-none flex items-center justify-center text-emerald-400 mb-4">
                     <CheckBadgeIcon className="w-7 h-7" />
                  </div>
                  <p className="text-4xl font-black tabular-nums">{stats.lessonsDone}</p>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mt-2">Lessons Finished</p>
               </div>
            </div>
          </div>
        </div>

        {/* AI Performance Insights Component */}
        <section className="bg-[#0f1128] border-2 border-indigo-500/20 rounded-[3rem] p-8 sm:p-12 overflow-hidden relative group">
          <div className="absolute -right-24 -top-24 w-64 h-64 bg-indigo-500/10 blur-[80px] rounded-full group-hover:bg-indigo-500/20 transition-all duration-700" />
          <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
            <div className="shrink-0">
               <div className="w-24 h-24 rounded-none bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-2xl relative">
                  <SparklesIcon className="w-12 h-12" />
                  <div className="absolute -bottom-2 -right-2 w-6 h-6 bg-emerald-500 rounded-full border-4 border-[#0f1128] animate-pulse" />
               </div>
            </div>
            <div className="flex-1 space-y-4 text-center md:text-left">
               <h3 className="text-2xl font-black tracking-tight text-foreground uppercase">Neural Performance Analyst</h3>
               <p className="text-muted-foreground font-medium max-w-2xl leading-relaxed">
                 Our AI engine has analyzed your recent technical activities. Click below to generate a deep-dive performance insight and tactical roadmap.
               </p>
               <div className="flex flex-wrap items-center gap-4 justify-center md:justify-start">
                  <button 
                    onClick={async () => {
                      const btn = document.getElementById('ai-insight-btn');
                      if (btn) btn.innerHTML = 'Synthesizing...';
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
                          alert(`SYSTEM INSIGHT:\n\nSTRATEGIC STRENGTHS:\n${d.data.key_strengths}\n\nROADMAP FOR ACCELERATION:\n${d.data.areas_for_growth}`);
                        }
                      } finally {
                        if (btn) btn.innerHTML = 'Generate Deep Segment Analysis';
                      }
                    }}
                    id="ai-insight-btn"
                    className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase text-[10px] tracking-[0.2em] rounded-none transition-all shadow-xl shadow-indigo-900/40"
                  >
                    Generate Deep Segment Analysis
                  </button>
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest italic">Requires Level 2 clearance</span>
               </div>
            </div>
          </div>
        </section>

        {/* Student Journey Map (Gamification 2.0) */}
        <section className="space-y-8">
          <div className="flex items-center justify-between px-4 sm:px-0">
            <h2 className="text-2xl font-black flex items-center gap-4">
              <MapPinIcon className="w-8 h-8 text-orange-500" />
              Your Academic Journey
            </h2>
            <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest hidden sm:block">
              Progress: <span className="text-orange-500">{stats.xp.toLocaleString()} XP collected</span>
            </div>
          </div>

          <div className="relative bg-[#0a0c1f] border border-border rounded-[3rem] p-8 sm:p-12 shadow-3xl overflow-hidden group">
            <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-[0.03] pointer-events-none" />
            
            <div className="relative overflow-x-auto pb-8 custom-scrollbar scroll-smooth">
              <div className="flex items-center gap-12 min-w-max px-8">
                {programs.length > 0 ? (
                  programs.slice(0, 1).map((prog) => (
                    <div key={prog.id} className="flex items-center gap-12">
                      {/* Generating nodes based on progress - using dummy nodes if real lesson order isn't mapped here yet */}
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((nodeIdx) => {
                        const progress = prog.progress_pct || 0;
                        const nodeProgress = nodeIdx * 12.5; 
                        const isCompleted = progress >= nodeProgress;
                        const isActive = progress < nodeProgress && progress >= (nodeProgress - 12.5);
                        
                        return (
                          <div key={nodeIdx} className="flex items-center">
                            {/* Path Segment */}
                            {nodeIdx > 1 && (
                              <div className={`h-1 w-20 sm:w-32 transition-colors duration-1000 ${isCompleted ? 'bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.4)]' : 'bg-white/10'}`} />
                            )}
                            
                            {/* Journey Node */}
                            <motion.div 
                              whileHover={{ scale: 1.1, y: -5 }}
                              className="relative flex flex-col items-center"
                            >
                              <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-none flex items-center justify-center border-2 transition-all duration-500 z-10 ${
                                isCompleted ? 'bg-orange-500 border-orange-400 text-foreground shadow-[0_0_20px_rgba(249,115,22,0.5)]' :
                                isActive ? 'bg-[#161628] border-orange-500 text-orange-500 animate-pulse shadow-[0_0_15px_orange]' :
                                'bg-[#161628] border-border text-muted-foreground grayscale opacity-40'
                              }`}>
                                {isCompleted ? <CheckBadgeIcon className="w-8 h-8" /> : 
                                 isActive ? <RocketLaunchIcon className="w-8 h-8" /> : 
                                 <LockClosedIcon className="w-6 h-6" />}
                                
                                {isActive && (
                                  <div className="absolute -top-12 bg-orange-600 text-white text-[9px] font-black uppercase px-3 py-1.5 rounded-none shadow-xl whitespace-nowrap">
                                    Current Sector
                                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-orange-600 rotate-45" />
                                  </div>
                                )}
                              </div>
                              
                              <div className="mt-4 text-center">
                                <p className={`text-[10px] font-black uppercase tracking-widest ${isActive ? 'text-orange-400' : 'text-muted-foreground'}`}>
                                  Phase {nodeIdx}
                                </p>
                                <p className={`text-[8px] font-bold uppercase tracking-tighter opacity-50 ${isCompleted ? 'text-orange-500' : 'text-muted-foreground'}`}>
                                  {isCompleted ? 'Completed' : isActive ? 'Active Now' : 'Classified'}
                                </p>
                              </div>
                            </motion.div>
                          </div>
                        );
                      })}
                    </div>
                  ))
                ) : (
                  <div className="flex-1 text-center py-10 opacity-50 italic text-sm">
                    Enroll in a program to see your journey map.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-6 pt-8 border-t border-white/5">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-orange-500 shadow-[0_0_8px_orange]" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Operational</span>
                </div>
                <div className="flex items-center gap-2">
                   <div className="w-3 h-3 bg-card shadow-sm border border-white/10" />
                   <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Locked Data</span>
                </div>
              </div>
              <button 
                onClick={() => window.scrollTo({ top: 800, behavior: 'smooth' })}
                className="px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-none text-[9px] font-black uppercase tracking-[0.2em] transition-all"
              >
                Sync Next Objective
              </button>
            </div>
          </div>
        </section>

        {/* Learning Content Sections */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
           
           <div className="xl:col-span-2 space-y-12">
              
              {/* Programs: The "My Courses" replacement */}
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-black flex items-center gap-4">
                    <AcademicCapIcon className="w-8 h-8 text-blue-400" />
                    Enrolled Programs
                  </h2>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {programs.map((prog, i) => (
                    <div key={prog.id} className="group relative bg-[#0a0b18] border border-border rounded-[2.5rem] p-6 hover:border-blue-500/30 transition-all shadow-xl overflow-hidden">
                       <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-blue-500/10 transition-all" />
                       
                       <div className="flex items-center gap-4 mb-6 relative z-10">
                         <div className={`w-14 h-14 bg-gradient-to-br from-orange-600 to-orange-400 to-indigo-600 rounded-none flex items-center justify-center text-foreground shadow-lg`}>
                            <BookOpenIcon className="w-8 h-8" />
                         </div>
                         <div className="min-w-0">
                            <h3 className="font-bold text-foreground group-hover:text-blue-400 transition-colors truncate">{prog.name}</h3>
                            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{prog.difficulty_level || 'General'} · {prog.duration_weeks || 12} Weeks</p>
                         </div>
                       </div>
                       
                       <p className="text-xs text-muted-foreground line-clamp-2 mb-6 font-medium leading-relaxed">
                          {prog.description || 'Master the concepts of ' + prog.name + ' through hands-on projects and expert-led sessions.'}
                       </p>
                       
                       <div className="space-y-3 relative z-10">
                          <div className="flex items-center justify-between text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                             <span>Progress</span>
                             <span className="text-blue-400">{prog.progress_pct || 0}%</span>
                          </div>
                          <div className="h-2 w-full bg-card shadow-sm rounded-full overflow-hidden">
                             <div className="h-full bg-gradient-to-r from-orange-600 to-orange-400 from-orange-600 to-orange-400 rounded-full transition-all duration-1000" style={{ width: `${prog.progress_pct || 0}%` }} />
                          </div>
                       </div>
                       
                       <div className="mt-8 flex items-center justify-between relative z-10">
                          <Link href={`/dashboard/lessons?program=${prog.id}`} className="flex items-center gap-2 text-xs font-black text-muted-foreground hover:text-foreground transition-colors group/btn">
                             Open Syllabus <ArrowRightIcon className="w-3 h-3 group-hover/btn:translate-x-1 transition-transform" />
                          </Link>
                          {prog.status !== 'completed' && (
                            <Link href={`/dashboard/lessons?program=${prog.id}`} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-foreground text-[10px] font-black uppercase tracking-widest rounded-none transition-all shadow-lg shadow-blue-900/40">
                              Continue
                            </Link>
                          )}
                       </div>
                    </div>
                  ))}
                  {programs.length === 0 && (
                    <div className="md:col-span-2 py-16 bg-white/[0.02] border border-dashed border-border rounded-[3rem] text-center">
                       <AcademicCapIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                       <p className="text-muted-foreground text-sm font-bold uppercase tracking-widest">You haven't enrolled in any programs yet.</p>
                       <Link href="/dashboard/library" className="mt-4 inline-block text-blue-400 hover:text-foreground text-xs font-black uppercase tracking-widest transition-colors">Browse Library →</Link>
                    </div>
                  )}
                </div>
              </section>

              {/* Featured Lessons */}
              <section className="space-y-6">
                 <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-black flex items-center gap-4">
                      <PlayCircleIcon className="w-8 h-8 text-orange-400" />
                      Featured Lessons
                    </h2>
                    <Link href="/dashboard/lessons" className="text-[10px] font-black text-orange-400 hover:text-foreground uppercase tracking-[0.2em] transition-colors">
                      View All Lessons →
                    </Link>
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {lessons.map(lesson => (
                      <Link key={lesson.id} href={`/dashboard/lessons/${lesson.id}`} className="group relative bg-[#0a0b18] border border-border rounded-[2.5rem] p-6 hover:bg-[#101229] hover:border-orange-500/30 transition-all shadow-xl">
                         <div className="flex justify-between items-start mb-6">
                            <div className="w-12 h-12 bg-orange-600/10 border border-orange-500/20 rounded-none flex items-center justify-center text-orange-400 group-hover:bg-orange-600 group-hover:text-foreground group-hover:scale-110 transition-all duration-300 shadow-lg">
                               <PlayIcon className="w-6 h-6 ml-1" />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-widest px-3 py-1 bg-card shadow-sm border border-border rounded-full text-muted-foreground">
                               {lesson.lesson_type || 'Lesson'}
                            </span>
                         </div>
                         <h3 className="text-lg font-bold text-foreground mb-2 leading-snug group-hover:text-orange-400 transition-colors">{lesson.title}</h3>
                         <div className="flex items-center gap-4 mt-6 pt-5 border-t border-border">
                            <div className="flex items-center gap-2">
                               <div className="w-6 h-6 rounded-none bg-blue-500/10 flex items-center justify-center">
                                  <AcademicCapIcon className="w-3.5 h-3.5 text-blue-400" />
                               </div>
                               <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest truncate max-w-[120px]">{lesson.courses?.title}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-black text-muted-foreground ml-auto">
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
