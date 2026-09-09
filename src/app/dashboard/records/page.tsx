'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { roleHasCapability } from '@/lib/auth/capabilities';
import { MagnifyingGlassIcon, ArrowDownTrayIcon, ArrowPathIcon, PrinterIcon, RectangleGroupIcon, UserGroupIcon } from '@/lib/icons';
import Link from 'next/link';
import { toast } from 'sonner';
import { compareClassNames } from '@/lib/cards/exportRoster';
import { cardPreviewPage } from '@/lib/cards/preview-page';
import { accessCardCodeForStudent } from '@/lib/access-card-code';
import { fetchCardConfig, buildBulkPrintHtml, openPrintWindow, type CardHolder, type CardFieldConfig } from '@/lib/cards/printCard';
import { fetchActionJson, friendlyActionError } from '@/lib/async-timeout';

type Rec = {
  id: string; type: string; name: string; email: string; school: string;
  klass: string; program: string; source: string; status: string;
  registered: string | null; href: string;
};
type Reg = {
  id: string; name: string; email: string; password: string | null; klass: string;
  school: string; source: string; batchName: string; status: string; account: string; registered: string | null; batchId: string;
  portalUserId?: string | null;
};
type SortKey = 'registered' | 'name' | 'school' | 'klass' | 'type' | 'status' | 'source' | 'account' | 'batch';

const INPUT = 'px-3 py-2 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary';
const TYPE_COLOR: Record<string, string> = {
  Student: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
  Teacher: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  Parent: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  School: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  Lead: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  Prospect: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
};
const ACCT_COLOR: Record<string, string> = { Active: 'text-emerald-700 dark:text-emerald-300', Inactive: 'text-amber-700 dark:text-amber-300', Deleted: 'text-rose-700 dark:text-rose-300' };
const SORT_LABELS: Record<SortKey, string> = {
  registered: 'Registration date',
  name: 'Name',
  school: 'School',
  klass: 'Grade',
  type: 'Type',
  status: 'Status',
  source: 'Source',
  account: 'Account',
  batch: 'Batch',
};

function fmtDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function StatCard({ label, value, active, onClick }: { label: string; value: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`text-left rounded-2xl border px-4 py-3 transition-all ${active ? 'border-primary/60 bg-primary/10' : 'border-border bg-card hover:bg-muted/60'}`}>
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground truncate">{label}</p>
      <p className="text-2xl font-black text-foreground mt-0.5 tabular-nums">{value}</p>
    </button>
  );
}

function Select({ value, onChange, children }: { value: string; onChange: (value: any) => void; children: React.ReactNode }) {
  return <select value={value} onChange={e => onChange(e.target.value)} className={INPUT + ' min-h-11 cursor-pointer'}>{children}</select>;
}

