// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  TrophyIcon, StarIcon, BoltIcon, FireIcon,
  AcademicCapIcon, ClipboardDocumentCheckIcon, SparklesIcon,
} from '@heroicons/react/24/outline';

interface LeaderEntry {
  id: string;
  full_name: string;
  school_name: string | null;
  section_class: string | null;
  xp: number;
  level: number;
  badge: string;
  submissions: number;
  avgGrade: number;
  attendance: number;
}

const LEVELS = [
  { min: 0, max: 99, label: 'Beginner', emoji: '🌱', color: 'text-green-400 bg-green-400/10' },
  { min: 100, max: 299, label: 'Explorer', emoji: '🔍', color: 'text-blue-400 bg-blue-400/10' },
  { min: 300, max: 599, label: 'Builder', emoji: '🔨', color: 'text-yellow-400 bg-yellow-400/10' },
  { min: 600, max: 999, label: 'Coder', emoji: '💻', color: 'text-violet-400 bg-violet-400/10' },
  { min: 1000, max: 1999, label: 'Innovator', emoji: '🚀', color: 'text-orange-400 bg-orange-400/10' },
  { min: 2000, max: 9999, label: 'Champion', emoji: '🏆', color: 'text-rose-400 bg-rose-400/10' },
];

function getLevel(xp: number) {
  return LEVELS.findLast(l => xp >= l.min) ?? LEVELS[0];
}

function XPBar({ xp, level }: { xp: number; level: typeof LEVELS[0] }) {
  const next = LEVELS.find(l => l.min > xp) ?? level;
  const pct = next.min === level.min ? 100 : Math.min(100, ((xp - level.min) / (next.min - level.min)) * 100);
  return (
    <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
      <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500 transition-all duration-700"
        style={{ width: `${pct}%` }} />
    </div>
  );
}

const MEDAL = ['🥇', '🥈', '🥉'];

