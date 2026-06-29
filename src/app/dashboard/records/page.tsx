'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { MagnifyingGlassIcon, ArrowDownTrayIcon, ArrowPathIcon, PrinterIcon, RectangleGroupIcon } from '@/lib/icons';

type Rec = {
  id: string; type: string; name: string; email: string; school: string;
  klass: string; program: string; source: string; status: string;
  registered: string | null; href: string;
};
type Reg = {
  id: string; name: string; email: string; password: string; klass: string;
  school: string; source: string; batchName: string; status: string; account: string; registered: string | null; batchId: string;
  portalUserId?: string | null;
};
type SortKey = 'registered' | 'name' | 'school' | 'klass' | 'type' | 'status' | 'source' | 'account' | 'batch';

const INPUT = 'px-3 py-2 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary';
const TYPE_COLOR: Record<string, string> = {
  Student: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  Teacher: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  Parent: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  School: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  Lead: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  Prospect: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};
const ACCT_COLOR: Record<string, string> = { Active: 'text-emerald-300', Inactive: 'text-amber-300', Deleted: 'text-rose-300' };
const SORT_LABELS: Record<SortKey, string> = {
  registered: 'Newest first',
  name: 'Name',
  school: 'School',
  klass: 'Class',
  type: 'Type',
  status: 'Status',
  source: 'Source',
  account: 'Account',
  batch: 'Batch',
};

function clean(value?: string | null) {
  return String(value || '').trim();
}

