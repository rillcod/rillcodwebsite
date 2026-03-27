// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
  UserGroupIcon, CheckCircleIcon, XCircleIcon, ArrowLeftIcon,
  DocumentTextIcon, ReceiptPercentIcon, PlusIcon, TrashIcon,
  MagnifyingGlassIcon, BuildingOfficeIcon, CheckIcon, ExclamationCircleIcon,
  ArrowPathIcon, ArchiveBoxIcon, UserIcon,
} from '@/lib/icons';

// ── Types ──────────────────────────────────────────────────────────────────

type PortalStudent = {
  id: string;
  full_name: string;
  email: string;
  school_id: string | null;
  school_name?: string;
  source: 'portal';
};

type NonPortalStudent = {
  id: string;
  full_name: string;
  email?: string;
  school_name?: string;
  source: 'non-portal';
};

type AnyStudent = PortalStudent | NonPortalStudent;

type LineItem = {
  description: string;
  quantity: number;
  unit_price: number;
};

type BulkResult = {
  student_id: string;
  student_name: string;
  status: 'success' | 'error';
  ref?: string;
  error?: string;
};

type BatchRecord = {
  id: string;
  batch_id: string;
  batch_type: 'invoice' | 'receipt';
  created_at: string;
  count: number;
  total_amount: number;
};

type BatchItem = {
  invoice_number?: string;
  receipt_number?: string;
  amount: number;
  currency?: string;
  status?: string;
  created_at?: string;
  issued_at?: string;
  notes?: string;
  portal_users?: { full_name: string } | null;
  metadata?: { payer_name?: string; batch_id?: string; [key: string]: unknown } | null;
};

type Batch = {
  id: string;
  type: 'invoice' | 'receipt';
  created_at: string;
  items: BatchItem[];
  total: number;
};

// ── Step indicator ─────────────────────────────────────────────────────────

