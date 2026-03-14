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

export default function EditLessonPage() {
    const params = useParams();
    const id = params?.id as string;
    const router = useRouter();
    const { profile, loading: authLoading } = useAuth();
    const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const isMinimal = searchParams?.get('minimal') === 'true';

    const [lesson, setLesson] = useState<any>(null);
    const [courses, setCourses] = useState<any[]>([]);
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
            const [lessonRes, planRes, materialsRes] = await Promise.all([
                db.from('lessons').select('*').eq('id', id).single(),
                db.from('lesson_plans').select('*, plan_data, covers_full_course').eq('lesson_id', id).maybeSingle(),
                db.from('lesson_materials').select('*').eq('lesson_id', id).order('created_at', { ascending: true })
            ]);

            if (lessonRes.error) throw lessonRes.error;
            const l = lessonRes.data;
            setLesson(l);
            setMaterials(materialsRes.data ?? []);

            // Handle courses with school context
            let query = db
                .from('courses')
                .select('id, title, program_id, school_id')
                .eq('is_active', true);

            if (profile?.school_id) {
                query = query.or(`school_id.eq.${profile.school_id},school_id.is.null`);
            }
            const { data: courseList } = await query.order('title');
            setCourses(courseList ?? []);

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

            if (planRes.data) {
                const pd = planRes.data as any;
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

    const [aiGeneratingPlan, setAiGeneratingPlan] = useState(false);

    const generateAiNotes = async () => {
        if (!form.title) { alert('Lesson must have a title'); return; }
        setSaving(true);
        try {
            const res = await fetch('/api/ai/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'lesson',
                    topic: form.title,
                }),
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error);
            const d = payload.data;
            setForm(prev => ({
                ...prev,
                lesson_notes: d.lesson_notes || prev.lesson_notes,
                description: d.description || prev.description
            }));
            alert('Study notes generated!');
        } catch (e: any) {
            alert(e.message);
        } finally {
            setSaving(false);
        }
    };

    const generateAiPlan = async () => {
        if (!form.title) { alert('Lesson must have a title'); return; }
        setAiGeneratingPlan(true);
        try {
            const res = await fetch('/api/ai/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'lesson',
                    topic: form.title,
                }),
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error);
            const d = payload.data;
            setPlan({
                objectives: Array.isArray(d.objectives) ? d.objectives.join('\n') : (d.objectives || ''),
                activities: Array.isArray(d.content_layout) ? d.content_layout.filter((b: any) => b.type === 'activity').map((b: any) => `${b.title || 'Activity'}: ${b.instructions || b.content || ''}`).join('\n\n') : '',
                assessment_methods: Array.isArray(d.content_layout) ? d.content_layout.filter((b: any) => b.type === 'quiz').map((b: any) => b.question || b.content || '').join('\n') : '',
                staff_notes: d.description || ''
            });
            alert('AI Plan generated! Review and save.');
        } catch (e: any) {
            alert(e.message);
        } finally {
            setAiGeneratingPlan(false);
        }
    };

    const handleSave = async () => {
        if (!id || !profile?.id) return;
        setSaving(true);
        setError(null);
        const db = createClient();
        try {
            // 1. Update Lesson
            const { error: lErr } = await db.from('lessons').update({
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
                content_layout: form.content_layout
            }).eq('id', id);
            if (lErr) throw lErr;

            // 2. Upsert Plan
            const { error: pErr } = await db.from('lesson_plans').upsert({
                lesson_id: id,
                ...plan,
                updated_at: new Date().toISOString()
            }, { onConflict: 'lesson_id' });
            if (pErr) throw pErr;

            alert('Lesson updated successfully!');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const addMaterial = async () => {
        if (!newMaterial.title || !newMaterial.file_url) return;
        const db = createClient();
        const { data, error } = await db.from('lesson_materials').insert({
            lesson_id: id,
            ...newMaterial
        }).select().single();
        if (error) { alert(error.message); return; }
        setMaterials([...materials, data]);
        setNewMaterial({ title: '', file_url: '', file_type: 'pdf' });
    };

    const deleteMaterial = async (mid: string) => {
        const db = createClient();
        const { error } = await db.from('lesson_materials').delete().eq('id', mid);
        if (error) { alert(error.message); return; }
        setMaterials(materials.filter(m => m.id !== mid));
    };

    if (authLoading || !lesson) return (
        <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <div className={`min-h-screen bg-[#0f0f1a] text-white ${isMinimal ? 'p-0' : 'p-4 sm:p-8'}`}>
            <div className={`${isMinimal ? 'w-full' : 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8'} space-y-8`}>

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        {!isMinimal && (
                            <button onClick={() => router.back()} className="p-2.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-white/40 hover:text-white" title="Go Back">
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                        )}
                        {!isMinimal && (
                            <div className="w-12 h-12 rounded-2xl bg-cyan-600/10 flex items-center justify-center text-cyan-400">
                                <BookOpen className="w-6 h-6" />
                            </div>
                        )}
                        <div>
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-1">{isMinimal ? 'Quick Edit' : 'Drafting Lesson'}</p>
                            <h1 className="text-2xl font-black">{form.title || 'Lesson Title'}</h1>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        {!isMinimal && (
                            <Link href={`/dashboard/lessons/${id}`} className="px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl font-bold text-sm hover:bg-white/10 transition-all">
                                View Live
                            </Link>
                        )}
                        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-black text-sm rounded-xl shadow-xl shadow-cyan-900/40 transition-all disabled:opacity-50">
                            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                            {saving ? (isMinimal ? 'SAVING...' : 'SAVING...') : (isMinimal ? 'SAVE' : 'SAVE CHANGES')}
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-sm font-medium">
                        {error}
                    </div>
                )}

                {/* Unified Tabs */}
                <div className="flex items-center gap-1 p-1 bg-white/5 border border-white/10 rounded-2xl w-fit">
                    <TabBtn active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={Settings2} label="Settings" />
                    <TabBtn active={activeTab === 'content'} onClick={() => setActiveTab('content')} icon={Layout} label="Visual Builder" />
                    <TabBtn active={activeTab === 'plan'} onClick={() => setActiveTab('plan')} icon={GraduationCap} label="Lesson Plan" />
                    <TabBtn active={activeTab === 'materials'} onClick={() => setActiveTab('materials')} icon={Paperclip} label="Materials" />
                </div>

                <div className="grid grid-cols-1 gap-8">
                    {activeTab === 'settings' && (
                        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-6 animate-in fade-in duration-500">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <Field label="Lesson Title" value={form.title} onChange={v => setForm({ ...form, title: v })} />
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Linked Course</label>
                                    <div className="relative">
                                        <select value={form.course_id} onChange={e => setForm({ ...form, course_id: e.target.value })}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-cyan-500 outline-none appearance-none cursor-pointer">
                                            <option value="">Select Course</option>
                                            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                                        </select>
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <ChevronDown className="w-4 h-4 text-white/20" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <SelectField label="Type" value={form.lesson_type} options={['hands-on', 'video', 'interactive', 'workshop', 'coding', 'reading']} onChange={v => setForm({ ...form, lesson_type: v })} />
                                <Field label="Duration (min)" value={form.duration_minutes} type="number" onChange={v => setForm({ ...form, duration_minutes: v })} />
                                <Field label="Sequence Number" value={form.order_index} type="number" onChange={v => setForm({ ...form, order_index: v })} />
                                <SelectField label="Status" value={form.status} options={['draft', 'scheduled', 'active', 'completed']} onChange={v => setForm({ ...form, status: v })} />
                            </div>

                            <Field label="Brief Description" value={form.description} textarea onChange={v => setForm({ ...form, description: v })} />
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Comprehensive Study Notes (Mandatory for Students)</label>
                                    <button
                                        type="button"
                                        onClick={generateAiNotes}
                                        disabled={saving}
                                        className="text-[9px] font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1 hover:text-cyan-300 transition-colors disabled:opacity-50"
                                    >
                                        <Sparkles className="w-3 h-3" /> {saving ? 'Generating...' : 'Enhance with AI'}
                                    </button>
                                </div>
                                <textarea
                                    value={form.lesson_notes}
                                    rows={8}
                                    onChange={e => setForm({ ...form, lesson_notes: e.target.value })}
                                    placeholder="These notes will be shown to students as a prerequisite to watching the video..."
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-cyan-500 outline-none resize-none"
                                />
                            </div>
                            <Field label="Video URL (YouTube/Direct)" value={form.video_url} onChange={v => setForm({ ...form, video_url: v })} />
                        </div>
                    )}

                    {activeTab === 'content' && (
                        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 animate-in fade-in duration-500">
                            <CanvaEditor layout={form.content_layout} onChange={l => setForm({ ...form, content_layout: l })} />
                        </div>
                    )}

                    {activeTab === 'plan' && (
                        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-8 animate-in fade-in duration-500">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <Sparkles className="w-6 h-6 text-amber-400" />
                                    <h2 className="text-xl font-black uppercase tracking-tight">Structured Lesson Plan</h2>
                                </div>
                                <button
                                    onClick={generateAiPlan}
                                    disabled={aiGeneratingPlan}
                                    className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                                >
                                    {aiGeneratingPlan ? (
                                        <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <Sparkles className="w-3 h-3" />
                                    )}
                                    {aiGeneratingPlan ? 'GENERATING...' : 'SYNC WITH AI'}
                                </button>
                            </div>

                            {plan.plan_data && Object.keys(plan.plan_data).length > 0 && (
                                <div className="p-6 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl space-y-4">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">Active Structured Data Detected</p>
                                        <button onClick={() => setPlan({ ...plan, plan_data: null })} className="text-[9px] text-white/20 hover:text-rose-400 uppercase font-black">Clear Structural Data</button>
                                    </div>
                                    <p className="text-xs text-white/40">This lesson is linked to a full course plan ({plan.plan_data.course_title}). The curriculum timeline will be rendered in the lesson viewer.</p>
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
                            <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
                                <h3 className="text-sm font-black uppercase tracking-widest text-white/40 mb-6">Add New Resource</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <input type="text" placeholder="Title (e.g. Starter Code)" value={newMaterial.title} onChange={e => setNewMaterial({ ...newMaterial, title: e.target.value })}
                                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-cyan-500 outline-none" />
                                    <input type="text" placeholder="URL (S3, Drive, Link...)" value={newMaterial.file_url} onChange={e => setNewMaterial({ ...newMaterial, file_url: e.target.value })}
                                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-cyan-500 outline-none" />
                                    <div className="flex gap-2">
                                        <select value={newMaterial.file_type} onChange={e => setNewMaterial({ ...newMaterial, file_type: e.target.value })}
                                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-cyan-500 outline-none">
                                            <option value="pdf">PDF</option>
                                            <option value="video">Video</option>
                                            <option value="image">Image</option>
                                            <option value="link">External Link</option>
                                        </select>
                                        <button onClick={addMaterial} className="p-2.5 bg-cyan-600 hover:bg-cyan-700 rounded-xl text-white">
                                            <Plus className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {materials.map((m) => (
                                    <div key={m.id} className="flex items-center gap-4 p-4 bg-white/5 border border-white/10 rounded-2xl group">
                                        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                                            <Paperclip className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-sm truncate">{m.title}</p>
                                            <p className="text-[10px] text-white/20 uppercase font-black">{m.file_type}</p>
                                        </div>
                                        <button onClick={() => deleteMaterial(m.id)} className="p-2 text-white/20 hover:text-rose-400 transition-colors">
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
        <button type="button" onClick={onClick} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${active ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/40' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
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
            <label className="text-[10px] font-black uppercase tracking-widest text-white/40">{label}</label>
            {textarea ? (
                <textarea value={value} rows={rows} onChange={e => onChange(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-cyan-500 outline-none resize-none" />
            ) : (
                <input type={type} value={value} onChange={e => onChange(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-cyan-500 outline-none" />
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
            <label className="text-[10px] font-black uppercase tracking-widest text-white/40">{label}</label>
            <select value={value} onChange={e => onChange(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-cyan-500 outline-none cursor-pointer">
                {options.map((o: string) => <option key={o} value={o}>{o.replace(/[-_]/g, ' ').toUpperCase()}</option>)}
            </select>
        </div>
    );
}
