'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  CalendarDaysIcon, PlusIcon, PencilIcon, TrashIcon,
  ClockIcon, BuildingOfficeIcon, XMarkIcon, CheckIcon,
  BellAlertIcon, UserGroupIcon,
} from '@heroicons/react/24/outline';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const TODAY = new Date().toLocaleDateString('en-US', { weekday: 'long' }) as typeof DAYS[number];

type Timetable = {
  id: string; title: string; section: string | null; academic_year: string | null;
  term: string | null; is_active: boolean; school_id: string | null;
  schools?: { name: string } | null;
};
type Slot = {
  id: string; timetable_id: string; day_of_week: string; start_time: string;
  end_time: string; subject: string; teacher_id: string | null; teacher_name: string | null;
  room: string | null; notes: string | null; course_id: string | null;
};

const BLANK_SLOT = {
  day_of_week: 'Monday', start_time: '08:00', end_time: '09:00',
  subject: '', teacher_id: '', teacher_name: '', room: '', notes: '', course_id: '',
};

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${color}`}>{text}</span>
  );
}

function SlotCell({ slot, onEdit, onDelete, isAdmin, highlight }: {
  slot: Slot; onEdit: (s: Slot) => void; onDelete: (id: string) => void;
  isAdmin: boolean; highlight?: boolean;
}) {
  return (
    <div className={`border rounded-xl p-2 group relative ${highlight
      ? 'bg-violet-600/20 border-violet-500/40'
      : 'bg-violet-500/10 border-violet-500/20'}`}>
      <p className="text-[11px] font-black text-white leading-tight">{slot.subject}</p>
      <p className="text-[10px] text-white/40 mt-0.5">{slot.start_time}–{slot.end_time}</p>
      {slot.teacher_name && <p className="text-[10px] text-violet-300/70 truncate">{slot.teacher_name}</p>}
      {slot.room && <p className="text-[10px] text-white/30">{slot.room}</p>}
      {isAdmin && (
        <div className="absolute top-1 right-1 hidden group-hover:flex gap-1">
          <button onClick={() => onEdit(slot)}
            className="p-1 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
            <PencilIcon className="w-3 h-3 text-white/60" />
          </button>
          <button onClick={() => onDelete(slot.id)}
            className="p-1 bg-rose-500/20 hover:bg-rose-500/30 rounded-lg transition-colors">
            <TrashIcon className="w-3 h-3 text-rose-400" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function TimetablePage() {
  const { profile, loading: authLoading } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isTeacher = profile?.role === 'teacher';
  const isSchool = profile?.role === 'school';
  const isStudent = profile?.role === 'student';

  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; full_name: string | null }[]>([]);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTimetable, setActiveTimetable] = useState<string | null>(null);

  const [showTTForm, setShowTTForm] = useState(false);
  const [editingTT, setEditingTT] = useState<Timetable | null>(null);
  const [ttForm, setTTForm] = useState({
    title: '', section: '', academic_year: '2025/2026', term: 'First Term',
    school_id: '', is_active: true,
  });

  const [showSlotForm, setShowSlotForm] = useState(false);
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null);
  const [slotForm, setSlotForm] = useState({ ...BLANK_SLOT });
  const [saving, setSaving] = useState(false);

  const db = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any;

  async function loadTimetables() {
    setLoading(true); setError(null);
    try {
      const { data, error: err } = await anyDb.from('timetables')
        .select('*, schools(name)')
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false });
      if (err) throw err;
      const list = (data ?? []) as Timetable[];
      setTimetables(list);
      // prefer active timetable; fall back to first
      const preferred = list.find(t => t.is_active) ?? list[0];
      if (preferred && !activeTimetable) {
        setActiveTimetable(preferred.id);
        await loadSlots(preferred.id);
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to load timetables');
    } finally {
      setLoading(false);
    }
  }

  async function loadSlots(ttId: string) {
    const { data, error: err } = await anyDb.from('timetable_slots')
      .select('*').eq('timetable_id', ttId).order('start_time');
    if (err) { setError(err.message); return; }
    setSlots((data ?? []) as Slot[]);
  }

  useEffect(() => {
    if (authLoading || !profile) return;
    if (!isTeacher) loadTimetables();
    if (isAdmin) {
      db.from('portal_users').select('id, full_name').eq('role', 'teacher').order('full_name')
        .then(({ data }) => setTeachers(data ?? []));
      db.from('schools').select('id, name').order('name')
        .then(({ data }) => setSchools((data ?? []) as { id: string; name: string }[]));
    }
  }, [profile?.id, authLoading]); // eslint-disable-line

  const handleSelectTT = async (id: string) => {
    setActiveTimetable(id);
    await loadSlots(id);
  };

  // ── Timetable CRUD ────────────────────────────────────────────────────────
  const openNewTT = () => {
    setEditingTT(null);
    setTTForm({ title: '', section: '', academic_year: '2025/2026', term: 'First Term', school_id: '', is_active: true });
    setShowTTForm(true);
  };
  const openEditTT = (tt: Timetable) => {
    setEditingTT(tt);
    setTTForm({ title: tt.title, section: tt.section ?? '', academic_year: tt.academic_year ?? '', term: tt.term ?? '', school_id: tt.school_id ?? '', is_active: tt.is_active });
    setShowTTForm(true);
  };
  const saveTT = async () => {
    if (!ttForm.title.trim() || !ttForm.school_id) { setError('Title and School are required.'); return; }
    setSaving(true); setError(null);
    try {
      const payload = {
        title: ttForm.title.trim(), section: ttForm.section || null,
        academic_year: ttForm.academic_year || null, term: ttForm.term || null,
        school_id: ttForm.school_id || null, is_active: ttForm.is_active,
        created_by: profile!.id,
      };
      if (editingTT) {
        await anyDb.from('timetables').update(payload).eq('id', editingTT.id);
      } else {
        await anyDb.from('timetables').insert(payload);
      }
      await loadTimetables();
      setShowTTForm(false);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };
  const deleteTT = async (id: string) => {
    if (!confirm('Delete this timetable and ALL its slots?')) return;
    await anyDb.from('timetables').delete().eq('id', id);
    setTimetables(prev => prev.filter(t => t.id !== id));
    if (activeTimetable === id) { setActiveTimetable(null); setSlots([]); }
  };

  // ── Slot CRUD ─────────────────────────────────────────────────────────────
  const openNewSlot = () => {
    if (!activeTimetable) return;
    setEditingSlot(null); setSlotForm({ ...BLANK_SLOT }); setShowSlotForm(true);
  };
  const openEditSlot = (slot: Slot) => {
    setEditingSlot(slot);
    setSlotForm({
      day_of_week: slot.day_of_week, start_time: slot.start_time, end_time: slot.end_time,
      subject: slot.subject, teacher_id: slot.teacher_id ?? '', teacher_name: slot.teacher_name ?? '',
      room: slot.room ?? '', notes: slot.notes ?? '', course_id: slot.course_id ?? '',
    });
    setShowSlotForm(true);
  };
  const saveSlot = async () => {
    if (!slotForm.subject.trim() || !activeTimetable) return;
    setSaving(true);
    try {
      const teacher = teachers.find(t => t.id === slotForm.teacher_id);
      const payload = {
        timetable_id: activeTimetable,
        day_of_week: slotForm.day_of_week, start_time: slotForm.start_time,
        end_time: slotForm.end_time, subject: slotForm.subject.trim(),
        teacher_id: slotForm.teacher_id || null,
        teacher_name: (teacher?.full_name ?? slotForm.teacher_name.trim()) || null,
        room: slotForm.room.trim() || null, notes: slotForm.notes.trim() || null,
        course_id: slotForm.course_id || null,
      };
      if (editingSlot) {
        await anyDb.from('timetable_slots').update(payload).eq('id', editingSlot.id);
      } else {
        await anyDb.from('timetable_slots').insert(payload);
      }
      await loadSlots(activeTimetable);
      setShowSlotForm(false);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };
  const deleteSlot = async (id: string) => {
    if (!confirm('Delete this slot?')) return;
    await anyDb.from('timetable_slots').delete().eq('id', id);
    setSlots(prev => prev.filter(s => s.id !== id));
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const slotsByDay: Record<string, Slot[]> = {};
  DAYS.forEach(d => {
    slotsByDay[d] = slots.filter(s => s.day_of_week === d)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  });
  const active = timetables.find(t => t.id === activeTimetable);
  const todaySlots = slotsByDay[TODAY] ?? [];

  // ── Teacher view: slots across all schools ────────────────────────────────
  const [teacherSlots, setTeacherSlots] = useState<(Slot & { timetable?: Timetable })[]>([]);
  useEffect(() => {
    if (!isTeacher || !profile) return;
    anyDb.from('timetable_slots')
      .select('*, timetables(*, schools(name))')
      .eq('teacher_id', profile.id)
      .order('start_time')
      .then(({ data }: { data: any[] | null }) => {
        setTeacherSlots((data ?? []).map((s: any) => ({ ...s, timetable: s.timetables })));
        setLoading(false);
      });
  }, [profile?.id, isTeacher]); // eslint-disable-line

  const teacherTodaySlots = teacherSlots.filter(s => s.day_of_week === TODAY);

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-white/40 text-sm">Loading timetable…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CalendarDaysIcon className="w-5 h-5 text-violet-400" />
              <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">Schedule</span>
            </div>
            <h1 className="text-3xl font-extrabold">Timetable</h1>
            <p className="text-white/40 text-sm mt-1">
              {isTeacher ? 'Your teaching schedule across all partner schools' :
                isStudent ? 'Your class schedule' :
                  isSchool ? 'Your school\'s timetable' :
                    'Create and manage school timetables'}
            </p>
          </div>
          {isAdmin && (
            <button onClick={openNewTT}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm rounded-xl transition-all hover:scale-105 shadow-lg shadow-violet-900/30">
              <PlusIcon className="w-4 h-4" /> New Timetable
            </button>
          )}
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-rose-400 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-rose-400/60 hover:text-rose-400"><XMarkIcon className="w-4 h-4" /></button>
          </div>
        )}

        {/* ── Teacher: today's alert + full schedule ── */}
        {isTeacher && (
          <div className="space-y-5">

            {/* Today's classes callout */}
            {teacherTodaySlots.length > 0 ? (
              <div className="bg-violet-600/10 border border-violet-500/30 rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 bg-violet-600/20 rounded-xl flex items-center justify-center">
                    <BellAlertIcon className="w-5 h-5 text-violet-400" />
                  </div>
                  <div>
                    <p className="font-black text-white text-sm">You have {teacherTodaySlots.length} class{teacherTodaySlots.length > 1 ? 'es' : ''} today</p>
                    <p className="text-[11px] text-violet-400/70">{TODAY} · {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {teacherTodaySlots.map(slot => (
                    <div key={slot.id} className="flex items-center gap-4 bg-violet-600/10 border border-violet-500/20 rounded-xl px-4 py-3">
                      <div className="flex-shrink-0 min-w-[80px]">
                        <p className="text-sm font-black text-violet-300">{slot.start_time}</p>
                        <p className="text-[10px] text-white/30">to {slot.end_time}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-white">{slot.subject}</p>
                        {slot.room && <p className="text-xs text-white/40">Room: {slot.room}</p>}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs font-bold text-white/60">{(slot.timetable as any)?.schools?.name ?? '—'}</p>
                        {(slot.timetable as any)?.section && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-white/10 rounded text-white/40">
                            {(slot.timetable as any).section}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4 px-5 py-4 bg-white/[0.03] border border-white/10 rounded-2xl">
                <ClockIcon className="w-5 h-5 text-white/20 flex-shrink-0" />
                <p className="text-sm text-white/30">No classes scheduled for you today ({TODAY}).</p>
              </div>
            )}

            {/* Full weekly schedule */}
            <div className="space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-white/30">Full Weekly Schedule</p>
              {DAYS.map(day => {
                const daySlots = teacherSlots.filter(s => s.day_of_week === day);
                if (daySlots.length === 0) return null;
                return (
                  <div key={day} className={`border rounded-2xl p-5 ${day === TODAY ? 'bg-violet-600/5 border-violet-500/20' : 'bg-white/5 border-white/10'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="font-black text-white">{day}</h3>
                      {day === TODAY && <Badge text="Today" color="bg-violet-600/30 text-violet-300" />}
                      <span className="text-[11px] text-white/30 ml-auto">{daySlots.length} slot{daySlots.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="space-y-2">
                      {daySlots.map(slot => (
                        <div key={slot.id} className="flex items-start gap-4 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3">
                          <div className="flex-shrink-0 text-center min-w-[70px]">
                            <p className="text-sm font-black text-violet-400">{slot.start_time}</p>
                            <p className="text-[10px] text-white/30">to {slot.end_time}</p>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-white">{slot.subject}</p>
                            {slot.room && <p className="text-xs text-white/40">Room: {slot.room}</p>}
                            {slot.notes && <p className="text-xs text-white/30 italic mt-0.5">{slot.notes}</p>}
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <p className="text-xs font-bold text-white/50">{(slot.timetable as any)?.schools?.name ?? '—'}</p>
                            {(slot.timetable as any)?.section && (
                              <p className="text-[10px] text-white/30">{(slot.timetable as any).section}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {teacherSlots.length === 0 && (
                <div className="text-center py-20 bg-white/5 border border-white/10 rounded-2xl">
                  <CalendarDaysIcon className="w-14 h-14 mx-auto text-white/10 mb-3" />
                  <p className="text-white/30 font-semibold">No schedule assigned to you yet.</p>
                  <p className="text-white/20 text-xs mt-1">Contact your admin to be assigned to timetable slots.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Admin / School / Student: timetable grid view ── */}
        {!isTeacher && (
          <>
            {/* Today's highlight for student/school */}
            {(isStudent || isSchool) && timetables.length > 0 && todaySlots.length > 0 && (
              <div className="bg-violet-600/10 border border-violet-500/30 rounded-2xl p-4 flex items-center gap-4">
                <BellAlertIcon className="w-5 h-5 text-violet-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-black text-white">{todaySlots.length} class{todaySlots.length > 1 ? 'es' : ''} scheduled today</p>
                  <p className="text-[11px] text-violet-400/70">{TODAY} — {todaySlots.map(s => s.subject).join(', ')}</p>
                </div>
              </div>
            )}

            {/* Timetable tabs */}
            {timetables.length > 0 && (
              <div className="space-y-2">
                {isAdmin && (
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/30">
                    Select timetable — each belongs to a specific school &amp; section
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  {timetables.map(tt => (
                    <div key={tt.id} role="button" tabIndex={0}
                      onClick={() => handleSelectTT(tt.id)}
                      onKeyDown={e => e.key === 'Enter' && handleSelectTT(tt.id)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${activeTimetable === tt.id
                        ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/30'
                        : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white'}`}>
                      <BuildingOfficeIcon className="w-4 h-4 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="truncate">{tt.title}</p>
                        {(tt as any).schools?.name && (
                          <p className={`text-[10px] truncate ${activeTimetable === tt.id ? 'text-violet-200' : 'text-white/30'}`}>
                            {(tt as any).schools.name}
                          </p>
                        )}
                      </div>
                      {tt.section && <Badge text={tt.section} color={activeTimetable === tt.id ? 'bg-white/20 text-white' : 'bg-white/10 text-white/40'} />}
                      {!tt.is_active && <Badge text="Inactive" color="bg-rose-500/20 text-rose-400" />}
                      {isAdmin && (
                        <span className="flex items-center gap-1 ml-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          <button onClick={() => openEditTT(tt)}
                            className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                            <PencilIcon className="w-3 h-3 text-white/40 hover:text-white" />
                          </button>
                          <button onClick={() => deleteTT(tt.id)}
                            className="p-1 hover:bg-rose-500/20 rounded-lg transition-colors">
                            <TrashIcon className="w-3 h-3 text-rose-400/60 hover:text-rose-400" />
                          </button>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active timetable info bar */}
            {active && (
              <div className="flex flex-wrap items-center gap-4 px-5 py-3 bg-white/[0.03] border border-white/10 rounded-2xl text-xs text-white/40 font-semibold">
                <span className="flex items-center gap-1.5">
                  <BuildingOfficeIcon className="w-3.5 h-3.5" />
                  <span className="text-white/70 font-bold">{(active as any).schools?.name ?? 'All Schools'}</span>
                </span>
                {active.section && (
                  <span><span className="text-white/20">Section:</span> <span className="text-white/70">{active.section}</span></span>
                )}
                {active.term && (
                  <span><span className="text-white/20">Term:</span> <span className="text-white/70">{active.term}</span></span>
                )}
                {active.academic_year && (
                  <span><span className="text-white/20">Year:</span> <span className="text-white/70">{active.academic_year}</span></span>
                )}
                <span className="flex items-center gap-1.5">
                  <UserGroupIcon className="w-3.5 h-3.5" />
                  <span>{slots.length} slot{slots.length !== 1 ? 's' : ''}</span>
                </span>
                {isAdmin && (
                  <button onClick={openNewSlot}
                    className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/30 text-violet-400 rounded-xl transition-colors font-bold">
                    <PlusIcon className="w-3.5 h-3.5" /> Add Slot
                  </button>
                )}
              </div>
            )}

            {/* Week grid */}
            {activeTimetable && (
              <div className="overflow-x-auto">
                <div className="min-w-[700px] grid grid-cols-5 gap-3">
                  {DAYS.map(day => (
                    <div key={day} className="space-y-2">
                      <div className={`border rounded-xl px-3 py-2 text-center ${day === TODAY
                        ? 'bg-violet-600/30 border-violet-500/40'
                        : 'bg-violet-600/10 border-violet-500/10'}`}>
                        <p className={`text-xs font-black uppercase tracking-widest ${day === TODAY ? 'text-violet-200' : 'text-violet-300/60'}`}>
                          {day.slice(0, 3)}
                        </p>
                        {day === TODAY && <p className="text-[9px] text-violet-300/60">Today</p>}
                      </div>
                      <div className="space-y-2 min-h-[120px]">
                        {slotsByDay[day]?.length === 0 && (
                          <div className="border border-dashed border-white/5 rounded-xl p-4 text-center">
                            {isAdmin && (
                              <button
                                onClick={() => { setSlotForm({ ...BLANK_SLOT, day_of_week: day }); setEditingSlot(null); setShowSlotForm(true); }}
                                className="text-[10px] text-white/20 hover:text-violet-400 transition-colors">
                                + Add
                              </button>
                            )}
                          </div>
                        )}
                        {slotsByDay[day]?.map(slot => (
                          <SlotCell key={slot.id} slot={slot} onEdit={openEditSlot}
                            onDelete={deleteSlot} isAdmin={isAdmin} highlight={day === TODAY} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {timetables.length === 0 && (
              <div className="text-center py-24 bg-white/5 border border-white/10 rounded-2xl">
                <CalendarDaysIcon className="w-16 h-16 mx-auto text-white/10 mb-4" />
                {isAdmin ? (
                  <>
                    <p className="text-lg font-semibold text-white/30">No timetables yet</p>
                    <p className="text-white/20 text-sm mt-1">Create one and assign it to a school, section, and term.</p>
                    <button onClick={openNewTT}
                      className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm rounded-xl transition-all">
                      <PlusIcon className="w-4 h-4" /> Create First Timetable
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-semibold text-white/30">No timetable assigned</p>
                    <p className="text-white/20 text-sm mt-1 max-w-xs mx-auto">
                      {isSchool ? 'No timetable has been set up for your school yet. Contact your Rillcod admin.' :
                        'Your school\'s timetable has not been published yet. Check back soon.'}
                    </p>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Timetable Form Modal ── */}
      {showTTForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#0f0f1a] border border-white/10 rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-white">{editingTT ? 'Edit Timetable' : 'New Timetable'}</h2>
              <button onClick={() => setShowTTForm(false)} className="p-2 text-white/40 hover:text-white rounded-xl hover:bg-white/10">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* School — full width, prominent */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">
                  Partner School <span className="text-rose-400">*</span>
                </label>
                <select value={ttForm.school_id} onChange={e => setTTForm(s => ({ ...s, school_id: e.target.value }))}
                  className={`w-full bg-white/5 border rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500 ${!ttForm.school_id ? 'border-rose-500/40' : 'border-white/10'}`}>
                  <option value="">— Select partner school —</option>
                  {schools.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
                </select>
                {!ttForm.school_id && (
                  <p className="text-[10px] text-rose-400/70">Required — determines which school sees this timetable</p>
                )}
              </div>

              {/* Title */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">
                  Timetable Title <span className="text-rose-400">*</span>
                </label>
                <input value={ttForm.title} onChange={e => setTTForm(s => ({ ...s, title: e.target.value }))}
                  placeholder="e.g. 2025/2026 First Term — Primary"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Section</label>
                  <select value={ttForm.section} onChange={e => setTTForm(s => ({ ...s, section: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500">
                    <option value="">All</option>
                    <option value="Primary">Primary</option>
                    <option value="Secondary">Secondary</option>
                    <option value="Unified">Unified</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Academic Year</label>
                  <select value={ttForm.academic_year} onChange={e => setTTForm(s => ({ ...s, academic_year: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500">
                    {['2024/2025', '2025/2026', '2026/2027'].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Term</label>
                  <select value={ttForm.term} onChange={e => setTTForm(s => ({ ...s, term: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500">
                    {['First Term', 'Second Term', 'Third Term', 'Annual'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <div className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${ttForm.is_active ? 'bg-violet-600' : 'bg-white/10'}`}
                  onClick={() => setTTForm(s => ({ ...s, is_active: !s.is_active }))}>
                  <div className={`w-5 h-5 bg-white rounded-full mt-0.5 transition-transform shadow ${ttForm.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <div>
                  <p className="text-sm text-white/70 font-semibold">Active timetable</p>
                  <p className="text-[10px] text-white/30">Visible to teachers, students, and the school</p>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setShowTTForm(false)} className="px-4 py-2 text-sm text-white/40 hover:text-white transition-colors">Cancel</button>
              <button onClick={saveTT} disabled={saving || !ttForm.title.trim() || !ttForm.school_id}
                className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                {editingTT ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Slot Form Modal ── */}
      {showSlotForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#0f0f1a] border border-white/10 rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-extrabold text-white">{editingSlot ? 'Edit Slot' : 'Add Slot'}</h2>
                {active && (
                  <p className="text-xs text-white/30 mt-0.5">
                    {(active as any).schools?.name ?? 'Timetable'} · {active.section ?? 'All sections'}
                  </p>
                )}
              </div>
              <button onClick={() => setShowSlotForm(false)} className="p-2 text-white/40 hover:text-white rounded-xl hover:bg-white/10">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Subject / Activity <span className="text-rose-400">*</span></label>
                <input value={slotForm.subject} onChange={e => setSlotForm(s => ({ ...s, subject: e.target.value }))}
                  placeholder="e.g. Python Programming"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Day</label>
                <select value={slotForm.day_of_week} onChange={e => setSlotForm(s => ({ ...s, day_of_week: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500">
                  {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Assigned Teacher</label>
                <select value={slotForm.teacher_id} onChange={e => setSlotForm(s => ({ ...s, teacher_id: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500">
                  <option value="">— Select teacher —</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Start Time</label>
                <input type="time" value={slotForm.start_time} onChange={e => setSlotForm(s => ({ ...s, start_time: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">End Time</label>
                <input type="time" value={slotForm.end_time} onChange={e => setSlotForm(s => ({ ...s, end_time: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Room / Location</label>
                <input value={slotForm.room} onChange={e => setSlotForm(s => ({ ...s, room: e.target.value }))}
                  placeholder="e.g. ICT Lab 2"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500" />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Notes</label>
                <input value={slotForm.notes} onChange={e => setSlotForm(s => ({ ...s, notes: e.target.value }))}
                  placeholder="e.g. Bring laptops, practical session"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500" />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowSlotForm(false)} className="px-4 py-2 text-sm text-white/40 hover:text-white transition-colors">Cancel</button>
              <button onClick={saveSlot} disabled={saving || !slotForm.subject.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                {editingSlot ? 'Update Slot' : 'Add Slot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