function StepBar({ step }: { step: 1 | 2 | 3 }) {
  const labels = ['Document Type', 'Select Recipients', 'Configure & Generate'];
  return (
    <div className="flex items-stretch gap-0">
      {labels.map((label, i) => {
        const s = (i + 1) as 1 | 2 | 3;
        const isActive = step === s;
        const isDone = step > s;
        return (
          <div key={i} className="flex items-stretch flex-1">
            <div className={`flex items-center gap-2 px-4 py-2.5 flex-1 text-xs font-black uppercase tracking-widest border transition-all ${isActive ? 'bg-primary text-white border-primary' : isDone ? 'bg-primary/10 text-primary border-primary/20' : 'bg-card text-muted-foreground border-border'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${isActive ? 'bg-white text-primary' : isDone ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                {isDone ? '✓' : s}
              </span>
              <span className="hidden sm:block">{label}</span>
            </div>
            {i < 2 && <div className="w-0 h-0 border-t-[18px] border-b-[18px] border-l-[10px] border-t-transparent border-b-transparent border-l-border flex-shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

// ── Line item editor ────────────────────────────────────────────────────────

function LineItemEditor({ items, onChange, accentColor = 'violet' }: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  accentColor?: string;
}) {
  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  function update(idx: number, field: keyof LineItem, value: string) {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: field === 'description' ? value : parseFloat(value) || 0 };
    onChange(next);
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Line Items (applied to all recipients)</p>
        <button type="button" onClick={() => onChange([...items, { description: '', quantity: 1, unit_price: 0 }])}
          className="text-[10px] font-black text-primary hover:text-primary/80 uppercase tracking-widest transition-colors flex items-center gap-1">
          <PlusIcon className="w-3 h-3" /> Add Line
        </button>
      </div>
      {items.map((item, idx) => (
        <div key={idx} className="flex gap-2 items-center">
          <input type="text" placeholder="Description" value={item.description}
            onChange={e => update(idx, 'description', e.target.value)}
            className="flex-1 px-3 py-2 bg-background border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary" />
          <input type="number" placeholder="Qty" min="1" value={item.quantity}
            onChange={e => update(idx, 'quantity', e.target.value)}
            className="w-14 px-2 py-2 bg-background border border-border rounded-none text-sm text-center text-foreground focus:outline-none focus:border-primary" />
          <input type="number" placeholder="Unit ₦" min="0" value={item.unit_price || ''}
            onChange={e => update(idx, 'unit_price', e.target.value)}
            className="w-28 px-3 py-2 bg-background border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary" />
          <span className="text-sm font-black text-primary w-24 text-right flex-shrink-0">
            ₦{(item.quantity * item.unit_price).toLocaleString()}
          </span>
          {items.length > 1 && (
            <button type="button" onClick={() => onChange(items.filter((_, i) => i !== idx))}
              className="p-1.5 text-rose-400/60 hover:text-rose-400 transition-colors">
              <TrashIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      <div className="flex justify-end pt-2 border-t border-border">
        <div className="text-right">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Per Recipient Total</p>
          <p className="text-xl font-black text-foreground">₦{total.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function BulkPaymentsPage() {
  const { profile, loading: authLoading } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isSchool = profile?.role === 'school';
  const canAccess = isAdmin || isSchool;

  // Navigation
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [activeTab, setActiveTab] = useState<'generate' | 'archive'>('generate');

  // Document type
  const [docType, setDocType] = useState<'invoice' | 'receipt'>('invoice');

  // Student source
  const [source, setSource] = useState<'portal' | 'non-portal'>('portal');
  const [portalStudents, setPortalStudents] = useState<PortalStudent[]>([]);
  const [nonPortalStudents, setNonPortalStudents] = useState<NonPortalStudent[]>([]);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; label: string; bank_name: string; account_number: string; account_name: string }[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('');

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Invoice config
  const [invItems, setInvItems] = useState<LineItem[]>([
    { description: 'Coding Club Fee', quantity: 1, unit_price: 0 },
  ]);
  const [invDueDate, setInvDueDate] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  );
  const [invNotes, setInvNotes] = useState('');

  // Receipt config
  const [rcptItems, setRcptItems] = useState<LineItem[]>([
    { description: 'STEM / AI / Coding Programme Fee', quantity: 1, unit_price: 0 },
  ]);
  const [rcptPaymentMethod, setRcptPaymentMethod] = useState('bank_transfer');
  const [rcptPaymentDate, setRcptPaymentDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [rcptReceivedBy, setRcptReceivedBy] = useState('');
  const [rcptAccountId, setRcptAccountId] = useState('');
  const [rcptNotes, setRcptNotes] = useState('');

  // Execution
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BulkResult[]>([]);
  const [done, setDone] = useState(false);
  const [currentBatchId, setCurrentBatchId] = useState('');

  // Archive
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [batchDetails, setBatchDetails] = useState<Record<string, BatchItem[]>>({});

  const db = createClient();

  useEffect(() => {
    if (authLoading || !profile) return;
    loadPortalStudents();
    loadNonPortalStudents();
    loadSchools();
    loadAccounts();
  }, [profile?.id, authLoading]); // eslint-disable-line

  useEffect(() => {
    if (activeTab === 'archive') loadBatches();
  }, [activeTab]); // eslint-disable-line

  async function loadPortalStudents() {
    setLoadingStudents(true);
    const base = db.from('portal_users')
      .select('id, full_name, email, school_id, schools(name)')
      .eq('role', 'student')
      .eq('is_active', true);
    const { data } = await (
      isSchool && profile?.school_id
        ? base.eq('school_id', profile.school_id).order('full_name')
        : base.order('full_name')
    );
    if (data) {
      type Row = { id: string; full_name: string; email: string; school_id: string | null; schools: { name: string } | null };
      setPortalStudents((data as unknown as Row[]).map(s => ({
        id: s.id, full_name: s.full_name, email: s.email,
        school_id: s.school_id, school_name: s.schools?.name, source: 'portal' as const,
      })));
    }
    setLoadingStudents(false);
  }

  async function loadNonPortalStudents() {
    const base = db.from('students').select('id, full_name, school_name, status');
    const sch = isSchool && profile?.school_id ? schools.find(s => s.id === profile.school_id) : null;
    const { data } = await (
      sch
        ? base.ilike('school_name', `%${sch.name}%`).eq('status', 'active').order('full_name')
        : base.eq('status', 'active').order('full_name')
    );
    if (data) {
      setNonPortalStudents(data.map(s => ({
        id: s.id, full_name: s.full_name ?? '', school_name: s.school_name ?? undefined, source: 'non-portal' as const,
      })));
    }
  }

  async function loadSchools() {
    if (!isAdmin) return;
    const { data } = await db.from('schools').select('id, name').eq('status', 'approved').order('name');
    if (data) setSchools(data as { id: string; name: string }[]);
  }

  async function loadAccounts() {
    const { data } = await db.from('payment_accounts').select('id, label, bank_name, account_number, account_name').eq('is_active', true);
    if (data) setAccounts(data as typeof accounts);
  }

  async function loadBatches() {
    setLoadingBatches(true);
    const [invRes, rcptRes] = await Promise.all([
      db.from('invoices')
        .select('invoice_number, amount, currency, status, created_at, notes, portal_users(full_name)')
        .ilike('notes', '%BULK-%')
        .order('created_at', { ascending: false })
        .limit(200),
      fetch('/api/receipts?limit=200').then(r => r.json()),
    ]);

    const invData = (invRes.data ?? []) as unknown as BatchItem[];
    const rcptData = ((rcptRes.data ?? []) as unknown as BatchItem[]).filter(r => r.metadata?.batch_id);

    const batchMap: Record<string, Batch> = {};

    invData.forEach(inv => {
      const match = (inv.notes || '').match(/BULK-([A-Z0-9]+)/);
      if (!match) return;
      const batchId = 'INV-' + match[1];
      if (!batchMap[batchId]) batchMap[batchId] = { id: batchId, type: 'invoice', created_at: inv.created_at ?? '', items: [], total: 0 };
      batchMap[batchId].items.push(inv);
      batchMap[batchId].total += inv.amount;
    });

    rcptData.forEach(rcpt => {
      const batchId = 'RCPT-' + rcpt.metadata!.batch_id;
      if (!batchMap[batchId]) batchMap[batchId] = { id: batchId, type: 'receipt', created_at: rcpt.issued_at ?? '', items: [], total: 0 };
      batchMap[batchId].items.push(rcpt);
      batchMap[batchId].total += rcpt.amount;
    });

    setBatches(Object.values(batchMap).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    setLoadingBatches(false);
  }

  const students: AnyStudent[] = source === 'portal' ? portalStudents : nonPortalStudents;

  const filtered = students.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !search || s.full_name.toLowerCase().includes(q) ||
      ('email' in s && s.email?.toLowerCase().includes(q));
    const matchSchool = !schoolFilter || (source === 'portal'
      ? (s as PortalStudent).school_id === schoolFilter
      : (s.school_name || '').toLowerCase().includes(schools.find(x => x.id === schoolFilter)?.name.toLowerCase() || '')
    );
    return matchSearch && matchSchool;
  });

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const items = docType === 'invoice' ? invItems : rcptItems;
  const totalAmount = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  async function runBulk() {
    const selectedStudents = students.filter(s => selected.has(s.id));
    if (!selectedStudents.length || totalAmount === 0) return;

    const validItems = items.filter(i => i.description && i.unit_price > 0);
    if (validItems.length === 0) { alert('Add at least one line item with a price.'); return; }

    const batchId = Date.now().toString(36).toUpperCase();
    setCurrentBatchId(batchId);
    setRunning(true);
    setResults([]);
    setDone(false);

    const resultsList: BulkResult[] = [];
    const acct = accounts.find(a => a.id === rcptAccountId);

    for (const student of selectedStudents) {
      try {
        if (docType === 'invoice') {
          const schoolId = source === 'portal' ? (student as PortalStudent).school_id : null;
          const res = await fetch('/api/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              portal_user_id: source === 'portal' ? student.id : null,
              school_id: schoolId,
              amount: totalAmount,
              items: validItems,
              due_date: invDueDate,
              notes: `${invNotes ? invNotes + ' · ' : ''}BULK-${batchId}`,
              status: 'sent',
            }),
          });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error || 'Failed');
          resultsList.push({ student_id: student.id, student_name: student.full_name, status: 'success', ref: j.data?.invoice_number || '—' });
        } else {
          const docRef = `RCPT-${batchId}-${student.id.slice(-4).toUpperCase()}`;
          const res = await fetch('/api/receipts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              student_id: source === 'non-portal' ? student.id : null,
              school_id: source === 'portal' ? (student as PortalStudent).school_id : null,
              amount: totalAmount,
              currency: 'NGN',
              metadata: {
                payer_name: student.full_name,
                payer_type: 'student',
                portal_user_id: source === 'portal' ? student.id : null,
                payment_method: rcptPaymentMethod,
                payment_date: rcptPaymentDate,
                reference: docRef,
                received_by: rcptReceivedBy,
                notes: rcptNotes,
                batch_id: batchId,
                items: validItems,
                deposit_account: acct ? {
                  bank_name: acct.bank_name,
                  account_number: acct.account_number,
                  account_name: acct.account_name,
                } : null,
              },
            }),
          });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error || 'Failed');
          resultsList.push({ student_id: student.id, student_name: student.full_name, status: 'success', ref: j.data?.receipt_number || docRef });
        }
      } catch (e: any) {
        resultsList.push({ student_id: student.id, student_name: student.full_name, status: 'error', error: e.message });
      }
      setResults([...resultsList]);
    }

    setRunning(false);
    setDone(true);
  }

  if (authLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!canAccess) return (
    <div className="p-8 text-center text-muted-foreground text-sm">Access restricted to administrators only.</div>
  );

  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/payments?tab=billing"
          className="p-2 bg-card border border-border rounded-none hover:bg-muted transition-colors">
          <ArrowLeftIcon className="w-5 h-5 text-muted-foreground" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-black text-foreground tracking-tight">Bulk Invoice &amp; Receipt Generator</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Create invoices or receipts for multiple students at once</p>
        </div>
        <div className="flex gap-1 bg-card border border-border rounded-none p-1">
          <button onClick={() => setActiveTab('generate')}
            className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-none transition-all ${activeTab === 'generate' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
            Generate
          </button>
          <button onClick={() => setActiveTab('archive')}
            className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-none transition-all flex items-center gap-1.5 ${activeTab === 'archive' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
            <ArchiveBoxIcon className="w-3.5 h-3.5" /> Archive
          </button>
        </div>
      </div>

      {/* ── GENERATE TAB ── */}
      {activeTab === 'generate' && (
        <div className="space-y-6">
          {!done && <StepBar step={step} />}

          {/* Step 1: Document type + source */}
          {step === 1 && !done && (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-3">Document Type</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button onClick={() => setDocType('invoice')}
                    className={`p-5 border-2 rounded-none text-left transition-all ${docType === 'invoice' ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/40'}`}>
                    <DocumentTextIcon className={`w-7 h-7 mb-2 ${docType === 'invoice' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <h3 className="font-black text-foreground text-sm mb-1">Bulk Invoices</h3>
                    <p className="text-xs text-muted-foreground">Each student gets a unique invoice with their name and a reference number.</p>
                  </button>
                  <button onClick={() => setDocType('receipt')}
                    className={`p-5 border-2 rounded-none text-left transition-all ${docType === 'receipt' ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/40'}`}>
                    <ReceiptPercentIcon className={`w-7 h-7 mb-2 ${docType === 'receipt' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <h3 className="font-black text-foreground text-sm mb-1">Bulk Receipts</h3>
                    <p className="text-xs text-muted-foreground">Issue payment receipts saved to each student's portal for download.</p>
                  </button>
                </div>
              </div>

              <div>
                <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-3">Recipient Source</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button onClick={() => { setSource('portal'); setSelected(new Set()); }}
                    className={`p-5 border-2 rounded-none text-left transition-all ${source === 'portal' ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/40'}`}>
                    <UserGroupIcon className={`w-7 h-7 mb-2 ${source === 'portal' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <h3 className="font-black text-foreground text-sm mb-1">Platform Students</h3>
                    <p className="text-xs text-muted-foreground">Active students with portal accounts. They can log in and view their documents.</p>
                    <p className="text-xs font-bold text-primary mt-1">{portalStudents.length} students</p>
                  </button>
                  <button onClick={() => { setSource('non-portal'); setSelected(new Set()); }}
                    className={`p-5 border-2 rounded-none text-left transition-all ${source === 'non-portal' ? 'border-blue-500 bg-blue-500/10' : 'border-border bg-card hover:border-blue-500/40'}`}>
                    <UserIcon className={`w-7 h-7 mb-2 ${source === 'non-portal' ? 'text-blue-400' : 'text-muted-foreground'}`} />
                    <h3 className="font-black text-foreground text-sm mb-1">Non-Platform Students</h3>
                    <p className="text-xs text-muted-foreground">Registered students without portal accounts (from student records).</p>
                    <p className="text-xs font-bold text-blue-400 mt-1">{nonPortalStudents.length} students</p>
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <button onClick={() => setStep(2)}
                  className="px-8 py-3 bg-primary hover:bg-primary/90 text-white font-black text-xs uppercase tracking-widest rounded-none transition-all">
                  Next: Select Recipients →
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Select students */}
          {step === 2 && !done && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="text" placeholder="Search by name or email..." value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary" />
                </div>
                {isAdmin && schools.length > 0 && (
                  <select value={schoolFilter} onChange={e => setSchoolFilter(e.target.value)}
                    className="px-4 py-2.5 bg-card border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary">
                    <option value="">All Schools</option>
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
                <div className="flex items-center gap-2 text-xs font-bold flex-shrink-0">
                  <span className="text-muted-foreground">{selected.size} selected</span>
                  <button onClick={() => setSelected(new Set(filtered.map(s => s.id)))} className="text-primary hover:text-primary transition-colors">All</button>
                  <button onClick={() => setSelected(new Set())} className="text-rose-400 hover:text-rose-300 transition-colors">None</button>
                </div>
              </div>

              {/* Student table */}
              {loadingStudents ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="bg-card border border-dashed border-border p-10 text-center text-muted-foreground text-sm">
                  No {source === 'portal' ? 'platform' : 'non-platform'} students found.
                </div>
              ) : (
                <div className="border border-border rounded-none overflow-hidden">
                  <div className="max-h-[420px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="w-10 p-3">
                            <input type="checkbox"
                              checked={filtered.length > 0 && filtered.every(s => selected.has(s.id))}
                              onChange={e => e.target.checked
                                ? setSelected(new Set(filtered.map(s => s.id)))
                                : setSelected(new Set())}
                              className="w-4 h-4 accent-red-700" />
                          </th>
                          <th className="p-3 text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest">Student</th>
                          {source === 'portal' && <th className="p-3 text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest hidden sm:table-cell">Email</th>}
                          {isAdmin && <th className="p-3 text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest hidden md:table-cell">School</th>}
                          <th className="p-3 text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(student => (
                          <tr key={student.id} onClick={() => toggleSelect(student.id)}
                            className={`cursor-pointer border-t border-border transition-colors ${selected.has(student.id) ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
                            <td className="p-3">
                              <input type="checkbox" checked={selected.has(student.id)}
                                onChange={() => toggleSelect(student.id)}
                                onClick={e => e.stopPropagation()}
                                className="w-4 h-4 accent-red-700" />
                            </td>
                            <td className="p-3 font-medium text-foreground">{student.full_name}</td>
                            {source === 'portal' && (
                              <td className="p-3 text-muted-foreground text-xs hidden sm:table-cell">{(student as PortalStudent).email}</td>
                            )}
                            {isAdmin && (
                              <td className="p-3 text-muted-foreground text-xs hidden md:table-cell">{student.school_name || '—'}</td>
                            )}
                            <td className="p-3">
                              <span className={`px-2 py-0.5 text-[10px] font-black rounded-full uppercase ${student.source === 'portal' ? 'bg-primary/10 text-primary' : 'bg-blue-500/20 text-blue-400'}`}>
                                {student.source === 'portal' ? 'Portal' : 'Non-Portal'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex gap-3 justify-between">
                <button onClick={() => setStep(1)}
                  className="px-6 py-3 bg-card border border-border text-foreground font-black text-xs uppercase tracking-widest rounded-none hover:bg-muted transition-all">
                  ← Back
                </button>
                <button onClick={() => setStep(3)} disabled={selected.size === 0}
                  className="px-8 py-3 bg-primary hover:bg-primary/90 text-white font-black text-xs uppercase tracking-widest rounded-none transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  Next: Configure ({selected.size}) →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Configure */}
          {step === 3 && !done && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black text-muted-foreground uppercase tracking-widest">
                  Configure {docType === 'invoice' ? 'Invoices' : 'Receipts'}
                </h2>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-none">
                  <UserGroupIcon className="w-4 h-4 text-primary" />
                  <span className="text-xs font-black text-primary">{selected.size} recipients</span>
                </div>
              </div>

              <div className="bg-card border border-border rounded-none p-5">
                <LineItemEditor
                  items={docType === 'invoice' ? invItems : rcptItems}
                  onChange={docType === 'invoice' ? setInvItems : setRcptItems}
                />
                <p className="text-xs text-muted-foreground mt-3">
                  Total across all recipients: <span className="font-black text-foreground">₦{(totalAmount * selected.size).toLocaleString()}</span>
                </p>
              </div>

              {docType === 'invoice' ? (
                <div className="bg-card border border-border rounded-none p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Due Date</label>
                    <input type="date" value={invDueDate} onChange={e => setInvDueDate(e.target.value)}
                      className="w-full px-4 py-2.5 bg-background border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Notes (optional)</label>
                    <input type="text" placeholder="e.g. First term 2025/2026" value={invNotes} onChange={e => setInvNotes(e.target.value)}
                      className="w-full px-4 py-2.5 bg-background border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary" />
                  </div>
                </div>
              ) : (
                <div className="bg-card border border-border rounded-none p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Payment Method</label>
                    <select value={rcptPaymentMethod} onChange={e => setRcptPaymentMethod(e.target.value)}
                      className="w-full px-4 py-2.5 bg-background border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary">
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="cash">Cash</option>
                      <option value="pos">POS Terminal</option>
                      <option value="cheque">Cheque</option>
                      <option value="online">Online Payment</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Payment Date</label>
                    <input type="date" value={rcptPaymentDate} onChange={e => setRcptPaymentDate(e.target.value)}
                      className="w-full px-4 py-2.5 bg-background border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Received By</label>
                    <input type="text" placeholder="e.g. Finance Officer" value={rcptReceivedBy} onChange={e => setRcptReceivedBy(e.target.value)}
                      className="w-full px-4 py-2.5 bg-background border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Deposited To Account</label>
                    <select value={rcptAccountId} onChange={e => setRcptAccountId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-background border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary">
                      <option value="">— Select account —</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.label} — {a.bank_name}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Notes (optional)</label>
                    <input type="text" placeholder="e.g. First term 2025/2026 coding club payment" value={rcptNotes} onChange={e => setRcptNotes(e.target.value)}
                      className="w-full px-4 py-2.5 bg-background border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary" />
                  </div>
                </div>
              )}

              {/* Summary + generate */}
              <div className="bg-primary/10 border border-primary/20 rounded-none p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-black text-primary uppercase tracking-widest">Ready to Generate</p>
                  <p className="text-sm text-white/80">
                    <span className="font-black">{selected.size}</span> {docType}s · <span className="font-black">₦{totalAmount.toLocaleString()}</span> each
                    {' '}· Total: <span className="font-black">₦{(totalAmount * selected.size).toLocaleString()}</span>
                  </p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setStep(2)}
                    className="px-5 py-2.5 bg-card border border-border text-foreground font-black text-xs uppercase tracking-widest rounded-none hover:bg-muted transition-all">
                    ← Back
                  </button>
                  <button onClick={runBulk} disabled={running || totalAmount === 0}
                    className="px-8 py-2.5 bg-primary hover:bg-primary/90 text-white font-black text-xs uppercase tracking-widest rounded-none transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
                    {running ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Processing...</> : `⚡ Generate ${selected.size} ${docType === 'invoice' ? 'Invoice' : 'Receipt'}${selected.size !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>

              {/* Live progress */}
              {(running || results.length > 0) && !done && (
                <div className="bg-card border border-border rounded-none overflow-hidden">
                  <div className="p-3 bg-muted border-b border-border flex items-center justify-between">
                    <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Progress</p>
                    <p className="text-xs text-muted-foreground">{results.length} / {selected.size}</p>
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-border">
                    {results.map(r => (
                      <div key={r.student_id} className="flex items-center gap-3 px-4 py-2.5">
                        {r.status === 'success'
                          ? <CheckCircleIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          : <XCircleIcon className="w-4 h-4 text-rose-400 flex-shrink-0" />}
                        <span className="text-sm text-foreground flex-1">{r.student_name}</span>
                        <span className={`text-xs font-mono ${r.status === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {r.status === 'success' ? r.ref : r.error}
                        </span>
                      </div>
                    ))}
                    {running && (
                      <div className="flex items-center gap-3 px-4 py-2.5">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        <span className="text-sm text-muted-foreground">Processing...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Done state */}
          {done && (
            <div className="space-y-5">
              <div className={`p-6 border-2 rounded-none ${errorCount === 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                <div className="flex items-center gap-3 mb-2">
                  {errorCount === 0
                    ? <CheckCircleIcon className="w-8 h-8 text-emerald-400" />
                    : <ExclamationCircleIcon className="w-8 h-8 text-amber-400" />}
                  <div>
                    <h3 className={`text-lg font-black ${errorCount === 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {errorCount === 0 ? 'All Done!' : `Completed with ${errorCount} error${errorCount !== 1 ? 's' : ''}`}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Batch ID: <span className="font-mono text-foreground">{currentBatchId}</span>
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 text-sm font-bold">
                  <span className="text-emerald-400">✓ {successCount} succeeded</span>
                  {errorCount > 0 && <span className="text-rose-400">✗ {errorCount} failed</span>}
                  <span className="text-muted-foreground">Total: ₦{(totalAmount * successCount).toLocaleString()}</span>
                </div>
              </div>

              <div className="bg-card border border-border rounded-none overflow-hidden">
                <div className="p-3 bg-muted border-b border-border">
                  <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Generation Results</p>
                </div>
                <div className="divide-y divide-border max-h-80 overflow-y-auto">
                  {results.map(r => (
                    <div key={r.student_id} className="flex items-center gap-3 px-4 py-3">
                      {r.status === 'success'
                        ? <CheckCircleIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        : <XCircleIcon className="w-4 h-4 text-rose-400 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{r.student_name}</p>
                        {r.ref && <p className="text-xs text-muted-foreground font-mono">{r.ref}</p>}
                        {r.error && <p className="text-xs text-rose-400">{r.error}</p>}
                      </div>
                      <span className={`text-xs font-black uppercase ${r.status === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>{r.status}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button onClick={() => { setStep(1); setSelected(new Set()); setResults([]); setDone(false); }}
                  className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-white font-black text-xs uppercase tracking-widest rounded-none transition-all flex items-center gap-2">
                  <ArrowPathIcon className="w-4 h-4" /> Generate More
                </button>
                <button onClick={() => { loadBatches(); setActiveTab('archive'); }}
                  className="px-6 py-2.5 bg-card border border-border text-foreground font-black text-xs uppercase tracking-widest rounded-none hover:bg-muted transition-all flex items-center gap-2">
                  <ArchiveBoxIcon className="w-4 h-4" /> View in Archive
                </button>
                <Link href="/dashboard/payments?tab=billing"
                  className="px-6 py-2.5 bg-card border border-border text-foreground font-black text-xs uppercase tracking-widest rounded-none hover:bg-muted transition-all">
                  ← Back to Payments
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ARCHIVE TAB ── */}
      {activeTab === 'archive' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-muted-foreground uppercase tracking-widest">Bulk Generation Archive</h2>
            <button onClick={loadBatches} disabled={loadingBatches}
              className="flex items-center gap-2 px-4 py-2 bg-card border border-border text-xs font-black text-muted-foreground uppercase tracking-widest rounded-none hover:bg-muted transition-all disabled:opacity-50">
              <ArrowPathIcon className={`w-3.5 h-3.5 ${loadingBatches ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>

          {loadingBatches ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : batches.length === 0 ? (
            <div className="bg-card border border-dashed border-border p-12 text-center space-y-2">
              <ArchiveBoxIcon className="w-10 h-10 text-muted-foreground/30 mx-auto" />
              <p className="text-muted-foreground text-sm">No bulk batches found yet.</p>
              <p className="text-xs text-muted-foreground">Generate invoices or receipts to see them here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {batches.map(batch => (
                <div key={batch.id} className="bg-card border border-border rounded-none overflow-hidden">
                  <button
                    onClick={() => {
                      setExpandedBatch(expandedBatch === batch.id ? null : batch.id);
                      setBatchDetails(prev => ({ ...prev, [batch.id]: batch.items as BatchItem[] }));
                    }}
                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/50 transition-colors text-left"
                  >
                    {batch.type === 'invoice'
                      ? <DocumentTextIcon className="w-5 h-5 text-amber-400 flex-shrink-0" />
                      : <ReceiptPercentIcon className="w-5 h-5 text-emerald-400 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-black uppercase px-2 py-0.5 rounded-full ${batch.type === 'invoice' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                          {batch.type}
                        </span>
                        <span className="text-sm font-mono text-muted-foreground">{batch.id}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(batch.created_at).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-black text-foreground">{batch.items.length} records</p>
                      <p className="text-xs text-muted-foreground">₦{batch.total.toLocaleString()}</p>
                    </div>
                    <span className="text-muted-foreground text-xs ml-2">{expandedBatch === batch.id ? '▲' : '▼'}</span>
                  </button>

                  {expandedBatch === batch.id && (
                    <div className="border-t border-border">
                      <div className="divide-y divide-border max-h-64 overflow-y-auto">
                        {batch.items.map((item, idx) => {
                          const name = item.portal_users?.full_name || item.metadata?.payer_name || '—';
                          const ref = item.invoice_number || item.receipt_number || '—';
                          const amt = item.amount;
                          const status = item.status;
                          return (
                            <div key={idx} className="flex items-center gap-3 px-5 py-3">
                              <CheckCircleIcon className="w-4 h-4 text-emerald-400/60 flex-shrink-0" />
                              <span className="text-sm text-foreground flex-1">{name}</span>
                              <span className="text-xs font-mono text-muted-foreground">{ref}</span>
                              {status && (
                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                                  status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' :
                                  status === 'sent' ? 'bg-blue-500/20 text-blue-400' :
                                  'bg-muted text-muted-foreground'
                                }`}>{status}</span>
                              )}
                              <span className="text-sm font-black text-foreground">₦{(amt || 0).toLocaleString()}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
