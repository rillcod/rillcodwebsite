'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
  AcademicCapIcon, ChartBarIcon, CheckCircleIcon,
  ExclamationTriangleIcon, ArrowLeftIcon, SparklesIcon,
  UserGroupIcon, TrophyIcon, BoltIcon,
} from '@/lib/icons';
import {
  WAEC_GRADES, SCORE_WEIGHTS, COMPONENT_LABELS, COMPONENT_DESCRIPTIONS,
  ACTIVITY_CAPS, XP_EVENTS, BADGES,
  computeWeightedScore, computeFinalScore, getWAECGrade,
  getMotivationMessage, formatScore,
  type ScoreComponents, type WAECGrade,
} from '@/lib/grading';
import { BadgeCardFull } from '@/components/badges/BadgeCard';

// ── Helpers ──────────────────────────────────────────────────────────────────
function ScoreSlider({
  label, value, description, onChange,
}: {
  label: string; value: number; description: string; onChange: (v: number) => void;
}) {
  const pct = Math.round(value);
  const color = pct >= 75 ? 'emerald' : pct >= 60 ? 'blue' : pct >= 50 ? 'amber' : pct >= 40 ? 'orange' : 'rose';
  const colorMap: Record<string, string> = {
    emerald: 'accent-emerald-500', blue: 'accent-blue-500',
    amber: 'accent-amber-500', orange: 'accent-orange-500', rose: 'accent-rose-500',
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-foreground">{label}</p>
          <p className="text-[10px] text-muted-foreground">{description}</p>
        </div>
        <div className={`text-lg font-black ${
          pct >= 75 ? 'text-emerald-400' : pct >= 60 ? 'text-blue-400' :
          pct >= 50 ? 'text-amber-400' : pct >= 40 ? 'text-orange-400' : 'text-rose-400'
        }`}>{pct}</div>
      </div>
      <input
        type="range" min={0} max={100} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className={`w-full h-2 rounded-full cursor-pointer ${colorMap[color]}`}
      />
    </div>
  );
}

