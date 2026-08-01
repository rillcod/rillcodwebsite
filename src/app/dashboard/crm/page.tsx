'use client';

import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  Users, Plus, Phone, Mail, MessageSquare,
  Loader2, Paperclip, Download, Trash2, X, Building2,
  CheckCircle, AlertCircle, Clock,
  Send, StickyNote, Calendar, Edit3, Save, ChevronDown,
  Briefcase, Tag, UserPlus,
  ArrowLeft, CheckSquare, Circle, BookUser, Sparkles,
} from 'lucide-react';
import {
  CRM_PIPELINE_STAGE_META,
  crmContactTypeFromRole,
  normalizeCrmStage,
  type CrmPipelineStage,
} from '@/lib/crm/stages';
import { computeCrmStageCounts, crmStageMeta, type CrmStats } from '@/lib/crm/ui';
import { CrmStatChips } from '@/components/crm/CrmStatChips';
import { CrmListToolbar } from '@/components/crm/CrmListToolbar';
import { CrmMergePanel } from '@/components/crm/CrmMergePanel';
import { useOfficeOptional } from '@/components/office/OfficeContext';
import { useOfficeAdminRedirect } from '@/components/office/useOfficeAdminRedirect';

// ─── Types ─────────────────────────────────────────────────────────────────────

type CRMContact = {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  phone_number?: string;
  role: string;
  school_name?: string;
  school_id?: string;
  section_class?: string;
  source?: string;
  last_message_at?: string;
  created_at?: string;
  pipeline_stage?: string;
  metadata?: Record<string, any>;
};

type Interaction = {
  id: string;
  contact_id: string;
  type: 'note' | 'call' | 'email' | 'meeting' | 'whatsapp';
  direction: 'inbound' | 'outbound';
  content: string;
  staff_name?: string;
  created_at: string;
};

type TimelineItem = {
  id: string;
  channel: 'crm' | 'whatsapp' | 'inapp';
  type: string;
  direction: 'inbound' | 'outbound' | 'system';
  content: string;
  created_at: string;
  actor?: string;
};

type Attachment = {
  id: string;
  file_name: string;
  file_type?: string;
  file_size?: number;
  uploaded_by_name?: string;
  created_at: string;
  signed_url?: string;
};

type Task = {
  id: string;
  contact_id: string;
  contact_name: string;
  title: string;
  due_at: string | null;
  priority: string;
  status: string;
  owner_name?: string;
  created_at: string;
};

type Opportunity = {
  id: string;
  contact_id: string;
  contact_name: string;
  stage: string;
  estimated_value?: number | null;
  expected_close_at?: string | null;
  close_probability?: number | null;
  notes?: string | null;
  source?: string | null;
  owner_name?: string | null;
  created_at: string;
};

type PipelineStage = CrmPipelineStage;
type Tab = 'overview' | 'timeline' | 'tasks' | 'opportunities' | 'files';

// ─── Constants ─────────────────────────────────────────────────────────────────

const PIPELINE_STAGES = CRM_PIPELINE_STAGE_META;

const OPP_STAGES = ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
const OPP_STAGE_COLOR: Record<string, string> = {
  lead: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20',
  qualified: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20',
  proposal: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
  negotiation: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20',
  won: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
  lost: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20',
};

const PRIORITY_COLOR: Record<string, string> = {
  low: 'text-muted-foreground/80',
  normal: 'text-amber-600 dark:text-amber-400',
  high: 'text-rose-600 dark:text-rose-400 font-semibold',
};

const ROLE_LABELS: Record<string, string> = {
  parent: 'Parent/Guardian', student: 'Student', teacher: 'Teacher',
  school: 'School Partner', admin: 'Admin', external: 'External (WhatsApp)',
  lead: 'Lead (Form)',
};

const INTERACTION_TYPES = ['note', 'call', 'email', 'meeting', 'whatsapp'] as const;
const CONTACTS_FETCH_LIMIT = 300;

