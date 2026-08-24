// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { AcademicCapIcon, ArrowLeftIcon, CheckCircleIcon } from '@/lib/icons';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

interface ExamClassOption {
  id: string;
  name: string;
  academic_offering_id: string | null;
  offering_period_id: string | null;
  status: string | null;
}

export default function EditExamPage() {
  const { id } = useParams<{ id: string }>();
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [availableClasses, setAvailableClasses] = useState<ExamClassOption[]>([]);
  const [classId, setClassId] = useState('');
  const [originalClassId, setOriginalClassId] = useState('');
  const [assessmentScope, setAssessmentScope] = useState<'class_result' | 'practice' | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    course_id: '', title: '', description: '', duration_minutes: 60,
    total_points: 100, passing_score: 70, max_attempts: 1,
    randomize_questions: true, randomize_options: true, is_active: false,
  });

  useEffect(() => {
    Promise.all([
      fetch(`/api/exams/${id}`).then(r => r.json()),
      fetch('/api/courses').then(r => r.json()),
      fetch(`/api/exams/${id}/attempts`).then(r => r.json()),
    ]).then(([examJson, coursesJson, attemptsJson]) => {
      const e = examJson.data;
      if (e) {
        setForm({
          course_id: e.course_id ?? '',
          title: e.title ?? '',
          description: e.description ?? '',
          duration_minutes: e.duration_minutes ?? 60,
          total_points: e.total_points ?? 100,
          passing_score: e.passing_score ?? 70,
          max_attempts: e.max_attempts ?? 1,
          randomize_questions: e.randomize_questions ?? true,
          randomize_options: e.randomize_options ?? true,
          is_active: e.is_active ?? false,
        });
        const nextClassId = e.class_id ?? '';
        const metadata = e.metadata && typeof e.metadata === 'object' ? e.metadata : {};
        const nextScope = metadata.assessment_scope === 'practice' || metadata.result_eligible === false
          ? 'practice'
          : metadata.assessment_scope === 'class_result' || nextClassId
            ? 'class_result'
            : null;
        setClassId(nextClassId);
        setOriginalClassId(nextClassId);
        setAssessmentScope(nextScope);
      }
      setCourses(coursesJson.data ?? []);
      setAttemptCount(Array.isArray(attemptsJson.data) ? attemptsJson.data.length : 0);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (!profile || !['admin', 'teacher'].includes(profile.role)) return;
    const loadClasses = async () => {
      const db = createClient();
      let query = db
        .from('classes')
        .select('id,name,academic_offering_id,offering_period_id,status')
        .order('name');
      if (profile.role === 'teacher') query = query.eq('teacher_id', profile.id);
      const { data, error } = await query;
      if (error) {
        toast.error('Classes could not be loaded. Refresh and try again.');
        return;
      }
      setAvailableClasses(((data ?? []) as ExamClassOption[]).filter(item => item.status !== 'archived'));
    };
    void loadClasses();
  }, [profile]);

  const canManage = profile?.role === 'admin' || profile?.role === 'teacher';
  const definitionLocked = attemptCount > 0;
  const classLinkLocked = definitionLocked && !!originalClassId;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assessmentScope) {
      toast.error('Choose whether this exam is a Class result or Practice only.');
      return;
    }
    if (assessmentScope === 'class_result' && !classId) {
      toast.error('Choose the class receiving this result.');
      return;
    }
    const selectedClass = classId ? availableClasses.find(item => item.id === classId) : null;
    if (assessmentScope === 'class_result' && selectedClass
      && (!selectedClass.academic_offering_id || !selectedClass.offering_period_id)) {
      toast.error('Repair this class academic offering and reporting period before linking official results.');
      return;
    }
    setSubmitting(true);
    try {
      const definition = {
        ...form,
        duration_minutes: Number(form.duration_minutes),
        total_points: Number(form.total_points),
        passing_score: Number(form.passing_score),
        max_attempts: Number(form.max_attempts),
      };
      const payload = attemptCount > 0
        ? { is_active: form.is_active, class_id: classId || null, assessment_scope: assessmentScope }
        : { ...definition, class_id: classId || null, assessment_scope: assessmentScope };
      const res = await fetch(`/api/exams/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      toast.success(attemptCount > 0 ? 'Result use and exam status updated.' : 'Exam updated.');
      router.push(`/dashboard/exams/${id}`);
    } catch (e: any) { toast.error(e.message || 'Failed to update'); }
    finally { setSubmitting(false); }
  }

  if (authLoading || loading) return <div className="flex items-center justify-center min-h-[60vh] mobile-page-root"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!canManage) return <div className="p-6 text-center text-card-foreground/50">Access denied</div>;

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6 mobile-page-root">
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/exams/${id}`} className="p-2 hover:bg-white/5 rounded-xl transition-all">
          <ArrowLeftIcon className="w-5 h-5 text-card-foreground/50" />
        </Link>
        <h1 className="text-2xl font-black text-card-foreground flex items-center gap-2">
          <AcademicCapIcon className="w-7 h-7 text-primary" /> Edit Exam
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-card border border-white/[0.08] rounded-2xl p-6 space-y-5">
        <div className="rounded-2xl border border-border bg-background/40 p-4 space-y-4">
          <div>
            <p className="text-sm font-black text-card-foreground">
              {assessmentScope ? 'Result use' : 'Resolve result use'}
            </p>
            <p className="mt-1 text-xs text-card-foreground/50">
              {definitionLocked
                ? 'Learner attempts are protected. This setting can repair where they belong without changing an answer, score, feedback or moderation decision.'
                : 'Choose whether completed attempts may contribute to the selected class result.'}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setAssessmentScope('class_result')}
              className={`rounded-xl border p-4 text-left transition-colors ${assessmentScope === 'class_result' ? 'border-primary/60 bg-primary/10' : 'border-border bg-card hover:border-primary/30'}`}>
              <p className="text-sm font-bold text-card-foreground">Class result</p>
              <p className="mt-1 text-xs text-card-foreground/50">Use in the linked class report and grade workflow.</p>
            </button>
            <button type="button" onClick={() => setAssessmentScope('practice')}
              className={`rounded-xl border p-4 text-left transition-colors ${assessmentScope === 'practice' ? 'border-sky-500/60 bg-sky-500/10' : 'border-border bg-card hover:border-sky-500/30'}`}>
              <p className="text-sm font-bold text-card-foreground">Keep as practice only</p>
              <p className="mt-1 text-xs text-card-foreground/50">Retain attempts and feedback outside official results.</p>
            </button>
          </div>
          <div>
            <label className="block text-xs font-bold text-card-foreground/50 uppercase tracking-wider mb-1.5">
              {assessmentScope === 'class_result' ? 'Result class *' : 'Limit practice to a class'}
            </label>
            <select value={classId} onChange={event => setClassId(event.target.value)} disabled={classLinkLocked}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-primary/50 disabled:cursor-not-allowed disabled:opacity-60">
              <option value="">{assessmentScope === 'class_result' ? 'Choose the class receiving this exam…' : 'Programme-wide practice'}</option>
              {availableClasses.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}{item.academic_offering_id && item.offering_period_id ? '' : ' — setup required'}
                </option>
              ))}
            </select>
            {classLinkLocked && (
              <p className="mt-2 text-xs text-card-foreground/50">The original class link stays fixed after an attempt. You can still switch official result eligibility safely.</p>
            )}
          </div>
        </div>

        {definitionLocked && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
            Paper settings are read-only because {attemptCount} learner attempt{attemptCount === 1 ? '' : 's'} exist. Deactivate the exam to stop new attempts; recorded work remains intact.
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-card-foreground/50 uppercase tracking-wider mb-1.5">Course</label>
          <select value={form.course_id} onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))}
            disabled={definitionLocked}
            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-primary/50 disabled:cursor-not-allowed disabled:opacity-60">
            <option value="">Select a course…</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-card-foreground/50 uppercase tracking-wider mb-1.5">Title</label>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required
            disabled={definitionLocked}
            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-primary/50 disabled:cursor-not-allowed disabled:opacity-60" />
        </div>
        <div>
          <label className="block text-xs font-bold text-card-foreground/50 uppercase tracking-wider mb-1.5">Description</label>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3}
            disabled={definitionLocked}
            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-primary/50 resize-none disabled:cursor-not-allowed disabled:opacity-60" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            { key: 'duration_minutes', label: 'Duration (min)' },
            { key: 'total_points', label: 'Total Points' },
            { key: 'passing_score', label: 'Pass Score (%)' },
            { key: 'max_attempts', label: 'Max Attempts' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs font-bold text-card-foreground/50 uppercase tracking-wider mb-1.5">{f.label}</label>
              <input type="number" min={1} value={(form as any)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                disabled={definitionLocked}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-primary/50 disabled:cursor-not-allowed disabled:opacity-60" />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          {[
            { key: 'randomize_questions', label: 'Randomize question order' },
            { key: 'randomize_options', label: 'Randomize answer options' },
            { key: 'is_active', label: 'Active (visible to students)' },
          ].map(t => (
            <label key={t.key} className="flex items-center gap-3 cursor-pointer">
              <div onClick={() => {
                if (definitionLocked && t.key !== 'is_active') return;
                setForm(f => ({ ...f, [t.key]: !(f as any)[t.key] }));
              }}
                className={`w-10 h-5 rounded-full transition-all relative ${(form as any)[t.key] ? 'bg-primary' : 'bg-white/10'}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-card shadow transition-transform ${(form as any)[t.key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm text-card-foreground/70">{t.label}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-3 pt-2">
          <Link href={`/dashboard/exams/${id}`} className="flex-1 py-2.5 text-center bg-white/5 hover:bg-white/10 text-card-foreground/70 font-bold rounded-xl transition-all">Cancel</Link>
          <button type="submit" disabled={submitting || !assessmentScope || (assessmentScope === 'class_result' && !classId)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary disabled:opacity-50 text-white font-bold rounded-xl transition-all">
            <CheckCircleIcon className="w-4 h-4" /> {submitting ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