function GradeBadge({ grade }: { grade: WAECGrade }) {
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 text-sm font-black border ${grade.color} ${grade.bgColor} border-current/30`}>
      {grade.code} — {grade.label}
    </span>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function WAECGradingPage() {
  const { profile } = useAuth();
  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';
  const canEdit  = profile?.role === 'admin' || profile?.role === 'teacher';

  const [activeTab, setActiveTab] = useState<'calculator' | 'scale' | 'activity' | 'motivation'>('calculator');
  const [scores, setScores] = useState<ScoreComponents>({
    theory: 70,
    classwork: 70,
    practical: 70,
    assignments: 70,
    attendance: 80,
    assessment: 65,
  });
  const [assignmentPct, setAssignmentPct] = useState(80);

  const result = computeFinalScore(scores, assignmentPct);
  const motivation = getMotivationMessage(result.capped, assignmentPct, 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/dashboard/grades" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeftIcon className="w-4 h-4" />
            </Link>
            <span className="text-[10px] font-black uppercase tracking-widest text-orange-400">WAEC-Aligned Grading</span>
          </div>
          <h1 className="text-2xl font-black">Grading System Reference</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Nigerian WAEC/NECO standard with weighted components and activity enforcement
          </p>
        </div>
        <Link
          href="/dashboard/grades"
          className="flex items-center gap-2 px-4 py-2 bg-card border border-border hover:border-orange-500/30 text-sm font-bold transition-all text-muted-foreground hover:text-foreground"
        >
          <ChartBarIcon className="w-4 h-4 text-orange-400" /> Grading Queue
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 bg-card border border-border p-1 w-fit flex-wrap">
        {([
          { id: 'calculator', label: 'Score Calculator' },
          { id: 'scale',      label: 'Grade Scale' },
          { id: 'activity',   label: 'Activity Rules' },
          { id: 'motivation', label: 'Badges & XP' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-xs font-bold transition-colors ${
              activeTab === t.id
                ? 'bg-orange-600 text-white'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Score Calculator ── */}
      {activeTab === 'calculator' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Sliders */}
          <div className="lg:col-span-3 bg-card border border-border p-6 space-y-5">
            <h2 className="text-xs font-black uppercase tracking-widest text-orange-400">Enter Component Scores</h2>

            {(Object.keys(SCORE_WEIGHTS) as (keyof ScoreComponents)[]).map(key => (
              <ScoreSlider
                key={key}
                label={`${COMPONENT_LABELS[key]} — ${Math.round(SCORE_WEIGHTS[key] * 100)}%`}
                description={COMPONENT_DESCRIPTIONS[key]}
                value={scores[key]}
                onChange={v => setScores(p => ({ ...p, [key]: v }))}
              />
            ))}

            <div className="border-t border-border pt-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-foreground">Assignment Submission Rate</p>
                  <p className="text-[10px] text-muted-foreground">% of assignments student actually submitted</p>
                </div>
                <div className={`text-lg font-black ${
                  assignmentPct >= 80 ? 'text-emerald-400' :
                  assignmentPct >= 60 ? 'text-amber-400' : 'text-rose-400'
                }`}>{assignmentPct}%</div>
              </div>
              <input
                type="range" min={0} max={100} value={assignmentPct}
                onChange={e => setAssignmentPct(Number(e.target.value))}
                className="w-full h-2 rounded-full cursor-pointer accent-orange-500"
              />
            </div>
          </div>

          {/* Result */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-card border border-border p-6 space-y-4">
              <h2 className="text-xs font-black uppercase tracking-widest text-orange-400">Result</h2>

              <div className="text-center space-y-3 py-2">
                <div className={`text-6xl font-black ${result.grade.color}`}>{result.capped}</div>
                <GradeBadge grade={result.grade} />
                <p className={`text-xs ${result.grade.color} font-bold`}>{result.grade.remark}</p>
              </div>

              <div className="space-y-2 border-t border-border pt-4">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Raw weighted score</span>
                  <span className="font-bold text-foreground">{result.raw}</span>
                </div>
                {result.raw !== result.capped && (
                  <div className="flex justify-between text-xs">
                    <span className="text-amber-400 font-bold">Activity cap ({result.cap.label})</span>
                    <span className="text-amber-400 font-bold">→ {result.capped}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Assignment rate</span>
                  <span className={`font-bold ${assignmentPct >= 80 ? 'text-emerald-400' : assignmentPct >= 60 ? 'text-amber-400' : 'text-rose-400'}`}>
                    {assignmentPct}%
                  </span>
                </div>
              </div>

              {result.raw !== result.capped && (
                <div className="bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-400">
                  <ExclamationTriangleIcon className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
                  {result.cap.message}
                </div>
              )}
            </div>

            {/* Motivation */}
            <div className="bg-card border border-border p-4 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Student Motivation Message</p>
              <p className="text-sm text-foreground leading-relaxed">{motivation}</p>
            </div>

            {/* Weighted breakdown */}
            <div className="bg-card border border-border p-4 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Score Breakdown</p>
              {(Object.keys(SCORE_WEIGHTS) as (keyof ScoreComponents)[]).map(key => {
                const contribution = Math.round(scores[key] * SCORE_WEIGHTS[key]);
                return (
                  <div key={key} className="flex items-center gap-2">
                    <div className="w-24 shrink-0 text-[10px] text-muted-foreground font-bold truncate">{COMPONENT_LABELS[key]}</div>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-orange-500 rounded-full"
                        style={{ width: `${scores[key]}%` }}
                      />
                    </div>
                    <div className="text-[11px] font-black text-foreground w-6 text-right">{contribution}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Grade Scale ── */}
      {activeTab === 'scale' && (
        <div className="bg-card border border-border p-6 space-y-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-orange-400 mb-4">WAEC/NECO Grade Scale (Nigeria)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Grade</th>
                  <th className="text-left py-2 pr-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Label</th>
                  <th className="text-left py-2 pr-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Score Range</th>
                  <th className="text-left py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {WAEC_GRADES.map(g => (
                  <tr key={g.code} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 pr-4">
                      <span className={`text-xl font-black ${g.color}`}>{g.code}</span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`font-bold text-sm ${g.color}`}>{g.label}</span>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="h-2 bg-muted rounded-full overflow-hidden w-20">
                          <div
                            className={`h-full rounded-full ${g.bgColor.replace('/10', '')}`}
                            style={{ width: `${((g.max - g.min + 1) / 100) * 100}%`, marginLeft: `${g.min}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-foreground">{g.min}–{g.max}</span>
                      </div>
                    </td>
                    <td className="py-3 text-xs text-muted-foreground">{g.remark}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Weight table */}
          <div className="border-t border-border pt-6 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-orange-400">Score Component Weights</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(Object.keys(SCORE_WEIGHTS) as (keyof ScoreComponents)[]).map(key => (
                <div key={key} className="bg-muted/40 border border-border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">{COMPONENT_LABELS[key]}</span>
                    <span className="text-sm font-black text-orange-400">{Math.round(SCORE_WEIGHTS[key] * 100)}%</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{COMPONENT_DESCRIPTIONS[key]}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Activity Rules ── */}
      {activeTab === 'activity' && (
        <div className="space-y-4">
          <div className="bg-card border border-border p-6 space-y-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-orange-400">Assignment Activity Enforcement</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Students must be consistently active to earn top WAEC grades. The more assignments submitted, the higher the grade ceiling.
              This drives students to engage every week, not just during exams.
            </p>
            <div className="space-y-3">
              {ACTIVITY_CAPS.map((cap, i) => {
                const isTop = i === 0;
                return (
                  <div key={cap.minPct} className={`p-4 border space-y-2 ${
                    isTop ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-muted/20'
                  }`}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        {isTop
                          ? <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
                          : <ExclamationTriangleIcon className="w-4 h-4 text-amber-400" />}
                        <span className={`text-sm font-black ${isTop ? 'text-emerald-400' : 'text-foreground'}`}>
                          {cap.label} — {cap.minPct}%+ assignments submitted
                        </span>
                      </div>
                      <span className={`text-xs font-black px-2 py-0.5 border ${
                        isTop
                          ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                          : 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                      }`}>
                        {isTop ? 'No cap — Full grade possible' : `Capped at ${cap.maxScore} (${getWAECGrade(cap.maxScore).code})`}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{cap.message}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-amber-500/5 border border-amber-500/20 p-4 space-y-2">
            <p className="text-xs font-black uppercase tracking-wider text-amber-400">Why This Matters for Nigerian Schools</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Parents pay school fees expecting <strong className="text-foreground">visible results</strong>. Students who skip assignments
              produce weak portfolios and poor showcase items. By tying the grade ceiling to assignment completion,
              teachers are empowered to push students consistently — not just before exam season.
              This creates a school culture of <strong className="text-foreground">weekly delivery</strong>, strong portfolios,
              and showcase-worthy project outcomes that impress parents at end-of-term presentations.
            </p>
          </div>
        </div>
      )}

      {/* ── Badges & XP ── */}
      {activeTab === 'motivation' && (
        <div className="space-y-6">
          {/* XP Events */}
          <div className="bg-card border border-border p-6 space-y-4">
            <div className="flex items-center gap-2">
              <BoltIcon className="w-4 h-4 text-yellow-400" />
              <h2 className="text-xs font-black uppercase tracking-widest text-orange-400">XP Events — How Students Earn Points</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {XP_EVENTS.map(event => (
                <div key={event.key} className="flex items-start gap-3 p-3 bg-muted/30 border border-border">
                  <span className="text-yellow-400 font-black text-sm w-12 shrink-0 text-right">+{event.xp}</span>
                  <div>
                    <p className="text-xs font-bold text-foreground">{event.label}</p>
                    <p className="text-[10px] text-muted-foreground">{event.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Badges */}
          <div className="bg-card border border-border p-6 space-y-4">
            <div className="flex items-center gap-2">
              <TrophyIcon className="w-4 h-4 text-amber-400" />
              <h2 className="text-xs font-black uppercase tracking-widest text-orange-400">Achievement Badges</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {BADGES.map(badge => (
                <BadgeCardFull
                  key={badge.key}
                  badgeKey={badge.key}
                  label={badge.label}
                  icon={badge.icon}
                  description={badge.description}
                  unlockCondition={badge.unlockCondition}
                />
              ))}
            </div>
          </div>

          <div className="bg-card border border-border p-4 space-y-2">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Implementation Note</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              XP and badges are recorded in student profiles and displayed on student dashboards.
              End-of-term showcase events highlight badge-holders and top XP earners — creating healthy competition
              and giving parents tangible proof of their child's consistent effort and achievement.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
