'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { brandAssets, companyInfo, contactInfo } from '@/config/brand';
import {
  Users, Search, Plus, Phone, Mail, MessageSquare, FileText,
  ChevronRight, Loader2, Paperclip, Download, Trash2, X,
  Phone as PhoneIcon, Building2, UserCircle, Filter,
  CheckCircle, AlertCircle, Clock, TrendingDown, Star,
  Send, ChevronDown, ChevronUp, StickyNote, Calendar,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

type CRMContact = {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  phone_number?: string;
  role: string;
  school_name?: string;
  school_id?: string;
  source?: string;
  last_message_at?: string;
  created_at?: string;
  pipeline_stage?: string;
};

type Interaction = {
  id: string;
  contact_id: string;
  contact_name: string;
  type: 'note' | 'call' | 'email' | 'meeting' | 'whatsapp';
  direction: 'inbound' | 'outbound';
  content: string;
  staff_name?: string;
  created_at: string;
};

type UnifiedTimelineItem = {
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
  contact_id: string;
  file_name: string;
  file_type?: string;
  file_size?: number;
  uploaded_by_name?: string;
  created_at: string;
  signed_url?: string;
};

type OverdueTask = {
  id: string;
  title: string;
  contact_name: string;
  due_at: string | null;
  priority: string;
};

type PipelineStage = 'prospect' | 'active' | 'at_risk' | 'churned' | 'won';

// ── Constants ──────────────────────────────────────────────────────────────────

const PIPELINE_STAGES: { value: PipelineStage; label: string; color: string; icon: React.ReactNode }[] = [
  { value: 'prospect',  label: 'Prospect',  color: 'bg-primary/20 text-primary border-primary/30',   icon: <Star className="w-3 h-3" /> },
  { value: 'active',   label: 'Active',    color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: <CheckCircle className="w-3 h-3" /> },
  { value: 'at_risk',  label: 'At Risk',   color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',   icon: <AlertCircle className="w-3 h-3" /> },
  { value: 'churned',  label: 'Churned',   color: 'bg-red-500/20 text-red-400 border-red-500/30',          icon: <TrendingDown className="w-3 h-3" /> },
  { value: 'won',      label: 'Won',       color: 'bg-primary/20 text-primary border-primary/30', icon: <CheckCircle className="w-3 h-3" /> },
];

const INTERACTION_TYPES = [
  { value: 'note',     label: 'Note',     icon: StickyNote },
  { value: 'call',     label: 'Call',     icon: PhoneIcon },
  { value: 'email',    label: 'Email',    icon: Mail },
  { value: 'meeting',  label: 'Meeting',  icon: Calendar },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
];

const ROLE_COLORS: Record<string, string> = {
  student:  'bg-emerald-500/20 text-emerald-400',
  parent:   'bg-primary/20 text-primary',
  teacher:  'bg-primary/20 text-primary',
  school:   'bg-indigo-500/20 text-indigo-400',
  admin:    'bg-primary/20 text-primary',
  external: 'bg-white/10 text-white/50',
};

const LETTERHEAD = {
  company: companyInfo.name,
  address: contactInfo.address,
  supportEmail: contactInfo.email,
  supportPhone: contactInfo.phone,
  logoPath: brandAssets.logo,
};

function initials(name: string) {
  return name?.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() || '?';
}

function formatDate(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatBytes(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type?: string) {
  if (!type) return '📄';
  if (type.startsWith('image/')) return '🖼️';
  if (type.includes('pdf')) return '📕';
  if (type.includes('word') || type.includes('document')) return '📝';
  if (type.includes('spreadsheet') || type.includes('excel') || type.includes('csv')) return '📊';
  if (type.startsWith('video/')) return '🎬';
  if (type.startsWith('audio/')) return '🎵';
  if (type.includes('zip') || type.includes('rar') || type.includes('tar')) return '🗜️';
  return '📄';
}

function stageMeta(stage?: string) {
  return PIPELINE_STAGES.find(s => s.value === stage) || PIPELINE_STAGES[0];
}

// ── Main Component ──────────────────────────────────────────────────────────────

export default function CRMPage() {
  const { profile, loading: authLoading } = useAuth();
  const supabase = createClient();

  // Contacts
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedContact, setSelectedContact] = useState<CRMContact | null>(null);

  // Right panel tabs
  const [panel, setPanel] = useState<'timeline' | 'documents' | 'pipeline'>('timeline');

  // Interactions
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [unifiedTimeline, setUnifiedTimeline] = useState<UnifiedTimelineItem[]>([]);
  const [interactionsLoading, setInteractionsLoading] = useState(false);
  const [showAddInteraction, setShowAddInteraction] = useState(false);
  const [interactionType, setInteractionType] = useState<string>('note');
  const [interactionDir, setInteractionDir] = useState<string>('outbound');
  const [interactionContent, setInteractionContent] = useState('');
  const [savingInteraction, setSavingInteraction] = useState(false);

  // Attachments
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pipeline
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>('active');
  const [pipelineNotes, setPipelineNotes] = useState('');
  const [savingPipeline, setSavingPipeline] = useState(false);
  const [pipelineSaved, setPipelineSaved] = useState(false);

  // WA message stats from supabase (communication count)
  const [waMessageCount, setWaMessageCount] = useState<number | null>(null);
  const [myOverdueTasks, setMyOverdueTasks] = useState<OverdueTask[]>([]);

  const isAdmin = profile?.role === 'admin';
  const isStaff = ['admin', 'teacher', 'school'].includes(profile?.role || '');

  // ── Fetch contacts ────────────────────────────────────────────────────────────

  const fetchContacts = useCallback(async () => {
    if (!profile) return;
    setContactsLoading(true);
    try {
      const params = new URLSearchParams({ search: contactSearch, role: roleFilter, limit: '80' });
      const res = await fetch(`/api/crm/contacts?${params}`);
      const json = await res.json();
      if (json.contacts) {
        // Pull pipeline stages in a single query
        const ids = json.contacts.map((c: CRMContact) => c.id);
        const { data: pipes } = await supabase.from('crm_pipeline').select('contact_id, stage').in('contact_id', ids);
        const stageMap: Record<string, string> = {};
        (pipes || []).forEach((p: any) => { stageMap[p.contact_id] = p.stage; });
        setContacts(json.contacts.map((c: CRMContact) => ({ ...c, pipeline_stage: stageMap[c.id] })));
      }
    } catch {
      // ignore
    } finally {
      setContactsLoading(false);
    }
  }, [contactSearch, roleFilter, profile]); // eslint-disable-line

  useEffect(() => {
    if (!isStaff) return;
    const t = setTimeout(fetchContacts, 300);
    return () => clearTimeout(t);
  }, [fetchContacts, isStaff]);

  useEffect(() => {
    if (!isStaff) return;
    fetch('/api/crm/tasks?mine=1&overdue=1&status=open')
      .then((r) => r.json())
      .then((j) => setMyOverdueTasks((Array.isArray(j?.data) ? j.data : []) as OverdueTask[]))
      .catch(() => setMyOverdueTasks([]));
  }, [isStaff, selectedContact?.id]);

  // ── Select contact — load interactions, attachments, pipeline ────────────────

  const selectContact = async (c: CRMContact) => {
    setSelectedContact(c);
    setInteractions([]); setAttachments([]);
    setUnifiedTimeline([]);
    setShowAddInteraction(false); setUploadError('');
    setPipelineSaved(false);

    setInteractionsLoading(true);
    setAttachmentsLoading(true);

    try {
      // Interactions
      const iRes = await fetch(`/api/crm/interactions?contact_id=${c.id}&limit=100`);
      const iJson = await iRes.json();
      setInteractions(iJson.interactions || []);
    } catch { /**/ } finally { setInteractionsLoading(false); }

    try {
      const tRes = await fetch(`/api/crm/timeline?contact_id=${encodeURIComponent(c.id)}`);
      const tJson = await tRes.json();
      setUnifiedTimeline((tJson.data ?? []) as UnifiedTimelineItem[]);
    } catch {
      setUnifiedTimeline([]);
    }

    try {
      // Attachments
      const aRes = await fetch(`/api/crm/attachments?contact_id=${c.id}`);
      const aJson = await aRes.json();
      setAttachments(aJson.attachments || []);
    } catch { /**/ } finally { setAttachmentsLoading(false); }

    try {
      // Pipeline stage
      const { data: pipe } = await supabase.from('crm_pipeline').select('stage, pipeline_notes').eq('contact_id', c.id).maybeSingle();
      if (pipe) { setPipelineStage(pipe.stage as PipelineStage); setPipelineNotes(pipe.pipeline_notes || ''); }
      else { setPipelineStage('active'); setPipelineNotes(''); }
    } catch { /**/ }

    try {
      // WA message count
      const { data: waConv } = await supabase.from('whatsapp_conversations')
        .select('id')
        .or(c.phone ? `phone_number.eq.${(c.phone || '').replace(/\D/g, '')}` : `portal_user_id.eq.${c.id}`)
        .maybeSingle();
      if (waConv) {
        const { count } = await supabase.from('whatsapp_messages').select('id', { count: 'exact', head: true }).eq('conversation_id', waConv.id);
        setWaMessageCount(count ?? 0);
      } else { setWaMessageCount(0); }
    } catch { setWaMessageCount(null); }
  };

  // ── Add interaction ─────────────────────────────────────────────────────────

  const addInteraction = async () => {
    if (!selectedContact || !interactionContent.trim()) return;
    setSavingInteraction(true);
    try {
      const res = await fetch('/api/crm/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: selectedContact.id,
          contact_name: selectedContact.full_name,
          contact_type: selectedContact.role === 'external' ? 'external' : 'portal_user',
          type: interactionType,
          direction: interactionDir,
          content: interactionContent.trim(),
        }),
      });
      const json = await res.json();
      if (json.interaction) {
        setInteractions(prev => [json.interaction, ...prev]);
        setInteractionContent('');
        setShowAddInteraction(false);
      }
    } catch { /**/ } finally { setSavingInteraction(false); }
  };

  // ── Delete interaction ──────────────────────────────────────────────────────

  const deleteInteraction = async (id: string) => {
    if (!confirm('Delete this interaction log?')) return;
    await fetch(`/api/crm/interactions?id=${id}`, { method: 'DELETE' });
    setInteractions(prev => prev.filter(i => i.id !== id));
  };

  // ── Upload document ─────────────────────────────────────────────────────────

  const uploadFile = async (file: File) => {
    if (!selectedContact) return;
    setUploadingFile(true); setUploadError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('contact_id', selectedContact.id);
      fd.append('contact_name', selectedContact.full_name);
      fd.append('contact_type', selectedContact.role === 'external' ? 'external' : 'portal_user');
      const res = await fetch('/api/crm/attachments', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.error) { setUploadError(json.error); return; }
      if (json.attachment) setAttachments(prev => [json.attachment, ...prev]);
    } catch (e: any) { setUploadError(e.message); }
    finally { setUploadingFile(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const deleteAttachment = async (id: string) => {
    if (!confirm('Delete this attachment?')) return;
    await fetch(`/api/crm/attachments?id=${id}`, { method: 'DELETE' });
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  // ── Save pipeline ─────────────────────────────────────────────────────────

  const savePipeline = async () => {
    if (!selectedContact) return;
    setSavingPipeline(true);
    try {
      await fetch('/api/crm/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: selectedContact.id,
          contact_name: selectedContact.full_name,
          contact_type: selectedContact.role === 'external' ? 'external' : 'portal_user',
          stage: pipelineStage,
          pipeline_notes: pipelineNotes,
        }),
      });
      setSelectedContact(prev => prev ? { ...prev, pipeline_stage: pipelineStage } : prev);
      setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, pipeline_stage: pipelineStage } : c));
      setPipelineSaved(true);
      setTimeout(() => setPipelineSaved(false), 3000);
    } catch { /**/ } finally { setSavingPipeline(false); }
  };

  // ── Guard ─────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p className="text-white/50">Access denied. Staff only.</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Customer Retention</h1>
          <p className="text-white/40 text-sm mt-0.5">All contacts, communication history & documents in one place</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-white/30 font-bold uppercase">
          <Users className="w-4 h-4" />
          <span>{contacts.length} contacts</span>
          <button
            type="button"
            onClick={() => window.print()}
            className="ml-2 px-3 py-1.5 rounded-lg border border-white/20 text-white/70 hover:bg-white/10 print:hidden"
          >
            Print
          </button>
          <Link
            href="/dashboard/customer-book"
            className="ml-2 px-3 py-1.5 rounded-lg border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10 print:hidden"
          >
            Customer Book
          </Link>
        </div>
      </div>

      <div className="hidden print:flex items-start justify-between gap-4 border-b border-black pb-3">
        <div className="flex items-start gap-3">
          <img src={LETTERHEAD.logoPath} alt="Rillcod Academy logo" className="h-10 w-10 object-contain" />
          <div>
            <p className="text-lg font-black text-black">{LETTERHEAD.company}</p>
            <p className="text-xs text-black/70">{LETTERHEAD.address}</p>
            <p className="text-xs text-black/70">Support: {LETTERHEAD.supportEmail} · {LETTERHEAD.supportPhone}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-black">CRM Customer Retention Record</p>
          <p className="text-xs text-black/70">{new Date().toLocaleString()}</p>
        </div>
      </div>

      {/* Pipeline summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {PIPELINE_STAGES.map(s => {
          const count = contacts.filter(c => c.pipeline_stage === s.value).length;
          return (
            <button key={s.value}
              onClick={() => setRoleFilter(prev => prev)}
              className={`flex flex-col items-center py-3 px-2 rounded-xl border ${s.color} text-center transition-all hover:brightness-110`}>
              <span className="text-lg font-black">{count}</span>
              <span className="text-[10px] font-bold uppercase tracking-wide mt-0.5">{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main layout */}
      <div className="flex flex-col lg:flex-row gap-4 min-h-[600px]">

        {/* ── Left: Contact list ─────────────────────────────────────────────── */}
        <div className="w-full lg:w-[320px] lg:shrink-0 bg-white/[0.03] border border-white/[0.07] rounded-2xl flex flex-col overflow-hidden">

          {/* Search + filters */}
          <div className="p-3 border-b border-white/[0.06] space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                value={contactSearch}
                onChange={e => setContactSearch(e.target.value)}
                placeholder="Search contacts…"
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-primary/50"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {['all', 'student', 'parent', 'teacher', 'school', 'external'].map(r => (
                <button key={r} onClick={() => setRoleFilter(r)}
                  className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full transition-colors ${roleFilter === r ? 'bg-primary text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="mx-3 mb-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-300/80">My overdue tasks</p>
            {myOverdueTasks.length === 0 ? (
              <p className="mt-1 text-[11px] text-white/45">No overdue tasks assigned to you.</p>
            ) : (
              <div className="mt-1.5 space-y-1.5">
                {myOverdueTasks.slice(0, 4).map((t) => (
                  <div key={t.id} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
                    <p className="text-[11px] font-bold text-white">{t.contact_name}</p>
                    <p className="text-[10px] text-white/60">{t.title}</p>
                    {t.due_at && <p className="text-[10px] text-amber-300/70">Due: {formatDate(t.due_at)}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto max-h-[42vh] lg:max-h-none">
            {contactsLoading ? (
              <div className="flex justify-center p-10">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : contacts.length === 0 ? (
              <div className="text-center p-10">
                <UserCircle className="w-8 h-8 text-white/10 mx-auto mb-2" />
                <p className="text-white/30 text-sm">No contacts found</p>
              </div>
            ) : (
              contacts.map(c => {
                const sm = stageMeta(c.pipeline_stage);
                return (
                  <div key={c.id}
                    onClick={() => selectContact(c)}
                    className={`px-3 py-3 cursor-pointer border-b border-white/[0.04] transition-colors group ${selectedContact?.id === c.id ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}>
                    <div className="flex items-center gap-2.5">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm text-white shrink-0 ${
                        c.role === 'student' ? 'bg-emerald-600' : c.role === 'parent' ? 'bg-primary' :
                        c.role === 'teacher' ? 'bg-primary' : c.role === 'school' ? 'bg-indigo-700' : 'bg-white/20'
                      }`}>
                        {initials(c.full_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-white text-sm truncate">{c.full_name}</span>
                          <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full shrink-0 ${ROLE_COLORS[c.role] || 'bg-white/10 text-white/40'}`}>{c.role}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {c.phone && <span className="text-[10px] text-white/30 flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />{c.phone}</span>}
                          {c.pipeline_stage && (
                            <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full border ${sm.color}`}>{sm.label}</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${selectedContact?.id === c.id ? 'rotate-90 text-primary' : 'text-white/20 group-hover:text-white/40'}`} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right: Contact detail ──────────────────────────────────────────── */}
        {selectedContact ? (
          <div className="w-full flex-1 bg-white/[0.03] border border-white/[0.07] rounded-2xl flex flex-col overflow-hidden">

            {/* Contact header */}
            <div className="px-4 sm:px-5 py-4 border-b border-white/[0.06] flex flex-col sm:flex-row items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl text-white shrink-0 ${
                  selectedContact.role === 'student' ? 'bg-emerald-600' : selectedContact.role === 'parent' ? 'bg-primary' :
                  selectedContact.role === 'teacher' ? 'bg-primary' : selectedContact.role === 'school' ? 'bg-indigo-700' : 'bg-white/20'
                }`}>
                  {initials(selectedContact.full_name)}
                </div>
                <div>
                  <h2 className="font-black text-white text-lg">{selectedContact.full_name}</h2>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${ROLE_COLORS[selectedContact.role] || 'bg-white/10 text-white/40'}`}>{selectedContact.role}</span>
                    {selectedContact.school_name && <span className="text-xs text-white/40 flex items-center gap-1"><Building2 className="w-3 h-3" />{selectedContact.school_name}</span>}
                    {selectedContact.email && <span className="text-xs text-white/40 flex items-center gap-1"><Mail className="w-3 h-3" />{selectedContact.email}</span>}
                    {(selectedContact.phone || selectedContact.phone_number) && (
                      <span className="text-xs text-emerald-400 flex items-center gap-1"><Phone className="w-3 h-3" />{selectedContact.phone || selectedContact.phone_number}</span>
                    )}
                  </div>
                </div>
              </div>
              {/* Communication stat */}
              <div className="shrink-0 text-right">
                {waMessageCount !== null && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 text-center">
                    <p className="text-xl font-black text-emerald-400">{waMessageCount}</p>
                    <p className="text-[10px] text-emerald-400/60 font-bold uppercase">WA messages</p>
                  </div>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-white/[0.06] px-2 overflow-x-auto">
              {[
                { key: 'timeline', label: 'Timeline', count: interactions.length },
                { key: 'documents', label: 'Documents', count: attachments.length },
                { key: 'pipeline', label: 'Pipeline' },
              ].map(t => (
                <button key={t.key} onClick={() => setPanel(t.key as any)}
                  className={`px-4 py-3 text-sm font-bold transition-colors border-b-2 flex items-center gap-1.5 ${panel === t.key ? 'border-primary text-primary' : 'border-transparent text-white/40 hover:text-white/70'}`}>
                  {t.label}
                  {t.count !== undefined && t.count > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${panel === t.key ? 'bg-primary/20 text-primary' : 'bg-white/10 text-white/40'}`}>{t.count}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">

              {/* ── TIMELINE TAB ─── */}
              {panel === 'timeline' && (
                <>
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                    <p className="text-[11px] font-black uppercase tracking-widest text-white/40 mb-2">Unified timeline (auto-captured)</p>
                    {unifiedTimeline.length === 0 ? (
                      <p className="text-xs text-white/30">No auto-captured messages yet.</p>
                    ) : (
                      <div className="space-y-2 max-h-[230px] overflow-y-auto pr-1">
                        {unifiedTimeline.slice(0, 30).map((item) => (
                          <div key={item.id} className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                                  item.channel === 'whatsapp'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : item.channel === 'inapp'
                                      ? 'bg-primary/20 text-violet-300'
                                      : 'bg-primary/20 text-primary'
                                }`}>
                                  {item.channel}
                                </span>
                                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                                  item.direction === 'inbound' ? 'bg-primary/15 text-blue-300' : 'bg-primary/15 text-primary'
                                }`}>
                                  {item.direction}
                                </span>
                                {item.actor && <span className="text-[10px] text-white/35">by {item.actor}</span>}
                              </div>
                              <span className="text-[10px] text-white/25">{formatDate(item.created_at)}</span>
                            </div>
                            <p className="text-xs text-white/75 mt-1 whitespace-pre-wrap">{item.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Add interaction */}
                  {!showAddInteraction ? (
                    <button onClick={() => setShowAddInteraction(true)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-xl text-primary text-sm font-bold transition-colors">
                      <Plus className="w-4 h-4" /> Log Interaction
                    </button>
                  ) : (
                    <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-black text-white">Log Interaction</span>
                        <button onClick={() => setShowAddInteraction(false)} className="text-white/30 hover:text-white"><X className="w-4 h-4" /></button>
                      </div>

                      {/* Type + direction */}
                      <div className="flex gap-2 flex-wrap">
                        {INTERACTION_TYPES.map(t => {
                          const Icon = t.icon;
                          return (
                            <button key={t.value} onClick={() => setInteractionType(t.value)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black transition-colors ${interactionType === t.value ? 'bg-primary text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
                              <Icon className="w-3 h-3" /> {t.label}
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex gap-2">
                        {['outbound', 'inbound'].map(d => (
                          <button key={d} onClick={() => setInteractionDir(d)}
                            className={`px-3 py-1 rounded-full text-[11px] font-black transition-colors ${interactionDir === d ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-white/5 text-white/30 hover:bg-white/10'}`}>
                            {d}
                          </button>
                        ))}
                      </div>

                      <textarea
                        value={interactionContent}
                        onChange={e => setInteractionContent(e.target.value)}
                        placeholder="Write notes about this interaction…"
                        rows={4}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-primary/50 resize-none"
                      />

                      <button onClick={addInteraction} disabled={savingInteraction || !interactionContent.trim()}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary disabled:opacity-40 text-white text-sm font-black rounded-xl transition-colors">
                        {savingInteraction ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Save Log
                      </button>
                    </div>
                  )}

                  {/* Timeline list */}
                  {interactionsLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
                  ) : interactions.length === 0 ? (
                    <div className="text-center py-10">
                      <Clock className="w-8 h-8 text-white/10 mx-auto mb-2" />
                      <p className="text-white/30 text-sm">No interactions logged yet.</p>
                    </div>
                  ) : (
                    <div className="relative">
                      {/* vertical line */}
                      <div className="absolute left-[19px] top-0 bottom-0 w-px bg-white/[0.06]" />
                      <div className="space-y-3">
                        {interactions.map(i => {
                          const TypeIcon = INTERACTION_TYPES.find(t => t.value === i.type)?.icon || StickyNote;
                          return (
                            <div key={i.id} className="flex gap-3 relative">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 ${
                                i.type === 'note' ? 'bg-primary/20 text-primary' :
                                i.type === 'call' ? 'bg-emerald-500/20 text-emerald-400' :
                                i.type === 'email' ? 'bg-primary/20 text-primary' :
                                i.type === 'meeting' ? 'bg-primary/20 text-primary' :
                                'bg-emerald-900/40 text-emerald-400'
                              }`}>
                                <TypeIcon className="w-4 h-4" />
                              </div>
                              <div className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[11px] font-black text-white uppercase">{i.type}</span>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${i.direction === 'outbound' ? 'bg-primary/10 text-primary' : 'bg-primary/10 text-primary'}`}>{i.direction}</span>
                                    {i.staff_name && <span className="text-[10px] text-white/30">by {i.staff_name}</span>}
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[10px] text-white/20">{formatDate(i.created_at)}</span>
                                    {isAdmin && (
                                      <button onClick={() => deleteInteraction(i.id)} className="text-white/20 hover:text-red-400 transition-colors">
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <p className="text-sm text-white/70 whitespace-pre-wrap">{i.content}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── DOCUMENTS TAB ─── */}
              {panel === 'documents' && (
                <>
                  {/* Upload button */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 px-4 py-6 bg-white/[0.03] border-2 border-dashed border-white/10 hover:border-primary/40 rounded-xl cursor-pointer transition-colors group">
                    {uploadingFile ? (
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    ) : (
                      <>
                        <Paperclip className="w-6 h-6 text-white/20 group-hover:text-primary transition-colors" />
                        <span className="text-sm text-white/40 group-hover:text-white/60 font-bold transition-colors">Click to attach a document</span>
                        <span className="text-[11px] text-white/20">PDF, Word, Excel, images, video — up to 25 MB</span>
                      </>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); }}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.mp4,.mp3,.zip" />
                  {uploadError && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{uploadError}</p>}

                  {/* Attachments list */}
                  {attachmentsLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
                  ) : attachments.length === 0 ? (
                    <div className="text-center py-8">
                      <FileText className="w-8 h-8 text-white/10 mx-auto mb-2" />
                      <p className="text-white/30 text-sm">No documents attached yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {attachments.map(a => (
                        <div key={a.id} className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-3 group">
                          <span className="text-2xl shrink-0">{fileIcon(a.file_type)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white truncate">{a.file_name}</p>
                            <p className="text-[10px] text-white/30">
                              {formatBytes(a.file_size)}
                              {a.uploaded_by_name && ` · ${a.uploaded_by_name}`}
                              {' · '}{formatDate(a.created_at)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            {a.signed_url && (
                              <a href={a.signed_url} download={a.file_name} target="_blank" rel="noopener noreferrer"
                                className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            )}
                            {isAdmin && (
                              <button onClick={() => deleteAttachment(a.id)}
                                className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ── PIPELINE TAB ─── */}
              {panel === 'pipeline' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-black text-white/50 uppercase tracking-widest mb-2 block">Retention Stage</label>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {PIPELINE_STAGES.map(s => (
                        <button key={s.value} onClick={() => setPipelineStage(s.value)}
                          className={`flex flex-col items-center py-3 px-2 rounded-xl border text-center transition-all ${pipelineStage === s.value ? s.color + ' ring-2 ring-current' : 'bg-white/5 border-white/10 text-white/30 hover:bg-white/10'}`}>
                          <span className="mb-1">{s.icon}</span>
                          <span className="text-[10px] font-black uppercase">{s.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-black text-white/50 uppercase tracking-widest mb-2 block">Pipeline Notes</label>
                    <textarea
                      value={pipelineNotes}
                      onChange={e => setPipelineNotes(e.target.value)}
                      placeholder="Reason for stage, last contact, action plan…"
                      rows={5}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-primary/50 resize-none"
                    />
                  </div>

                  <button onClick={savePipeline} disabled={savingPipeline}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-colors ${pipelineSaved ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-primary hover:bg-primary disabled:opacity-40 text-white'}`}>
                    {savingPipeline ? <Loader2 className="w-4 h-4 animate-spin" /> : pipelineSaved ? <CheckCircle className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                    {pipelineSaved ? 'Saved!' : 'Save Pipeline Stage'}
                  </button>
                </div>
              )}

            </div>
          </div>
        ) : (
          <div className="flex-1 bg-white/[0.02] border border-white/[0.05] rounded-2xl flex items-center justify-center">
            <div className="text-center">
              <Users className="w-12 h-12 text-white/10 mx-auto mb-3" />
              <p className="text-white/30 font-bold">Select a contact</p>
              <p className="text-white/20 text-sm mt-1">View timeline, documents & retention stage</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