export default function LeaderboardPage() {
  const { profile, loading: authLoading } = useAuth();
  const [entries, setEntries] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'school'>(profile?.role === 'school' ? 'school' : 'all');
  const [myRank, setMyRank] = useState<number | null>(null);

  useEffect(() => {
    if (authLoading || !profile) return;
    load();
  }, [profile?.id, authLoading]); // eslint-disable-line

  async function load() {
    setLoading(true);
    const supabase = createClient();

    // Build student query
    let studQuery = supabase
      .from('portal_users')
      .select('id, full_name, school_name, section_class, school_id')
      .eq('role', 'student')
      .eq('is_active', true);

    // If school partner, restrict to their school immediately
    if (profile?.role === 'school' && profile.school_id) {
      studQuery = studQuery.eq('school_id', profile.school_id);
    }

    const { data: students } = await studQuery;

    if (!students?.length) { setLoading(false); return; }

    const ids = students.map(s => s.id);

    // Fetch submissions, attendance in parallel
    const [subsRes, attRes] = await Promise.all([
      supabase.from('assignment_submissions')
        .select('portal_user_id, grade, status')
        .in('portal_user_id', ids),
      supabase.from('attendance')
        .select('user_id, status')
        .in('user_id', ids),
    ]);

    const subs = subsRes.data ?? [];
    const att = attRes.data ?? [];

    const computed: LeaderEntry[] = students.map(s => {
      const mySubs = subs.filter(x => x.portal_user_id === s.id);
      const graded = mySubs.filter(x => x.grade != null);
      const avgGrade = graded.length ? graded.reduce((a, x) => a + Number(x.grade), 0) / graded.length : 0;
      const submitted = mySubs.filter(x => x.status === 'submitted' || x.status === 'graded').length;

      const myAtt = att.filter(x => x.user_id === s.id);
      const present = myAtt.filter(x => x.status === 'present' || x.status === 'late').length;
      const attendance = myAtt.length ? Math.round((present / myAtt.length) * 100) : 0;

      // XP formula: 10 per submission + grade bonus + attendance bonus
      const xp = Math.round(
        submitted * 10 +
        avgGrade * 2 +
        attendance * 0.5
      );

      const lvl = getLevel(xp);
      return {
        id: s.id,
        full_name: s.full_name,
        school_name: s.school_name,
        section_class: s.section_class,
        xp,
        level: LEVELS.indexOf(lvl),
        badge: lvl.emoji,
        submissions: submitted,
        avgGrade,
        attendance,
      };
    }).sort((a, b) => b.xp - a.xp);

    const rank = computed.findIndex(e => e.id === profile!.id);
    setMyRank(rank >= 0 ? rank + 1 : null);
    setEntries(computed);
    setLoading(false);
  }

  const filtered = filter === 'school' && profile?.school_id
    ? entries.filter(e => e.school_name === profile?.school_name)
    : entries;

  const myEntry = entries.find(e => e.id === profile?.id);

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-[#7a0606] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f0f1a] px-4 py-6 md:px-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 px-4 py-2 rounded-full mb-4">
          <TrophyIcon className="w-4 h-4 text-yellow-400" />
          <span className="text-yellow-400 text-xs font-black uppercase tracking-widest">Leaderboard</span>
        </div>
        <h1 className="text-3xl font-black text-white">Top Coders 🏆</h1>
        <p className="text-white/40 text-sm mt-2">Earn XP by completing assignments, attending classes & acing your CBT exams!</p>
      </div>

      {/* My Card (if student) */}
      {profile?.role === 'student' && myEntry && (
        <div className="bg-gradient-to-r from-violet-600/20 to-pink-600/20 border border-violet-500/30 rounded-2xl p-5 mb-6 flex items-center gap-4 flex-wrap">
          <div className="text-3xl">{myEntry.badge}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-white font-black">You</p>
              {myRank && <span className="text-xs bg-white/10 text-white/60 px-2 py-0.5 rounded-full">Rank #{myRank}</span>}
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${getLevel(myEntry.xp).color}`}>
                {getLevel(myEntry.xp).label}
              </span>
            </div>
            <XPBar xp={myEntry.xp} level={getLevel(myEntry.xp)} />
            <p className="text-white/40 text-xs mt-1">{myEntry.xp} XP · {myEntry.submissions} submissions · {myEntry.attendance}% attendance</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-yellow-400">{myEntry.xp} XP</p>
          </div>
        </div>
      )}

      {/* Filter */}
      {(profile?.role === 'school' || profile?.school_id) && (
        <div className="flex gap-2 mb-6">
          {(['all', 'school'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold uppercase transition-all ${filter === f ? 'bg-[#7a0606] text-white' : 'bg-white/5 text-white/40 hover:text-white'}`}
            >
              {f === 'all' ? '🌍 All Schools' : '🏫 My School'}
            </button>
          ))}
        </div>
      )}

      {/* Top 3 Podium */}
      {filtered.length >= 3 && (
        <div className="flex items-end justify-center gap-4 mb-8">
          {[1, 0, 2].map((idx) => {
            const e = filtered[idx];
            const lvl = getLevel(e.xp);
            const heights = ['h-28', 'h-36', 'h-24'];
            const heightMap: Record<number, string> = { 0: heights[1], 1: heights[0], 2: heights[2] };
            return (
              <div key={e.id} className="flex flex-col items-center gap-2">
                <div className="text-2xl">{MEDAL[idx]}</div>
                <div className="w-12 h-12 rounded-full bg-[#7a0606] flex items-center justify-center border-2 border-white/10">
                  <span className="text-white font-black text-lg">{e.full_name.charAt(0)}</span>
                </div>
                <p className="text-white text-xs font-bold truncate max-w-[80px] text-center">{e.full_name.split(' ')[0]}</p>
                <p className="text-yellow-400 text-xs font-black">{e.xp} XP</p>
                <div className={`w-20 ${heightMap[idx]} rounded-t-xl flex items-center justify-center ${idx === 0 ? 'bg-yellow-500/20' : idx === 1 ? 'bg-gray-400/10' : 'bg-orange-500/10'}`}>
                  <span className="text-2xl font-black text-white/20">{idx + 1}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full list */}
      <div className="bg-[#0d1526] border border-white/10 rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-white/10">
          <p className="text-white/40 text-xs font-bold uppercase tracking-widest">All Rankings · {filtered.length} students</p>
        </div>
        <div className="divide-y divide-white/5">
          {filtered.map((e, i) => {
            const lvl = getLevel(e.xp);
            const isMe = e.id === profile?.id;
            return (
              <div key={e.id} className={`flex items-center gap-4 px-5 py-3 transition-colors ${isMe ? 'bg-violet-500/10' : 'hover:bg-white/2'}`}>
                {/* Rank */}
                <div className="w-8 text-center flex-shrink-0">
                  {i < 3
                    ? <span className="text-lg">{MEDAL[i]}</span>
                    : <span className="text-white/20 text-sm font-bold">#{i + 1}</span>}
                </div>

                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-[#1a2b54] border border-white/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-black">{e.full_name.charAt(0)}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white text-sm font-bold truncate">{e.full_name} {isMe && '(You)'}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 ${lvl.color}`}>
                      {lvl.emoji} {lvl.label}
                    </span>
                  </div>
                  <XPBar xp={e.xp} level={lvl} />
                </div>

                {/* Stats */}
                <div className="hidden sm:flex items-center gap-4 text-xs text-white/40 flex-shrink-0">
                  <span title="Submissions"><ClipboardDocumentCheckIcon className="w-3.5 h-3.5 inline mr-1" />{e.submissions}</span>
                  <span title="Avg Grade"><AcademicCapIcon className="w-3.5 h-3.5 inline mr-1" />{e.avgGrade.toFixed(0)}%</span>
                </div>

                {/* XP */}
                <div className="text-right flex-shrink-0">
                  <p className="text-yellow-400 font-black text-sm">{e.xp}</p>
                  <p className="text-white/20 text-[10px]">XP</p>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-16">
              <SparklesIcon className="w-12 h-12 mx-auto text-white/10 mb-3" />
              <p className="text-white/30">No students yet. Be the first!</p>
            </div>
          )}
        </div>
      </div>

      {/* XP Guide */}
      <div className="mt-6 bg-[#0d1526] border border-white/10 rounded-2xl p-5">
        <h3 className="text-white/40 text-xs font-bold uppercase tracking-widest mb-4">How to Earn XP</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { icon: ClipboardDocumentCheckIcon, label: 'Submit Assignment', xp: '+10 XP' },
            { icon: AcademicCapIcon, label: 'Score 100% on a test', xp: '+50 XP' },
            { icon: FireIcon, label: 'Daily Attendance', xp: '+5 XP' },
            { icon: BoltIcon, label: 'Pass CBT Exam', xp: '+30 XP' },
            { icon: StarIcon, label: 'Get graded work', xp: '+2× grade' },
            { icon: TrophyIcon, label: 'Complete a course', xp: '+100 XP' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2 bg-white/3 rounded-xl p-3">
              <item.icon className="w-4 h-4 text-violet-400 flex-shrink-0" />
              <div>
                <p className="text-white text-xs font-semibold leading-tight">{item.label}</p>
                <p className="text-yellow-400 text-[10px] font-bold">{item.xp}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Level badges */}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/10">
          {LEVELS.map(l => (
            <span key={l.label} className={`text-xs px-2 py-1 rounded-full font-bold ${l.color}`}>
              {l.emoji} {l.label} ({l.min}+ XP)
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