export default function RecordsPage() {
  const [printing, setPrinting] = useState(false);
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isStaff = roleHasCapability(profile?.role, 'view_records');
  const canViewCredentials = roleHasCapability(profile?.role, 'view_registration_credentials');

  const [tab, setTab] = useState<'people' | 'registrations'>(() => searchParams.get('tab') === 'registrations' ? 'registrations' : 'people');
  const [rows, setRows] = useState<Rec[]>([]);
  const [regs, setRegs] = useState<Reg[]>([]);
  const [loading, setLoading] = useState(true);
  const [regsLoaded, setRegsLoaded] = useState(false);
  const [regsLoading, setRegsLoading] = useState(false);
  const [regsError, setRegsError] = useState('');
  const regsRequestInFlight = useRef(false);
  const [err, setErr] = useState('');

  const [q, setQ] = useState('');
  const [fType, setFType] = useState('all');
  const [fSchool, setFSchool] = useState('all');
  const [fClass, setFClass] = useState('all');
  const [fSource, setFSource] = useState('all');
  const [fStatus, setFStatus] = useState('all');
  const [fAccount, setFAccount] = useState('all');
  const [fBatch, setFBatch] = useState('all');
  const [showPw, setShowPw] = useState(false);
  const [copied, setCopied] = useState('');
  const [view, setView] = useState<'table' | 'cards'>('cards');
  const [sortKey, setSortKey] = useState<SortKey>('registered');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  const loadPeople = useCallback(async () => {
    if (authLoading || !isStaff) return;
      setLoading(true); setErr('');
      try {
        const { response, data } = await fetchActionJson<{ records: Rec[]; error?: string }>('/api/records', { cache: 'no-store' }, 'Records are taking longer than expected. Please retry.', 30_000);
        if (!response.ok || !Array.isArray(data.records)) throw new Error(data.error || 'Could not load records.');
        setRows(data.records);
      } catch (e) { setErr(friendlyActionError(e, 'Could not load records. Please retry.')); }
      finally { setLoading(false); }
  }, [authLoading, isStaff]);
  useEffect(() => { void loadPeople(); }, [loadPeople]);

  const loadRegistrations = useCallback(async () => {
    if (authLoading || !isStaff || regsRequestInFlight.current) return;
    regsRequestInFlight.current = true;
    setRegsLoading(true);
    setRegsError('');
    try {
      const { response, data } = await fetchActionJson<{
        registrations: Reg[];
        error: string;
      }>(
        '/api/records/registrations',
        { cache: 'no-store' },
        'Registration records are taking longer than expected. Please retry.',
        30_000,
      );
      if (!response.ok) throw new Error(data.error || 'Registration records could not be loaded.');
      if (!Array.isArray(data.registrations)) throw new Error('Registration records could not be loaded.');
      setRegs(data.registrations);
      setRegsLoaded(true);
    } catch (error) {
      setRegsError(friendlyActionError(error, 'Registration records could not be loaded. Please retry.'));
    } finally {
      regsRequestInFlight.current = false;
      setRegsLoading(false);
    }
  }, [authLoading, isStaff]);

  useEffect(() => {
    if (tab !== 'registrations' || regsLoaded) return;
    const timer = window.setTimeout(() => void loadRegistrations(), 0);
    return () => window.clearTimeout(timer);
  }, [tab, regsLoaded, loadRegistrations]);

  const uniq = (arr: any[], key: string) => [...new Set(arr.map(r => r[key]).filter(Boolean) as string[])].sort();
  const typeCounts = useMemo(() => { const c: Record<string, number> = {}; for (const r of rows) c[r.type] = (c[r.type] || 0) + 1; return c; }, [rows]);
  const acctCounts = useMemo(() => { const c: Record<string, number> = {}; for (const r of regs) c[r.account] = (c[r.account] || 0) + 1; return c; }, [regs]);
  const registrationBatches = useMemo(() => {
    const byId = new Map<string, string>();
    for (const r of regs) if (r.batchId) byId.set(r.batchId, r.batchName || r.batchId);
    return [...byId.entries()].map(([id, label]) => ({ id, label }));
  }, [regs]);

  const compareRows = useCallback((a: Rec | Reg, b: Rec | Reg) => {
    const val = (row: Rec | Reg) => {
      if (sortKey === 'registered') return row.registered || '';
      if (sortKey === 'name') return row.name || '';
      if (sortKey === 'school') return row.school || '';
      if (sortKey === 'klass') return row.klass || '';
      if ('type' in row && sortKey === 'type') return row.type || '';
      if (sortKey === 'status') return row.status || '';
      if ('source' in row && sortKey === 'source') return row.source || '';
      if ('account' in row && sortKey === 'account') return row.account || '';
      if ('batchName' in row && sortKey === 'batch') return row.batchName || row.batchId || '';
      return '';
    };
    const av = val(a);
    const bv = val(b);
    const cmp = sortKey === 'klass' ? compareClassNames(String(av), String(bv)) : sortKey === 'registered'
      ? String(av).localeCompare(String(bv))
      : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
    return sortDir === 'asc' ? cmp : -cmp;
  }, [sortKey, sortDir]);

  const peopleFiltered = useMemo(() => rows.filter(r => {
    const s = q.trim().toLowerCase();
    const mq = !s || [r.name, r.email, r.school, r.klass].some(value => (value || '').toLowerCase().includes(s));
    return mq && (fType === 'all' || r.type === fType) && (fSchool === 'all' || r.school === fSchool)
      && (fClass === 'all' || r.klass === fClass) && (fSource === 'all' || r.source === fSource)
      && (fStatus === 'all' || r.status === fStatus);
  }).sort(compareRows), [rows, q, fType, fSchool, fClass, fSource, fStatus, compareRows]);

  const regsFiltered = useMemo(() => regs.filter(r => {
    const s = q.trim().toLowerCase();
    const mq = !s || [r.name, r.email, r.school, r.klass, r.batchName].some(value => (value || '').toLowerCase().includes(s));
    return mq && (fSchool === 'all' || r.school === fSchool) && (fClass === 'all' || r.klass === fClass)
      && (fSource === 'all' || r.source === fSource) && (fBatch === 'all' || r.batchId === fBatch)
      && (fAccount === 'all' || r.account === fAccount);
  }).sort(compareRows), [regs, q, fSchool, fClass, fSource, fBatch, fAccount, compareRows]);

  const activeRows: Array<Rec | Reg> = tab === 'people' ? peopleFiltered : regsFiltered;
  const { visibleRecords: visibleRows, currentPage, pageCount } = cardPreviewPage(activeRows, page);
  useEffect(() => { setPage(1); }, [activeRows, view]);
  const rowSelectionKey = (row: Rec | Reg) => `${tab}:${'type' in row ? row.type : ''}:${row.id}`;
  const selectedVisibleRows = activeRows.filter((row) => selectedRows.has(rowSelectionKey(row)));
  const allVisibleSelected = activeRows.length > 0 && selectedVisibleRows.length === activeRows.length;

  function toggleRow(row: Rec | Reg) {
    const key = rowSelectionKey(row);
    setSelectedRows((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedRows((current) => {
      const next = new Set(current);
      for (const row of activeRows) {
        const key = rowSelectionKey(row);
        if (allVisibleSelected) next.delete(key); else next.add(key);
      }
      return next;
    });
  }
  async function copy(text: string | null, id: string) {
    if (!text) return;
    if (!showPw && (id.endsWith('p') || id.endsWith('cp') || id.endsWith('cp2'))) return;
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(''), 1200); }
    catch { toast.error('Could not copy. Select and copy the text manually.'); }
  }

  function resultCheckHref(row: Reg) {
    return row.portalUserId ? `/result-check/${encodeURIComponent(accessCardCodeForStudent(row.portalUserId))}?via=qr` : '';
  }

  function exportCsv() {
    // Standard exports never include reusable login secrets.
    let head: string[]; let lines: string[];
    if (tab === 'people') {
      head = ['Name', 'Type', 'Email', 'School', 'Grade', 'Program', 'Source', 'Status', 'Registered'];
      lines = peopleFiltered.map(r => [r.name, r.type, r.email, r.school, r.klass, r.program, r.source, r.status, r.registered ? new Date(r.registered).toLocaleDateString('en-GB') : ''].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    } else {
      head = ['Name', 'Email', 'Grade', 'School', 'Registration Type', 'Batch', 'Status', 'Account', 'Registered'];
      lines = regsFiltered.map(r => [r.name, r.email, r.klass, r.school, r.source, r.batchName, r.status, r.account, r.registered ? new Date(r.registered).toLocaleDateString('en-GB') : ''].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    }
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${tab}_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }

  async function printList(explicitRows?: Array<Rec | Reg>, mode: 'print' | 'save' = 'print') {
    const isPeople = tab === 'people';
    const data = explicitRows ?? (isPeople ? peopleFiltered : regsFiltered);
    const includeCredentials = !isPeople && canViewCredentials && showPw;
    if (!data.length || printing) return;
    // Reserve the tab during the click, before importing/rendering the PDF.
    const preview = mode === 'print' ? window.open('', '_blank') : null;
    if (mode === 'print' && !preview) {
      toast.error('Your browser blocked the print window. Allow pop-ups or use Download PDF.');
      return;
    }
    if (preview) preview.document.body.textContent = 'Preparing your records PDF...';
    setPrinting(true);
    try {
      const title = isPeople ? 'People records' : includeCredentials ? 'Registration credentials' : 'Registration records';
      const columns = isPeople
        ? ['#', 'Name', 'Type', 'Email', 'School', 'Grade', 'Program', 'Source', 'Status', 'Registered']
        : includeCredentials
          ? ['#', 'Name', 'Login email', 'Password', 'Grade', 'School', 'Type', 'Batch', 'Status', 'Account', 'Registered']
          : ['#', 'Name', 'Login email', 'Grade', 'School', 'Type', 'Batch', 'Status', 'Account', 'Registered'];
      const pdfRows = data.map((row, index) => {
        if ('type' in row) return [index + 1, row.name, row.type, row.email, row.school, row.klass, row.program, row.source, row.status, fmtDate(row.registered)];
        return [index + 1, row.name, row.email, ...(includeCredentials ? [row.password || ''] : []), row.klass, row.school, row.source, row.batchName, row.status, row.account, fmtDate(row.registered)];
      });
      const { createRecordsPdf } = await import('@/lib/records/print-pdf');
      const doc = await createRecordsPdf({ title, sortLabel: `Sorted by ${SORT_LABELS[sortKey]} (${sortDir === 'asc' ? 'ascending' : 'descending'})`, columns, rows: pdfRows });
      if (preview) {
        doc.autoPrint();
        const url = URL.createObjectURL(doc.output('blob'));
        preview.location.replace(url);
        setTimeout(() => URL.revokeObjectURL(url), 300_000);
      } else doc.save(`records-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('PDF ready');
    } catch (error) {
      preview?.close();
      toast.error(friendlyActionError(error, 'Could not prepare the PDF. Please try again.'));
    } finally { setPrinting(false); }
  }
  useEffect(() => {
    const onPrintShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        printList(selectedVisibleRows.length > 0 ? selectedVisibleRows : activeRows);
      }
    };
    window.addEventListener('keydown', onPrintShortcut);
    return () => window.removeEventListener('keydown', onPrintShortcut);
  });

  async function printCards(items: Reg[] = regsFiltered) {
    if (!canViewCredentials) {
      alert('Temporary credentials are restricted to platform administrators and the relevant school manager.');
      return;
    }
    const valid = items.filter(r => r.portalUserId && r.account !== 'Deleted' && String(r.status || '').toLowerCase() !== 'failed');
    if (valid.length === 0) {
      alert('No printable cards found. Cards need a live student portal account and cannot be printed for deleted or failed registrations.');
      return;
    }
    const sorted = valid; // Keep the same user-selected order as the Records list.
    const codes = sorted.map(r => accessCardCodeForStudent(r.portalUserId || r.id));
    if (new Set(codes).size !== codes.length) {
      alert('Duplicate result-check codes were detected in this selection. Please print fewer cards or contact admin before issuing them.');
      return;
    }
    // Shared card template branded by the saved Card Studio student design. These
    // are login slips, so credential fields are always shown regardless of the
    // design's field toggles.
    const preview = window.open('', '_blank');
    if (!preview) { toast.error('Allow pop-ups to print cards.'); return; }
    preview.document.body.textContent = 'Preparing your cards...';
    try {
    const cfg = await fetchCardConfig('student');
    const forced = ['email', 'password', 'studentId', 'qr', 'school', 'className', 'section'];
    const fields: CardFieldConfig[] = forced.map(key => ({
      key,
      visible: true,
      label: cfg.fields?.find(f => f.key === key)?.label,
    }));
    const holders: CardHolder[] = sorted.map(r => ({
      id: r.portalUserId || r.id,
      full_name: r.name,
      email: r.email || null,
      school_name: r.school || 'Rillcod Technologies',
      grade: r.klass || null,
      section_class: null,
      temp_password: r.password || null,
    }));
    const html = await buildBulkPrintHtml(
      holders,
      { ...cfg, fields },
      window.location.origin,
      {
        qrHint: 'Scan or type code at rillcod.com/result-check', preserveOrder: true,
        onProgress: (done, total) => {
          if (preview.closed) throw new Error('Print cancelled');
          preview.document.body.textContent = done < total
            ? `Preparing scan codes: ${done} of ${total}. Please keep this window open.`
            : 'Scan codes ready. Arranging your printable cards...';
        },
      },
    );
    openPrintWindow(html, preview);
    } catch (error) {
      if (preview.closed) return;
      preview.close();
      toast.error(friendlyActionError(error, 'Could not prepare the cards. Please try again.'));
    }
  }

  if (authLoading || (tab === 'people' && loading && rows.length === 0)) {
    return <div className="flex items-center justify-center h-[60vh]"><div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!isStaff) return <div className="p-8 text-center text-muted-foreground">Access denied.</div>;

  const activeCount = tab === 'people' ? peopleFiltered.length : regsFiltered.length;
  const totalCount = tab === 'people' ? rows.length : regs.length;

  function switchTab(nextTab: 'people' | 'registrations') {
    setTab(nextTab);
    setPage(1);
    setShowPw(false);
    if ((nextTab === 'registrations' && sortKey === 'type') || (nextTab === 'people' && ['account', 'batch'].includes(sortKey))) setSortKey('name');
    setSelectedRows(new Set());
    setFSchool('all');
    setFClass('all');
    setFSource('all');
    setFStatus('all');
    setFAccount('all');
    setFBatch('all');
    const query = nextTab === 'registrations' ? '?tab=registrations' : '';
    router.replace(`/dashboard/records${query}`, { scroll: false });
  }

  return (
    <div className="space-y-5 p-1 pb-10 mobile-page-root">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">Records</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">Find a person or registration. Filter and sort, then print your results or selected records.</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
          <button disabled={tab === 'people' ? loading : regsLoading} onClick={() => void (tab === 'people' ? loadPeople() : loadRegistrations())} className="min-h-11 inline-flex items-center gap-1.5 px-3 rounded-xl border border-border bg-card hover:bg-muted text-xs font-bold text-foreground"><ArrowPathIcon className="w-4 h-4" /> Refresh</button>
          <button onClick={() => void printList(selectedVisibleRows.length ? selectedVisibleRows : undefined)} disabled={printing || activeCount === 0} className="min-h-11 inline-flex items-center gap-2 px-3 rounded-xl bg-primary text-primary-foreground disabled:opacity-40 text-sm font-medium"><PrinterIcon className="w-4 h-4" />{printing ? 'Preparing PDF…' : selectedVisibleRows.length ? `Print selected (${selectedVisibleRows.length})` : `Print results (${activeCount})`}</button>
          <button onClick={() => void printList(selectedVisibleRows.length ? selectedVisibleRows : undefined, 'save')} disabled={printing || activeCount === 0} className="min-h-11 inline-flex items-center gap-2 px-3 rounded-xl border border-border disabled:opacity-40 text-sm font-medium"><ArrowDownTrayIcon className="w-4 h-4" />Download PDF</button>
          {tab === 'registrations' && canViewCredentials && (
            <button onClick={() => printCards()} disabled={regsFiltered.length === 0} className="min-h-11 inline-flex items-center gap-1.5 px-3 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-40 text-xs font-black text-amber-800 dark:text-amber-200"><RectangleGroupIcon className="w-4 h-4" /> Print Cards</button>
          )}
          {tab === 'people' && (fType === 'Student' || fType === 'all') && (
            <Link
              href={`/dashboard/card-studio?tab=manage&type=student&view=roster${fSchool !== 'all' ? `&school=${encodeURIComponent(fSchool)}` : ''}`}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-black text-emerald-600 dark:text-emerald-400"
            >
              <UserGroupIcon className="w-4 h-4" /> RC Roster Print
            </Link>
          )}
          <button onClick={exportCsv} disabled={activeCount === 0} className="min-h-11 inline-flex items-center gap-1.5 px-3 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 text-xs font-black text-primary-foreground shadow-lg"><ArrowDownTrayIcon className="w-4 h-4" /> CSV ({activeCount})</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded-xl border border-border bg-card p-1">
        {(['people', 'registrations'] as const).map(t => (
          <button key={t} onClick={() => switchTab(t)} className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-colors ${tab === t ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}>
            {t === 'people' ? 'People' : 'Registrations & Logins'}
          </button>
        ))}
      </div>

      {/* Stat cards (click to filter) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {tab === 'people' ? (
          <>
            <StatCard label="All people" value={rows.length} active={fType === 'all'} onClick={() => setFType('all')} />
            {['Student', 'Parent', 'Teacher', 'Lead', 'Prospect'].filter(t => typeCounts[t]).map(t => (
              <StatCard key={t} label={t + 's'} value={typeCounts[t] ?? 0} active={fType === t} onClick={() => setFType(fType === t ? 'all' : t)} />
            ))}
          </>
        ) : (
          <>
            <StatCard label="All logins" value={regs.length} active={fAccount === 'all'} onClick={() => setFAccount('all')} />
            {['Active', 'Inactive'].map(a => (
              <StatCard key={a} label={a} value={acctCounts[a] ?? 0} active={fAccount === a} onClick={() => setFAccount(fAccount === a ? 'all' : a)} />
            ))}
            {['Bulk register', 'Single student'].filter(t => regs.some(r => r.source === t)).map(t => (
              <StatCard key={t} label={t} value={regs.filter(r => r.source === t).length} active={fSource === t} onClick={() => setFSource(fSource === t ? 'all' : t)} />
            ))}
          </>
        )}
      </div>

      {/* Filter bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <div className="relative col-span-2 sm:col-span-3 lg:col-span-2">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input aria-label="Search records" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email, grade or school…" className={INPUT + ' w-full pl-9'} />
        </div>
        <Select value={fSchool} onChange={setFSchool}><option value="all">All schools</option>{uniq(tab === 'people' ? rows : regs, 'school').map(s => <option key={s} value={s}>{s}</option>)}</Select>
        <Select value={fClass} onChange={setFClass}><option value="all">All grades</option>{uniq(tab === 'people' ? rows : regs, 'klass').map(c => <option key={c} value={c}>{c}</option>)}</Select>
        {tab === 'people' ? (
          <>
            <Select value={fSource} onChange={setFSource}><option value="all">All sources</option>{uniq(rows, 'source').map(s => <option key={s} value={s}>{s}</option>)}</Select>
            <Select value={fStatus} onChange={setFStatus}><option value="all">All statuses</option>{uniq(rows, 'status').map(s => <option key={s} value={s}>{s}</option>)}</Select>
          </>
        ) : (
          <>
            <Select value={fSource} onChange={setFSource}><option value="all">All registration types</option>{uniq(regs, 'source').map(s => <option key={s} value={s}>{s}</option>)}</Select>
            <Select value={fBatch} onChange={setFBatch}><option value="all">All batches</option>{registrationBatches.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}</Select>
            {canViewCredentials ? (
              <button onClick={() => setShowPw(v => !v)} className={INPUT + ' cursor-pointer text-left lg:col-span-2'}>{showPw ? 'Hide temporary passwords' : 'Reveal temporary passwords'}</button>
            ) : (
              <div className={INPUT + ' lg:col-span-2 text-muted-foreground'}>Credentials restricted to administrators</div>
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
        <label className="flex items-center gap-2 text-xs font-bold text-foreground">
          <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} disabled={activeRows.length === 0} className="accent-primary" />
          Select all filtered ({activeRows.length})
        </label>
        {selectedVisibleRows.length > 0 && <span className="text-xs text-primary font-black">{selectedVisibleRows.length} selected</span>}
        {selectedVisibleRows.length > 0 && <button onClick={() => setSelectedRows(new Set())} className="text-xs font-bold text-muted-foreground hover:text-foreground">Clear selection</button>}
        <span className="ml-auto hidden text-[10px] text-muted-foreground sm:inline">Ctrl/Cmd + P prints selected rows, or all filtered rows when none are selected.</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sort</span>
          <Select value={sortKey} onChange={setSortKey}>
            {(tab === 'people'
              ? ['registered', 'name', 'type', 'school', 'klass', 'source', 'status']
              : ['registered', 'name', 'school', 'klass', 'source', 'batch', 'status', 'account']
            ).map(k => <option key={k} value={k}>{SORT_LABELS[k as SortKey]}</option>)}
          </Select>
          <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')} className="px-3 py-2 rounded-xl border border-border bg-background text-xs font-black text-foreground">
            {sortDir === 'asc' ? 'Ascending' : 'Descending'}
          </button>
        </div>
        <div className="inline-flex rounded-xl border border-border bg-background p-1">
          {(['table', 'cards'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={`min-h-11 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest ${view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {v === 'table' ? 'Table' : 'Cards'}
            </button>
          ))}
        </div>
      </div>

      {err && tab === 'people' && <div className="px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-sm">{err}</div>}
      {tab === 'registrations' && regsError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <div>
            <p className="text-sm font-black text-foreground">Registration records are temporarily unavailable</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Your data is safe. Retry the live register without leaving this page.</p>
          </div>
          <button onClick={() => void loadRegistrations()} disabled={regsLoading} className="rounded-xl bg-foreground px-4 py-2 text-xs font-black text-background disabled:opacity-50">
            {regsLoading ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

      {/* Datasheet */}
      {view === 'cards' ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {visibleRows.map((row: any) => (
            <div key={`${tab}-${row.id}`} className="rounded-2xl border border-border bg-card p-4 hover:bg-muted/60 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <input type="checkbox" checked={selectedRows.has(rowSelectionKey(row))} onChange={() => toggleRow(row)} className="mt-1 accent-primary" aria-label={`Select ${row.name}`} />
                <div className="min-w-0">
                  <p className="font-semibold text-foreground break-words">{row.name || 'Unnamed'}</p>
                  <p className="text-xs text-muted-foreground break-all mt-0.5">{row.email || '—'}</p>
                </div>
                {tab === 'people' ? (
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${TYPE_COLOR[row.type] ?? 'bg-muted text-foreground border-border'}`}>{row.type}</span>
                ) : (
                  <span className={`text-[10px] font-black ${ACCT_COLOR[row.account] ?? 'text-muted-foreground'}`}>{row.account}</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                <div><p className="text-muted-foreground text-[10px] uppercase font-black">School</p><p className="text-foreground truncate">{row.school || '—'}</p></div>
                <div><p className="text-muted-foreground text-[10px] uppercase font-black">Grade</p><p className="text-foreground truncate">{row.klass || '—'}</p></div>
                {tab === 'registrations' && (
                  <>
                    <div><p className="text-muted-foreground text-[10px] uppercase font-black">Type</p><p className="text-foreground truncate">{row.source || '—'}</p></div>
                    <div><p className="text-muted-foreground text-[10px] uppercase font-black">Batch</p><p className="text-foreground truncate">{row.batchName || '—'}</p></div>
                  </>
                )}
                <div><p className="text-muted-foreground text-[10px] uppercase font-black">Status</p><p className="text-foreground truncate">{row.status || '—'}</p></div>
                <div><p className="text-muted-foreground text-[10px] uppercase font-black">Registered</p><p className="text-foreground truncate">{fmtDate(row.registered)}</p></div>
              </div>
              {tab === 'registrations' && canViewCredentials && (
                <div className="mt-3 rounded-xl border border-border bg-background p-3">
                  <p className="text-[10px] uppercase font-black text-muted-foreground">Temporary password</p>
                  <button
                    onClick={() => showPw && copy(row.password, row.id + 'cp')}
                    disabled={!showPw || !row.password}
                    className="font-mono text-amber-700 dark:text-amber-300 text-sm hover:text-amber-800 dark:hover:text-amber-200 disabled:cursor-default"
                  >
                    {showPw ? (row.password || '—') : '••••••'}{copied === row.id + 'cp' && ' ✓'}
                  </button>
                </div>
              )}
              <div className="flex flex-wrap gap-2 mt-4">
                {tab === 'people' ? (
                  <button onClick={() => router.push(row.href)} className="min-h-11 px-3 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-[10px] font-black uppercase tracking-widest">Open Record</button>
                ) : (
                  <>
                    <button onClick={() => copy(row.email, row.id + 'ce')} className="min-h-11 px-3 py-2 rounded-lg border border-border text-foreground text-[10px] font-black uppercase tracking-widest">Copy Email</button>
                    {canViewCredentials && showPw && row.password && <button onClick={() => copy(row.password, row.id + 'cp2')} className="min-h-11 px-3 py-2 rounded-lg border border-border text-foreground text-[10px] font-black uppercase tracking-widest">Copy Password</button>}
                    {row.portalUserId && (
                      <button onClick={() => window.open(resultCheckHref(row), '_blank', 'noopener,noreferrer')} className="min-h-11 px-3 py-2 rounded-lg border border-primary/30 text-primary text-[10px] font-black uppercase tracking-widest">Open result check</button>
                    )}
                    {canViewCredentials && <button onClick={() => printCards([row])} className="min-h-11 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-primary-foreground text-[10px] font-black uppercase tracking-widest">Print Card</button>}
                  </>
                )}
              </div>
            </div>
          ))}
          {activeCount === 0 && !regsLoading && !regsError && <div className="sm:col-span-2 xl:col-span-3 px-3 py-12 text-center text-muted-foreground text-sm">No records match your filters.</div>}
          {tab === 'registrations' && regsLoading && <div className="sm:col-span-2 xl:col-span-3 px-3 py-12 text-center text-muted-foreground text-sm">Loading registration records…</div>}
        </div>
      ) : (
      <div className="border border-border rounded-2xl overflow-hidden bg-card">
        <div className="overflow-auto max-h-[64vh]">
          {tab === 'people' ? (
            <table className="w-full text-sm min-w-[820px]">
              <thead className="sticky top-0 z-10 bg-muted text-[10px] uppercase tracking-widest text-muted-foreground shadow-sm">
                <tr><th className="px-3 py-3"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} className="accent-primary" aria-label="Select all filtered records" /></th>{['Name', 'Type', 'Email', 'School', 'Grade', 'Program', 'Source', 'Status', 'Registered'].map(h => <th key={h} className="text-left font-black px-3 py-3 whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {(visibleRows as Rec[]).map(r => (
                  <tr key={`${r.type}-${r.id}`} onClick={() => router.push(r.href)} className="border-t border-border even:bg-muted/30 hover:bg-primary/5 cursor-pointer transition-colors">
                    <td className="px-3 py-2.5"><input type="checkbox" checked={selectedRows.has(rowSelectionKey(r))} onChange={() => toggleRow(r)} onClick={(e) => e.stopPropagation()} className="accent-primary" aria-label={`Select ${r.name}`} /></td>
                    <td className="px-3 py-2.5 font-bold text-foreground whitespace-nowrap">{r.name}</td>
                    <td className="px-3 py-2.5"><span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${TYPE_COLOR[r.type] ?? 'bg-muted text-foreground border-border'}`}>{r.type}</span></td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.email || '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.school || '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.klass || '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.program || '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><span className="text-[10px] font-bold text-muted-foreground">{r.source}</span></td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><span className="text-[10px] font-bold text-foreground/80">{r.status}</span></td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.registered ? new Date(r.registered).toLocaleDateString('en-GB') : '—'}</td>
                  </tr>
                ))}
                {peopleFiltered.length === 0 && <tr><td colSpan={10} className="px-3 py-12 text-center text-muted-foreground text-sm">No records match your filters.</td></tr>}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm min-w-[980px]">
              <thead className="sticky top-0 z-10 bg-muted text-[10px] uppercase tracking-widest text-muted-foreground shadow-sm">
                <tr><th className="px-3 py-3"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} className="accent-primary" aria-label="Select all filtered registrations" /></th>{['Name', 'Login Email', ...(canViewCredentials ? ['Password'] : []), 'Grade', 'School', 'Type', 'Batch', 'Status', 'Account', 'Registered', 'Result Check'].map(h => <th key={h} className="text-left font-black px-3 py-3 whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {(visibleRows as Reg[]).map(r => (
                  <tr key={r.id} className="border-t border-border even:bg-muted/30 hover:bg-primary/5 transition-colors">
                    <td className="px-3 py-2.5"><input type="checkbox" checked={selectedRows.has(rowSelectionKey(r))} onChange={() => toggleRow(r)} className="accent-primary" aria-label={`Select ${r.name}`} /></td>
                    <td className="px-3 py-2.5 font-bold text-foreground whitespace-nowrap">{r.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap"><button onClick={() => copy(r.email, r.id + 'e')} className="hover:text-foreground" title="Copy email">{r.email || '—'}{copied === r.id + 'e' && ' ✓'}</button></td>
                    {canViewCredentials && (
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono"><button onClick={() => showPw && copy(r.password, r.id + 'p')} disabled={!showPw || !r.password} className="text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200 disabled:cursor-default" title={showPw ? 'Copy temporary password' : 'Reveal passwords to enable copying'}>{showPw ? (r.password || '—') : '••••••'}{copied === r.id + 'p' && ' ✓'}</button></td>
                    )}
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.klass || '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.school || '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.source || '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.batchName || '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><span className="text-[10px] font-bold text-foreground/80">{r.status}</span></td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><span className={`text-[10px] font-black ${ACCT_COLOR[r.account] ?? 'text-muted-foreground'}`}>{r.account}</span></td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.registered ? new Date(r.registered).toLocaleDateString('en-GB') : '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {r.portalUserId ? (
                        <button onClick={() => window.open(resultCheckHref(r), '_blank', 'noopener,noreferrer')} className="text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/80">
                          Test
                        </button>
                      ) : (
                        <span className="text-[10px] font-bold text-muted-foreground">No live account</span>
                      )}
                    </td>
                  </tr>
                ))}
                {regsFiltered.length === 0 && <tr><td colSpan={12} className="px-3 py-12 text-center text-muted-foreground text-sm">{regsError ? 'Use Retry above to load registration records.' : regsLoading || !regsLoaded ? 'Loading registration records…' : 'No registrations match your filters.'}</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
      )}
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="min-h-11 rounded-xl border border-border px-4 disabled:opacity-40">Previous</button>
          <span role="status" className="text-sm">Page {currentPage} of {pageCount}</span>
          <button disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} className="min-h-11 rounded-xl border border-border px-4 disabled:opacity-40">Next</button>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground px-1">
        Showing <span className="text-foreground font-bold">{visibleRows.length}</span> of {activeCount} filtered ({totalCount} total) {tab === 'people' ? 'records' : 'registrations'} ·
        {tab === 'people' ? ' click a row to open the full profile ·' : canViewCredentials ? ' reveal credentials before copying ·' : ' credential secrets are restricted ·'} live data, no stale copies.
      </p>
    </div>
  );
}
