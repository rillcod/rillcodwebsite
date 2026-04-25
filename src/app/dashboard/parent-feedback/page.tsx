'use client';

import { useAuth } from '@/contexts/auth-context';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
  ChatBubbleLeftEllipsisIcon, CheckCircleIcon, StarIcon,
  UserIcon, BuildingOfficeIcon, ClockIcon, AcademicCapIcon,
  UserGroupIcon, ClipboardDocumentListIcon,
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

interface Child { id: string; full_name: string; user_id: string | null }

const CATEGORIES = [
  'General Experience',
  "Child's Progress",
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
function ParentFeedbackForm({ profile }: { profile: { id: string; email?: string | null } }) {
  const searchParams = useSearchParams();
  const studentParam = searchParams.get('student');

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>(studentParam ?? '');
  const [loadingChildren, setLoadingChildren] = useState(true);

  const [form, setForm] = useState({
    category: CATEGORIES[0],
    rating: 0,
    message: '',
    is_anonymous: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/parents/portal?section=children')
      .then(r => r.json())
      .then(data => {
        const list = (data.children ?? []) as Child[];
        setChildren(list);
        // Auto-select the first child if no param provided
        if (!selectedChildId && list.length > 0) setSelectedChildId(list[0].id);
      })
      .catch(() => {/* silently ignore */})
      .finally(() => setLoadingChildren(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedChild = children.find(c => c.id === selectedChildId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.message.trim()) { setError('Please write your feedback.'); return; }
    setError(null);
    setSubmitting(true);
    try {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        portal_user_id: profile.id,
        category: form.category,
        rating: form.rating > 0 ? form.rating : null,
        message: form.message.trim(),
        is_anonymous: form.is_anonymous,
        status: 'pending',
      };
      if (selectedChildId) payload.student_id = selectedChildId;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: err } = await (supabase.from('parent_feedback' as any)).insert(payload);
      if (err) throw err;
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSubmitted(false);
    setForm({ category: CATEGORIES[0], rating: 0, message: '', is_anonymous: false });
  };

  if (submitted) {
    return (
      <div className="bg-card border border-emerald-500/30 p-10 text-center max-w-xl">
        <CheckCircleIcon className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
        <h2 className="text-base font-black text-foreground uppercase tracking-widest mb-2">Thank You!</h2>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Your feedback has been received. We value your perspective and will review it carefully.
        </p>
        <button
          onClick={resetForm}
          className="mt-6 px-6 py-2.5 bg-primary hover:bg-primary text-foreground text-xs font-black uppercase tracking-widest transition-all"
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
            Your feedback helps us improve your child&apos;s educational experience.
          </p>
        </div>

        {/* Child Selector */}
        {!loadingChildren && children.length > 0 && (
          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-2">
              Regarding which child?
            </label>
            <div className="flex flex-wrap gap-2">
              {children.map(child => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => setSelectedChildId(child.id)}
                  className={`flex items-center gap-2 px-3 py-2 border text-xs font-bold transition-all ${
                    selectedChildId === child.id
                      ? 'bg-primary border-primary text-white'
                      : 'bg-white/5 border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  <AcademicCapIcon className="w-3.5 h-3.5" />
                  {child.full_name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSelectedChildId('')}
                className={`px-3 py-2 border text-xs font-bold transition-all ${
                  selectedChildId === ''
                    ? 'bg-white/10 border-white/30 text-foreground'
                    : 'bg-white/5 border-border text-muted-foreground hover:border-white/30'
                }`}
              >
                General / School
              </button>
            </div>
            {selectedChild && (
              <p className="text-[10px] text-primary mt-2 flex items-center gap-1">
                <AcademicCapIcon className="w-3 h-3" />
                Feedback about <strong>{selectedChild.full_name}</strong>
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2">{error}</p>
          )}

          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Category</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
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
              className="w-full px-4 py-3 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-primary transition-colors resize-none"
            />
            <p className="text-[10px] text-muted-foreground mt-1">{form.message.length}/1000 characters</p>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_anonymous}
              onChange={e => setForm(f => ({ ...f, is_anonymous: e.target.checked }))}
              className="w-4 h-4 border border-border bg-background accent-primary"
            />
            <div>
              <span className="text-xs font-bold text-foreground">Submit anonymously</span>
              <p className="text-[10px] text-muted-foreground">Your name will not be visible to staff.</p>
            </div>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-3 bg-primary hover:bg-primary disabled:opacity-50 text-foreground text-xs font-black uppercase tracking-widest transition-all"
          >
            {submitting ? 'Submitting…' : 'Submit Feedback'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Staff: View all feedback ──────────────────────────────────────────────────
function StaffFeedbackView({ profile }: { profile: { role: string; school_name?: string | null } }) {
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'reviewed' | 'actioned'>('all');
  const [updating, setUpdating] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase.from('parent_feedback' as any))
      .select(`
        id, created_at, category, rating, message, is_anonymous, status,
        portal_users!parent_feedback_portal_user_id_fkey(full_name, email, school_name)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (filter !== 'all') q = q.eq('status', filter);

    const { data } = await q;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // Filter by teacher's school client-side (can't filter on joined columns)
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('parent_feedback' as any)).update({ status }).eq('id', id);
    setFeedback(prev => prev.map(f => f.id === id ? { ...f, status: status as FeedbackRow['status'] } : f));
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
                ? 'bg-primary border-primary text-white'
                : 'border-border text-muted-foreground hover:border-primary/50'
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
                    <span className="text-[10px] font-black uppercase tracking-widest text-brand-red-600">{fb.category}</span>
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

// ── Inner page (needs Suspense for useSearchParams) ───────────────────────────
function ParentFeedbackContent() {
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
      {/* Parents Hub Tab Bar — only visible to staff */}
      {isStaff && (
        <div className="bg-card border border-border">
          <div className="flex items-center gap-0 overflow-x-auto">
            <Link href="/dashboard/parents"
              className="px-5 sm:px-6 py-4 border-r border-border text-muted-foreground hover:text-foreground text-[10px] font-black uppercase tracking-[0.25em] flex items-center gap-2 transition-colors hover:bg-muted/30 whitespace-nowrap flex-shrink-0">
              <UserGroupIcon className="w-4 h-4" /> Parents
            </Link>
            <div className="px-5 sm:px-6 py-4 border-r border-border border-b-2 border-b-primary text-primary text-[10px] font-black uppercase tracking-[0.25em] flex items-center gap-2 whitespace-nowrap flex-shrink-0">
              <ChatBubbleLeftEllipsisIcon className="w-4 h-4" /> Feedback
            </div>
            <Link href="/dashboard/parent-results"
              className="px-5 sm:px-6 py-4 border-r border-border text-muted-foreground hover:text-foreground text-[10px] font-black uppercase tracking-[0.25em] flex items-center gap-2 transition-colors hover:bg-muted/30 whitespace-nowrap flex-shrink-0">
              <ClipboardDocumentListIcon className="w-4 h-4" /> Results
            </Link>
            <Link href="/dashboard/parent-grades"
              className="px-5 sm:px-6 py-4 text-muted-foreground hover:text-foreground text-[10px] font-black uppercase tracking-[0.25em] flex items-center gap-2 transition-colors hover:bg-muted/30 whitespace-nowrap flex-shrink-0">
              <CheckCircleIcon className="w-4 h-4" /> Grades
            </Link>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-black text-foreground tracking-tight">
          {isParent ? 'Share Feedback' : 'Parent Feedback'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isParent
            ? "Let us know how we're doing. Your voice helps shape your child's learning environment."
            : 'Review feedback submitted by parents across your schools.'}
        </p>
      </div>

      {isParent && <ParentFeedbackForm profile={profile} />}
      {isStaff && <StaffFeedbackView profile={profile} />}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ParentFeedbackPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-64 bg-card border border-border" />}>
      <ParentFeedbackContent />
    </Suspense>
  );
}
