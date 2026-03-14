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
  FireIcon, BoltIcon,
} from '@heroicons/react/24/outline';

const GREETINGS = ['Welcome back', 'Keep it up', 'Ready to study?', 'Looking sharp'];

export default function StudentLearningPage() {
  const { profile, loading: authLoading } = useAuth();
  const [lessons, setLessons] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];

  async function loadData() {
    if (!profile) return;
    setLoading(true);
    const db = createClient();
    
    // 1. Get enrollments and courses
    const { data: enr } = await db.from('enrollments').select('program_id').eq('user_id', profile.id);
    const pIds = enr?.map(e => e.program_id) || [];
    
    let cData: any[] = [];
    if (pIds.length) {
      const { data } = await db.from('courses').select('*, programs(name)').in('program_id', pIds);
      cData = data || [];
    }
    setCourses(cData);

    // 2. Get recent lessons for these courses
    const cIds = cData.map(c => c.id);
    if (cIds.length) {
      const { data } = await db.from('lessons')
        .select('*, courses(title)')
        .in('course_id', cIds)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(6);
      setLessons(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!authLoading && profile) loadData();
  }, [profile?.id, authLoading]);

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        
        {/* Welcome Hero */}
        <div className="relative overflow-hidden bg-gradient-to-br from-violet-600 to-blue-700 rounded-[2.5rem] p-8 sm:p-12 shadow-2xl shadow-violet-900/20">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <RocketLaunchIcon className="w-64 h-64 -rotate-12" />
          </div>
          <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-8 text-center sm:text-left">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full text-xs font-black uppercase tracking-widest text-white/90">
                <SparklesIcon className="w-4 h-4" /> Student Portal
              </div>
              <h1 className="text-4xl sm:text-5xl font-black">{greeting}, {profile?.full_name?.split(' ')[0]}!</h1>
              <p className="text-lg text-white/70 max-w-lg font-medium">Continue your journey in mastering AI, Robotics, and Animation. You have {lessons.length} lessons available today.</p>
              <div className="flex flex-wrap gap-4 pt-4 justify-center sm:justify-start">
                <Link href="/dashboard/courses" className="px-6 py-3 bg-white text-violet-700 font-black rounded-2xl hover:scale-105 transition-all shadow-xl shadow-black/20">
                  My Courses
                </Link>
                <div className="flex items-center gap-3 px-5 py-3 bg-black/20 rounded-2xl border border-white/10 backdrop-blur-md">
                   <FireIcon className="w-5 h-5 text-orange-400" />
                   <span className="font-bold">5 Day Streak</span>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
               <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6 text-center">
                  <p className="text-3xl font-black">84%</p>
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Avg Score</p>
               </div>
               <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6 text-center">
                  <p className="text-3xl font-black">12</p>
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Lessons Done</p>
               </div>
            </div>
          </div>
        </div>

        {/* Continue Learning */}
        <div className="space-y-5">
           <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black flex items-center gap-3">
                <BookOpenIcon className="w-7 h-7 text-violet-400" />
                Featured Lessons
              </h2>
              <Link href="/dashboard/lessons" className="text-sm font-bold text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1">
                View All <ArrowRightIcon className="w-4 h-4" />
              </Link>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {lessons.map(lesson => (
                <Link key={lesson.id} href={`/dashboard/lessons/${lesson.id}`} className="group relative bg-[#161625] border border-white/5 rounded-3xl p-6 hover:bg-[#1a1a2e] hover:border-violet-500/30 transition-all shadow-lg hover:shadow-violet-900/10">
                   <div className="flex justify-between items-start mb-6">
                      <div className="w-12 h-12 bg-violet-600/10 rounded-2xl flex items-center justify-center text-violet-400 group-hover:bg-violet-600 group-hover:text-white transition-all duration-300">
                         <PlayCircleIcon className="w-7 h-7" />
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-white/5 border border-white/10 rounded text-white/40">
                         {lesson.lesson_type}
                      </span>
                   </div>
                   <h3 className="text-lg font-bold text-white group-hover:text-violet-400 transition-colors mb-2">{lesson.title}</h3>
                   <p className="text-xs text-white/30 line-clamp-2 mb-6 font-medium">{lesson.description || 'Access this lesson to start learning today.'}</p>
                   
                   <div className="flex items-center justify-between pt-5 border-t border-white/5">
                      <div className="flex items-center gap-2">
                         <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                            <AcademicCapIcon className="w-3.5 h-3.5 text-blue-400" />
                         </div>
                         <span className="text-[10px] font-bold text-white/50">{lesson.courses?.title}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-bold text-white/30">
                         <ClockIcon className="w-3 h-3" /> {lesson.duration_minutes || '45'}m
                      </div>
                   </div>
                </Link>
              ))}
           </div>
        </div>

        {/* My Roadmap & Recommended */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           
           {/* Course Cards */}
           <div className="lg:col-span-2 space-y-6">
              <h2 className="text-2xl font-black flex items-center gap-3">
                <AcademicCapIcon className="w-7 h-7 text-emerald-400" />
                My Enrolled Courses
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {courses.map(course => (
                  <div key={course.id} className="bg-white/5 border border-white/10 rounded-3xl p-5 hover:bg-white/8 transition-colors flex gap-4 items-center">
                     <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400 flex-shrink-0">
                        <CheckBadgeIcon className="w-7 h-7" />
                     </div>
                     <div className="min-w-0">
                        <h4 className="font-bold text-white truncate">{course.title}</h4>
                        <p className="text-[10px] text-white/40 font-black uppercase tracking-widest">{course.programs?.name}</p>
                        <div className="h-1.5 w-full bg-white/5 rounded-full mt-3 overflow-hidden">
                           <div className="h-full bg-emerald-500 rounded-full" style={{ width: '35%' }} />
                        </div>
                     </div>
                  </div>
                ))}
                {courses.length === 0 && (
                   <p className="text-white/30 text-sm">You haven't enrolled in any courses yet.</p>
                )}
              </div>
           </div>

           {/* Sidebar: Leaderboard & Activities */}
           <div className="space-y-8">
              <div className="bg-[#1c1c2e] border border-white/10 rounded-[2rem] p-6">
                 <div className="flex items-center justify-between mb-6">
                    <h3 className="font-black flex items-center gap-2">
                       <TrophyIcon className="w-5 h-5 text-amber-400" />
                       Leaderboard
                    </h3>
                    <Link href="/dashboard/leaderboard" className="text-[10px] font-black text-violet-400 uppercase tracking-widest">Global</Link>
                 </div>
                 <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                       <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-2xl">
                          <div className="flex items-center gap-3">
                             <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black ${i===1?'bg-amber-500 text-black':i===2?'bg-slate-300 text-black':'bg-orange-400 text-black'}`}>{i}</span>
                             <p className="text-sm font-bold text-white/80">{i===1?'David A.':i===2?'Grace O.':'Samuel K.'}</p>
                          </div>
                          <span className="text-[10px] font-black text-amber-400">{(1200 - i*15).toLocaleString()} XP</span>
                       </div>
                    ))}
                 </div>
              </div>

              <div className="bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-indigo-500/20 rounded-[2rem] p-6 text-center">
                 <BoltIcon className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
                 <h4 className="font-black text-white mb-2">Power Hour is Live!</h4>
                 <p className="text-xs text-white/50 mb-4 px-2">Earn 2x XP for all coding playground activities for the next hour.</p>
                 <Link href="/dashboard/playground" className="block w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl text-xs transition-colors">
                    Start Coding
                 </Link>
              </div>
           </div>
        </div>

      </div>
    </div>
  );
}
