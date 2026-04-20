// @refresh reset
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
    ArrowLeft, BookOpen, Check,
    Trash2, Plus, Paperclip,
    GraduationCap, Sparkles, Save,
    Layout, FileText, Settings2, ChevronDown
} from 'lucide-react';
import CanvaEditor from '@/features/lessons/components/CanvaEditor';
import { SparklesIcon } from '@/lib/icons';

export default function EditLessonPage() {
    const params = useParams();
    const id = params?.id as string;
    const router = useRouter();
    const { profile, loading: authLoading } = useAuth();
    const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const isMinimal = searchParams?.get('minimal') === 'true';

    const [lesson, setLesson] = useState<any>(null);
    const [courses, setCourses] = useState<any[]>([]);
    const [programs, setPrograms] = useState<any[]>([]);
    const [selectedProgramId, setSelectedProgramId] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'settings' | 'content' | 'plan' | 'materials'>('settings');

    // Lesson Form State
    const [form, setForm] = useState({
        title: '',
        description: '',
        lesson_notes: '',
        course_id: '',
        lesson_type: 'hands-on',
        duration_minutes: '60',
        session_date: '',
        video_url: '',
        status: 'draft',
        order_index: '',
        content_layout: [] as any[]
    });

    // Plan State
    const [plan, setPlan] = useState<any>({
        objectives: '',
        activities: '',
        assessment_methods: '',
        staff_notes: '',
        plan_data: null
    });

    // Materials State
    const [materials, setMaterials] = useState<any[]>([]);
    const [newMaterial, setNewMaterial] = useState({ title: '', file_url: '', file_type: 'pdf' });

    const fetchData = useCallback(async () => {
        if (!profile || !id) return;
        const db = createClient();
        try {
            const [lessonApiRes, materialsRes] = await Promise.all([
                fetch(`/api/lessons/${id}`, { cache: 'no-store' }).then(r => r.json()),
                db.from('lesson_materials').select('*').eq('lesson_id', id).order('created_at', { ascending: true }),
            ]);

            if (lessonApiRes.error) throw new Error(lessonApiRes.error);
            const l = lessonApiRes.data;
            setLesson(l);
            const planRes = l?.lesson_plans?.[0] ?? null;
            setMaterials(materialsRes.data ?? []);

            // Handle courses with school context
            const { data: progData } = await db.from('programs').select('id, name').eq('is_active', true).order('name');
            setPrograms(progData ?? []);

            let query = db
                .from('courses')
                .select('id, title, program_id, school_id')
                .eq('is_active', true);

            if (profile?.school_id) {
                query = query.or(`school_id.eq.${profile.school_id},school_id.is.null`);
            }
            const { data: courseList } = await query.order('title');
            setCourses(courseList ?? []);

            // Pre-select the programme based on the lesson's course
            if (l.course_id) {
                const lc = (courseList ?? []).find((c: any) => c.id === l.course_id);
                if (lc?.program_id) setSelectedProgramId(lc.program_id);
            }

            setForm({
                title: l.title,
                description: l.description || '',
                lesson_notes: l.lesson_notes || '',
                course_id: l.course_id || '',
                lesson_type: l.lesson_type || 'hands-on',
                duration_minutes: String(l.duration_minutes || 60),
                session_date: l.session_date ? new Date(l.session_date).toISOString().slice(0, 16) : '',
                video_url: l.video_url || '',
                status: l.status || 'draft',
                order_index: String(l.order_index || ''),
                content_layout: (l.content_layout as any[]) || []
            });

            if (planRes) {
                const pd = planRes as any;
                setPlan({
                    objectives: pd.objectives || '',
                    activities: pd.activities || '',
                    assessment_methods: pd.assessment_methods || '',
                    staff_notes: pd.staff_notes || '',
                    plan_data: pd.plan_data || null
                });
            }
        } catch (err: any) {
            setError(err.message);
        }
    }, [id, profile]);

    useEffect(() => {
        if (!authLoading && profile) fetchData();
    }, [authLoading, profile, fetchData]);

    const [aiGenerating, setAiGenerating] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [aiMode, setAiMode] = useState<'academic' | 'project' | 'interactive'>('academic');
    const [aiGrade, setAiGrade] = useState('JSS1–SS3');
    const [saveSuccess, setSaveSuccess] = useState(false);

    const handleAiGenerate = async () => {
        if (!form.title.trim()) { setAiError('Enter a lesson title first.'); return; }
        setAiGenerating(true);
        setAiError(null);
        try {
            const res = await fetch('/api/ai/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'lesson',
                    topic: form.title,
                    gradeLevel: aiGrade,
                    durationMinutes: parseInt(form.duration_minutes) || 60,
                    lessonMode: aiMode,
                }),
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error);
            const d = payload.data;
            setForm(prev => ({
                ...prev,
                description: d.description || prev.description,
                lesson_notes: d.lesson_notes || prev.lesson_notes,
                duration_minutes: String(d.duration_minutes || prev.duration_minutes),
                content_layout: d.content_layout || prev.content_layout,
                lesson_type: d.lesson_type || prev.lesson_type,
            }));
            const activityText = (d.content_layout || []).filter((b: any) => b.type === 'activity')
                .map((b: any) => `${b.title || 'Activity'}: ${b.instructions || ''}`.trim()).join('\n\n');
            const assessText = (d.content_layout || []).filter((b: any) => b.type === 'quiz')
                .map((b: any) => b.question || '').filter(Boolean).join('\n');
            setPlan((prev: any) => ({
                ...prev,
                objectives: Array.isArray(d.objectives) ? d.objectives.join('\n') : (d.objectives || prev.objectives),
                activities: activityText || prev.activities,
                assessment_methods: assessText || prev.assessment_methods,
            }));
        } catch (e: any) { setAiError(e.message ?? 'Generation failed'); }
        finally { setAiGenerating(false); }
    };

    const handleGenerateNotesOnly = async () => {
        if (!form.title.trim()) { setAiError('Enter a lesson title first.'); return; }
        setAiGenerating(true);
        setAiError(null);
        try {
            const res = await fetch('/api/ai/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'lesson-notes', topic: form.title, gradeLevel: aiGrade, durationMinutes: parseInt(form.duration_minutes) || 60 }),
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error);
            if (payload.data?.lesson_notes) setForm(prev => ({ ...prev, lesson_notes: payload.data.lesson_notes }));
        } catch (e: any) { setAiError(e.message ?? 'Notes generation failed'); }
        finally { setAiGenerating(false); }
    };



    const handleSave = async () => {
        if (!id || !profile?.id) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`/api/lessons/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: form.title,
                    description: form.description,
                    lesson_notes: form.lesson_notes,
                    course_id: form.course_id,
                    lesson_type: form.lesson_type,
                    status: form.status,
                    duration_minutes: parseInt(form.duration_minutes),
                    order_index: form.order_index ? parseInt(form.order_index) : null,
                    session_date: form.session_date ? new Date(form.session_date).toISOString() : null,
                    video_url: form.video_url,
                    content_layout: form.content_layout,
                    lesson_plan: plan,
                }),
            });
            if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Update failed'); }

            // Sync assignment-block content blocks → real assignments (create if not already existing)
            const assignmentBlocks = form.content_layout.filter((b: any) => b.type === 'assignment-block' && b.title?.trim());
            if (assignmentBlocks.length > 0 && form.course_id) {
                // Fetch existing assignments for this lesson to avoid duplicates
                const db = createClient();
                const { data: existing } = await db.from('assignments').select('title').eq('lesson_id', id);
                const existingTitles = new Set((existing ?? []).map((a: any) => a.title?.trim().toLowerCase()));
                for (const block of assignmentBlocks) {
                    if (existingTitles.has(block.title.trim().toLowerCase())) continue;
                    await fetch('/api/assignments', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            title: block.title,
                            instructions: [block.instructions, block.deliverables?.length ? `\n\nDeliverables:\n${block.deliverables.map((d: string, i: number) => `${i + 1}. ${d}`).join('\n')}` : ''].filter(Boolean).join(''),
                            course_id: form.course_id,
                            lesson_id: id,
                            assignment_type: 'project',
                            max_points: 100,
                            is_active: true,
                        }),
                    });
                }
            }

            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const addMaterial = async () => {
        if (!newMaterial.title || !newMaterial.file_url) return;
        const res = await fetch(`/api/lessons/${id}/materials`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newMaterial),
        });
        const json = await res.json();
        if (!res.ok) { alert(json.error || 'Failed to add material'); return; }
        setMaterials([...materials, json.data]);
        setNewMaterial({ title: '', file_url: '', file_type: 'pdf' });
    };

    const deleteMaterial = async (mid: string) => {
        const res = await fetch(`/api/lessons/${id}/materials/${mid}`, { method: 'DELETE' });
        if (!res.ok) { const j = await res.json(); alert(j.error || 'Failed to delete'); return; }
        setMaterials(materials.filter(m => m.id !== mid));
    };

    if (authLoading || !lesson) return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <div className={`min-h-screen bg-background text-foreground ${isMinimal ? 'p-0' : 'p-4 sm:p-8'}`}>
            <div className={`${isMinimal ? 'w-full' : 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8'} space-y-8`}>

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        {!isMinimal && (
                            <button onClick={() => router.back()} className="p-2.5 bg-card shadow-sm border border-border rounded-none hover:bg-muted transition-all text-muted-foreground hover:text-foreground" title="Go Back">
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                        )}
                        {!isMinimal && (
                            <div className="w-12 h-12 rounded-none bg-cyan-600/10 flex items-center justify-center text-cyan-400">
                                <BookOpen className="w-6 h-6" />
                            </div>
                        )}
                        <div>
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-1">{isMinimal ? 'Quick Edit' : 'Drafting Lesson'}</p>
                            <h1 className="text-2xl font-black">{form.title || 'Lesson Title'}</h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {saveSuccess && (
                            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                                <Check className="w-3.5 h-3.5" /> Saved
                            </span>
                        )}
                        {!isMinimal && (
                            <Link href={`/dashboard/lessons/${id}`} className="px-5 py-2.5 bg-card shadow-sm border border-border rounded-none font-bold text-sm hover:bg-muted transition-all">
                                View Live
                            </Link>
                        )}
                        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-foreground font-black text-sm rounded-none shadow-xl shadow-cyan-900/40 transition-all disabled:opacity-50">
                            {saving ? <div className="w-4 h-4 border-2 border-border border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                            {saving ? 'SAVING...' : (isMinimal ? 'SAVE' : 'SAVE CHANGES')}
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-none text-rose-400 text-sm font-medium">
                        {error}
                    </div>
                )}

                {/* Unified Tabs */}
                <div className="flex items-center gap-1 p-1 bg-card shadow-sm border border-border rounded-none w-fit">
                    <TabBtn active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={Settings2} label="Settings" />
                    <TabBtn active={activeTab === 'content'} onClick={() => setActiveTab('content')} icon={Layout} label="Visual Builder" />
                    <TabBtn active={activeTab === 'plan'} onClick={() => setActiveTab('plan')} icon={GraduationCap} label="Lesson Plan" />
                    <TabBtn active={activeTab === 'materials'} onClick={() => setActiveTab('materials')} icon={Paperclip} label="Materials" />
                </div>


                <div className="grid grid-cols-1 gap-8">
                    {activeTab === 'settings' && (
                        <div className="bg-card shadow-sm border border-border rounded-none p-8 space-y-6 animate-in fade-in duration-500">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <Field label="Lesson Title" value={form.title} onChange={v => setForm({ ...form, title: v })} />
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Programme</label>
                                    <div className="relative">
                                        <select value={selectedProgramId}
                                            onChange={e => {
                                                const pid = e.target.value;
                                                setSelectedProgramId(pid);
                                                const currentCourse = courses.find((c: any) => c.id === form.course_id);
                                                if (currentCourse?.program_id !== pid) {
                                                    setForm(prev => ({ ...prev, course_id: '' }));
                                                }
                                            }}
                                            className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-3 text-sm focus:border-cyan-500 outline-none appearance-none cursor-pointer">
                                            <option value="">Select Programme</option>
                                            {programs.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Linked Course</label>
                                    <div className="relative">
                                        <select value={form.course_id}
                                            onChange={e => setForm({ ...form, course_id: e.target.value })}
                                            disabled={!selectedProgramId}
                                            className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-3 text-sm focus:border-cyan-500 outline-none appearance-none cursor-pointer disabled:opacity-40">
                                            <option value="">{selectedProgramId ? 'Select Course' : '— pick a programme first —'}</option>
                                            {(selectedProgramId ? courses.filter((c: any) => c.program_id === selectedProgramId) : courses)
                                                .map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}
                                        </select>
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <SelectField label="Type" value={form.lesson_type} options={['hands-on', 'video', 'interactive', 'workshop', 'coding', 'reading', 'quiz', 'article', 'project', 'lab', 'live']} onChange={v => setForm({ ...form, lesson_type: v })} />
                                <Field label="Duration (min)" value={form.duration_minutes} type="number" onChange={v => setForm({ ...form, duration_minutes: v })} />
                                <Field label="Sequence Number" value={form.order_index} type="number" onChange={v => setForm({ ...form, order_index: v })} />
                                <SelectField label="Status" value={form.status} options={['draft', 'scheduled', 'active', 'completed']} onChange={v => setForm({ ...form, status: v })} />
                            </div>

                            <Field label="Brief Description" value={form.description} textarea onChange={v => setForm({ ...form, description: v })} />
                            
                            {/* AI Lesson Engine Panel */}
                            <div className="border border-orange-500/20 bg-orange-500/5 rounded-none overflow-hidden">
                                <div className="px-5 py-4 flex items-center gap-3 border-b border-orange-500/10">
                                    <SparklesIcon className="w-5 h-5 text-orange-400" />
                                    <span className="text-xs font-black text-foreground uppercase tracking-widest">AI Lesson Engine</span>
                                    <span className="text-[10px] text-muted-foreground ml-1">— regenerate content from current title</span>
                                </div>
                                <div className="p-5 space-y-4">
                                    {aiError && (
                                        <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium rounded-none">
                                            {aiError}
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Grade Level</label>
                                            <select value={aiGrade} onChange={e => setAiGrade(e.target.value)}
                                                className="w-full bg-card border border-border rounded-none px-3 py-2 text-sm text-foreground outline-none focus:border-orange-500">
                                                {['KG','Basic 1–Basic 3','Basic 4–Basic 6','JSS1','JSS2','JSS3','JSS1–JSS3','SS1','SS2','SS3','SS1–SS3','JSS1–SS3'].map(g => <option key={g} value={g}>{g}</option>)}
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Mode</label>
                                            <select value={aiMode} onChange={e => setAiMode(e.target.value as any)}
                                                className="w-full bg-card border border-border rounded-none px-3 py-2 text-sm text-foreground outline-none focus:border-orange-500">
                                                <option value="academic">Academic</option>
                                                <option value="project">Project</option>
                                                <option value="interactive">Interactive</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex gap-3">
                                        <button onClick={handleAiGenerate} disabled={aiGenerating}
                                            className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest transition-all">
                                            {aiGenerating ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Building...</> : <><SparklesIcon className="w-3.5 h-3.5" /> Full Rebuild</>}
                                        </button>
                                        <button onClick={handleGenerateNotesOnly} disabled={aiGenerating}
                                            className="flex items-center gap-2 px-5 py-2.5 bg-card border border-border hover:border-orange-500/40 disabled:opacity-50 text-foreground text-[10px] font-black uppercase tracking-widest transition-all">
                                            {aiGenerating ? 'Writing...' : '✦ Notes Only'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Comprehensive Study Notes (Mandatory for Students)</label>
                                <textarea
                                    value={form.lesson_notes}
                                    rows={12}
                                    onChange={e => setForm({ ...form, lesson_notes: e.target.value })}
                                    placeholder="Notes generated by AI or manual input..."
                                    className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-3 text-sm focus:border-cyan-500 outline-none resize-none"
                                />
                            </div>
                            <Field label="Video URL (YouTube/Direct)" value={form.video_url} onChange={v => setForm({ ...form, video_url: v })} />
                        </div>
                    )}

                    {activeTab === 'content' && (
                        <div className="bg-card shadow-sm border border-border rounded-none p-8 animate-in fade-in duration-500">
                            <CanvaEditor layout={form.content_layout} onChange={l => setForm({ ...form, content_layout: l })} />
                        </div>
                    )}

                    {activeTab === 'plan' && (
                        <div className="bg-card shadow-sm border border-border rounded-none p-8 space-y-8 animate-in fade-in duration-500">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <Sparkles className="w-6 h-6 text-amber-400" />
                                    <h2 className="text-xl font-black uppercase tracking-tight">Structured Lesson Plan</h2>
                                </div>
                                <button
                                    onClick={handleAiGenerate}
                                    disabled={aiGenerating}
                                    className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-none text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                                >
                                    {aiGenerating ? (
                                        <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <SparklesIcon className="w-3 h-3" />
                                    )}
                                    {aiGenerating ? 'GENERATING...' : 'SYNC WITH AI'}
                                </button>
                            </div>

                            {plan.plan_data && Object.keys(plan.plan_data).length > 0 && (
                                <div className="p-6 bg-cyan-500/5 border border-cyan-500/20 rounded-none space-y-4">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">Active Structured Data Detected</p>
                                        <button onClick={() => setPlan({ ...plan, plan_data: null })} className="text-[9px] text-muted-foreground hover:text-rose-400 uppercase font-black">Clear Structural Data</button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">This lesson is linked to a full course plan ({plan.plan_data.course_title}). The curriculum timeline will be rendered in the lesson viewer.</p>
                                </div>
                            )}

                            <Field label="Learning Objectives" value={plan.objectives} textarea rows={4} onChange={v => setPlan({ ...plan, objectives: v })} />
                            <Field label="Activities Sequence" value={plan.activities} textarea rows={6} onChange={v => setPlan({ ...plan, activities: v })} />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <Field label="Assessment Methods" value={plan.assessment_methods} textarea rows={4} onChange={v => setPlan({ ...plan, assessment_methods: v })} />
                                <Field label="Confidential Staff Notes" value={plan.staff_notes} textarea rows={4} onChange={v => setPlan({ ...plan, staff_notes: v })} />
                            </div>
                        </div>
                    )}

                    {activeTab === 'materials' && (
                        <div className="space-y-6 animate-in fade-in duration-500">
                            <div className="bg-card shadow-sm border border-border rounded-none p-8">
                                <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-6">Add New Resource</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <input type="text" placeholder="Title (e.g. Starter Code)" value={newMaterial.title} onChange={e => setNewMaterial({ ...newMaterial, title: e.target.value })}
                                        className="bg-card shadow-sm border border-border rounded-none px-4 py-2.5 text-sm focus:border-cyan-500 outline-none" />
                                    <input type="text" placeholder="URL (S3, Drive, Link...)" value={newMaterial.file_url} onChange={e => setNewMaterial({ ...newMaterial, file_url: e.target.value })}
                                        className="bg-card shadow-sm border border-border rounded-none px-4 py-2.5 text-sm focus:border-cyan-500 outline-none" />
                                    <div className="flex gap-2">
                                        <select value={newMaterial.file_type} onChange={e => setNewMaterial({ ...newMaterial, file_type: e.target.value })}
                                            className="flex-1 bg-card shadow-sm border border-border rounded-none px-4 py-2.5 text-sm focus:border-cyan-500 outline-none">
                                            <option value="pdf">PDF</option>
                                            <option value="video">Video</option>
                                            <option value="image">Image</option>
                                            <option value="link">External Link</option>
                                        </select>
                                        <button onClick={addMaterial} className="p-2.5 bg-cyan-600 hover:bg-cyan-700 rounded-none text-foreground">
                                            <Plus className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {materials.map((m) => (
                                    <div key={m.id} className="flex items-center gap-4 p-4 bg-card shadow-sm border border-border rounded-none group">
                                        <div className="w-10 h-10 rounded-none bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                                            <Paperclip className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-sm truncate">{m.title}</p>
                                            <p className="text-[10px] text-muted-foreground uppercase font-black">{m.file_type}</p>
                                        </div>
                                        <button onClick={() => deleteMaterial(m.id)} className="p-2 text-muted-foreground hover:text-rose-400 transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

interface TabBtnProps {
    active: boolean;
    onClick: () => void;
    icon: any;
    label: string;
}

function TabBtn({ active, onClick, icon: Icon, label }: TabBtnProps) {
    return (
        <button type="button" onClick={onClick} className={`flex items-center gap-2 px-5 py-2.5 rounded-none text-xs font-black uppercase tracking-widest transition-all ${active ? 'bg-cyan-600 text-foreground shadow-lg shadow-cyan-900/40' : 'text-muted-foreground hover:text-foreground hover:bg-card shadow-sm'}`}>
            <Icon className="w-4 h-4" />
            {label}
        </button>
    );
}

interface FieldProps {
    label: string;
    value: string;
    onChange: (v: string) => void;
    textarea?: boolean;
    rows?: number;
    type?: string;
}

function Field({ label, value, onChange, textarea, rows = 3, type = 'text' }: FieldProps) {
    return (
        <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</label>
            {textarea ? (
                <textarea value={value} rows={rows} onChange={e => onChange(e.target.value)}
                    className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-3 text-sm focus:border-cyan-500 outline-none resize-none" />
            ) : (
                <input type={type} value={value} onChange={e => onChange(e.target.value)}
                    className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-3 text-sm focus:border-cyan-500 outline-none" />
            )}
        </div>
    );
}

interface SelectFieldProps {
    label: string;
    value: string;
    options: string[];
    onChange: (v: string) => void;
}

function SelectField({ label, value, options, onChange }: SelectFieldProps) {
    return (
        <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</label>
            <select value={value} onChange={e => onChange(e.target.value)}
                className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-3 text-sm focus:border-cyan-500 outline-none cursor-pointer">
                {options.map((o: string) => <option key={o} value={o}>{o.replace(/[-_]/g, ' ').toUpperCase()}</option>)}
            </select>
        </div>
    );
}
