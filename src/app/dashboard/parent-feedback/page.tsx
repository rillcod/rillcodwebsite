'use client';

import { useAuth } from '@/contexts/auth-context';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  ChatBubbleLeftEllipsisIcon, CheckCircleIcon, StarIcon,
  UserIcon, BuildingOfficeIcon, ClockIcon,
} from '@/lib/icons';

interface FeedbackRow {
  id: string;
  created_at: string;
  category: string;
  rating: number | null;
  message: string;
  is_anonymous: boolean;
  status: 'pending' | 'reviewed' | 'actioned';
  parent_name: string | null;
  parent_email: string | null;
  school_name: string | null;
}

const CATEGORIES = [
  'General Experience',
  'Child\'s Progress',
  'Teacher Communication',
  'School Environment',
  'Admin & Support',
  'Curriculum & Courses',
  'Portal & Technology',
  'Other',
];

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  reviewed: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  actioned: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
};

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange?.(n)}
          onMouseEnter={() => onChange && setHovered(n)}
          onMouseLeave={() => onChange && setHovered(0)}
          className={`w-6 h-6 transition-all ${onChange ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <StarIcon className={`w-5 h-5 ${
            n <= (hovered || value)
              ? 'text-amber-400 fill-amber-400'
              : 'text-muted-foreground'
          }`} />
        </button>
      ))}
    </div>
  );
}

// ── Parent: Submit feedback form ──────────────────────────────────────────────
function ParentFeedbackForm({ profile }: { profile: any }) {
  const [form, setForm] = useState({
    category: CATEGORIES[0],
    rating: 0,
    message: '',
    is_anonymous: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.message.trim()) { setError('Please write your feedback.'); return; }
    setError(null);
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error: err } = await (supabase.from('parent_feedback' as any)).insert({
        portal_user_id: profile.id,
        category: form.category,
        rating: form.rating > 0 ? form.rating : null,
        message: form.message.trim(),
        is_anonymous: form.is_anonymous,
        status: 'pending',
      });
      if (err) throw err;
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message ?? 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-card border border-emerald-500/30 p-10 text-center">
        <CheckCircleIcon className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
        <h2 className="text-base font-black text-foreground uppercase tracking-widest mb-2">Thank You!</h2>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Your feedback has been received. We value your perspective and will review it carefully.
        </p>
        <button
          onClick={() => { setSubmitted(false); setForm({ category: CATEGORIES[0], rating: 0, message: '', is_anonymous: false }); }}
          className="mt-6 px-6 py-2.5 bg-orange-600 hover:bg-orange-500 text-foreground text-xs font-black uppercase tracking-widest transition-all"
        >
          Submit Another
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <div className="bg-card border border-border p-6 space-y-5">
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest text-foreground">Share Your Feedback</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Your feedback helps us improve your child's educational experience.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2">{error}</p>
          )}

          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Category</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-2">
              Overall Rating (optional)
            </label>
            <StarRating value={form.rating} onChange={v => setForm(f => ({ ...f, rating: v }))} />
          </div>

          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">
              Your Feedback *
            </label>
            <textarea
              required
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              rows={5}
              placeholder="Share your thoughts, suggestions, or concerns…"
              className="w-full px-4 py-3 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors resize-none"
            />
            <p className="text-[10px] text-muted-foreground mt-1">{form.message.length}/1000 characters</p>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_anonymous}
              onChange={e => setForm(f => ({ ...f, is_anonymous: e.target.checked }))}
              className="w-4 h-4 border border-border bg-background accent-orange-500"
            />
            <div>
              <span className="text-xs font-bold text-foreground">Submit anonymously</span>
              <p className="text-[10px] text-muted-foreground">Your name will not be visible to staff.</p>
            </div>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-foreground text-xs font-black uppercase tracking-widest transition-all"
          >
            {submitting ? 'Submitting…' : 'Submit Feedback'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Staff: View all feedback ──────────────────────────────────────────────────
function StaffFeedbackView({ profile }: { profile: any }) {
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'reviewed' | 'actioned'>('all');
  const [updating, setUpdating] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const supabase = createClient();
    let q = (supabase.from('parent_feedback' as any))
      .select(`
        id, created_at, category, rating, message, is_anonymous, status,
        portal_users!parent_feedback_portal_user_id_fkey(full_name, email, school_name)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (filter !== 'all') q = q.eq('status', filter);
    if (profile.role === 'teacher' && profile.school_name) {
      // Teachers only see their school's feedback (via portal_users.school_name)
      // Supabase can't filter on joined columns directly — load all and filter client-side for now
    }

    const { data } = await q;
    const rows = (data ?? []).map((r: any) => ({
      id: r.id,
      created_at: r.created_at,
      category: r.category,
      rating: r.rating,
      message: r.message,
      is_anonymous: r.is_anonymous,
      status: r.status,
      parent_name: r.is_anonymous ? null : r.portal_users?.full_name ?? null,
      parent_email: r.is_anonymous ? null : r.portal_users?.email ?? null,
      school_name: r.portal_users?.school_name ?? null,
    }));

    // Filter by teacher's school
    if (profile.role === 'teacher' && profile.school_name) {
      setFeedback(rows.filter((r: FeedbackRow) => r.school_name === profile.school_name));
    } else {
      setFeedback(rows as FeedbackRow[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]); // eslint-disable-line

  const updateStatus = async (id: string, status: string) => {
    setUpdating(id);
    const supabase = createClient();
    await (supabase.from('parent_feedback' as any)).update({ status }).eq('id', id);
    setFeedback(prev => prev.map(f => f.id === id ? { ...f, status: status as any } : f));
    setUpdating(null);
  };

  const avgRating = feedback.filter(f => f.rating).length > 0
    ? (feedback.filter(f => f.rating).reduce((s, f) => s + (f.rating ?? 0), 0) / feedback.filter(f => f.rating).length).toFixed(1)
    : null;

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: feedback.length, color: 'text-foreground' },
          { label: 'Pending', value: feedback.filter(f => f.status === 'pending').length, color: 'text-amber-400' },
          { label: 'Reviewed', value: feedback.filter(f => f.status === 'reviewed').length, color: 'text-blue-400' },
          { label: 'Avg Rating', value: avgRating ? `${avgRating}/5` : '—', color: 'text-amber-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-card border border-border p-4">
            <p className={`text-2xl font-black ${color}`}>{value}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'pending', 'reviewed', 'actioned'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest border transition-all ${
              filter === f
                ? 'bg-orange-600 border-orange-600 text-white'
                : 'border-border text-muted-foreground hover:border-orange-500/50'
            }`}>
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border border-border p-5 animate-pulse h-24" />
          ))}
        </div>
      ) : feedback.length === 0 ? (
        <div className="bg-card border border-border p-12 text-center">
          <ChatBubbleLeftEllipsisIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-black text-foreground uppercase tracking-wider">No feedback yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {feedback.map(fb => (
            <div key={fb.id} className="bg-card border border-border p-5 space-y-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black uppercase tracking-widest text-orange-400">{fb.category}</span>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border ${STATUS_STYLE[fb.status]}`}>
                      {fb.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <UserIcon className="w-3 h-3" />
                      {fb.is_anonymous ? 'Anonymous' : (fb.parent_name ?? fb.parent_email ?? 'Unknown')}
                    </span>
                    {fb.school_name && (
                      <span className="flex items-center gap-1">
                        <BuildingOfficeIcon className="w-3 h-3" /> {fb.school_name}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <ClockIcon className="w-3 h-3" />
                      {new Date(fb.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </span>
                    {fb.rating && <StarRating value={fb.rating} />}
                  </div>
                </div>

                {/* Status actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {fb.status !== 'reviewed' && (
                    <button
                      onClick={() => updateStatus(fb.id, 'reviewed')}
                      disabled={updating === fb.id}
                      className="px-3 py-1.5 border border-blue-500/30 text-[9px] font-black uppercase tracking-widest text-blue-400 hover:border-blue-500 transition-all disabled:opacity-50"
                    >
                      Mark Reviewed
                    </button>
                  )}
                  {fb.status !== 'actioned' && (
                    <button
                      onClick={() => updateStatus(fb.id, 'actioned')}
                      disabled={updating === fb.id}
                      className="px-3 py-1.5 border border-emerald-500/30 text-[9px] font-black uppercase tracking-widest text-emerald-400 hover:border-emerald-500 transition-all disabled:opacity-50"
                    >
                      Actioned
                    </button>
                  )}
                </div>
              </div>

              <p className="text-sm text-foreground leading-relaxed border-t border-border pt-3">{fb.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ParentFeedbackPage() {
  const { profile, loading: authLoading } = useAuth();

  if (authLoading || !profile) return null;

  const isStaff = profile.role === 'admin' || profile.role === 'teacher';
  const isParent = profile.role === 'parent';

  if (!isStaff && !isParent) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-sm">Access restricted.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-foreground tracking-tight">
          {isParent ? 'Share Feedback' : 'Parent Feedback'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isParent
            ? 'Let us know how we\'re doing. Your voice helps shape your child\'s learning environment.'
            : 'Review feedback submitted by parents across your schools.'}
        </p>
      </div>

      {isParent && <ParentFeedbackForm profile={profile} />}
      {isStaff && <StaffFeedbackView profile={profile} />}
    </div>
  );
}