type BookRow = { id: string; full_name: string | null; email: string | null; phone: string | null; role: string };

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function fmtNaira(n?: number | null) {
  if (!n) return '₦0';
  return '₦' + n.toLocaleString('en-NG');
}
function fileIcon(type?: string) {
  if (!type) return '📄';
  if (type.startsWith('image/')) return '🖼️';
  if (type.includes('pdf')) return '📕';
  if (type.includes('word') || type.includes('document')) return '📝';
  if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) return '📊';
  return '📄';
}
function isOverdue(task: Task) {
  return task.due_at && new Date(task.due_at) < new Date() && task.status !== 'completed';
}
function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
function channelIcon(channel: string, type: string) {
  if (channel === 'whatsapp') return '💬';
  if (channel === 'inapp') return '✉️';
  if (type === 'call') return '📞';
  if (type === 'email') return '📧';
  if (type === 'meeting') return '📅';
  if (type === 'note') return '📝';
  return '•';
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function CRMPage() {
  const { profile } = useAuth();
  const office = useOfficeOptional();
  const redirecting = useOfficeAdminRedirect({ workspace: 'crm' });
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Contact list state ─────────────────────────────────────────
  const [contacts, setContacts]           = useState<CRMContact[]>([]);
  const [loading, setLoading]             = useState(true);
  const [search, setSearch]               = useState('');
  const [roleFilter, setRoleFilter]       = useState('all');
  const [stageFilter, setStageFilter]     = useState<PipelineStage | 'all'>('all');
  const [selected, setSelected]           = useState<CRMContact | null>(null);
  const [showList, setShowList]           = useState(true); // mobile toggle

  // ── Detail panel state ─────────────────────────────────────────
  const [tab, setTab]                     = useState<Tab>('overview');
  const [timeline, setTimeline]           = useState<TimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [attachments, setAttachments]     = useState<Attachment[]>([]);
  const [attachLoading, setAttachLoading] = useState(false);
  const [uploading, setUploading]         = useState(false);
  const [tasks, setTasks]                 = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading]   = useState(false);
  const [opps, setOpps]                   = useState<Opportunity[]>([]);
  const [oppsLoading, setOppsLoading]     = useState(false);
  const [overdueAlerts, setOverdueAlerts] = useState<Task[]>([]);

  // ── Pipeline ───────────────────────────────────────────────────
  const [pipelineStage, setPipelineStage]   = useState<PipelineStage>('prospect');
  const [pipelineNotes, setPipelineNotes]   = useState('');
  const [pipelineSaving, setPipelineSaving] = useState(false);

  // ── Interaction form ───────────────────────────────────────────
  const [intType, setIntType]       = useState<typeof INTERACTION_TYPES[number]>('note');
  const [intDir, setIntDir]         = useState<'inbound' | 'outbound'>('outbound');
  const [intContent, setIntContent] = useState('');
  const [intSaving, setIntSaving]   = useState(false);

  // ── Task form ──────────────────────────────────────────────────
  const [showTaskForm, setShowTaskForm]   = useState(false);
  const [taskTitle, setTaskTitle]         = useState('');
  const [taskDue, setTaskDue]             = useState('');
  const [taskPriority, setTaskPriority]   = useState('normal');
  const [taskSaving, setTaskSaving]       = useState(false);

  // ── Opportunity form ───────────────────────────────────────────
  const [showOppForm, setShowOppForm]         = useState(false);
  const [oppStage, setOppStage]               = useState('lead');
  const [oppValue, setOppValue]               = useState('');
  const [oppCloseDate, setOppCloseDate]       = useState('');
  const [oppProbability, setOppProbability]   = useState('');
  const [oppNotes, setOppNotes]               = useState('');
  const [oppSource, setOppSource]             = useState('');
  const [oppSaving, setOppSaving]             = useState(false);

  // ── Edit contact ───────────────────────────────────────────────
  const [editMode, setEditMode]   = useState(false);
  const [editName, setEditName]   = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editSchool, setEditSchool] = useState('');
  const [editClass, setEditClass] = useState('');
  const [editTags, setEditTags]   = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // ── New contact modal ──────────────────────────────────────────
  const [showNewContact, setShowNewContact]   = useState(false);
  const [newName, setNewName]                 = useState('');
  const [newEmail, setNewEmail]               = useState('');
  const [newPhone, setNewPhone]               = useState('');
  const [newRole, setNewRole]                 = useState('parent');
  const [newSchool, setNewSchool]             = useState('');
  const [newSchoolId, setNewSchoolId]         = useState('');
  const [newClass, setNewClass]               = useState('');
  const [newSaving, setNewSaving]             = useState(false);
  const [newErr, setNewErr]                   = useState('');
  const [schoolOptions, setSchoolOptions]     = useState<{ id: string; name: string }[]>([]);

  // ── Link student modal states ────────────────────────────────────
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentOptions, setStudentOptions] = useState<{ id: string; full_name: string; section_class: string | null }[]>([]);
  const [allStudents, setAllStudents] = useState<{ id: string; full_name: string; section_class: string | null }[]>([]);
  const [linkingStudentId, setLinkingStudentId] = useState<string | null>(null);
  const [relationship, setRelationship] = useState('Guardian');
  const [linkError, setLinkError] = useState<string | null>(null);

  // ── Children (linked students for a parent contact) ────────────
  const [children, setChildren] = useState<{ id: string; full_name: string; school_name?: string; school_id?: string; grade_level?: string; section_class?: string; relationship?: string; user_id?: string }[]>([]);

  // ── Stats ──────────────────────────────────────────────────────
  const [stats, setStats] = useState<CrmStats>({ total: 0, parents: 0, students: 0, active: 0, prospect: 0, at_risk: 0, won: 0, churned: 0, overdueTasks: 0, pipelineValue: 0 });
  const [stageCounts, setStageCounts] = useState<Partial<Record<CrmPipelineStage | 'all', number>>>({ all: 0 });
  const [contactsTruncated, setContactsTruncated] = useState(false);

  // ── Data tools (directory merge + dedup) ───────────────────────
  const [showDataTools, setShowDataTools] = useState(false);
  const [bookRows, setBookRows] = useState<BookRow[]>([]);
  const [bookLoading, setBookLoading] = useState(false);
  const [mergeTarget, setMergeTarget] = useState('');
  const [mergeSource, setMergeSource] = useState('');
  const [mergeMsg, setMergeMsg] = useState('');
  const [merging, setMerging] = useState(false);
  const [dedupRunning, setDedupRunning] = useState(false);
  const [dedupMsg, setDedupMsg] = useState('');

  // ── School grouping ────────────────────────────────────────────
  const [collapsedSchools, setCollapsedSchools] = useState<Set<string>>(new Set());
  const toggleSchool = (school: string) =>
    setCollapsedSchools(prev => {
      const next = new Set(prev);
      if (next.has(school)) next.delete(school); else next.add(school);
      return next;
    });

  const isAdmin = profile?.role === 'admin';
  const isStaff = isAdmin || profile?.role === 'teacher';

  // ─── Load contacts ─────────────────────────────────────────────────────────
  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(CONTACTS_FETCH_LIMIT) });
      if (search) params.set('search', search);
      params.set('role', roleFilter);
      if (stageFilter !== 'all') params.set('stage', stageFilter);
      const res = await fetch(`/api/crm/contacts?${params}`);
      const json = await res.json();
      const list: CRMContact[] = json.contacts || [];
      setContacts(list);
      setContactsTruncated(!!json.truncated);
      setStageCounts(json.stage_counts || { all: list.length });

      setStats(prev => ({
        ...prev,
        ...(json.stats ? json.stats : computeCrmStageCounts(list)),
      }));
    } catch { /* silent */ }
    setLoading(false);
  }, [search, roleFilter, stageFilter]);

  useEffect(() => { if (isStaff) loadContacts(); }, [loadContacts, isStaff]);

  const loadBookRows = useCallback(async () => {
    setBookLoading(true);
    try {
      const res = await fetch('/api/customer-book?limit=500');
      const json = await res.json();
      setBookRows((json.data ?? json.rows ?? []) as BookRow[]);
    } catch { setBookRows([]); }
    setBookLoading(false);
  }, []);

  useEffect(() => {
    if (!showDataTools || !isAdmin) return;
    loadBookRows();
  }, [showDataTools, isAdmin, loadBookRows]);

  const runMerge = async () => {
    if (!mergeTarget || !mergeSource || mergeTarget === mergeSource) {
      setMergeMsg('Select two different directory contacts to merge.');
      return;
    }
    setMerging(true);
    setMergeMsg('');
    const res = await fetch('/api/customer-book', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_id: mergeTarget, source_id: mergeSource }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMergeMsg(json?.error || 'Merge failed');
      setMerging(false);
      return;
    }
    setMergeMsg('Merge completed.');
    setMergeSource('');
    setMergeTarget('');
    await loadBookRows();
    await loadContacts();
    setMerging(false);
  };

  const runDedup = async () => {
    if (!confirm('Scan the contact directory and merge duplicate email/phone records? This cannot be undone.')) return;
    setDedupRunning(true);
    setDedupMsg('');
    try {
      const res = await fetch('/api/crm/dedup', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDedupMsg(json?.error || 'Dedup failed');
      } else {
        setDedupMsg(`Dedup complete — ${json.merged ?? 0} group(s) merged, ${json.deleted ?? 0} record(s) removed.`);
        await loadBookRows();
        await loadContacts();
      }
    } catch {
      setDedupMsg('Dedup failed');
    }
    setDedupRunning(false);
  };

  // Load overdue tasks on mount
  useEffect(() => {
    if (!isStaff) return;
    fetch('/api/crm/tasks?mine=1&overdue=1')
      .then(r => r.json())
      .then(j => {
        setOverdueAlerts(j.data || []);
        setStats(prev => ({ ...prev, overdueTasks: (j.data || []).length }));
      });
  }, [isStaff]);

  // ─── Select contact ────────────────────────────────────────────────────────
  const selectContact = useCallback(async (c: CRMContact) => {
    setSelected(c);
    setTab('overview');
    setShowList(false); // mobile: hide list, show detail
    setEditMode(false);
    setEditName(c.full_name);
    setEditEmail(c.email || '');
    setEditPhone(c.phone || c.phone_number || '');
    setEditSchool(c.school_name || '');
    setEditClass(c.section_class || '');
    setEditTags((c.metadata?.tags || []).join(', '));
    setEditNotes(c.metadata?.notes || '');
    setPipelineStage(normalizeCrmStage(c.pipeline_stage));
    setPipelineNotes('');

    // Load all tab data in parallel (pipeline comes from detail API — normalized)
    setTimelineLoading(true);
    setAttachLoading(true);
    setTasksLoading(true);
    setOppsLoading(true);
    setChildren([]);

    const [tlRes, attRes, taskRes, oppRes, detailRes] = await Promise.all([
      fetch(`/api/crm/timeline?contact_id=${encodeURIComponent(c.id)}`),
      fetch(`/api/crm/attachments?contact_id=${c.id}`),
      fetch(`/api/crm/tasks?contact_id=${c.id}`),
      fetch(`/api/crm/opportunities?contact_id=${c.id}`),
      fetch(`/api/crm/contacts/${c.id}`),
    ]);
    const [tlJson, attJson, taskJson, oppJson, detailJson] = await Promise.all([
      tlRes.json(), attRes.json(), taskRes.json(), oppRes.json(), detailRes.json(),
    ]);

    setTimeline(tlJson.timeline || tlJson.data || []);
    setAttachments(attJson.attachments || []);
    setTasks(taskJson.data || []);
    setOpps(oppJson.opportunities || []);
    setChildren(detailJson.children || []);
    if (detailJson.pipeline?.stage) {
      setPipelineStage(normalizeCrmStage(detailJson.pipeline.stage));
      setPipelineNotes(detailJson.pipeline.pipeline_notes || '');
    } else if (detailJson.contact?.pipeline_stage) {
      setPipelineStage(normalizeCrmStage(detailJson.contact.pipeline_stage));
    }

    // Aggregate pipeline value
    const totalValue = (oppJson.opportunities || [])
      .filter((o: Opportunity) => o.stage !== 'lost')
      .reduce((sum: number, o: Opportunity) => sum + (o.estimated_value || 0), 0);
    setStats(prev => ({ ...prev, pipelineValue: totalValue }));

    setTimelineLoading(false);
    setAttachLoading(false);
    setTasksLoading(false);
    setOppsLoading(false);
  }, []);

  // ─── Save pipeline ─────────────────────────────────────────────────────────
  const savePipeline = async () => {
    if (!selected) return;
    setPipelineSaving(true);
    await fetch('/api/crm/contacts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact_id: selected.id,
        contact_type: crmContactTypeFromRole(selected.role),
        contact_name: selected.full_name,
        stage: pipelineStage,
        pipeline_notes: pipelineNotes,
      }),
    });
    setSelected(prev => prev ? { ...prev, pipeline_stage: pipelineStage } : prev);
    setContacts(prev => prev.map(c => c.id === selected.id ? { ...c, pipeline_stage: pipelineStage } : c));
    office?.notifyOfficeChange('crm');
    setPipelineSaving(false);
  };

  // ─── Link student to parent ─────────────────────────────────────────
  const openLinkStudent = async () => {
    setShowLinkModal(true);
    setStudentSearch('');
    setLinkError(null);
    setStudentsLoading(true);
    try {
      const res = await fetch(`/api/parents/manage?include_picker_data=true`);
      const json = await res.json();
      const list = (json.students ?? []) as { id: string; full_name: string; section_class: string | null }[];
      setAllStudents(list);
      setStudentOptions(list.slice(0, 40));
    } catch (err: any) {
      setLinkError('Failed to load students list');
    } finally {
      setStudentsLoading(false);
    }
  };

  const handleLinkStudentSearch = (q: string) => {
    setStudentSearch(q);
    const lower = q.toLowerCase();
    setStudentOptions(
      lower ? allStudents.filter(s => s.full_name.toLowerCase().includes(lower)) : allStudents.slice(0, 40)
    );
  };

  const linkStudent = async (studentId: string) => {
    if (!selected) return;
    setLinkingStudentId(studentId);
    setLinkError(null);
    try {
      const res = await fetch('/api/parents/manage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: selected.id, student_id: studentId, relationship }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? 'Failed to link');
      }
      // Re-fetch selected contact details to update children list
      const detailRes = await fetch(`/api/crm/contacts/${selected.id}`);
      const detailJson = await detailRes.json();
      setChildren(detailJson.children || []);
      setShowLinkModal(false);
      office?.notifyOfficeChange('crm');
    } catch (err: any) {
      setLinkError(err.message || 'Failed to link student');
    } finally {
      setLinkingStudentId(null);
    }
  };

  // ─── Log interaction ───────────────────────────────────────────────────────
  const logInteraction = async () => {
    if (!selected || !intContent.trim()) return;
    setIntSaving(true);
    const res = await fetch('/api/crm/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact_id: selected.id,
        contact_type: crmContactTypeFromRole(selected.role),
        contact_name: selected.full_name,
        type: intType,
        direction: intDir,
        content: intContent.trim(),
      }),
    });
    const json = await res.json();
    if (json.interaction) {
      const item: TimelineItem = {
        id: json.interaction.id,
        channel: 'crm',
        type: intType,
        direction: intDir,
        content: intContent.trim(),
        created_at: json.interaction.created_at,
        actor: profile?.full_name,
      };
      setTimeline(prev => [item, ...prev]);
      setIntContent('');
      office?.notifyOfficeChange('crm');
    }
    setIntSaving(false);
  };

  // ─── Save edit ─────────────────────────────────────────────────────────────
  const saveEdit = async () => {
    if (!selected) return;
    setEditSaving(true);
    const tags = editTags.split(',').map(t => t.trim()).filter(Boolean);
    const res = await fetch(`/api/crm/contacts/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: editName,
        email: editEmail,
        phone: editPhone,
        school_name: editSchool,
        section_class: editClass,
        tags,
        notes: editNotes,
      }),
    });
    const json = await res.json();
    if (json.contact) {
      const updated = {
        ...selected,
        full_name: editName,
        email: editEmail,
        phone: editPhone,
        school_name: editSchool,
        section_class: editClass,
        metadata: { ...selected.metadata, tags, notes: editNotes },
      };
      setSelected(updated);
      setContacts(prev => prev.map(c => c.id === selected.id ? { ...c, ...updated } : c));
      setEditMode(false);
      office?.notifyOfficeChange('crm');
    }
    setEditSaving(false);
  };

  const convertLead = async () => {
    if (!selected || selected.role !== 'lead') return;
    setEditSaving(true);
    const res = await fetch(`/api/crm/contacts/${selected.id}/convert`, { method: 'POST' });
    const json = await res.json();
    if (res.ok && json.contact) {
      const converted = { ...json.contact, pipeline_stage: json.contact.pipeline_stage || 'active' };
      const bookId = selected.id;
      setContacts(prev => {
        const withoutBook = prev.filter(c => c.id !== bookId);
        if (withoutBook.some(c => c.id === converted.id)) {
          return withoutBook.map(c => c.id === converted.id ? { ...c, ...converted } : c);
        }
        return [converted, ...withoutBook];
      });
      setSelected(converted);
      setPipelineStage(normalizeCrmStage(converted.pipeline_stage));
      office?.notifyOfficeChange('crm');
    } else {
      alert(json.error || 'Could not convert lead');
    }
    setEditSaving(false);
  };

  // ─── Upload attachment ─────────────────────────────────────────────────────
  const uploadFile = async (file: File) => {
    if (!selected) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('contact_id', selected.id);
    fd.append('contact_name', selected.full_name);
    fd.append('contact_type', crmContactTypeFromRole(selected.role));
    const res = await fetch('/api/crm/attachments', { method: 'POST', body: fd });
    const json = await res.json();
    if (json.attachment) {
      setAttachments(prev => [json.attachment, ...prev]);
      office?.notifyOfficeChange('crm');
    }
    setUploading(false);
  };

  const deleteAttachment = async (id: string) => {
    if (!confirm('Delete this file?')) return;
    await fetch(`/api/crm/attachments?id=${id}`, { method: 'DELETE' });
    setAttachments(prev => prev.filter(a => a.id !== id));
    office?.notifyOfficeChange('crm');
  };

  // ─── Task CRUD ─────────────────────────────────────────────────────────────
  const createTask = async () => {
    if (!selected || !taskTitle.trim()) return;
    setTaskSaving(true);
    const res = await fetch('/api/crm/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact_id: selected.id,
        contact_name: selected.full_name,
        title: taskTitle,
        due_at: taskDue || null,
        priority: taskPriority,
      }),
    });
    const json = await res.json();
    if (json.task) {
      setTasks(prev => [json.task, ...prev]);
      setTaskTitle(''); setTaskDue(''); setTaskPriority('normal');
      setShowTaskForm(false);
      office?.notifyOfficeChange('crm');
    }
    setTaskSaving(false);
  };

  const toggleTask = async (task: Task) => {
    const newStatus = task.status === 'completed' ? 'open' : 'completed';
    await fetch('/api/crm/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, status: newStatus }),
    });
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    if (task.status !== 'completed') {
      setOverdueAlerts(prev => prev.filter(t => t.id !== task.id));
    }
    office?.notifyOfficeChange('crm');
  };

  const deleteTask = async (id: string) => {
    if (!confirm('Delete this task?')) return;
    await fetch(`/api/crm/tasks?id=${id}`, { method: 'DELETE' });
    setTasks(prev => prev.filter(t => t.id !== id));
    setOverdueAlerts(prev => prev.filter(t => t.id !== id));
    office?.notifyOfficeChange('crm');
  };

  // ─── Opportunity CRUD ──────────────────────────────────────────────────────
  const createOpp = async () => {
    if (!selected) return;
    setOppSaving(true);
    const res = await fetch('/api/crm/opportunities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact_id: selected.id,
        contact_name: selected.full_name,
        stage: oppStage,
        estimated_value: oppValue ? parseInt(oppValue.replace(/,/g, ''), 10) : null,
        expected_close_at: oppCloseDate || null,
        close_probability: oppProbability ? parseInt(oppProbability, 10) : null,
        notes: oppNotes || null,
        source: oppSource || null,
      }),
    });
    const json = await res.json();
    if (json.opportunity) {
      setOpps(prev => [json.opportunity, ...prev]);
      setOppStage('lead'); setOppValue(''); setOppCloseDate('');
      setOppProbability(''); setOppNotes(''); setOppSource('');
      setShowOppForm(false);
      office?.notifyOfficeChange('crm');
    }
    setOppSaving(false);
  };

  const deleteOpp = async (id: string) => {
    if (!confirm('Delete this opportunity?')) return;
    await fetch(`/api/crm/opportunities?id=${id}`, { method: 'DELETE' });
    setOpps(prev => prev.filter(o => o.id !== id));
    office?.notifyOfficeChange('crm');
  };

  const updateOppStage = async (opp: Opportunity, newStage: string) => {
    await fetch('/api/crm/opportunities', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: opp.id, stage: newStage }),
    });
    setOpps(prev => prev.map(o => o.id === opp.id ? { ...o, stage: newStage } : o));
    office?.notifyOfficeChange('crm');
  };

  // ─── Create new contact ────────────────────────────────────────────────────
  const createContact = async () => {
    if (!newName.trim()) { setNewErr('Name is required'); return; }
    setNewErr('');
    setNewSaving(true);
    const res = await fetch('/api/crm/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: newName,
        email: newEmail,
        phone: newPhone,
        role: newRole,
        school_id: newSchoolId || null,
        school_name: newSchool || schoolOptions.find(s => s.id === newSchoolId)?.name || null,
        class_name: newClass || null,
      }),
    });
    const json = await res.json();
    if (res.status === 409) { setNewErr('A contact with this email already exists'); setNewSaving(false); return; }
    if (json.contact) {
      setContacts(prev => [{ ...json.contact, pipeline_stage: 'prospect' }, ...prev]);
      setNewName(''); setNewEmail(''); setNewPhone(''); setNewRole('parent'); setNewSchool(''); setNewSchoolId(''); setNewClass('');
      setShowNewContact(false);
      selectContact({ ...json.contact, pipeline_stage: 'prospect' });
      office?.notifyOfficeChange('crm');
    } else {
      setNewErr(json.error || 'Failed to create contact');
    }
    setNewSaving(false);
  };

  // ─── Grouped list (server applies stage filter) ───────────────────────────
  const groupedContacts = useMemo(() => {
    const map = new Map<string, CRMContact[]>();
    for (const c of contacts) {
      const key = c.school_name?.trim() || '(No School)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    const roleOrder = (r: string) => r === 'parent' ? 0 : r === 'student' ? 1 : r === 'teacher' ? 2 : 3;
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        if (a.role !== b.role) return roleOrder(a.role) - roleOrder(b.role);
        const ca = a.section_class || '';
        const cb = b.section_class || '';
        if (ca !== cb) return ca.localeCompare(cb);
        return a.full_name.localeCompare(b.full_name);
      });
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === '(No School)') return 1;
      if (b === '(No School)') return -1;
      return a.localeCompare(b);
    });
  }, [contacts]);

  const sm = crmStageMeta(selected?.pipeline_stage);

  // ─── Directory export / print ─────────────────────────────────────────────
  function buildExportParams(fmt: string) {
    const p = new URLSearchParams({ format: fmt, limit: '3000' });
    if (search) p.set('search', search);
    p.set('role', roleFilter);
    if (stageFilter !== 'all') p.set('stage', stageFilter);
    return p.toString();
  }

  function exportContactsCSV() {
    window.location.href = `/api/crm/contacts?${buildExportParams('csv')}`;
  }

  function printContactDirectory() {
    window.open(`/api/crm/contacts?${buildExportParams('print')}`, '_blank');
  }

  if (redirecting) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground mobile-page-root">
        Opening Retention in Office Center...
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="flex items-center justify-center min-h-screen text-muted-foreground mobile-page-root">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-3 text-rose-600 dark:text-rose-400" size={32} />
          <p className="font-semibold text-foreground">CRM access is for staff only</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background text-foreground overflow-hidden">

      {/* ── Top stats bar ─────────────────────────────────────────────────────── */}
      <div className="flex-none border-b border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2.5">
          {!office ? (
            <span className="text-xs font-black uppercase tracking-widest text-primary mr-1 shrink-0">Retention</span>
          ) : null}
          <CrmStatChips stats={stats} className="flex-1 min-w-0" />
          <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto sm:ml-auto">
            <Link
              href="/dashboard/customer-book"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <BookUser size={12} /> Directory
            </Link>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowDataTools(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${showDataTools ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted'}`}
              >
                <Sparkles size={12} /> Data tools
              </button>
            )}
            {isAdmin && (
              <button onClick={() => setShowNewContact(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors">
                <UserPlus size={12} /> New Contact
              </button>
            )}
          </div>
        </div>

        {contactsTruncated && (
          <div className="mx-3 sm:mx-4 mb-2 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <p>
              Showing the first {CONTACTS_FETCH_LIMIT} matches for this filter. Narrow search or role, or open{' '}
              <Link href="/dashboard/customer-book" className="font-bold underline underline-offset-2">Contact Directory</Link>{' '}
              for the full list.
            </p>
          </div>
        )}

        {showDataTools && isAdmin && (
          <div className="mx-3 sm:mx-4 mb-3 space-y-3 rounded-xl border border-border bg-muted/30 p-3 sm:p-4 mobile-page-root">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-black text-foreground">Contact directory tools</p>
                <p className="text-xs text-muted-foreground mt-0.5">Merge duplicates or run an automated dedup on captured leads.</p>
              </div>
              <button type="button" onClick={() => setShowDataTools(false)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted">
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/customer-book"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background text-xs font-bold hover:bg-muted">
                <BookUser size={12} /> Open full directory
              </Link>
              <button type="button" onClick={runDedup} disabled={dedupRunning}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50">
                {dedupRunning ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {dedupRunning ? 'Running dedup…' : 'Run dedup scan'}
              </button>
            </div>
            {dedupMsg && (
              <p className={`text-xs font-semibold px-2 py-1.5 rounded-lg ${dedupMsg.includes('complete') ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                {dedupMsg}
              </p>
            )}
            <CrmMergePanel
              variant="inline"
              rows={bookRows}
              loading={bookLoading}
              mergeTarget={mergeTarget}
              mergeSource={mergeSource}
              onMergeTargetChange={setMergeTarget}
              onMergeSourceChange={setMergeSource}
              onMerge={runMerge}
              merging={merging}
              message={mergeMsg}
            />
          </div>
        )}

        {/* Overdue alerts */}
        {overdueAlerts.length > 0 && (
          <div className="px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-none">
            {overdueAlerts.slice(0, 3).map(t => (
              <button key={t.id} onClick={() => {
                const c = contacts.find(x => x.id === t.contact_id);
                if (c) { selectContact(c); setTab('tasks'); }
              }}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs hover:bg-rose-500/20 transition-colors">
                <Clock size={10} /> {t.title} — {t.contact_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Main body ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Left: Contact list ────────────────────────────────────────────── */}
        <div className={`${showList ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-72 lg:w-80 border-r border-border bg-card shrink-0`}>
          <CrmListToolbar
            search={search}
            onSearchChange={setSearch}
            roleFilter={roleFilter}
            onRoleFilterChange={setRoleFilter}
            stageFilter={stageFilter}
            onStageFilterChange={setStageFilter}
            stageCounts={stageCounts}
            totalCount={stageCounts.all}
            onRefresh={loadContacts}
            onExportCsv={exportContactsCSV}
            onPrint={printContactDirectory}
          />

          {/* Contact list — grouped by school, then role, then class */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="animate-spin text-primary" size={20} />
              </div>
            ) : contacts.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">No contacts found</div>
            ) : (
              groupedContacts.map(([school, schoolContacts]) => {
                const collapsed = collapsedSchools.has(school);
                let lastRole = '';
                let lastClass = '';
                return (
                  <div key={school}>
                    {/* School header */}
                    <button
                      onClick={() => toggleSchool(school)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 bg-muted/20 border-b border-border text-left sticky top-0 z-10 hover:bg-muted/40 transition-colors">
                      <Building2 size={10} className="text-primary shrink-0" />
                      <span className="flex-1 text-[9px] font-black uppercase tracking-widest text-muted-foreground truncate">{school}</span>
                      <span className="text-[10px] text-muted-foreground/80 mr-1">{schoolContacts.length}</span>
                      <ChevronDown size={10} className={`text-muted-foreground/60 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                    </button>
                    {!collapsed && schoolContacts.map(c => {
                      const cSm = crmStageMeta(c.pipeline_stage);
                      const isSelected = selected?.id === c.id;
                      // Role separator (e.g. switching from parent → student)
                      const showRoleHeader = c.role !== lastRole;
                      lastRole = c.role;
                      // Class separator (only for students)
                      const cls = c.role === 'student' ? (c.section_class || '') : '';
                      const showClassHeader = c.role === 'student' && cls !== lastClass && cls !== '';
                      lastClass = cls;
                      return (
                        <Fragment key={c.id}>
                          {showRoleHeader && (
                            <div className="px-3 py-0.5 border-b border-border bg-muted/10 flex items-center gap-1.5">
                              <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/80">
                                {ROLE_LABELS[c.role] || c.role}
                              </span>
                            </div>
                          )}
                          {showClassHeader && (
                            <div className="pl-4 pr-3 py-0.5 border-b border-border bg-muted/5">
                              <span className="text-[8px] font-semibold uppercase tracking-widest text-muted-foreground/60">Class {cls}</span>
                            </div>
                          )}
                          <button onClick={() => selectContact(c)}
                            className={`w-full text-left px-3 py-2 border-b border-border hover:bg-muted/30 transition-colors ${isSelected ? 'bg-muted border-l-2 border-l-primary' : ''}`}>
                            <div className="flex items-center gap-2.5">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                {initials(c.full_name)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-semibold truncate">{c.full_name}</span>
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cSm.dot}`} />
                                  {c.role === 'parent' && (c as any).children_count > 0 && (
                                    <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-primary/10 text-primary shrink-0">
                                      {(c as any).children_count}👤
                                    </span>
                                  )}
                                </div>
                                <div className="space-y-0.5">
                                  {(c.phone || c.phone_number) && (
                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground/90">
                                      <Phone size={8} className="shrink-0 text-emerald-600/70 dark:text-emerald-400/70" />
                                      <span className="truncate">{c.phone || c.phone_number}</span>
                                    </div>
                                  )}
                                  {c.email && (
                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground/90">
                                      <Mail size={8} className="shrink-0 text-sky-600/70 dark:text-sky-400/70" />
                                      <span className="truncate">{c.email}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>
                        </Fragment>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right: Detail panel ──────────────────────────────────────────── */}
        <div className={`${!showList ? 'flex' : 'hidden'} md:flex flex-col flex-1 min-w-0 bg-background`}>
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center space-y-3">
                <Users size={40} className="mx-auto opacity-30" />
                <p className="text-sm">Select a contact to view details</p>
                <button onClick={() => setShowNewContact(true)}
                  className="flex items-center gap-2 mx-auto px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors">
                  <UserPlus size={14} /> Add new contact
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Contact header */}
              <div className="flex-none border-b border-border bg-card px-4 py-3">
                <div className="flex items-start gap-3">
                  {/* Mobile back button */}
                  <button onClick={() => setShowList(true)} className="md:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground">
                    <ArrowLeft size={16} />
                  </button>
                  <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-sm font-black text-primary-foreground shrink-0">
                    {initials(selected.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-black">{selected.full_name}</h2>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${sm.color}`}>{sm.label}</span>
                      <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border">
                        {ROLE_LABELS[selected.role] || selected.role}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {selected.email && <a href={`mailto:${selected.email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"><Mail size={10} />{selected.email}</a>}
                      {(selected.phone || selected.phone_number) && <a href={`tel:${selected.phone || selected.phone_number}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"><Phone size={10} />{selected.phone || selected.phone_number}</a>}
                      {selected.school_name && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Building2 size={10} />{selected.school_name}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {(selected.phone || selected.phone_number) && (
                      <a href={`https://wa.me/${(selected.phone || selected.phone_number || '').replace(/\D/g, '')}`}
                        target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded-lg bg-[#25d366]/10 text-[#25d366] hover:bg-[#25d366]/20 transition-colors" title="WhatsApp">
                        <MessageSquare size={14} />
                      </a>
                    )}
                    {selected.role === 'lead' && (
                      <button
                        onClick={convertLead}
                        disabled={editSaving}
                        title="Link to matching portal parent"
                        className="px-2 py-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-semibold hover:bg-indigo-500/20 transition-colors disabled:opacity-50"
                      >
                        {editSaving ? '…' : 'Convert to parent'}
                      </button>
                    )}
                    <button onClick={() => setEditMode(!editMode)}
                      className={`p-1.5 rounded-lg border transition-colors ${editMode ? 'bg-primary border-primary text-primary-foreground' : 'bg-muted border-border text-muted-foreground hover:text-foreground'}`}>
                      <Edit3 size={14} />
                    </button>
                  </div>
                </div>

                {/* Tags */}
                {(selected.metadata?.tags || []).length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {((selected.metadata?.tags || []) as string[]).map(tag => (
                      <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted border border-border text-[10px] text-muted-foreground">
                        <Tag size={8} /> {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div className="flex-none border-b border-border bg-card px-4 overflow-x-auto scrollbar-none">
                <div className="flex gap-0">
                  {([
                    ['overview', 'Overview', <UserPlus size={12} key="o" />],
                    ['timeline', 'Timeline', <MessageSquare size={12} key="t" />],
                    ['tasks', `Tasks ${tasks.filter(t => t.status !== 'completed').length > 0 ? `(${tasks.filter(t => t.status !== 'completed').length})` : ''}`, <CheckSquare size={12} key="tk" />],
                    ['opportunities', `Opps ${opps.filter(o => o.stage !== 'lost').length > 0 ? `(${opps.filter(o => o.stage !== 'lost').length})` : ''}`, <Briefcase size={12} key="op" />],
                    ['files', `Files ${attachments.length > 0 ? `(${attachments.length})` : ''}`, <Paperclip size={12} key="f" />],
                  ] as [Tab, string, React.ReactNode][]).map(([t, label, icon]) => (
                    <button key={t} onClick={() => setTab(t)}
                      className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                      {icon} {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto">

                {/* ── Overview tab ───────────────────────────────────────────── */}
                {tab === 'overview' && (
                  <div className="p-4 space-y-4 max-w-2xl mobile-page-root">
                    {editMode ? (
                      <div className="space-y-3 p-4 bg-card rounded-xl border border-border mobile-page-root">
                        <h3 className="text-xs font-black uppercase tracking-widest text-primary">Edit Contact</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {[
                            ['Full name *', editName, setEditName, 'text'],
                            ['Email', editEmail, setEditEmail, 'email'],
                            ['Phone / WhatsApp', editPhone, setEditPhone, 'tel'],
                            ['School', editSchool, setEditSchool, 'text'],
                            ['Class', editClass, setEditClass, 'text'],
                            ['Tags (comma separated)', editTags, setEditTags, 'text'],
                          ].map(([label, val, setter, type]) => (
                            <div key={label as string}>
                              <label className="block text-[10px] text-muted-foreground mb-1">{label as string}</label>
                              <input value={val as string} onChange={e => (setter as any)(e.target.value)} type={type as string}
                                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary" />
                            </div>
                          ))}
                        </div>
                        <div>
                          <label className="block text-[10px] text-muted-foreground mb-1">Internal notes</label>
                          <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3}
                            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary resize-none" />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={saveEdit} disabled={editSaving}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                            {editSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save changes
                          </button>
                          <button onClick={() => setEditMode(false)} className="px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm hover:bg-muted/80 transition-colors">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                          ['Full name', selected.full_name],
                          ['Role', ROLE_LABELS[selected.role] || selected.role],
                          ['Email', selected.email || '—'],
                          ['Phone', selected.phone || selected.phone_number || '—'],
                          ['School', selected.school_name || '—'],
                          ['Class', selected.section_class || '—'],
                          ['Source', selected.source || '—'],
                          ['Joined', fmtDate(selected.created_at)],
                        ].map(([k, v]) => (
                          <div key={k} className="p-3 bg-card rounded-xl border border-border">
                            <div className="text-[10px] text-muted-foreground/80 uppercase tracking-wider mb-0.5">{k}</div>
                            <div className="text-sm text-foreground font-semibold break-all">{v}</div>
                          </div>
                        ))}
                        {selected.metadata?.notes && (
                          <div className="sm:col-span-2 p-3 bg-card rounded-xl border border-border">
                            <div className="text-[10px] text-muted-foreground/80 uppercase tracking-wider mb-0.5">Notes</div>
                            <div className="text-sm text-muted-foreground whitespace-pre-wrap">{selected.metadata.notes}</div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Children section — shown for parent contacts */}
                    {selected.role === 'parent' && (
                      <div className="p-4 bg-card rounded-xl border border-border space-y-2 mobile-page-root">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                            Children / Students
                            {children.length > 0 && (
                              <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">{children.length}</span>
                            )}
                          </h3>
                          <button
                            onClick={openLinkStudent}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary text-[10px] font-bold transition-colors"
                          >
                            <Plus size={10} /> Connect Student
                          </button>
                        </div>
                        {children.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">No linked students found for this parent's email.</p>
                        ) : (
                          <div className="space-y-2">
                            {children.map(child => (
                              <div key={child.id} className="flex items-start gap-3 p-2.5 bg-background rounded-lg border border-border">
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-black text-primary shrink-0">
                                  {initials(child.full_name)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-foreground truncate">{child.full_name}</p>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                    {child.school_name && (
                                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                        <Building2 size={8} /> {child.school_name}
                                      </span>
                                    )}
                                    {child.section_class && (
                                      <span className="text-[10px] text-muted-foreground">Class {child.section_class}</span>
                                    )}
                                    {child.grade_level && (
                                      <span className="text-[10px] text-muted-foreground/80">{child.grade_level}</span>
                                    )}
                                    {child.relationship && (
                                      <span className="text-[10px] text-muted-foreground/80 italic">{child.relationship}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Pipeline section */}
                    <div className="p-4 bg-card rounded-xl border border-border space-y-3 mobile-page-root">
                      <h3 className="text-xs font-black uppercase tracking-widest text-primary">Pipeline Stage</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {PIPELINE_STAGES.map(s => (
                          <button key={s.value} onClick={() => setPipelineStage(s.value)}
                            className={`px-2 py-2 rounded-lg text-xs font-semibold border transition-colors ${pipelineStage === s.value ? s.color : 'bg-background border-border text-muted-foreground hover:border-muted-foreground/50'}`}>
                            {s.label}
                          </button>
                        ))}
                      </div>
                      <textarea value={pipelineNotes} onChange={e => setPipelineNotes(e.target.value)}
                        placeholder="Pipeline notes (optional)…" rows={2}
                        className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary resize-none" />
                      <button onClick={savePipeline} disabled={pipelineSaving}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                        {pipelineSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save stage
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Timeline tab ────────────────────────────────────────────── */}
                {tab === 'timeline' && (
                  <div className="p-4 space-y-4 max-w-2xl mobile-page-root">
                    {/* Log interaction form */}
                    <div className="p-4 bg-card rounded-xl border border-border space-y-3 mobile-page-root">
                      <h3 className="text-xs font-black uppercase tracking-widest text-primary">Log Interaction</h3>
                      <div className="flex gap-2 flex-wrap">
                        {INTERACTION_TYPES.map(t => (
                          <button key={t} onClick={() => setIntType(t)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors capitalize ${intType === t ? 'bg-primary border-primary text-primary-foreground' : 'bg-background border-border text-muted-foreground hover:border-muted-foreground/50'}`}>
                            {channelIcon('crm', t)} {t}
                          </button>
                        ))}
                        <div className="flex gap-1">
                          {(['inbound', 'outbound'] as const).map(d => (
                            <button key={d} onClick={() => setIntDir(d)}
                              className={`px-2 py-1.5 rounded-lg text-xs border transition-colors capitalize ${intDir === d ? 'bg-muted border-border text-foreground' : 'bg-background border-border text-muted-foreground'}`}>
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>
                      <textarea value={intContent} onChange={e => setIntContent(e.target.value)}
                        placeholder="Add notes about this interaction…" rows={3}
                        className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary resize-none" />
                      <button onClick={logInteraction} disabled={intSaving || !intContent.trim()}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                        {intSaving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Log
                      </button>
                    </div>

                    {/* Timeline list */}
                    {timelineLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={20} /></div>
                    ) : timeline.length === 0 ? (
                      <p className="text-center text-muted-foreground text-sm py-8">No interactions yet</p>
                    ) : (
                      <div className="space-y-2">
                        {timeline.map(item => (
                          <div key={item.id} className={`p-3 rounded-xl border ${item.channel === 'crm' ? 'bg-card border-border' : item.channel === 'whatsapp' ? 'bg-emerald-500/5 dark:bg-emerald-950/20 border-emerald-500/20' : 'bg-indigo-500/5 dark:bg-indigo-950/20 border-indigo-500/20'}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-base">{channelIcon(item.channel, item.type)}</span>
                              <span className="text-[10px] text-muted-foreground capitalize">{item.type} · {item.direction}</span>
                              {item.actor && <span className="text-[10px] text-muted-foreground">by {item.actor}</span>}
                              <span className="ml-auto text-[10px] text-muted-foreground/60">{fmtTime(item.created_at)}</span>
                            </div>
                            <p className="text-sm text-foreground whitespace-pre-wrap break-words">{item.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Tasks tab ──────────────────────────────────────────────── */}
                {tab === 'tasks' && (
                  <div className="p-4 space-y-3 max-w-2xl mobile-page-root">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase tracking-widest text-primary">Tasks</h3>
                      <button onClick={() => setShowTaskForm(!showTaskForm)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors">
                        <Plus size={12} /> Add task
                      </button>
                    </div>

                    {showTaskForm && (
                      <div className="p-4 bg-card rounded-xl border border-border space-y-3 mobile-page-root">
                        <input value={taskTitle} onChange={e => setTaskTitle(e.target.value)}
                          placeholder="Task title *" maxLength={200}
                          className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary" />
                        <div className="flex gap-2">
                          <input type="date" value={taskDue} onChange={e => setTaskDue(e.target.value)}
                            className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary" />
                          <select value={taskPriority} onChange={e => setTaskPriority(e.target.value)}
                            className="px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none">
                            <option value="low">Low</option>
                            <option value="normal">Normal</option>
                            <option value="high">High</option>
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={createTask} disabled={taskSaving || !taskTitle.trim()}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                            {taskSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create
                          </button>
                          <button onClick={() => setShowTaskForm(false)} className="px-3 py-2 rounded-lg bg-muted text-muted-foreground text-sm hover:bg-muted/80 transition-colors">Cancel</button>
                        </div>
                      </div>
                    )}

                    {tasksLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={20} /></div>
                    ) : tasks.length === 0 ? (
                      <p className="text-center text-muted-foreground text-sm py-8">No tasks yet</p>
                    ) : (
                      <div className="space-y-2">
                        {tasks.map(task => (
                          <div key={task.id} className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${task.status === 'completed' ? 'bg-muted/20 border-border/80 opacity-60' : isOverdue(task) ? 'bg-rose-500/5 dark:bg-rose-950/10 border-rose-500/20' : 'bg-card border-border'}`}>
                            <button onClick={() => toggleTask(task)} className="mt-0.5 shrink-0">
                              {task.status === 'completed'
                                ? <CheckCircle size={16} className="text-emerald-600 dark:text-emerald-400" />
                                : <Circle size={16} className="text-muted-foreground hover:text-primary" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{task.title}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {task.due_at && (
                                  <span className={`text-[10px] flex items-center gap-0.5 ${isOverdue(task) ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}`}>
                                    <Calendar size={9} /> {fmtDate(task.due_at)}
                                  </span>
                                )}
                                <span className={`text-[10px] font-semibold capitalize ${PRIORITY_COLOR[task.priority] || 'text-muted-foreground'}`}>{task.priority}</span>
                                {task.owner_name && <span className="text-[10px] text-muted-foreground/80">→ {task.owner_name}</span>}
                              </div>
                            </div>
                            <button onClick={() => deleteTask(task.id)} className="shrink-0 p-1 rounded text-muted-foreground/60 hover:text-rose-600 dark:hover:text-rose-400 transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Opportunities tab ──────────────────────────────────────── */}
                {tab === 'opportunities' && (
                  <div className="p-4 space-y-3 max-w-2xl mobile-page-root">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-primary">Opportunities</h3>
                        {opps.filter(o => o.stage !== 'lost').length > 0 && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Pipeline: {fmtNaira(opps.filter(o => o.stage !== 'lost').reduce((s, o) => s + (o.estimated_value || 0), 0))}
                          </p>
                        )}
                      </div>
                      <button onClick={() => setShowOppForm(!showOppForm)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors">
                        <Plus size={12} /> Add opportunity
                      </button>
                    </div>

                    {showOppForm && (
                      <div className="p-4 bg-card rounded-xl border border-border space-y-3 mobile-page-root">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] text-muted-foreground mb-1">Stage</label>
                            <select value={oppStage} onChange={e => setOppStage(e.target.value)}
                              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none">
                              {OPP_STAGES.map(s => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] text-muted-foreground mb-1">Value (₦)</label>
                            <input value={oppValue} onChange={e => setOppValue(e.target.value)} placeholder="e.g. 150000" inputMode="numeric"
                              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-[10px] text-muted-foreground mb-1">Expected close date</label>
                            <input type="date" value={oppCloseDate} onChange={e => setOppCloseDate(e.target.value)}
                              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-[10px] text-muted-foreground mb-1">Probability (%)</label>
                            <input value={oppProbability} onChange={e => setOppProbability(e.target.value)} placeholder="e.g. 70" inputMode="numeric"
                              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-[10px] text-muted-foreground mb-1">Source</label>
                            <input value={oppSource} onChange={e => setOppSource(e.target.value)} placeholder="e.g. WhatsApp, Referral"
                              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:outline-none" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] text-muted-foreground mb-1">Notes</label>
                          <textarea value={oppNotes} onChange={e => setOppNotes(e.target.value)} rows={2}
                            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none resize-none" />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={createOpp} disabled={oppSaving}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                            {oppSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
                          </button>
                          <button onClick={() => setShowOppForm(false)} className="px-3 py-2 rounded-lg bg-muted text-muted-foreground text-sm hover:bg-muted/80 transition-colors">Cancel</button>
                        </div>
                      </div>
                    )}

                    {oppsLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={20} /></div>
                    ) : opps.length === 0 ? (
                      <p className="text-center text-muted-foreground text-sm py-8">No opportunities yet</p>
                    ) : (
                      <div className="space-y-2">
                        {opps.map(opp => (
                          <div key={opp.id} className="p-3 bg-card rounded-xl border border-border space-y-2">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <select value={opp.stage} onChange={e => updateOppStage(opp, e.target.value)}
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border-0 focus:outline-none ${OPP_STAGE_COLOR[opp.stage] || 'bg-muted text-muted-foreground'}`}>
                                    {OPP_STAGES.map(s => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                                  </select>
                                  {opp.estimated_value && (
                                    <span className="text-sm font-black text-primary">{fmtNaira(opp.estimated_value)}</span>
                                  )}
                                  {opp.close_probability != null && (
                                    <span className="text-[10px] text-muted-foreground">{opp.close_probability}% likely</span>
                                  )}
                                </div>
                                <div className="flex gap-3 mt-1 flex-wrap">
                                  {opp.expected_close_at && (
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                      <Calendar size={9} /> Close {fmtDate(opp.expected_close_at)}
                                    </span>
                                  )}
                                  {opp.source && <span className="text-[10px] text-muted-foreground/80">via {opp.source}</span>}
                                  {opp.owner_name && <span className="text-[10px] text-muted-foreground/80">owner: {opp.owner_name}</span>}
                                </div>
                                {opp.notes && <p className="text-xs text-muted-foreground mt-1">{opp.notes}</p>}
                              </div>
                              <button onClick={() => deleteOpp(opp.id)} className="shrink-0 p-1 rounded text-muted-foreground/60 hover:text-rose-600 dark:hover:text-rose-400 transition-colors">
                                <Trash2 size={13} />
                              </button>
                            </div>
                            {opp.close_probability != null && (
                              <div className="h-1 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${opp.close_probability}%` }} />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Files tab ──────────────────────────────────────────────── */}
                {tab === 'files' && (
                  <div className="p-4 space-y-3 max-w-2xl mobile-page-root">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase tracking-widest text-primary">Files & Documents</h3>
                      <button onClick={() => fileRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        disabled={uploading}>
                        {uploading ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
                        {uploading ? 'Uploading…' : 'Upload file'}
                      </button>
                    </div>
                    <input ref={fileRef} type="file" className="hidden"
                      onChange={e => { if (e.target.files?.[0]) uploadFile(e.target.files[0]); e.target.value = ''; }} />

                    {attachLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={20} /></div>
                    ) : attachments.length === 0 ? (
                      <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
                        <Paperclip size={24} className="mx-auto mb-2 text-muted-foreground/60" />
                        <p className="text-sm text-muted-foreground">No files yet</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">Max 25 MB per file</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {attachments.map(a => (
                          <div key={a.id} className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border">
                            <span className="text-xl shrink-0">{fileIcon(a.file_type)}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{a.file_name}</p>
                              <div className="flex gap-2 text-[10px] text-muted-foreground mt-0.5">
                                {a.file_size && <span>{(a.file_size / 1024).toFixed(0)} KB</span>}
                                {a.uploaded_by_name && <span>by {a.uploaded_by_name}</span>}
                                <span>{fmtDate(a.created_at)}</span>
                              </div>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              {a.signed_url && (
                                <a href={a.signed_url} target="_blank" rel="noopener noreferrer" download
                                  className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                  <Download size={13} />
                                </a>
                              )}
                              <button onClick={() => deleteAttachment(a.id)}
                                className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 transition-colors">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── New Contact Modal ─────────────────────────────────────────────────── */}
      {showNewContact && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-sm font-black text-foreground">New Contact</h2>
              <button onClick={() => { setShowNewContact(false); setNewErr(''); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {newErr && <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{newErr}</p>}
              <div className="grid grid-cols-1 gap-3">
                {([
                  ['Full name *', newName, setNewName, 'text', true],
                  ['Email', newEmail, setNewEmail, 'email', false],
                  ['Phone / WhatsApp', newPhone, setNewPhone, 'tel', false],
                  ['Class / Year (hint)', newClass, setNewClass, 'text', false],
                ] as [string, string, (v: string) => void, string, boolean][]).map(([label, val, setter, type]) => (
                  <div key={label}>
                    <label className="block text-[10px] text-muted-foreground mb-1">{label}</label>
                    <input value={val} onChange={e => setter(e.target.value)} type={type}
                      className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary" />
                  </div>
                ))}
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">School *</label>
                  <select
                    value={newSchoolId}
                    onChange={e => {
                      const id = e.target.value;
                      setNewSchoolId(id);
                      setNewSchool(schoolOptions.find(s => s.id === id)?.name || '');
                    }}
                    onFocus={async () => {
                      if (schoolOptions.length) return;
                      try {
                        const res = await fetch('/api/schools', { cache: 'no-store' });
                        const json = await res.json();
                        setSchoolOptions((json.data ?? []).map((s: any) => ({ id: s.id, name: s.name })));
                      } catch { /* ignore */ }
                    }}
                    className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none"
                  >
                    <option value="">Select school</option>
                    {schoolOptions.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] text-muted-foreground">Required for parent / teacher / school / student portal contacts. Students auto-get a class.</p>
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">Role</label>
                  <select value={newRole} onChange={e => setNewRole(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none">
                    <option value="parent">Parent/Guardian</option>
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                    <option value="school">School Partner</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={createContact} disabled={newSaving || !newName.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-black hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {newSaving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Create contact
              </button>
              <button onClick={() => { setShowNewContact(false); setNewErr(''); }}
                className="px-4 py-2.5 rounded-xl bg-muted text-muted-foreground text-sm hover:bg-muted/80 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Link Student Modal ────────────────────────────────────────────────── */}
      {showLinkModal && selected && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h2 className="text-sm font-black text-foreground">Connect Student</h2>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Link child to: <span className="text-foreground font-bold">{selected.full_name}</span>
                </p>
              </div>
              <button onClick={() => setShowLinkModal(false)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {linkError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                  {linkError}
                </p>
              )}
              
              <div className="space-y-1">
                <label className="block text-[10px] text-muted-foreground uppercase tracking-wider">Search Student</label>
                <input
                  type="search"
                  value={studentSearch}
                  onChange={e => handleLinkStudentSearch(e.target.value)}
                  placeholder="Type student name..."
                  className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] text-muted-foreground uppercase tracking-wider">Relationship</label>
                <select
                  value={relationship}
                  onChange={e => setRelationship(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
                >
                  {['Guardian', 'Father', 'Mother', 'Sibling', 'Uncle', 'Aunt', 'Other'].map(r => (
                    <option key={r} value={r} className="bg-card text-foreground">{r}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] text-muted-foreground uppercase tracking-wider">Select Student</label>
                {studentsLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                  </div>
                ) : studentOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic text-center py-4">No students found matching that name.</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {studentOptions.map(s => (
                      <button
                        key={s.id}
                        disabled={linkingStudentId === s.id}
                        onClick={() => linkStudent(s.id)}
                        className="w-full flex items-center justify-between px-3 py-2.5 bg-background hover:bg-muted border border-border rounded-xl text-left transition-colors disabled:opacity-50 group"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">{s.full_name}</p>
                          {s.section_class && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">{s.section_class}</p>
                          )}
                        </div>
                        <span className="text-[10px] font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          {linkingStudentId === s.id ? 'Connecting...' : 'Connect →'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 pb-5">
              <button
                onClick={() => setShowLinkModal(false)}
                className="w-full py-2.5 rounded-xl bg-muted text-muted-foreground text-sm hover:bg-muted/80 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
