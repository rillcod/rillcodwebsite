'use client';

import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  CloudArrowDownIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  LockOpenIcon,
  PhoneIcon,
  PlusIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  XMarkIcon,
} from '@/lib/icons';
import { SINGLE_GRADES, canonicalGrade } from '@/lib/classes/naming';
import { accessCardCodeForStudent, formatAccessCardCodeDisplay } from '@/lib/access-card-code';

export interface IntakeStudentRow {
  id: string;
  full_name: string;
  email?: string | null;
  grade?: string | null;
  parent_phone?: string | null;
  parent_name?: string | null;
  parent_verified?: boolean;
  parent_phone_source?: string | null;
  session_status?: 'confirmed_current' | 'carryover_unconfirmed';
  confirmed_session?: string | null;
  created_at?: string | null;
}

export interface DestinationClassOption {
  id: string;
  name: string;
  qa_grade_key?: string | null;
}

interface ClassIntakeAndSessionPanelProps {
  classId: string;
  className: string;
  classGradeKey?: string | null;
  currentSession: string;
  students: IntakeStudentRow[];
  destinationClasses: DestinationClassOption[];
  initialTab?: 'intake' | 'hygiene';
  onClose: () => void;
  onRefresh: () => void | Promise<void>;
}

function formatWhatsAppDigits(phone?: string | null): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (digits.length === 11 && digits.startsWith('0')) return `234${digits.slice(1)}`;
  if (digits.length === 10 && /^[789]/.test(digits)) return `234${digits}`;
  if (digits.startsWith('234')) return digits;
  return digits;
}

function suggestNextClass(
  className: string,
  classGradeKey: string | null | undefined,
  destinations: DestinationClassOption[],
): string {
  const cur = canonicalGrade(classGradeKey || className);
  if (!cur) return destinations[0]?.id ?? '';
  const idx = (SINGLE_GRADES as readonly string[]).indexOf(cur);
  const nextGrade = idx >= 0 && idx < SINGLE_GRADES.length - 1 ? SINGLE_GRADES[idx + 1] : null;
  if (!nextGrade) return destinations[0]?.id ?? '';
  const exact = destinations.find(
    (c) =>
      canonicalGrade(c.qa_grade_key || c.name) === nextGrade ||
      c.name.toLowerCase().includes(nextGrade.toLowerCase()),
  );
  return exact?.id ?? destinations[0]?.id ?? '';
}

