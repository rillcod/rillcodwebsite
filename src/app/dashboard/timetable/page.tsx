// @refresh reset
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  CalendarDaysIcon, PlusIcon, PencilIcon, TrashIcon,
  ClockIcon, BuildingOfficeIcon, XMarkIcon, CheckIcon,
  BellAlertIcon, UserGroupIcon, UserIcon,
  EllipsisVerticalIcon, ArrowsRightLeftIcon, ClipboardDocumentCheckIcon,
} from '@/lib/icons';

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

// ── Slot action menu ──────────────────────────────────────────────────────────
function SlotMenu({
  slot, teachers, canEdit, onEdit, onDelete, onReassign, onMove,
}: {
  slot: Slot;
  teachers: { id: string; full_name: string | null }[];
  canEdit: boolean;
  onEdit: (s: Slot) => void;
  onDelete: (id: string) => void;
  onReassign: (slotId: string, teacherId: string, teacherName: string) => void;
  onMove: (slotId: string, day: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<'reassign' | 'move' | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setSub(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!canEdit) return null;

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => { setOpen(v => !v); setSub(null); }}
        className="p-1.5 rounded-none hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        title="Slot actions"
      >
        <EllipsisVerticalIcon className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-7 z-50 w-44 bg-card border border-border rounded-none shadow-2xl overflow-hidden">
          {sub === null && (
            <>
              <button
                onClick={() => { setOpen(false); onEdit(slot); }}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <PencilIcon className="w-3.5 h-3.5 text-blue-400" /> Edit Slot
              </button>
              <button
                onClick={() => setSub('reassign')}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <UserIcon className="w-3.5 h-3.5 text-primary" /> Reassign Teacher
              </button>
              <button
                onClick={() => setSub('move')}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <ArrowsRightLeftIcon className="w-3.5 h-3.5 text-amber-400" /> Move to Day
              </button>
              <div className="border-t border-border" />
              <button
                onClick={() => { setOpen(false); onDelete(slot.id); }}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors"
              >
                <TrashIcon className="w-3.5 h-3.5" /> Delete Slot
              </button>
            </>
          )}

          {sub === 'reassign' && (
            <>
              <div className="px-4 py-2 border-b border-border flex items-center gap-2">
                <button onClick={() => setSub(null)} className="text-muted-foreground hover:text-foreground text-xs">←</button>
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Reassign Teacher</span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                <button
                  onClick={() => { onReassign(slot.id, '', ''); setOpen(false); setSub(null); }}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  — Unassign
                </button>
                {teachers.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { onReassign(slot.id, t.id, t.full_name ?? ''); setOpen(false); setSub(null); }}
                    className={`flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-muted transition-colors ${slot.teacher_id === t.id ? 'text-primary font-bold' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {slot.teacher_id === t.id && <CheckIcon className="w-3 h-3 flex-shrink-0" />}
                    {t.full_name ?? 'Unnamed'}
                  </button>
                ))}
              </div>
            </>
          )}

          {sub === 'move' && (
            <>
              <div className="px-4 py-2 border-b border-border flex items-center gap-2">
                <button onClick={() => setSub(null)} className="text-muted-foreground hover:text-foreground text-xs">←</button>
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Move to Day</span>
              </div>
              {DAYS.filter(d => d !== slot.day_of_week).map(day => (
                <button
                  key={day}
                  onClick={() => { onMove(slot.id, day); setOpen(false); setSub(null); }}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <ArrowsRightLeftIcon className="w-3.5 h-3.5 text-amber-400" /> {day}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Slot card ─────────────────────────────────────────────────────────────────
function SlotCell({
  slot, teachers, onEdit, onDelete, onReassign, onMove, canEdit, isCurrent,
}: {
  slot: Slot;
  teachers: { id: string; full_name: string | null }[];
  onEdit: (s: Slot) => void;
  onDelete: (id: string) => void;
  onReassign: (slotId: string, teacherId: string, teacherName: string) => void;
  onMove: (slotId: string, day: string) => void;
  canEdit: boolean;
  isCurrent?: boolean;
}) {
  const isPractical = /lab|practical|coding|robotics/i.test(slot.subject);
  const isExam = /exam|test|quiz/i.test(slot.subject);

  const cardCls = isCurrent
    ? 'bg-primary border-primary shadow-[0_0_20px_rgba(139,92,246,0.3)] ring-2 ring-primary/50'
    : isPractical
      ? 'bg-cyan-500/10 border-cyan-500/20'
      : isExam
        ? 'bg-rose-500/10 border-rose-500/20'
        : 'bg-primary/10 border-primary/20';

  return (
    <div className={`border rounded-none p-3 transition-all duration-300 ${cardCls}`}>
      {/* Top row: subject + menu */}
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-black text-foreground leading-tight uppercase tracking-tight truncate">{slot.subject}</p>
          <p className={`text-[10px] mt-0.5 font-bold ${isCurrent ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
            {slot.start_time}–{slot.end_time}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isCurrent && (
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          )}
          <SlotMenu
            slot={slot}
            teachers={teachers}
            canEdit={canEdit}
            onEdit={onEdit}
            onDelete={onDelete}
            onReassign={onReassign}
            onMove={onMove}
          />
        </div>
      </div>

      {slot.teacher_name && (
        <p className={`text-[10px] mt-2 font-medium truncate ${isCurrent ? 'text-muted-foreground' : 'text-primary/60'}`}>
          👤 {slot.teacher_name}
        </p>
      )}
      {slot.room && (
        <p className={`text-[10px] mt-0.5 font-bold ${isCurrent ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
          📍 {slot.room}
        </p>
      )}
      {isCurrent && (
        <p className="text-[9px] font-black text-emerald-400 mt-2 uppercase tracking-widest animate-pulse">Now Ongoing</p>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TimetablePage() {
  const { profile, loading: authLoading } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isTeacher = profile?.role === 'teacher';
  const isSchool = profile?.role === 'school';
  const isStudent = profile?.role === 'student';
  const canEdit = isAdmin || isTeacher;

  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; full_name: string | null }[]>([]);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTimetable, setActiveTimetable] = useState<string | null>(null);
  const [mobileDay, setMobileDay] = useState(DAYS.includes(TODAY) ? TODAY : 'Monday');

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

  async function loadTimetables(initialSchoolId?: string | null) {
    setLoading(true); setError(null);
    try {
      let query = anyDb.from('timetables').select('*, schools(name)');

      // Security & Visibility: If student or school partner, they can ONLY see their own school's TTs.
      // If admin/teacher, they see all (optionally filtered by Param).
      const finalFilterId = (isStudent || isSchool) ? profile?.school_id : initialSchoolId;
      
      if (finalFilterId) {
        query = query.eq('school_id', finalFilterId);
      } else if (isStudent || isSchool) {
        // If restricted role but no school_id, must not show anything
        setTimetables([]);
        setLoading(false);
        return;
      }

      const { data, error: err } = await query
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false });
      
      if (err) throw err;
      const list = (data ?? []) as Timetable[];
      setTimetables(list);
      
      // Auto-select logic:
      // 1. If school_id passed in URL or profile, pick that school's active TT
      // 2. Else pick the global active one or first one
      let preferred = list.find(t => t.is_active);
      
      if (finalFilterId) {
        const schoolTT = list.find(t => t.school_id === finalFilterId && t.is_active) 
                      || list.find(t => t.school_id === finalFilterId);
        if (schoolTT) preferred = schoolTT;
      }

      if (!preferred && list.length > 0) preferred = list[0];

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

  const searchParams = useSearchParams();
  const schoolIdParam = searchParams.get('school_id');

  useEffect(() => {
    if (authLoading || !profile) return;
    
    // For students and school partners, default to their assigned school
    const defaultSchoolId = schoolIdParam || profile.school_id;
    
    if (!isTeacher) loadTimetables(defaultSchoolId);
    
    if (isAdmin) {
      db.from('portal_users').select('id, full_name').eq('role', 'teacher').order('full_name')
        .then(({ data }) => setTeachers(data ?? []));
      db.from('schools').select('id, name').order('name')
        .then(({ data }) => setSchools((data ?? []) as { id: string; name: string }[]));
    }
  }, [profile?.id, authLoading, schoolIdParam, profile?.school_id, profile?.role]); // eslint-disable-line

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
      };
      if (editingTT) {
        const res = await fetch(`/api/timetables/${editingTT.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to save'); }
      } else {
        const res = await fetch('/api/timetables', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to save'); }
      }
      await loadTimetables();
      setShowTTForm(false);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };
  const deleteTT = async (id: string) => {
    if (!confirm('Delete this timetable and ALL its slots?')) return;
    await fetch(`/api/timetables/${id}`, { method: 'DELETE' });
    setTimetables(prev => prev.filter(t => t.id !== id));
    if (activeTimetable === id) { setActiveTimetable(null); setSlots([]); }
  };

  // ── Slot CRUD ─────────────────────────────────────────────────────────────
  const openNewSlot = (day?: string) => {
    if (!activeTimetable) return;
    setEditingSlot(null);
    setSlotForm({ ...BLANK_SLOT, day_of_week: day || 'Monday' });
    setShowSlotForm(true);
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
        const res = await fetch(`/api/timetable-slots/${editingSlot.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to save slot'); }
        setSlots(prev => prev.map(s => s.id === editingSlot.id ? { ...s, ...payload, id: s.id, timetable_id: s.timetable_id } : s));
      } else {
        const res = await fetch('/api/timetable-slots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to save slot'); }
        const { data: newSlot } = await res.json();
        if (newSlot) setSlots(prev => [...prev, newSlot].sort((a, b) => a.start_time.localeCompare(b.start_time)));
        else await loadSlots(activeTimetable);
      }
      setShowSlotForm(false);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };
  const deleteSlot = async (id: string) => {
    if (!confirm('Delete this slot?')) return;
    await fetch(`/api/timetable-slots/${id}`, { method: 'DELETE' });
    setSlots(prev => prev.filter(s => s.id !== id));
  };

  // ── Quick reassign teacher ────────────────────────────────────────────────
  const handleReassign = async (slotId: string, teacherId: string, teacherName: string) => {
    const res = await fetch(`/api/timetable-slots/${slotId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacher_id: teacherId || null, teacher_name: teacherName || null }),
    });
    if (!res.ok) { const j = await res.json(); setError(j.error || 'Reassign failed'); return; }
    setSlots(prev => prev.map(s => s.id === slotId
      ? { ...s, teacher_id: teacherId || null, teacher_name: teacherName || null }
      : s
    ));
  };

  // ── Quick move to day ─────────────────────────────────────────────────────
  const handleMove = async (slotId: string, day: string) => {
    const res = await fetch(`/api/timetable-slots/${slotId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day_of_week: day }),
    });
    if (!res.ok) { const j = await res.json(); setError(j.error || 'Move failed'); return; }
    setSlots(prev => prev.map(s => s.id === slotId ? { ...s, day_of_week: day } : s));
  };

  // ── Professional A4 timetable print ──────────────────────────────────────
  const buildTimetablePrint = (
    ttMeta: { title: string; section?: string | null; term?: string | null; academic_year?: string | null; schools?: { name: string } | null },
    printSlots: Slot[],
    forTeacher?: string,
  ) => {
    const docRef = `TT-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const schoolName = (ttMeta as any).schools?.name ?? 'Rillcod Technologies';

    const slotsByDayLocal: Record<string, Slot[]> = {};
    DAYS.forEach(d => {
      slotsByDayLocal[d] = printSlots.filter(s => s.day_of_week === d).sort((a, b) => a.start_time.localeCompare(b.start_time));
    });

    const daysHtml = DAYS.map(day => {
      const daySlots = slotsByDayLocal[day] ?? [];
      if (daySlots.length === 0) return `
        <div style="margin-bottom:14px;">
          <div style="background:#1e3a8a;color:#fff;padding:6px 12px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:1px;border-radius:6px 6px 0 0;">${day}</div>
          <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 6px 6px;padding:10px 12px;">
            <span style="font-size:10px;color:#9ca3af;font-style:italic;">No classes scheduled</span>
          </div>
        </div>`;

      const rows = daySlots.map((slot, i) => `
        <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'};border-bottom:1px solid #e5e7eb;">
          <td style="padding:7px 10px;font-weight:700;font-size:11px;white-space:nowrap;color:#4c1d95;">${slot.start_time} – ${slot.end_time}</td>
          <td style="padding:7px 10px;font-weight:800;font-size:11px;text-transform:uppercase;">${slot.subject}</td>
          <td style="padding:7px 10px;font-size:10px;color:#6b7280;">${slot.teacher_name ?? '—'}</td>
          <td style="padding:7px 10px;font-size:10px;color:#6b7280;">${slot.room ?? '—'}</td>
          <td style="padding:7px 10px;font-size:10px;color:#9ca3af;font-style:italic;">${slot.notes ?? ''}</td>
        </tr>`).join('');

      return `
        <div style="margin-bottom:16px;break-inside:avoid;">
          <div style="background:#1e3a8a;color:#fff;padding:7px 12px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;border-radius:6px 6px 0 0;display:flex;justify-content:space-between;">
            <span>${day}</span><span style="opacity:0.6;">${daySlots.length} slot${daySlots.length !== 1 ? 's' : ''}</span>
          </div>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 6px 6px;overflow:hidden;">
            <thead><tr style="background:#ede9fe;">
              <th style="padding:6px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#5b21b6;text-align:left;width:16%;">Time</th>
              <th style="padding:6px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#5b21b6;text-align:left;width:28%;">Subject / Topic</th>
              <th style="padding:6px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#5b21b6;text-align:left;width:22%;">Teacher / Facilitator</th>
              <th style="padding:6px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#5b21b6;text-align:left;width:12%;">Room</th>
              <th style="padding:6px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#5b21b6;text-align:left;width:22%;">Notes</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }).join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Timetable — ${ttMeta.title}</title>
      <style>
        @page { size: A4; margin: 18mm 15mm 20mm 15mm; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; margin: 0; }
        .no-print { display: none; }
        @media screen { .no-print { display: block; } }
      </style>
    </head><body>

    <div class="no-print" style="padding:12px;text-align:right;background:#f3f4f6;border-bottom:1px solid #e5e7eb;">
      <button onclick="window.print()" style="padding:8px 20px;background:#7c3aed;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:13px;">🖨 Print / Save as PDF</button>
    </div>

    <!-- Letterhead -->
    <div style="display:flex;align-items:center;gap:16px;border-bottom:3px solid #7c3aed;padding-bottom:14px;margin-bottom:18px;">
      <img src="${window.location.origin}/logo.png" alt="Rillcod" style="width:56px;height:56px;object-fit:contain;flex-shrink:0;" onerror="this.style.display='none'" />
      <div style="flex:1;">
        <div style="font-size:20px;font-weight:900;color:#7c3aed;letter-spacing:-0.5px;line-height:1.1;">RILLCOD TECHNOLOGIES</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;">Coding Today, Innovating Tomorrow</div>
        <div style="font-size:10px;color:#9ca3af;margin-top:2px;">26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City &nbsp;·&nbsp; 08116600091 &nbsp;·&nbsp; support@rillcod.com</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;">Official Document</div>
        <div style="font-size:14px;font-weight:900;color:#7c3aed;text-transform:uppercase;">Class Timetable</div>
        <div style="font-size:10px;color:#9ca3af;margin-top:4px;">${dateStr}</div>
      </div>
    </div>

    <!-- Title block -->
    <div style="background:linear-gradient(135deg,#4c1d95 0%,#7c3aed 100%);border-radius:10px;padding:14px 20px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-size:16px;font-weight:900;color:#fff;">${forTeacher ? `Personal Schedule — ${forTeacher}` : ttMeta.title}</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:3px;">${schoolName}${ttMeta.section ? ` · Section: ${ttMeta.section}` : ''}</div>
      </div>
      <div style="text-align:right;color:rgba(255,255,255,0.7);font-size:10px;">
        <div>Ref: <strong style="color:#fff;">${docRef}</strong></div>
        <div>${ttMeta.term ?? ''}${ttMeta.term && ttMeta.academic_year ? ' · ' : ''}${ttMeta.academic_year ?? ''}</div>
      </div>
    </div>

    <!-- Metadata grid -->
    <table style="width:100%;margin-bottom:14px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:7px 12px;background:#f9fafb;border-right:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;width:16%;">School</td>
        <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:11px;font-weight:600;width:34%;">${schoolName}</td>
        <td style="padding:7px 12px;background:#f9fafb;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;width:16%;">Term</td>
        <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:11px;font-weight:600;width:34%;">${ttMeta.term ?? '—'}</td>
      </tr>
      <tr>
        <td style="padding:7px 12px;background:#f9fafb;border-right:1px solid #e5e7eb;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;">Section</td>
        <td style="padding:7px 12px;font-size:11px;">${ttMeta.section ?? '—'}</td>
        <td style="padding:7px 12px;background:#f9fafb;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;">Academic Year</td>
        <td style="padding:7px 12px;font-size:11px;">${ttMeta.academic_year ?? '—'}</td>
      </tr>
    </table>

    <!-- Day-by-day schedule -->
    ${daysHtml}

    <!-- Footer -->
    <div style="margin-top:24px;padding-top:12px;border-top:2px solid #7c3aed;display:flex;justify-content:space-between;align-items:flex-end;">
      <div>
        <div style="font-size:10px;color:#9ca3af;margin-bottom:5px;">Head of Academics</div>
        <div style="border-top:1px solid #374151;width:160px;padding-top:4px;font-size:10px;color:#6b7280;">Signature &amp; Date</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:10px;color:#9ca3af;margin-bottom:5px;">School Authority Stamp</div>
        <div style="border:1px dashed #d1d5db;width:100px;height:40px;border-radius:6px;"></div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:9px;color:#d1d5db;">Ref: ${docRef}</div>
        <div style="font-size:9px;color:#d1d5db;">Printed: ${dateStr}</div>
        <div style="font-size:9px;color:#d1d5db;">academy.rillcod.com — Confidential</div>
      </div>
    </div>
    </body></html>`;
  };

  const handlePrint = () => {
    if (isTeacher) {
      // Teacher: print their personal schedule
      if (teacherSlots.length === 0) { alert('No schedule assigned to you yet.'); return; }
      const ttMeta = {
        title: 'My Teaching Schedule',
        section: null,
        term: (teacherSlots[0]?.timetable as any)?.term ?? null,
        academic_year: (teacherSlots[0]?.timetable as any)?.academic_year ?? null,
        schools: { name: 'All Assigned Schools' },
      };
      const win = window.open('', '_blank');
      if (!win) { alert('Pop-up blocked.'); return; }
      win.document.write(buildTimetablePrint(ttMeta, teacherSlots as Slot[], profile?.full_name ?? 'Teacher'));
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 600);
      return;
    }
    if (!active) { alert('No timetable selected.'); return; }
    const win = window.open('', '_blank');
    if (!win) { alert('Pop-up blocked.'); return; }
    win.document.write(buildTimetablePrint(active, slots));
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  };

  // Admin: print ALL timetables in one document
  const handlePrintAll = async () => {
    if (!isAdmin || timetables.length === 0) return;
    // Fetch all slots for all timetables
    const { data: allSlots } = await anyDb.from('timetable_slots').select('*').order('start_time');
    const slotList = (allSlots ?? []) as Slot[];
    const pages = timetables.map(tt => {
      const ttSlots = slotList.filter(s => s.timetable_id === tt.id);
      return buildTimetablePrint(tt, ttSlots);
    });
    // Merge all into one document with page breaks
    const combined = pages.map(p => {
      // Extract just the body content between <body> and </body>
      const bodyMatch = p.match(/<body>([\s\S]*)<\/body>/i);
      return bodyMatch ? bodyMatch[1] : p;
    }).join('<div style="page-break-before:always;"></div>');

    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const full = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>All Timetables — ${dateStr}</title>
      <style>@page{size:A4;margin:18mm 15mm 20mm 15mm;}body{font-family:'Segoe UI',Arial,sans-serif;color:#111827;margin:0;}
      .no-print{display:none;}@media screen{.no-print{display:block;}}</style>
      </head><body><div class="no-print" style="padding:12px;text-align:right;background:#f3f4f6;border-bottom:1px solid #e5e7eb;">
      <button onclick="window.print()" style="padding:8px 20px;background:#7c3aed;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">🖨 Print All</button>
      </div>${combined}</body></html>`;

    const win = window.open('', '_blank');
    if (!win) { alert('Pop-up blocked.'); return; }
    win.document.write(full);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 800);
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
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Loading timetable…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* ── Schedule Tab Bar ── */}
        {(isAdmin || isTeacher) && (
          <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1 w-fit flex-wrap">
            <Link href="/dashboard/classes"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
              <UserGroupIcon className="w-4 h-4" /> Classes
            </Link>
            <span className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-black">
              <CalendarDaysIcon className="w-4 h-4" /> Timetable
            </span>
            <Link href="/dashboard/attendance"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
              <ClipboardDocumentCheckIcon className="w-4 h-4" /> Attendance
            </Link>
          </div>
        )}
        {isStudent && (
          <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1 w-fit flex-wrap">
            <span className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-black">
              <CalendarDaysIcon className="w-4 h-4" /> Timetable
            </span>
            <Link href="/dashboard/attendance"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
              <ClipboardDocumentCheckIcon className="w-4 h-4" /> Attendance
            </Link>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CalendarDaysIcon className="w-5 h-5 text-primary" />
              <span className="text-xs font-bold text-primary uppercase tracking-widest">Schedule</span>
            </div>
            <h1 className="text-3xl font-extrabold">Timetable</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isTeacher ? 'Your teaching schedule across all partner schools' :
                isStudent ? 'Your class schedule' :
                  isSchool ? 'Your school\'s timetable' :
                    'Create and manage school timetables'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 bg-card shadow-sm border border-border hover:bg-muted text-muted-foreground font-bold text-sm rounded-none transition-all"
            >
              <CalendarDaysIcon className="w-4 h-4" /> {isTeacher ? 'Print My Schedule' : 'Print Timetable'}
            </button>
            {isAdmin && (
              <button
                onClick={handlePrintAll}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 hover:bg-primary/20 text-primary font-bold text-sm rounded-none transition-all"
              >
                <CalendarDaysIcon className="w-4 h-4" /> Print All
              </button>
            )}
            {isAdmin && (
              <button onClick={openNewTT}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary text-foreground font-bold text-sm rounded-none transition-all hover:scale-105 shadow-lg shadow-orange-900/30">
                <PlusIcon className="w-4 h-4" /> New Timetable
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-none p-4 text-rose-400 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-rose-400/60 hover:text-rose-400"><XMarkIcon className="w-4 h-4" /></button>
          </div>
        )}

        {/* ── Teacher: today's alert + full schedule ── */}
        {isTeacher && (
          <div className="space-y-5">
            {teacherTodaySlots.length > 0 ? (
              <div className="bg-primary/10 border border-primary/30 rounded-none p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 bg-primary/20 rounded-none flex items-center justify-center">
                    <BellAlertIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-black text-foreground text-sm">You have {teacherTodaySlots.length} class{teacherTodaySlots.length > 1 ? 'es' : ''} today</p>
                    <p className="text-[11px] text-primary/70">{TODAY} · {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {teacherTodaySlots.map(slot => (
                    <div key={slot.id} className="flex items-center gap-4 bg-primary/10 border border-primary/20 rounded-none px-4 py-3">
                      <div className="flex-shrink-0 min-w-[80px]">
                        <p className="text-sm font-black text-primary">{slot.start_time}</p>
                        <p className="text-[10px] text-muted-foreground">to {slot.end_time}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-foreground">{slot.subject}</p>
                        {slot.room && <p className="text-xs text-muted-foreground">Room: {slot.room}</p>}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs font-bold text-muted-foreground">{(slot.timetable as any)?.schools?.name ?? '—'}</p>
                        {(slot.timetable as any)?.section && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                            {(slot.timetable as any).section}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4 px-5 py-4 bg-white/[0.03] border border-border rounded-none">
                <ClockIcon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <p className="text-sm text-muted-foreground">No classes scheduled for you today ({TODAY}).</p>
              </div>
            )}

            <div className="space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Full Weekly Schedule</p>
              {DAYS.map(day => {
                const daySlots = teacherSlots.filter(s => s.day_of_week === day);
                if (daySlots.length === 0) return null;
                return (
                  <div key={day} className={`border rounded-none p-5 ${day === TODAY ? 'bg-primary/5 border-primary/20' : 'bg-card shadow-sm border-border'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="font-black text-foreground">{day}</h3>
                      {day === TODAY && <Badge text="Today" color="bg-primary/30 text-primary" />}
                      <span className="text-[11px] text-muted-foreground ml-auto">{daySlots.length} slot{daySlots.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="space-y-2">
                      {daySlots.map(slot => (
                        <div key={slot.id} className="flex items-start gap-4 bg-white/[0.03] border border-border rounded-none px-4 py-3">
                          <div className="flex-shrink-0 text-center min-w-[70px]">
                            <p className="text-sm font-black text-primary">{slot.start_time}</p>
                            <p className="text-[10px] text-muted-foreground">to {slot.end_time}</p>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-foreground">{slot.subject}</p>
                            {slot.room && <p className="text-xs text-muted-foreground">Room: {slot.room}</p>}
                            {slot.notes && <p className="text-xs text-muted-foreground italic mt-0.5">{slot.notes}</p>}
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <p className="text-xs font-bold text-muted-foreground">{(slot.timetable as any)?.schools?.name ?? '—'}</p>
                            {(slot.timetable as any)?.section && (
                              <p className="text-[10px] text-muted-foreground">{(slot.timetable as any).section}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {teacherSlots.length === 0 && (
                <div className="text-center py-20 bg-card shadow-sm border border-border rounded-none">
                  <CalendarDaysIcon className="w-14 h-14 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground font-semibold">No schedule assigned to you yet.</p>
                  <p className="text-muted-foreground text-xs mt-1">Contact your admin to be assigned to timetable slots.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Admin / School / Student: timetable grid view ── */}
        {!isTeacher && (
          <>
            {/* Today's highlight */}
            {(isStudent || isSchool) && timetables.length > 0 && todaySlots.length > 0 && (
              <div className="bg-primary/10 border border-primary/30 rounded-none p-4 flex items-center gap-4">
                <BellAlertIcon className="w-5 h-5 text-primary flex-shrink-0" />
                <div>
                  <p className="text-sm font-black text-foreground">{todaySlots.length} class{todaySlots.length > 1 ? 'es' : ''} scheduled today</p>
                  <p className="text-[11px] text-primary/70">{TODAY} — {todaySlots.map(s => s.subject).join(', ')}</p>
                </div>
              </div>
            )}

            {/* Timetable tabs */}
            {timetables.length > 0 && (
              <div className="space-y-2">
                {isAdmin && (
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Select timetable — each belongs to a specific school &amp; section
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  {timetables.map(tt => (
                    <div key={tt.id} role="button" tabIndex={0}
                      onClick={() => handleSelectTT(tt.id)}
                      onKeyDown={e => e.key === 'Enter' && handleSelectTT(tt.id)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-none text-sm font-bold transition-all cursor-pointer ${activeTimetable === tt.id
                        ? 'bg-primary text-foreground shadow-lg shadow-orange-900/30'
                        : 'bg-card shadow-sm border border-border text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                      <BuildingOfficeIcon className="w-4 h-4 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="truncate">{tt.title}</p>
                        {(tt as any).schools?.name && (
                          <p className={`text-[10px] truncate ${activeTimetable === tt.id ? 'text-primary' : 'text-muted-foreground'}`}>
                            {(tt as any).schools.name}
                          </p>
                        )}
                      </div>
                      {tt.section && <Badge text={tt.section} color={activeTimetable === tt.id ? 'bg-muted text-foreground' : 'bg-muted text-muted-foreground'} />}
                      {!tt.is_active && <Badge text="Inactive" color="bg-rose-500/20 text-rose-400" />}
                      {isAdmin && (
                        <span className="flex items-center gap-1 ml-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          <button onClick={() => openEditTT(tt)}
                            className="p-1 hover:bg-muted rounded-none transition-colors" title="Edit timetable">
                            <PencilIcon className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                          </button>
                          <button onClick={() => deleteTT(tt.id)}
                            className="p-1 hover:bg-rose-500/20 rounded-none transition-colors" title="Delete timetable">
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
              <div className="flex flex-wrap items-center gap-4 px-5 py-3 bg-white/[0.03] border border-border rounded-none text-xs text-muted-foreground font-semibold">
                <span className="flex items-center gap-1.5">
                  <BuildingOfficeIcon className="w-3.5 h-3.5" />
                  <span className="text-muted-foreground font-bold">{(active as any).schools?.name ?? 'All Schools'}</span>
                </span>
                {active.section && <span><span className="text-muted-foreground">Section:</span> <span className="text-muted-foreground">{active.section}</span></span>}
                {active.term && <span><span className="text-muted-foreground">Term:</span> <span className="text-muted-foreground">{active.term}</span></span>}
                {active.academic_year && <span><span className="text-muted-foreground">Year:</span> <span className="text-muted-foreground">{active.academic_year}</span></span>}
                <span className="flex items-center gap-1.5">
                  <UserGroupIcon className="w-3.5 h-3.5" />
                  <span>{slots.length} slot{slots.length !== 1 ? 's' : ''}</span>
                </span>
                {canEdit && (
                  <button onClick={() => openNewSlot()}
                    className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary rounded-none transition-colors font-bold">
                    <PlusIcon className="w-3.5 h-3.5" /> Add Slot
                  </button>
                )}
              </div>
            )}

            {/* Mobile Day Selector */}
            {activeTimetable && (
              <div className="flex sm:hidden gap-1 p-1 bg-card shadow-sm border border-border rounded-none overflow-x-auto">
                {DAYS.map(day => (
                  <button
                    key={day}
                    onClick={() => setMobileDay(day)}
                    className={`flex-1 min-w-[60px] py-3 rounded-none text-[10px] font-black uppercase tracking-widest transition-all ${mobileDay === day ? 'bg-primary text-foreground shadow-lg' : 'text-muted-foreground'}`}
                  >
                    {day.slice(0, 3)}
                    {day === TODAY && <span className="block text-[8px] opacity-60">Today</span>}
                  </button>
                ))}
              </div>
            )}

            {/* Week grid */}
            {activeTimetable && (
              <div className="overflow-x-auto sm:overflow-visible">
                <div className="min-w-0 sm:min-w-[700px] grid grid-cols-1 sm:grid-cols-5 gap-3">
                  {DAYS.map(day => {
                    const daySlotList = slotsByDay[day] ?? [];
                    return (
                      <div key={day} className={`space-y-2 ${mobileDay === day ? 'block' : 'hidden sm:block'}`}>
                        {/* Day header */}
                        <div className={`border rounded-none px-3 py-2 flex items-center justify-between ${day === TODAY
                          ? 'bg-primary/30 border-primary/40'
                          : 'bg-primary/10 border-primary/10'}`}>
                          <div>
                            <p className={`text-xs font-black uppercase tracking-widest ${day === TODAY ? 'text-primary' : 'text-primary/60'}`}>
                              {day.slice(0, 3)}
                            </p>
                            {day === TODAY && <p className="text-[9px] text-primary/60">Today</p>}
                          </div>
                          <div className="flex items-center gap-1">
                            {daySlotList.length > 0 && (
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${day === TODAY ? 'bg-primary/40 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                {daySlotList.length}
                              </span>
                            )}
                            {canEdit && (
                              <button
                                onClick={() => openNewSlot(day)}
                                className="p-1 rounded-none hover:bg-muted transition-colors"
                                title={`Add slot for ${day}`}
                              >
                                <PlusIcon className={`w-3.5 h-3.5 ${day === TODAY ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Slots */}
                        <div className="space-y-2 min-h-[80px]">
                          {daySlotList.length === 0 && (
                            <div className="border border-dashed border-border rounded-none p-4 text-center">
                              {canEdit ? (
                                <button
                                  onClick={() => openNewSlot(day)}
                                  className="text-[10px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 mx-auto">
                                  <PlusIcon className="w-3 h-3" /> Add slot
                                </button>
                              ) : (
                                <p className="text-[10px] text-muted-foreground">No classes</p>
                              )}
                            </div>
                          )}
                          {daySlotList.map(slot => {
                            const now = new Date();
                            const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
                            const currentTime = now.getHours() * 60 + now.getMinutes();
                            const [h1 = 0, m1 = 0] = (slot.start_time ?? '').split(':').map(Number);
                            const [h2 = 0, m2 = 0] = (slot.end_time ?? '').split(':').map(Number);
                            const start = h1 * 60 + m1;
                            const end = h2 * 60 + m2;
                            const isCurrent = day === currentDay && currentTime >= start && currentTime < end;

                            return (
                              <SlotCell
                                key={slot.id}
                                slot={slot}
                                teachers={teachers}
                                onEdit={openEditSlot}
                                onDelete={deleteSlot}
                                onReassign={handleReassign}
                                onMove={handleMove}
                                canEdit={canEdit}
                                isCurrent={isCurrent}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {timetables.length === 0 && (
              <div className="text-center py-24 bg-card shadow-sm border border-border rounded-none">
                <CalendarDaysIcon className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                {isAdmin ? (
                  <>
                    <p className="text-lg font-semibold text-muted-foreground">No timetables yet</p>
                    <p className="text-muted-foreground text-sm mt-1">Create one and assign it to a school, section, and term.</p>
                    <button onClick={openNewTT}
                      className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary text-foreground font-bold text-sm rounded-none transition-all">
                      <PlusIcon className="w-4 h-4" /> Create First Timetable
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-semibold text-muted-foreground">No timetable assigned</p>
                    <p className="text-muted-foreground text-sm mt-1 max-w-xs mx-auto">
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
          <div className="w-full max-w-lg bg-background border border-border rounded-none p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-foreground">{editingTT ? 'Edit Timetable' : 'New Timetable'}</h2>
              <button onClick={() => setShowTTForm(false)} className="p-2 text-muted-foreground hover:text-foreground rounded-none hover:bg-muted">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Partner School <span className="text-rose-400">*</span>
                </label>
                <select value={ttForm.school_id} onChange={e => setTTForm(s => ({ ...s, school_id: e.target.value }))}
                  className={`w-full bg-card shadow-sm border rounded-none px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary ${!ttForm.school_id ? 'border-rose-500/40' : 'border-border'}`}>
                  <option value="">— Select partner school —</option>
                  {schools.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Timetable Title <span className="text-rose-400">*</span>
                </label>
                <input value={ttForm.title} onChange={e => setTTForm(s => ({ ...s, title: e.target.value }))}
                  placeholder="e.g. 2025/2026 First Term — Primary"
                  className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Section</label>
                  <select value={ttForm.section} onChange={e => setTTForm(s => ({ ...s, section: e.target.value }))}
                    className="w-full bg-card shadow-sm border border-border rounded-none px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary">
                    <option value="">All</option>
                    <option value="Primary">Primary</option>
                    <option value="Secondary">Secondary</option>
                    <option value="Unified">Unified</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Academic Year</label>
                  <select value={ttForm.academic_year} onChange={e => setTTForm(s => ({ ...s, academic_year: e.target.value }))}
                    className="w-full bg-card shadow-sm border border-border rounded-none px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary">
                    {['2024/2025', '2025/2026', '2026/2027'].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Term</label>
                  <select value={ttForm.term} onChange={e => setTTForm(s => ({ ...s, term: e.target.value }))}
                    className="w-full bg-card shadow-sm border border-border rounded-none px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary">
                    {['First Term', 'Second Term', 'Third Term', 'Annual'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <div className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${ttForm.is_active ? 'bg-primary' : 'bg-muted'}`}
                  onClick={() => setTTForm(s => ({ ...s, is_active: !s.is_active }))}>
                  <div className={`w-5 h-5 bg-card rounded-full mt-0.5 transition-transform shadow ${ttForm.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Active timetable</p>
                  <p className="text-[10px] text-muted-foreground">Visible to teachers, students, and the school</p>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setShowTTForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
              <button onClick={saveTT} disabled={saving || !ttForm.title.trim() || !ttForm.school_id}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary disabled:opacity-50 text-foreground font-bold text-sm rounded-none transition-all">
                {saving ? <div className="w-4 h-4 border-2 border-border border-t-transparent rounded-full animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                {editingTT ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Slot Form Modal ── */}
      {showSlotForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-background border border-border rounded-none p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-extrabold text-foreground">{editingSlot ? 'Edit Slot' : 'Add Slot'}</h2>
                {active && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(active as any).schools?.name ?? 'Timetable'} · {active.section ?? 'All sections'}
                  </p>
                )}
              </div>
              <button onClick={() => setShowSlotForm(false)} className="p-2 text-muted-foreground hover:text-foreground rounded-none hover:bg-muted">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Subject / Activity <span className="text-rose-400">*</span></label>
                <input value={slotForm.subject} onChange={e => setSlotForm(s => ({ ...s, subject: e.target.value }))}
                  placeholder="e.g. Python Programming"
                  className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Day</label>
                <select value={slotForm.day_of_week} onChange={e => setSlotForm(s => ({ ...s, day_of_week: e.target.value }))}
                  className="w-full bg-card shadow-sm border border-border rounded-none px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary">
                  {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Assigned Teacher</label>
                <select value={slotForm.teacher_id} onChange={e => setSlotForm(s => ({ ...s, teacher_id: e.target.value }))}
                  className="w-full bg-card shadow-sm border border-border rounded-none px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary">
                  <option value="">— Unassigned —</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Start Time</label>
                <input type="time" value={slotForm.start_time} onChange={e => setSlotForm(s => ({ ...s, start_time: e.target.value }))}
                  className="w-full bg-card shadow-sm border border-border rounded-none px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">End Time</label>
                <input type="time" value={slotForm.end_time} onChange={e => setSlotForm(s => ({ ...s, end_time: e.target.value }))}
                  className="w-full bg-card shadow-sm border border-border rounded-none px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Room / Location</label>
                <input value={slotForm.room} onChange={e => setSlotForm(s => ({ ...s, room: e.target.value }))}
                  placeholder="e.g. ICT Lab 2"
                  className="w-full bg-card shadow-sm border border-border rounded-none px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Notes</label>
                <input value={slotForm.notes} onChange={e => setSlotForm(s => ({ ...s, notes: e.target.value }))}
                  placeholder="e.g. Bring laptops, practical session"
                  className="w-full bg-card shadow-sm border border-border rounded-none px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setShowSlotForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
              <button onClick={saveSlot} disabled={saving || !slotForm.subject.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary disabled:opacity-50 text-foreground font-bold text-sm rounded-none transition-all">
                {saving ? <div className="w-4 h-4 border-2 border-border border-t-transparent rounded-full animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                {editingSlot ? 'Update Slot' : 'Add Slot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