function esc(value?: string | null) {
  return clean(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

export default function RecordsPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';

  const [tab, setTab] = useState<'people' | 'registrations'>(() => searchParams.get('tab') === 'registrations' ? 'registrations' : 'people');
  const [rows, setRows] = useState<Rec[]>([]);
  const [regs, setRegs] = useState<Reg[]>([]);
  const [loading, setLoading] = useState(true);
  const [regsLoaded, setRegsLoaded] = useState(false);
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
  const [view, setView] = useState<'table' | 'cards'>('table');
  const [sortKey, setSortKey] = useState<SortKey>('registered');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (authLoading || !isStaff) return;
    (async () => {
      setLoading(true); setErr('');
      try {
        const res = await fetch('/api/records', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load');
        setRows(json.records ?? []);
      } catch (e: any) { setErr(e.message ?? 'Failed to load'); }
      finally { setLoading(false); }
    })();
  }, [authLoading, isStaff]);

  useEffect(() => {
    if (tab !== 'registrations' || regsLoaded || authLoading || !isStaff) return;
    (async () => {
      try {
        const res = await fetch('/api/records/registrations', { cache: 'no-store' });
        const json = await res.json();
        if (res.ok) { setRegs(json.registrations ?? []); setRegsLoaded(true); }
        else setErr(json.error || 'Failed to load registrations');
      } catch (e: any) { setErr(e.message ?? 'Failed to load registrations'); }
    })();
  }, [tab, regsLoaded, authLoading, isStaff]);

  const uniq = (arr: any[], key: string) => [...new Set(arr.map(r => r[key]).filter(Boolean) as string[])].sort();
  const typeCounts = useMemo(() => { const c: Record<string, number> = {}; for (const r of rows) c[r.type] = (c[r.type] || 0) + 1; return c; }, [rows]);
  const acctCounts = useMemo(() => { const c: Record<string, number> = {}; for (const r of regs) c[r.account] = (c[r.account] || 0) + 1; return c; }, [regs]);
  const registrationBatches = useMemo(() => {
    const byId = new Map<string, string>();
    for (const r of regs) if (r.batchId) byId.set(r.batchId, r.batchName || r.batchId);
    return [...byId.entries()].map(([id, label]) => ({ id, label }));
  }, [regs]);

  const compareRows = (a: Rec | Reg, b: Rec | Reg) => {
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
    const cmp = sortKey === 'registered'
      ? String(av).localeCompare(String(bv))
      : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
    return sortDir === 'asc' ? cmp : -cmp;
  };

  const peopleFiltered = useMemo(() => rows.filter(r => {
    const s = q.trim().toLowerCase();
    const mq = !s || r.name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s);
    return mq && (fType === 'all' || r.type === fType) && (fSchool === 'all' || r.school === fSchool)
      && (fClass === 'all' || r.klass === fClass) && (fSource === 'all' || r.source === fSource)
      && (fStatus === 'all' || r.status === fStatus);
  }).sort(compareRows), [rows, q, fType, fSchool, fClass, fSource, fStatus, sortKey, sortDir]);

  const regsFiltered = useMemo(() => regs.filter(r => {
    const s = q.trim().toLowerCase();
    const mq = !s || r.name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s);
    return mq && (fSchool === 'all' || r.school === fSchool) && (fClass === 'all' || r.klass === fClass)
      && (fSource === 'all' || r.source === fSource) && (fBatch === 'all' || r.batchId === fBatch)
      && (fAccount === 'all' || r.account === fAccount);
  }).sort(compareRows), [regs, q, fSchool, fClass, fSource, fBatch, fAccount, sortKey, sortDir]);

  async function copy(text: string, id: string) {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(''), 1200); } catch { /* ignore */ }
  }

  function exportCsv() {
    let head: string[]; let lines: string[];
    if (tab === 'people') {
      head = ['Name', 'Type', 'Email', 'School', 'Class', 'Program', 'Source', 'Status', 'Registered'];
      lines = peopleFiltered.map(r => [r.name, r.type, r.email, r.school, r.klass, r.program, r.source, r.status, r.registered ? new Date(r.registered).toLocaleDateString('en-GB') : ''].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    } else {
      head = ['Name', 'Email', 'Password', 'Class', 'School', 'Registration Type', 'Batch', 'Status', 'Account', 'Registered'];
      lines = regsFiltered.map(r => [r.name, r.email, r.password, r.klass, r.school, r.source, r.batchName, r.status, r.account, r.registered ? new Date(r.registered).toLocaleDateString('en-GB') : ''].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    }
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${tab}_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }

  function printList() {
    const isPeople = tab === 'people';
    const data = isPeople ? peopleFiltered : regsFiltered;
    if (data.length === 0) return;
    const title = isPeople ? 'People Records List' : 'Registration Credentials List';
    const columns = isPeople
      ? ['#', 'Name', 'Type', 'Email', 'School', 'Class', 'Program', 'Source', 'Status', 'Registered']
      : ['#', 'Name', 'Login Email', 'Password', 'Class', 'School', 'Type', 'Batch', 'Status', 'Account', 'Registered'];
    const rowsHtml = data.map((row: any, index) => {
      const cells = isPeople
        ? [index + 1, row.name, row.type, row.email, row.school, row.klass, row.program, row.source, row.status, fmtDate(row.registered)]
        : [index + 1, row.name, row.email, row.password, row.klass, row.school, row.source, row.batchName, row.status, row.account, fmtDate(row.registered)];
      return `<tr>${cells.map(cell => `<td>${esc(String(cell ?? ''))}</td>`).join('')}</tr>`;
    }).join('');
    const html = `<!doctype html><html><head><title>${esc(title)}</title><style>
      @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Inter,Segoe UI,Arial,sans-serif;color:#111827;margin:0}
      .head{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:3px solid #7c3aed;padding-bottom:10px;margin-bottom:14px}
      h1{font-size:20px;margin:0;font-weight:900;letter-spacing:-.02em}.meta{font-size:10px;text-transform:uppercase;color:#6b7280;font-weight:800;text-align:right}
      table{width:100%;border-collapse:collapse;font-size:10px}th{background:#f3f4f6;color:#111827;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.05em}
      th,td{border:1px solid #e5e7eb;padding:6px 7px;vertical-align:top}td:nth-child(3),td:nth-child(4){word-break:break-word}.foot{margin-top:10px;font-size:9px;color:#6b7280;text-align:center}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
      <div class="head"><div><h1>Rillcod Academy ${esc(title)}</h1><div class="meta" style="text-align:left">Source: Records · ${data.length} row${data.length === 1 ? '' : 's'}</div></div><div class="meta">Printed ${fmtDate(new Date().toISOString())}<br/>Sorted by ${esc(SORT_LABELS[sortKey])} (${sortDir})</div></div>
      <table><thead><tr>${columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table>
      <div class="foot">Confidential administrative record. Generated from live Records, not bulk archive copies.</div>
      <script>window.onload=()=>window.print()</script>
    </body></html>`;
    const win = window.open('', '_blank');
    win?.document.write(html);
    win?.document.close();
  }

  function printCards(items: Reg[] = regsFiltered) {
    const valid = items.filter(r => r.portalUserId && r.account !== 'Deleted' && String(r.status || '').toLowerCase() !== 'failed');
    if (valid.length === 0) return;
    const sorted = [...valid].sort((a, b) => (a.klass || '').localeCompare(b.klass || '') || a.name.localeCompare(b.name));
    const origin = window.location.origin;
    const html = `<!doctype html><html><head><title>Student Access Cards</title><style>
      @page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}body{font-family:Inter,Segoe UI,Arial,sans-serif;margin:0;color:#111827;background:#fff}
      .grid{display:grid;grid-template-columns:80mm 80mm;grid-auto-rows:58mm;gap:7mm;justify-content:center}
      .card{border:1px solid #d1d5db;border-left:5px solid #7c3aed;border-radius:8px;overflow:hidden;break-inside:avoid;display:flex;flex-direction:column;background:#fff}
      .top{background:#7c3aed;color:#fff;padding:8px 10px;display:flex;align-items:center;justify-content:space-between}.brand{font-weight:900;font-size:12px;text-transform:uppercase}.tag{font-size:8px;font-weight:900;background:rgba(0,0,0,.2);padding:3px 6px;border-radius:999px}
      .body{padding:9px 10px;display:grid;grid-template-columns:1fr 24mm;gap:8px;align-items:start}.name{font-size:13px;font-weight:900;text-transform:uppercase;line-height:1.1;margin-bottom:6px}.line{font-size:8px;color:#6b7280;text-transform:uppercase;font-weight:800;margin-top:4px}.val{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;color:#111827;font-weight:800;word-break:break-word}.qr{width:24mm;height:24mm;border:1px solid #e5e7eb;border-radius:6px;padding:2px;background:#fff}.hint{font-size:7px;font-weight:900;color:#6b7280;text-align:center;text-transform:uppercase;line-height:1.15;margin-top:3px}.code{font-size:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#4c1d95;text-align:center;font-weight:900;word-break:break-all;letter-spacing:.03em}
      .foot{margin-top:auto;border-top:1px dashed #e5e7eb;padding:6px 10px;font-size:8px;color:#6b7280;font-weight:800;display:flex;justify-content:space-between}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body><div class="grid">
      ${sorted.map(r => {
        const studentId = r.portalUserId || r.id;
        const code = `RC-${studentId.slice(0, 8).toUpperCase()}`;
        const checkUrl = `${origin}/result-check/${encodeURIComponent(code)}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=1&data=${encodeURIComponent(checkUrl)}`;
        return `<div class="card"><div class="top"><div class="brand">Rillcod Access</div><div class="tag">${esc(r.klass || 'STUDENT')}</div></div><div class="body">
          <div><div class="name">${esc(r.name)}</div>
          <div class="line">Login Email</div><div class="val">${esc(r.email)}</div>
          <div class="line">Password</div><div class="val" style="color:#7c2d12">${esc(r.password || '—')}</div>
          <div class="line">School</div><div class="val" style="font-size:8px">${esc(r.school || 'Rillcod Academy')}</div></div>
          <div><img class="qr" src="${qrUrl}" alt="Result QR for ${esc(r.name)}"/><div class="hint">Scan to check result<br/>Consent is one-time</div><div class="code">${esc(code)}</div></div>
        </div><div class="foot"><span>rillcod.com/result-check</span><span>${esc(code)}</span></div></div>`;
      }).join('')}
      </div><script>
        window.onload=()=>{const imgs=[...document.images];Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(r=>{img.onload=r;img.onerror=r;}))).then(()=>setTimeout(()=>window.print(),250));};
      </script></body></html>`;
    const win = window.open('', '_blank');
    win?.document.write(html);
    win?.document.close();
  }

  if (authLoading || (loading && rows.length === 0)) {
    return <div className="flex items-center justify-center h-[60vh]"><div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!isStaff) return <div className="p-8 text-center text-muted-foreground">Access denied.</div>;

  const Select = ({ value, onChange, children }: any) => (
    <select value={value} onChange={(e: any) => onChange(e.target.value)} className={INPUT + ' cursor-pointer'}>{children}</select>
  );
  const activeCount = tab === 'people' ? peopleFiltered.length : regsFiltered.length;
  const totalCount = tab === 'people' ? rows.length : regs.length;

  return (
    <div className="space-y-5 p-1 pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">Records</h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">One live, filterable sheet for everyone and every registration — no scattered archives. Click a person to open their profile; click a login to copy it.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => location.reload()} className="h-9 inline-flex items-center gap-1.5 px-3 rounded-xl border border-border bg-card hover:bg-muted text-xs font-bold text-foreground"><ArrowPathIcon className="w-4 h-4" /> Refresh</button>
          <button onClick={printList} disabled={activeCount === 0} className="h-9 inline-flex items-center gap-1.5 px-3 rounded-xl border border-border bg-card hover:bg-muted disabled:opacity-40 text-xs font-bold text-foreground"><PrinterIcon className="w-4 h-4" /> Print List</button>
          {tab === 'registrations' && (
            <button onClick={() => printCards()} disabled={regsFiltered.length === 0} className="h-9 inline-flex items-center gap-1.5 px-3 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-40 text-xs font-black text-amber-200"><RectangleGroupIcon className="w-4 h-4" /> Print Cards</button>
          )}
          <button onClick={exportCsv} disabled={activeCount === 0} className="h-9 inline-flex items-center gap-1.5 px-3 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 text-xs font-black text-primary-foreground shadow-lg"><ArrowDownTrayIcon className="w-4 h-4" /> Export ({activeCount})</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded-xl border border-border bg-card p-1">
        {(['people', 'registrations'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-colors ${tab === t ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}>
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
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or email…" className={INPUT + ' w-full pl-9'} />
        </div>
        <Select value={fSchool} onChange={setFSchool}><option value="all">All schools</option>{uniq(tab === 'people' ? rows : regs, 'school').map(s => <option key={s} value={s}>{s}</option>)}</Select>
        <Select value={fClass} onChange={setFClass}><option value="all">All classes</option>{uniq(tab === 'people' ? rows : regs, 'klass').map(c => <option key={c} value={c}>{c}</option>)}</Select>
        {tab === 'people' ? (
          <>
            <Select value={fSource} onChange={setFSource}><option value="all">All sources</option>{uniq(rows, 'source').map(s => <option key={s} value={s}>{s}</option>)}</Select>
            <Select value={fStatus} onChange={setFStatus}><option value="all">All statuses</option>{uniq(rows, 'status').map(s => <option key={s} value={s}>{s}</option>)}</Select>
          </>
        ) : (
          <>
            <Select value={fSource} onChange={setFSource}><option value="all">All registration types</option>{uniq(regs, 'source').map(s => <option key={s} value={s}>{s}</option>)}</Select>
            <Select value={fBatch} onChange={setFBatch}><option value="all">All batches</option>{registrationBatches.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}</Select>
            <button onClick={() => setShowPw(v => !v)} className={INPUT + ' cursor-pointer text-left lg:col-span-2'}>{showPw ? 'Hide passwords' : 'Show passwords'}</button>
          </>
        )}
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
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {v === 'table' ? 'Table' : 'Cards'}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">{err}</div>}

      {/* Datasheet */}
      {view === 'cards' ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {(tab === 'people' ? peopleFiltered : regsFiltered).map((row: any) => (
            <div key={`${tab}-${row.id}`} className="rounded-2xl border border-border bg-card p-4 hover:bg-muted/60 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-black text-foreground truncate">{row.name || 'Unnamed'}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{row.email || '—'}</p>
                </div>
                {tab === 'people' ? (
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${TYPE_COLOR[row.type] ?? 'bg-muted text-foreground border-border'}`}>{row.type}</span>
                ) : (
                  <span className={`text-[10px] font-black ${ACCT_COLOR[row.account] ?? 'text-muted-foreground'}`}>{row.account}</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                <div><p className="text-muted-foreground text-[10px] uppercase font-black">School</p><p className="text-foreground truncate">{row.school || '—'}</p></div>
                <div><p className="text-muted-foreground text-[10px] uppercase font-black">Class</p><p className="text-foreground truncate">{row.klass || '—'}</p></div>
                {tab === 'registrations' && (
                  <>
                    <div><p className="text-muted-foreground text-[10px] uppercase font-black">Type</p><p className="text-foreground truncate">{row.source || '—'}</p></div>
                    <div><p className="text-muted-foreground text-[10px] uppercase font-black">Batch</p><p className="text-foreground truncate">{row.batchName || '—'}</p></div>
                  </>
                )}
                <div><p className="text-muted-foreground text-[10px] uppercase font-black">Status</p><p className="text-foreground truncate">{row.status || '—'}</p></div>
                <div><p className="text-muted-foreground text-[10px] uppercase font-black">Registered</p><p className="text-foreground truncate">{fmtDate(row.registered)}</p></div>
              </div>
              {tab === 'registrations' && (
                <div className="mt-3 rounded-xl border border-border bg-background p-3">
                  <p className="text-[10px] uppercase font-black text-muted-foreground">Password</p>
                  <button onClick={() => copy(row.password, row.id + 'cp')} className="font-mono text-amber-300 text-sm hover:text-amber-200">
                    {showPw ? (row.password || '—') : '••••••'}{copied === row.id + 'cp' && ' ✓'}
                  </button>
                </div>
              )}
              <div className="flex flex-wrap gap-2 mt-4">
                {tab === 'people' ? (
                  <button onClick={() => router.push(row.href)} className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-[10px] font-black uppercase tracking-widest">Open Record</button>
                ) : (
                  <>
                    <button onClick={() => copy(row.email, row.id + 'ce')} className="px-3 py-1.5 rounded-lg border border-border text-foreground text-[10px] font-black uppercase tracking-widest">Copy Email</button>
                    <button onClick={() => copy(row.password, row.id + 'cp2')} className="px-3 py-1.5 rounded-lg border border-border text-foreground text-[10px] font-black uppercase tracking-widest">Copy Password</button>
                    <button onClick={() => printCards([row])} className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-primary-foreground text-[10px] font-black uppercase tracking-widest">Print Card</button>
                  </>
                )}
              </div>
            </div>
          ))}
          {activeCount === 0 && <div className="sm:col-span-2 xl:col-span-3 px-3 py-12 text-center text-muted-foreground text-sm">No records match your filters.</div>}
        </div>
      ) : (
      <div className="border border-border rounded-2xl overflow-hidden bg-card">
        <div className="overflow-auto max-h-[64vh]">
          {tab === 'people' ? (
            <table className="w-full text-sm min-w-[820px]">
              <thead className="sticky top-0 z-10 bg-muted text-[10px] uppercase tracking-widest text-muted-foreground shadow-sm">
                <tr>{['Name', 'Type', 'Email', 'School', 'Class', 'Program', 'Source', 'Status', 'Registered'].map(h => <th key={h} className="text-left font-black px-3 py-3 whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {peopleFiltered.map(r => (
                  <tr key={`${r.type}-${r.id}`} onClick={() => router.push(r.href)} className="border-t border-border even:bg-muted/30 hover:bg-primary/5 cursor-pointer transition-colors">
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
                {peopleFiltered.length === 0 && <tr><td colSpan={9} className="px-3 py-12 text-center text-muted-foreground text-sm">No records match your filters.</td></tr>}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm min-w-[860px]">
              <thead className="sticky top-0 z-10 bg-muted text-[10px] uppercase tracking-widest text-muted-foreground shadow-sm">
                <tr>{['Name', 'Login Email', 'Password', 'Class', 'School', 'Type', 'Batch', 'Status', 'Account', 'Registered'].map(h => <th key={h} className="text-left font-black px-3 py-3 whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {regsFiltered.map(r => (
                  <tr key={r.id} className="border-t border-border even:bg-muted/30 hover:bg-primary/5 transition-colors">
                    <td className="px-3 py-2.5 font-bold text-foreground whitespace-nowrap">{r.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap"><button onClick={() => copy(r.email, r.id + 'e')} className="hover:text-foreground" title="Copy email">{r.email || '—'}{copied === r.id + 'e' && ' ✓'}</button></td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono"><button onClick={() => copy(r.password, r.id + 'p')} className="text-amber-300 hover:text-amber-200" title="Click to copy password">{showPw ? (r.password || '—') : '••••••'}{copied === r.id + 'p' && ' ✓'}</button></td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.klass || '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.school || '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.source || '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.batchName || '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><span className="text-[10px] font-bold text-foreground/80">{r.status}</span></td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><span className={`text-[10px] font-black ${ACCT_COLOR[r.account] ?? 'text-muted-foreground'}`}>{r.account}</span></td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.registered ? new Date(r.registered).toLocaleDateString('en-GB') : '—'}</td>
                  </tr>
                ))}
                {regsFiltered.length === 0 && <tr><td colSpan={10} className="px-3 py-12 text-center text-muted-foreground text-sm">{regsLoaded ? 'No registrations match your filters.' : 'Loading…'}</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
      )}
      <p className="text-[10px] text-muted-foreground px-1">
        Showing <span className="text-foreground font-bold">{activeCount}</span> of {totalCount} {tab === 'people' ? 'records' : 'registrations'} ·
        {tab === 'people' ? ' click a row to open the full profile ·' : ' click an email or password to copy ·'} live data, no stale copies.
      </p>
    </div>
  );
}
