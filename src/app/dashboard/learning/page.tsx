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
  PlayIcon,
} from '@/lib/icons';

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
    if (!authLoading && profile) loadData();
  }, [profile?.id, authLoading]);

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#050610] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-white/40 text-sm font-bold tracking-widest uppercase">Initializing Learning Center...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050610] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
        
        {/* Unified Hero Section */}
        <div className="relative overflow-hidden bg-[#0a0c1f] border border-white/5 rounded-[3rem] p-8 sm:p-14 shadow-3xl group">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-violet-600/10 blur-[150px] -mr-64 -mt-64 pointer-events-none group-hover:bg-violet-600/20 transition-all duration-1000" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-600/10 blur-[120px] -ml-48 -mb-48 pointer-events-none" />
          
          <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-12">
            <div className="space-y-6 text-center lg:text-left flex-1">
              <div className="inline-flex items-center gap-2.5 px-4 py-2 bg-violet-500/10 border border-violet-500/20 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] text-violet-400">
                <SparklesIcon className="w-4 h-4" /> Academy HQ
              </div>
              <h1 className="text-4xl sm:text-7xl font-black tracking-tighter leading-[0.9]">
                {greeting},<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-blue-400 to-cyan-400">
                  {profile?.full_name?.split(' ')[0]}!
                </span>
              </h1>
              <p className="text-lg sm:text-xl text-white/50 max-w-xl font-medium leading-relaxed">
                Your portal to mastering Robotics, AI, and Creative Technologies. 
                Everything you need to build the future is right here.
              </p>
              
              <div className="flex flex-wrap gap-4 pt-4 justify-center lg:justify-start">
                <div className="flex items-center gap-3 px-6 py-4 bg-white/[0.03] rounded-3xl border border-white/10 backdrop-blur-md shadow-2xl">
                   <FireIcon className="w-6 h-6 text-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,0.5)]" />
                   <div>
                      <p className="text-xl font-black tabular-nums leading-none">{stats.streak} DAYS</p>
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mt-1">Activity Streak</p>
                   </div>
                </div>
                <div className="flex items-center gap-3 px-6 py-4 bg-white/[0.03] rounded-3xl border border-white/10 backdrop-blur-md shadow-2xl">
                   <TrophyIcon className="w-6 h-6 text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                   <div>
                      <p className="text-xl font-black tabular-nums leading-none">{stats.xp.toLocaleString()}</p>
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mt-1">Total XP Points</p>
                   </div>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full lg:w-auto">
               <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8 text-center flex flex-col items-center justify-center min-w-[180px] shadow-2xl hover:bg-white/10 transition-all">
                  <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400 mb-4">
                     <ChartBarIcon className="w-7 h-7" />
                  </div>
                  <p className="text-4xl font-black tabular-nums">{stats.avgScore}%</p>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mt-2">Avg Proficiency</p>
               </div>
               <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8 text-center flex flex-col items-center justify-center min-w-[180px] shadow-2xl hover:bg-white/10 transition-all">
                  <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-400 mb-4">
                     <CheckBadgeIcon className="w-7 h-7" />
                  </div>
                  <p className="text-4xl font-black tabular-nums">{stats.lessonsDone}</p>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mt-2">Lessons Finished</p>
               </div>
            </div>
          </div>
        </div>

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
                    <div key={prog.id} className="group relative bg-[#0a0b18] border border-white/5 rounded-[2.5rem] p-6 hover:border-blue-500/30 transition-all shadow-xl overflow-hidden">
                       <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-blue-500/10 transition-all" />
                       
                       <div className="flex items-center gap-4 mb-6 relative z-10">
                         <div className={`w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg`}>
                            <BookOpenIcon className="w-8 h-8" />
                         </div>
                         <div className="min-w-0">
                            <h3 className="font-bold text-white group-hover:text-blue-400 transition-colors truncate">{prog.name}</h3>
                            <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">{prog.difficulty_level || 'General'} · {prog.duration_weeks || 12} Weeks</p>
                         </div>
                       </div>
                       
                       <p className="text-xs text-white/40 line-clamp-2 mb-6 font-medium leading-relaxed">
                          {prog.description || 'Master the concepts of ' + prog.name + ' through hands-on projects and expert-led sessions.'}
                       </p>
                       
                       <div className="space-y-3 relative z-10">
                          <div className="flex items-center justify-between text-[10px] font-black text-white/30 uppercase tracking-widest">
                             <span>Progress</span>
                             <span className="text-blue-400">{prog.progress_pct || 0}%</span>
                          </div>
                          <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                             <div className="h-full bg-gradient-to-r from-blue-600 to-cyan-500 rounded-full transition-all duration-1000" style={{ width: `${prog.progress_pct || 0}%` }} />
                          </div>
                       </div>
                       
                       <div className="mt-8 flex items-center justify-between relative z-10">
                          <Link href={`/dashboard/lessons?program=${prog.id}`} className="flex items-center gap-2 text-xs font-black text-white/60 hover:text-white transition-colors group/btn">
                             Open Syllabus <ArrowRightIcon className="w-3 h-3 group-hover/btn:translate-x-1 transition-transform" />
                          </Link>
                          {prog.status !== 'completed' && (
                            <Link href={`/dashboard/lessons?program=${prog.id}`} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-blue-900/40">
                              Continue
                            </Link>
                          )}
                       </div>
                    </div>
                  ))}
                  {programs.length === 0 && (
                    <div className="md:col-span-2 py-16 bg-white/[0.02] border border-dashed border-white/10 rounded-[3rem] text-center">
                       <AcademicCapIcon className="w-12 h-12 mx-auto text-white/10 mb-4" />
                       <p className="text-white/30 text-sm font-bold uppercase tracking-widest">You haven't enrolled in any programs yet.</p>
                       <Link href="/dashboard/library" className="mt-4 inline-block text-blue-400 hover:text-white text-xs font-black uppercase tracking-widest transition-colors">Browse Library →</Link>
                    </div>
                  )}
                </div>
              </section>

              {/* Featured Lessons */}
              <section className="space-y-6">
                 <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-black flex items-center gap-4">
                      <PlayCircleIcon className="w-8 h-8 text-violet-400" />
                      Featured Lessons
                    </h2>
                    <Link href="/dashboard/lessons" className="text-[10px] font-black text-violet-400 hover:text-white uppercase tracking-[0.2em] transition-colors">
                      View All Lessons →
                    </Link>
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {lessons.map(lesson => (
                      <Link key={lesson.id} href={`/dashboard/lessons/${lesson.id}`} className="group relative bg-[#0a0b18] border border-white/5 rounded-[2.5rem] p-6 hover:bg-[#101229] hover:border-violet-500/30 transition-all shadow-xl">
                         <div className="flex justify-between items-start mb-6">
                            <div className="w-12 h-12 bg-violet-600/10 border border-violet-500/20 rounded-2xl flex items-center justify-center text-violet-400 group-hover:bg-violet-600 group-hover:text-white group-hover:scale-110 transition-all duration-300 shadow-lg">
                               <PlayIcon className="w-6 h-6 ml-1" />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-widest px-3 py-1 bg-white/5 border border-white/10 rounded-full text-white/30">
                               {lesson.lesson_type || 'Lesson'}
                            </span>
                         </div>
                         <h3 className="text-lg font-bold text-white mb-2 leading-snug group-hover:text-violet-400 transition-colors">{lesson.title}</h3>
                         <div className="flex items-center gap-4 mt-6 pt-5 border-t border-white/5">
                            <div className="flex items-center gap-2">
                               <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                  <AcademicCapIcon className="w-3.5 h-3.5 text-blue-400" />
                               </div>
                               <span className="text-[10px] font-black text-white/20 uppercase tracking-widest truncate max-w-[120px]">{lesson.courses?.title}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-black text-white/30 ml-auto">
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
              <div className="bg-gradient-to-br from-violet-600/10 to-blue-600/10 border border-white/5 rounded-[3rem] p-8 shadow-3xl text-center">
                 <div className="relative w-24 h-24 mx-auto mb-6">
                    <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-blue-500 rounded-3xl rotate-6 animate-pulse opacity-50" />
                    <div className="relative w-full h-full bg-[#0a0c1f] border border-white/10 rounded-3xl flex items-center justify-center text-3xl font-black text-white shadow-2xl">
                       {profile?.full_name?.[0].toUpperCase()}
                    </div>
                 </div>
                 <h3 className="text-xl font-black text-white">{profile?.full_name}</h3>
                 <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mt-1">Academy Member · {profile?.school_name || 'Rillcod'}</p>
                 
                 <div className="grid grid-cols-2 gap-3 mt-8">
                    <div className="p-4 bg-white/5 rounded-[1.5rem] border border-white/5">
                       <p className="text-lg font-black">{stats.xp > 1000 ? (stats.xp/1000).toFixed(1) + 'k' : stats.xp}</p>
                       <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">XP</p>
                    </div>
                    <div className="p-4 bg-white/5 rounded-[1.5rem] border border-white/5">
                       <p className="text-lg font-black">{stats.lessonsDone}</p>
                       <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">Done</p>
                    </div>
                 </div>
              </div>

              {/* Dynamic Leaderborad Sidebar */}
              <div className="bg-[#0a0b18] border border-white/10 rounded-[3rem] p-8 shadow-3xl">
                 <div className="flex items-center justify-between mb-8">
                    <h3 className="font-black flex items-center gap-3">
                       <TrophyIcon className="w-6 h-6 text-amber-500" />
                       Leaderboard
                    </h3>
                    <div className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[8px] font-black uppercase tracking-widest border border-emerald-500/20 rounded-full animate-pulse">Live</div>
                 </div>
                 
                 <div className="space-y-4">
                    {leaderboard.map(member => (
                       <div key={member.name} className={`flex items-center justify-between p-4 rounded-2xl border ${member.isMe ? 'bg-violet-600/10 border-violet-500/20' : 'bg-white/[0.02] border-white/5 hover:bg-white/5'} transition-all`}>
                          <div className="flex items-center gap-3 min-w-0">
                             <div className={`w-8 h-8 rounded-lg ${member.rank===1?'bg-amber-500':member.rank===2?'bg-violet-600':'bg-slate-400'} flex items-center justify-center text-[10px] font-black text-white shadow-lg`}>
                                {member.rank}
                             </div>
                             <p className={`text-xs font-bold truncate ${member.isMe ? 'text-white' : 'text-white/60'}`}>{member.name} {member.isMe && '(You)'}</p>
                          </div>
                          <span className={`text-[10px] font-black tabular-nums ${member.rank===1?'text-amber-500':'text-white/30'}`}>{member.pts.toLocaleString()} XP</span>
                       </div>
                    ))}
                    {leaderboard.length === 0 && (
                      <p className="text-center py-4 text-xs text-white/20 italic">No rankings available yet.</p>
                    )}
                 </div>
                 
                 <Link href="/dashboard/leaderboard" className="mt-8 block py-4 text-center text-[10px] font-black text-white/20 hover:text-white uppercase tracking-widest bg-white/5 border border-white/5 rounded-2xl transition-all">
                    View Full Rankings →
                 </Link>
              </div>

              {/* Action Banner */}
              <div className="relative group bg-gradient-to-br from-[#7a0606] to-[#af0a0a] rounded-[3rem] p-8 text-center shadow-3xl overflow-hidden hover:scale-[1.02] transition-transform">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-2xl rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-1000" />
                 <BoltIcon className="w-12 h-12 text-white mx-auto mb-4 drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]" />
                 <h4 className="text-xl font-black text-white mb-2 tracking-tight">Practice Arena</h4>
                 <p className="text-xs text-white/60 mb-6 leading-relaxed font-medium">Step into the coding playground to experiment with hardware and software projects.</p>
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
