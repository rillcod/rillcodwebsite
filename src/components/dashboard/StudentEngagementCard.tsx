'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BoltIcon, TrophyIcon, FireIcon, CheckCircleIcon,
  ArrowRightIcon, StarIcon, ChartBarIcon,
} from '@/lib/icons';
import { getWAECGrade, getMotivationMessage, ACTIVITY_CAPS } from '@/lib/grading';

interface XPSummary {
  total_xp: number;
  level: number;
  this_term_xp: number;
}
interface Badge { badge_key: string; badge_label: string; badge_icon: string; earned_at: string }
interface Streak { current_streak: number; longest_streak: number; total_active_weeks: number }
interface AssignmentEngagement {
  total_assigned: number; total_submitted: number; submission_pct: number; term_number: number;
}
interface RecentXP { event_key: string; event_label: string; xp: number; created_at: string }

interface Props {
  studentId: string;
}

// XP required per level (every 500 XP = 1 level)
const XP_PER_LEVEL = 500;

function xpToNextLevel(totalXp: number) {
  const level = Math.floor(totalXp / XP_PER_LEVEL) + 1;
  const xpIntoLevel = totalXp % XP_PER_LEVEL;
  return { level, xpIntoLevel, xpNeeded: XP_PER_LEVEL - xpIntoLevel };
}