export function ClassIntakeAndSessionPanel({
  classId,
  className,
  classGradeKey,
  currentSession,
  students,
  destinationClasses,
  initialTab = 'intake',
  onClose,
  onRefresh,
}: ClassIntakeAndSessionPanelProps) {
  const defaultGrade = canonicalGrade(classGradeKey || className) || SINGLE_GRADES[0];

  const [tab, setTab] = useState<'intake' | 'hygiene'>(initialTab);
  // Teacher/Admin Grade Lock vs Student Grade Dropdown
  const [lockGrade, setLockGrade] = useState<boolean>(Boolean(canonicalGrade(classGradeKey || className)));
  const [selectedGrade, setSelectedGrade] = useState<string>(defaultGrade);
  // Kid-friendly Pass-Around Mode (hides roster editing/deletion while passing device around class)
  const [passAroundMode, setPassAroundMode] = useState(false);
  const [passAroundAddedCount, setPassAroundAddedCount] = useState(0);
  const [lastAddedName, setLastAddedName] = useState<string | null>(null);

  // Quick intake form
  const [fullName, setFullName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Inline phone edit
  const [editingPhoneId, setEditingPhoneId] = useState<string | null>(null);
  const [editingPhoneValue, setEditingPhoneValue] = useState('');
  const [savingPhoneId, setSavingPhoneId] = useState<string | null>(null);

  // Cohort hygiene (Old vs New Session)
  const carryoverStudents = useMemo(
    () => students.filter((s) => s.session_status === 'carryover_unconfirmed'),
    [students],
  );
  const currentSessionStudents = useMemo(
    () => students.filter((s) => s.session_status !== 'carryover_unconfirmed'),
    [students],
  );
  const [selectedHygieneIds, setSelectedHygieneIds] = useState<Set<string>>(
    () => new Set(carryoverStudents.map((s) => s.id)),
  );
  const [destClassId, setDestClassId] = useState<string>(() =>
    suggestNextClass(className, classGradeKey, destinationClasses),
  );
  const [hygieneBusy, setHygieneBusy] = useState<string | null>(null);

  const withPhoneCount = useMemo(
    () => students.filter((s) => Boolean(formatWhatsAppDigits(s.parent_phone))).length,
    [students],
  );
  const verifiedCount = useMemo(
    () => students.filter((s) => s.parent_verified).length,
    [students],
  );
  const isEntryClass = /\b(basic\s*1|primary\s*1|jss\s*1|ss\s*1)\b/i.test(`${classGradeKey || ''} ${className}`);

  const handleIntakeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = fullName.trim();
    if (trimmed.length < 2) {
      toast.error('Please enter the student full name.');
      nameInputRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/classes/${classId}/intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'intake_add',
          full_name: trimmed,
          grade: selectedGrade,
          parent_phone: parentPhone.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not add student.');
      setFullName('');
      setParentPhone('');
      setLastAddedName(json.student?.full_name || trimmed);
      if (passAroundMode) {
        setPassAroundAddedCount((c) => c + 1);
      }
      toast.success(
        json.created
          ? `${json.student?.full_name || trimmed} added to ${className}!`
          : `${json.student?.full_name || trimmed} confirmed on ${className}!`,
      );
      await onRefresh();
      setTimeout(() => nameInputRef.current?.focus(), 40);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add student.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInlinePhoneSave = async (studentId: string) => {
    setSavingPhoneId(studentId);
    try {
      const res = await fetch(`/api/classes/${classId}/intake`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          parent_phone: editingPhoneValue.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not update phone.');
      toast.success('Parent phone updated.');
      setEditingPhoneId(null);
      await onRefresh();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update phone.');
    } finally {
      setSavingPhoneId(null);
    }
  };

  const copyWhatsAppNumbers = async () => {
    const nums = students
      .map((s) => formatWhatsAppDigits(s.parent_phone))
      .filter((v): v is string => Boolean(v))
      .map((d) => `+${d}`);
    if (nums.length === 0) {
      toast.error('No parent phone numbers captured in this class yet.');
      return;
    }
    try {
      await navigator.clipboard.writeText(nums.join('\n'));
      toast.success(`Copied ${nums.length} WhatsApp parent number${nums.length === 1 ? '' : 's'}!`);
    } catch {
      toast.error('Could not copy to clipboard.');
    }
  };

  const downloadWhatsAppVCard = () => {
    const entries = students
      .map((s) => ({ student: s, digits: formatWhatsAppDigits(s.parent_phone) }))
      .filter((item): item is { student: IntakeStudentRow; digits: string } => Boolean(item.digits));
    if (entries.length === 0) {
      toast.error('No parent phone numbers captured in this class yet.');
      return;
    }
    const vcf = entries
      .map(({ student, digits }) => {
        const label = `Parent of ${student.full_name} (${student.grade || className})`;
        return [
          'BEGIN:VCARD',
          'VERSION:3.0',
          `FN:${label}`,
          `N:${label};;;;`,
          `TEL;TYPE=CELL,VOICE:+${digits}`,
          `ORG:Rillcod Academy - ${className}`,
          `NOTE:Student: ${student.full_name} | Class: ${className} | Session: ${currentSession}`,
          'END:VCARD',
        ].join('\r\n');
      })
      .join('\r\n');
    const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${className.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-whatsapp-parents.vcf`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${entries.length} WhatsApp contact${entries.length === 1 ? '' : 's'} (.vcf) — open on phone to import into Contacts.`);
  };

  const exportIntakeCsv = () => {
    const header = ['S/N', 'Full Name', 'Grade', 'Parent Phone', 'WhatsApp Format', 'Parent Status', 'Session Status', 'RC Code'];
    const rows = students.map((s, idx) => {
      const wa = formatWhatsAppDigits(s.parent_phone);
      const pStatus = s.parent_verified
        ? 'Parent Verified'
        : wa
        ? 'Pending Parent Verification'
        : 'No Phone Yet';
      const sStatus = s.session_status === 'carryover_unconfirmed'
        ? 'Prior Session (Unconfirmed)'
        : `Active (${currentSession})`;
      const rc = formatAccessCardCodeDisplay(accessCardCodeForStudent(s.id));
      return [
        String(idx + 1),
        s.full_name,
        s.grade || classGradeKey || className,
        s.parent_phone || '',
        wa ? `+${wa}` : '',
        pStatus,
        sStatus,
        rc,
      ];
    });
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${className.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-class-intake-${currentSession.replace('/', '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${students.length} student record${students.length === 1 ? '' : 's'} to CSV.`);
  };

  const runCohortHygiene = async (operation: 'confirm_current' | 'archive_old' | 'promote_to_class') => {
    const ids = Array.from(selectedHygieneIds);
    if (ids.length === 0) {
      toast.error('Select at least one student first.');
      return;
    }
    if (operation === 'promote_to_class' && !destClassId) {
      toast.error('Choose the destination class first.');
      return;
    }
    const labelMap = {
      confirm_current: `Confirm ${ids.length} student(s) as active in ${className} for ${currentSession}?`,
      archive_old: `Archive ${ids.length} prior-session student(s) out of ${className}'s active roster? Their past results and certificates stay 100% safe.`,
      promote_to_class: `Move ${ids.length} student(s) to the selected next class for ${currentSession}?`,
    };
    if (!confirm(labelMap[operation])) return;

    setHygieneBusy(operation);
    try {
      const res = await fetch(`/api/classes/${classId}/intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cohort_hygiene',
          operation,
          student_ids: ids,
          destination_class_id: operation === 'promote_to_class' ? destClassId : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not update session cohort.');
      toast.success(json.message || 'Session cohort updated.');
      setSelectedHygieneIds(new Set());
      await onRefresh();
    } catch (err: any) {
      toast.error(err?.message || 'Cohort cleanup failed.');
    } finally {
      setHygieneBusy(null);
    }
  };

  return (
    <div className="rounded-2xl border border-primary/30 bg-card shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-primary/5 border-b border-border px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-widest text-primary">
              Digital Class Sheet · {currentSession}
            </span>
            {carryoverStudents.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/40 px-2 py-0.5 text-[10px] font-black text-amber-800 dark:text-amber-300">
                <ExclamationTriangleIcon className="w-3 h-3" />
                {carryoverStudents.length} prior-session unconfirmed
              </span>
            )}
          </div>
          <h3 className="text-sm sm:text-base font-black text-foreground mt-0.5">
            {className} — Intake, WhatsApp List &amp; Session Cleanup
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {!passAroundMode && (
            <div className="inline-flex rounded-xl bg-muted p-1 border border-border">
              <button
                type="button"
                onClick={() => setTab('intake')}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${
                  tab === 'intake'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Intake &amp; WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setTab('hygiene')}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all inline-flex items-center gap-1.5 ${
                  tab === 'hygiene'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Old vs New Session
                {carryoverStudents.length > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                    tab === 'hygiene' ? 'bg-white/20 text-white' : 'bg-amber-500 text-black'
                  }`}>
                    {carryoverStudents.length}
                  </span>
                )}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close digital class sheet"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground hover:text-foreground"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* TAB 1: DIGITAL INTAKE & WHATSAPP CONTACT LIST */}
      {tab === 'intake' && (
        <div className="p-4 sm:p-5 space-y-5">
          {/* Teacher Grade Lock + Pass-Around Student Entry Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setLockGrade((v) => !v)}
                className={`inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 rounded-lg border text-xs font-black transition-colors ${
                  lockGrade
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-foreground hover:bg-muted'
                }`}
              >
                {lockGrade ? <LockClosedIcon className="w-3.5 h-3.5" /> : <LockOpenIcon className="w-3.5 h-3.5" />}
                {lockGrade ? `Grade Locked: ${selectedGrade}` : 'Student Picks Grade'}
              </button>
              {lockGrade && (
                <select
                  aria-label="Locked class grade"
                  value={selectedGrade}
                  onChange={(e) => setSelectedGrade(e.target.value)}
                  className="min-h-9 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-bold text-foreground"
                >
                  {SINGLE_GRADES.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setPassAroundMode((v) => !v);
                setLastAddedName(null);
              }}
              className={`inline-flex items-center gap-1.5 min-h-9 px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-colors ${
                passAroundMode
                  ? 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm'
                  : 'border border-emerald-600/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/20'
              }`}
            >
              <UserGroupIcon className="w-4 h-4" />
              {passAroundMode ? 'Exit Pass-Around Mode' : 'Student Pass-Around Mode'}
            </button>
          </div>

          {/* Fast Intake Entry Form (Paper-Sheet Replacement) */}
          <form
            onSubmit={handleIntakeSubmit}
            className={`rounded-2xl border p-4 sm:p-5 space-y-4 ${
              passAroundMode
                ? 'border-emerald-500/50 bg-emerald-500/[0.06]'
                : 'border-primary/25 bg-primary/[0.03]'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-foreground">
                  {passAroundMode
                    ? '👋 Student Self-Entry — Type Your Name & Parent Phone'
                    : 'Quick Add Student to Live Class List'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Full name appears on results &amp; report cards. Parent phone is{' '}
                  <strong className="text-foreground">optional</strong> (especially for Basic classes) — parents verify &amp; complete extra details when checking results.
                </p>
              </div>
              {passAroundMode && passAroundAddedCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-700 px-3 py-1 text-xs font-black text-white">
                  <CheckCircleIcon className="w-3.5 h-3.5" />
                  {passAroundAddedCount} added
                </span>
              )}
            </div>

            {lastAddedName && (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-bold text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-2">
                <span>
                  ✓ <strong>{lastAddedName}</strong> saved to {className}!{' '}
                  {passAroundMode ? 'Hand the device to the next classmate.' : 'Ready for the next student.'}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className={lockGrade ? 'sm:col-span-5' : 'sm:col-span-4'}>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                  Student Full Name *
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Chinedu Okafor"
                  className="w-full min-h-11 rounded-xl border border-border bg-background px-3.5 py-2 text-sm font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {!lockGrade && (
                <div className="sm:col-span-3">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                    Grade / Class *
                  </label>
                  <select
                    aria-label="Student grade"
                    value={selectedGrade}
                    onChange={(e) => setSelectedGrade(e.target.value)}
                    className="w-full min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {SINGLE_GRADES.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className={lockGrade ? 'sm:col-span-4' : 'sm:col-span-3'}>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                  Parent Phone <span className="text-muted-foreground font-semibold normal-case">(Optional)</span>
                </label>
                <input
                  type="tel"
                  value={parentPhone}
                  onChange={(e) => setParentPhone(e.target.value)}
                  placeholder="0801 234 5678 (or leave blank)"
                  className="w-full min-h-11 rounded-xl border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className={lockGrade ? 'sm:col-span-3 flex items-end' : 'sm:col-span-2 flex items-end'}>
                <button
                  type="submit"
                  disabled={submitting || fullName.trim().length < 2}
                  className="w-full min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-45 px-4 py-2 text-xs font-black uppercase tracking-wider text-primary-foreground shadow-sm transition-colors"
                >
                  <PlusIcon className="w-4 h-4" />
                  {submitting ? 'Saving…' : 'Add & Next'}
                </button>
              </div>
            </div>
          </form>

          {/* Teacher / Admin Live List + WhatsApp Export (hidden in Pass-Around Mode!) */}
          {!passAroundMode && (
            <div className="space-y-3">
              {/* Stats + WhatsApp / Admin Export Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 p-3">
                <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
                  <span className="text-foreground">
                    <strong>{students.length}</strong> in class
                  </span>
                  <span className="text-emerald-700 dark:text-emerald-400">
                    <strong>{withPhoneCount}</strong> WhatsApp-ready
                  </span>
                  <span className="text-primary">
                    <strong>{verifiedCount}</strong> parent verified
                  </span>
                  <span className="text-muted-foreground">
                    <strong>{Math.max(0, students.length - withPhoneCount)}</strong> no phone yet
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={downloadWhatsAppVCard}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-white shadow-sm"
                  >
                    <PhoneIcon className="w-3.5 h-3.5" />
                    WhatsApp Contacts (.vcf)
                  </button>
                  <button
                    type="button"
                    onClick={copyWhatsAppNumbers}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card hover:bg-muted px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-foreground"
                  >
                    <ClipboardDocumentListIcon className="w-3.5 h-3.5" />
                    Copy Numbers
                  </button>
                  <button
                    type="button"
                    onClick={exportIntakeCsv}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card hover:bg-muted px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-foreground"
                  >
                    <CloudArrowDownIcon className="w-3.5 h-3.5" />
                    Attendance / Admin CSV
                  </button>
                </div>
              </div>

              {/* Live Digital Intake List */}
              {students.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                  No students in {className} yet. Start adding names above — they automatically populate the live class list and WhatsApp contact sheet.
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                  {students.map((s, idx) => {
                    const isEditing = editingPhoneId === s.id;
                    const hasPhone = Boolean(formatWhatsAppDigits(s.parent_phone));
                    return (
                      <div
                        key={s.id}
                        className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-card hover:bg-muted/20"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-[11px] font-mono text-muted-foreground w-6 shrink-0">
                            {idx + 1}.
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-bold text-foreground truncate">
                                {s.full_name}
                              </span>
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-black text-muted-foreground">
                                {s.grade || classGradeKey || '—'}
                              </span>
                              {s.session_status === 'carryover_unconfirmed' && (
                                <span className="rounded bg-amber-500/15 border border-amber-500/35 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-800 dark:text-amber-300">
                                  Old Session
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pl-8 sm:pl-0 flex-wrap">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="tel"
                                aria-label={`Parent phone for ${s.full_name}`}
                                value={editingPhoneValue}
                                onChange={(e) => setEditingPhoneValue(e.target.value)}
                                placeholder="0801 234 5678"
                                autoFocus
                                className="h-8 w-36 rounded-lg border border-primary bg-background px-2 text-xs font-mono text-foreground"
                              />
                              <button
                                type="button"
                                disabled={savingPhoneId === s.id}
                                onClick={() => void handleInlinePhoneSave(s.id)}
                                className="h-8 px-2.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase"
                              >
                                {savingPhoneId === s.id ? '…' : 'Save'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingPhoneId(null)}
                                className="h-8 px-2 rounded-lg border border-border text-[10px] font-bold text-muted-foreground"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingPhoneId(s.id);
                                  setEditingPhoneValue(s.parent_phone || '');
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background hover:border-primary/50 px-2.5 py-1 text-xs font-mono text-foreground transition-colors"
                              >
                                <PhoneIcon className="w-3 h-3 text-muted-foreground" />
                                {s.parent_phone || 'Add phone'}
                              </button>

                              {s.parent_verified ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/35 px-2 py-0.5 text-[10px] font-black text-emerald-800 dark:text-emerald-300">
                                  <ShieldCheckIcon className="w-3 h-3" />
                                  Verified
                                </span>
                              ) : hasPhone ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/35 px-2 py-0.5 text-[10px] font-black text-amber-800 dark:text-amber-300">
                                  Pending Verify
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold text-muted-foreground">
                                  Optional
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: OLD VS NEW SESSION COHORT CLEANUP */}
      {tab === 'hygiene' && (
        <div className="p-4 sm:p-5 space-y-4">
          <div className={`rounded-xl border p-3.5 text-xs space-y-1 ${
            carryoverStudents.length > 0
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-200'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200'
          }`}>
            <p className="font-black uppercase tracking-wider">
              {carryoverStudents.length > 0
                ? `${carryoverStudents.length} Prior-Session Student${carryoverStudents.length === 1 ? '' : 's'} Mixed Into ${className}`
                : `✓ ${className} is 100% Clean for ${currentSession}`}
            </p>
            <p className="opacity-90">
              {carryoverStudents.length > 0
                ? isEntryClass
                  ? `${className} is a fresh-intake entry class. Move last session's set up to the next class or archive them cleanly (all past results stay safe) so only new ${currentSession} students remain here.`
                  : `Separate last session's students from this session's new/confirmed students: Promote them to the next class, Archive anyone who left, or Confirm returning students.`
                : `Every student currently on this roster is confirmed for ${currentSession}. You can still select students below if you need to promote or archive anyone.`}
            </p>
          </div>

          {/* Bulk Action Bar */}
          <div className="rounded-xl border border-border bg-muted/40 p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedHygieneIds(new Set(carryoverStudents.map((s) => s.id)))}
                className="px-2.5 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-[11px] font-black text-amber-900 dark:text-amber-200 hover:bg-amber-500/20"
              >
                Select All Old Session ({carryoverStudents.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedHygieneIds(new Set(students.map((s) => s.id)))}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-card text-[11px] font-bold text-foreground hover:bg-muted"
              >
                Select All ({students.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedHygieneIds(new Set())}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-card text-[11px] font-bold text-muted-foreground hover:text-foreground"
              >
                Clear ({selectedHygieneIds.size})
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {destinationClasses.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <select
                    aria-label="Destination class for promotion"
                    value={destClassId}
                    onChange={(e) => setDestClassId(e.target.value)}
                    className="min-h-9 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-bold text-foreground max-w-[190px]"
                  >
                    {destinationClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        → {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={hygieneBusy !== null || selectedHygieneIds.size === 0}
                    onClick={() => void runCohortHygiene('promote_to_class')}
                    className="min-h-9 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground text-[11px] font-black uppercase tracking-wider"
                  >
                    {hygieneBusy === 'promote_to_class' ? 'Moving…' : 'Promote Selected'}
                  </button>
                </div>
              )}

              <button
                type="button"
                disabled={hygieneBusy !== null || selectedHygieneIds.size === 0}
                onClick={() => void runCohortHygiene('confirm_current')}
                className="min-h-9 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white text-[11px] font-black uppercase tracking-wider"
              >
                {hygieneBusy === 'confirm_current' ? 'Saving…' : `Confirm Returning (${currentSession})`}
              </button>

              <button
                type="button"
                disabled={hygieneBusy !== null || selectedHygieneIds.size === 0}
                onClick={() => void runCohortHygiene('archive_old')}
                className="min-h-9 px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 disabled:opacity-40 text-white text-[11px] font-black uppercase tracking-wider"
              >
                {hygieneBusy === 'archive_old' ? 'Archiving…' : 'Archive Old Set'}
              </button>
            </div>
          </div>

          {/* Split List: Prior Session vs Active Current Session */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Prior Session / Unconfirmed */}
            <div className="rounded-xl border border-amber-500/35 overflow-hidden">
              <div className="bg-amber-500/10 px-3.5 py-2 border-b border-amber-500/25 flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-300">
                  Prior Session / Unconfirmed ({carryoverStudents.length})
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-border bg-card">
                {carryoverStudents.length === 0 ? (
                  <p className="p-4 text-xs text-muted-foreground text-center">
                    No unconfirmed prior-session students in this class.
                  </p>
                ) : (
                  carryoverStudents.map((s) => {
                    const checked = selectedHygieneIds.has(s.id);
                    return (
                      <label
                        key={s.id}
                        className="flex items-center justify-between gap-2 px-3.5 py-2.5 cursor-pointer hover:bg-muted/30"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedHygieneIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(s.id)) next.delete(s.id);
                                else next.add(s.id);
                                return next;
                              });
                            }}
                            className="h-4 w-4 accent-amber-600 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-foreground truncate">{s.full_name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {s.grade || '—'} · Added {s.created_at ? new Date(s.created_at).toLocaleDateString() : 'earlier'}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          {s.parent_phone || 'No phone'}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* Active This Session */}
            <div className="rounded-xl border border-emerald-500/35 overflow-hidden">
              <div className="bg-emerald-500/10 px-3.5 py-2 border-b border-emerald-500/25 flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-900 dark:text-emerald-300">
                  Active This Session · {currentSession} ({currentSessionStudents.length})
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-border bg-card">
                {currentSessionStudents.length === 0 ? (
                  <p className="p-4 text-xs text-muted-foreground text-center">
                    No students confirmed for {currentSession} yet.
                  </p>
                ) : (
                  currentSessionStudents.map((s) => {
                    const checked = selectedHygieneIds.has(s.id);
                    return (
                      <label
                        key={s.id}
                        className="flex items-center justify-between gap-2 px-3.5 py-2.5 cursor-pointer hover:bg-muted/30"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedHygieneIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(s.id)) next.delete(s.id);
                                else next.add(s.id);
                                return next;
                              });
                            }}
                            className="h-4 w-4 accent-emerald-700 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-foreground truncate">{s.full_name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {s.grade || '—'} · Confirmed {currentSession}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          {s.parent_phone || 'No phone'}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ClassIntakeAndSessionPanel;