function relativeTime(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60)  return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function StudentEngagementCard({ studentId }: Props) {
  const [xp, setXp]          = useState<XPSummary | null>(null);
  const [badges, setBadges]   = useState<Badge[]>([]);
  const [streak, setStreak]   = useState<Streak | null>(null);
  const [asgn, setAsgn]       = useState<AssignmentEngagement | null>(null);
  const [recentXp, setRecentXp] = useState<RecentXP[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/engagement?student_id=${studentId}&include=xp,badges,streak,assignments`)
      .then(r => r.json())
      .then(j => {
        const d = j.data ?? {};
        setXp(d.xp ?? null);
        setBadges(d.badges ?? []);
        setStreak(d.streak ?? null);
        setRecentXp(d.recent_xp ?? []);
        // Latest term engagement
        if (d.assignment_engagement?.length > 0) setAsgn(d.assignment_engagement[0]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [studentId]);

  if (loading) {
    return (
      <div className="bg-card border border-border p-5 space-y-3 animate-pulse">
        <div className="h-4 bg-muted rounded w-32" />
        <div className="h-2 bg-muted rounded w-full" />
        <div className="h-2 bg-muted rounded w-3/4" />
      </div>
    );
  }

  const totalXp = xp?.total_xp ?? 0;
  const { level, xpIntoLevel, xpNeeded } = xpToNextLevel(totalXp);
  const levelPct = Math.round((xpIntoLevel / XP_PER_LEVEL) * 100);
  const submissionPct = asgn?.submission_pct ?? 100;
  const actCap = ACTIVITY_CAPS.find(c => submissionPct >= c.minPct) ?? ACTIVITY_CAPS[ACTIVITY_CAPS.length - 1];
  const currentStreak = streak?.current_streak ?? 0;
  const motivation = getMotivationMessage(0, submissionPct, currentStreak);

  return (
    <div className="bg-card border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-gradient-to-r from-orange-500/5 to-violet-500/5">
        <div className="flex items-center gap-2">
          <BoltIcon className="w-4 h-4 text-orange-400" />
          <span className="text-xs font-black uppercase tracking-widest text-orange-400">My Engagement</span>
        </div>
        <Link href="/dashboard/showcase" className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors">
          Showcase <ArrowRightIcon className="w-3 h-3" />
        </Link>
      </div>

      <div className="p-5 space-y-5">
        {/* Level + XP bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-orange-500/10 border border-orange-500/30 flex items-center justify-center">
                <span className="text-sm font-black text-orange-400">{level}</span>
              </div>
              <div>
                <p className="text-xs font-black text-foreground">Level {level}</p>
                <p className="text-[10px] text-muted-foreground">{totalXp.toLocaleString()} total XP</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground font-bold">{xpNeeded} XP to level up</p>
              <p className="text-[10px] text-orange-400 font-bold">This term: +{xp?.this_term_xp ?? 0}</p>
            </div>
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-700 rounded-full"
              style={{ width: `${levelPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-muted-foreground font-bold">
            <span>Level {level}</span>
            <span>{levelPct}%</span>
            <span>Level {level + 1}</span>
          </div>
        </div>

        {/* Streak + submission rate */}
        <div className="grid grid-cols-2 gap-3">
          <div className={`p-3 border space-y-1 ${
            currentStreak >= 3
              ? 'border-orange-500/30 bg-orange-500/5'
              : 'border-border bg-muted/20'
          }`}>
            <div className="flex items-center gap-1.5">
              <FireIcon className={`w-4 h-4 ${currentStreak >= 3 ? 'text-orange-400' : 'text-muted-foreground'}`} />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Streak</span>
            </div>
            <p className={`text-2xl font-black ${currentStreak >= 3 ? 'text-orange-400' : 'text-foreground'}`}>
              {currentStreak}
              <span className="text-xs font-bold text-muted-foreground ml-1">week{currentStreak !== 1 ? 's' : ''}</span>
            </p>
            <p className="text-[9px] text-muted-foreground">Best: {streak?.longest_streak ?? 0} weeks</p>
          </div>

          <div className={`p-3 border space-y-1 ${
            submissionPct >= 80
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : submissionPct >= 60
              ? 'border-amber-500/30 bg-amber-500/5'
              : 'border-rose-500/30 bg-rose-500/5'
          }`}>
            <div className="flex items-center gap-1.5">
              <CheckCircleIcon className={`w-4 h-4 ${
                submissionPct >= 80 ? 'text-emerald-400' :
                submissionPct >= 60 ? 'text-amber-400' : 'text-rose-400'
              }`} />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Submitted</span>
            </div>
            <p className={`text-2xl font-black ${
              submissionPct >= 80 ? 'text-emerald-400' :
              submissionPct >= 60 ? 'text-amber-400' : 'text-rose-400'
            }`}>
              {Math.round(submissionPct)}<span className="text-xs">%</span>
            </p>
            <p className="text-[9px] text-muted-foreground">{asgn?.total_submitted ?? 0}/{asgn?.total_assigned ?? 0} tasks</p>
          </div>
        </div>

        {/* Grade cap warning */}
        {submissionPct < 80 && (
          <div className={`px-3 py-2 border text-[10px] leading-relaxed ${
            submissionPct < 40
              ? 'border-rose-500/30 bg-rose-500/5 text-rose-400'
              : 'border-amber-500/30 bg-amber-500/5 text-amber-400'
          }`}>
            <span className="font-black">Grade cap active:</span> Max {actCap.maxScore}/100 (
            {(() => {
              const g = getWAECGrade(actCap.maxScore);
              return g.code;
            })()}
            ) — submit more to unlock higher grades.
          </div>
        )}

        {/* Badges */}
        {badges.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Badges Earned</p>
            <div className="flex flex-wrap gap-2">
              {badges.slice(0, 6).map(b => (
                <div
                  key={b.badge_key}
                  title={b.badge_label}
                  className="flex items-center gap-1.5 px-2 py-1 bg-muted/40 border border-border text-[10px] font-bold text-foreground"
                >
                  <span>{b.badge_icon}</span>
                  <span className="hidden sm:inline truncate max-w-[80px]">{b.badge_label}</span>
                </div>
              ))}
              {badges.length > 6 && (
                <div className="flex items-center px-2 py-1 bg-muted/40 border border-border text-[10px] font-bold text-muted-foreground">
                  +{badges.length - 6}
                </div>
              )}
            </div>
          </div>
        )}

        {badges.length === 0 && (
          <div className="text-center py-3 border border-dashed border-border">
            <TrophyIcon className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
            <p className="text-[11px] text-muted-foreground">Submit your first assignment to earn a badge!</p>
          </div>
        )}

        {/* Recent XP */}
        {recentXp.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Recent XP</p>
            {recentXp.slice(0, 4).map((entry, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-foreground/70 truncate">{entry.event_label}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-orange-400 font-black">+{entry.xp}</span>
                  <span className="text-muted-foreground text-[10px]">{relativeTime(entry.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Motivation */}
        <div className="border-t border-border pt-3">
          <p className="text-xs text-foreground leading-relaxed">{motivation}</p>
        </div>
      </div>
    </div>
  );
}
