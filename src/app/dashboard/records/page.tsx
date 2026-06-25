'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { MagnifyingGlassIcon, ArrowDownTrayIcon, ArrowPathIcon } from '@/lib/icons';

type Rec = {
  id: string; type: string; name: string; email: string; school: string;
  klass: string; program: string; source: string; status: string;
  registered: string | null; href: string;
};
type Reg = {
  id: string; name: string; email: string; password: string; klass: string;
  school: string; status: string; account: string; registered: string | null; batchId: string;
};

const INPUT = 'px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500';
const TYPE_COLOR: Record<string, string> = {
  Student: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  Teacher: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  Parent: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  School: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  Lead: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  Prospect: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};
const ACCT_COLOR: Record<string, string> = { Active: 'text-emerald-300', Inactive: 'text-amber-300', Deleted: 'text-rose-300' };

function StatCard({ label, value, active, onClick }: { label: string; value: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`text-left rounded-2xl border px-4 py-3 transition-all ${active ? 'border-violet-500/60 bg-violet-500/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}>
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground truncate">{label}</p>
      <p className="text-2xl font-black text-white mt-0.5 tabular-nums">{value}</p>
    </button>
  );
}

export default function RecordsPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';

  const [tab, setTab] = useState<'people' | 'registrations'>('people');
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
  const [showPw, setShowPw] = useState(false);
  const [copied, setCopied] = useState('');

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

  const peopleFiltered = useMemo(() => rows.filter(r => {
    const s = q.trim().toLowerCase();
    const mq = !s || r.name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s);
    return mq && (fType === 'all' || r.type === fType) && (fSchool === 'all' || r.school === fSchool)
      && (fClass === 'all' || r.klass === fClass) && (fSource === 'all' || r.source === fSource)
      && (fStatus === 'all' || r.status === fStatus);
  }), [rows, q, fType, fSchool, fClass, fSource, fStatus]);

  const regsFiltered = useMemo(() => regs.filter(r => {
    const s = q.trim().toLowerCase();
    const mq = !s || r.name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s);
    return mq && (fSchool === 'all' || r.school === fSchool) && (fClass === 'all' || r.klass === fClass) && (fAccount === 'all' || r.account === fAccount);
  }), [regs, q, fSchool, fClass, fAccount]);

  async function copy(text: string, id: string) {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(''), 1200); } catch { /* ignore */ }
  }

  function exportCsv() {
    let head: string[]; let lines: string[];
    if (tab === 'people') {
      head = ['Name', 'Type', 'Email', 'School', 'Class', 'Program', 'Source', 'Status', 'Registered'];
      lines = peopleFiltered.map(r => [r.name, r.type, r.email, r.school, r.klass, r.program, r.source, r.status, r.registered ? new Date(r.registered).toLocaleDateString('en-GB') : ''].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    } else {
      head = ['Name', 'Email', 'Password', 'Class', 'School', 'Status', 'Account', 'Registered'];
      lines = regsFiltered.map(r => [r.name, r.email, r.password, r.klass, r.school, r.status, r.account, r.registered ? new Date(r.registered).toLocaleDateString('en-GB') : ''].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    }
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${tab}_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
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
          <h1 className="text-2xl font-black text-white tracking-tight">Records</h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">One live, filterable sheet for everyone and every registration — no scattered archives. Click a person to open their profile; click a login to copy it.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => location.reload()} className="h-9 inline-flex items-center gap-1.5 px-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-bold text-white"><ArrowPathIcon className="w-4 h-4" /> Refresh</button>
          <button onClick={exportCsv} disabled={activeCount === 0} className="h-9 inline-flex items-center gap-1.5 px-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-xs font-black text-white shadow-lg shadow-violet-900/30"><ArrowDownTrayIcon className="w-4 h-4" /> Export ({activeCount})</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
        {(['people', 'registrations'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-colors ${tab === t ? 'bg-violet-600 text-white shadow' : 'text-muted-foreground hover:text-white'}`}>
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
            {['Active', 'Inactive', 'Deleted'].map(a => (
              <StatCard key={a} label={a} value={acctCounts[a] ?? 0} active={fAccount === a} onClick={() => setFAccount(fAccount === a ? 'all' : a)} />
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
          <button onClick={() => setShowPw(v => !v)} className={INPUT + ' cursor-pointer text-left lg:col-span-2'}>{showPw ? '🙈 Hide passwords' : '👁 Show passwords'}</button>
        )}
      </div>

      {err && <div className="px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">{err}</div>}

      {/* Datasheet */}
      <div className="border border-white/10 rounded-2xl overflow-hidden bg-white/[0.02]">
        <div className="overflow-auto max-h-[64vh]">
          {tab === 'people' ? (
            <table className="w-full text-sm min-w-[820px]">
              <thead className="sticky top-0 z-10 bg-[#14141f] text-[10px] uppercase tracking-widest text-muted-foreground shadow-sm">
                <tr>{['Name', 'Type', 'Email', 'School', 'Class', 'Program', 'Source', 'Status', 'Registered'].map(h => <th key={h} className="text-left font-black px-3 py-3 whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {peopleFiltered.map(r => (
                  <tr key={`${r.type}-${r.id}`} onClick={() => router.push(r.href)} className="border-t border-white/5 even:bg-white/[0.015] hover:bg-violet-500/5 cursor-pointer transition-colors">
                    <td className="px-3 py-2.5 font-bold text-white whitespace-nowrap">{r.name}</td>
                    <td className="px-3 py-2.5"><span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${TYPE_COLOR[r.type] ?? 'bg-white/10 text-white border-white/20'}`}>{r.type}</span></td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.email || '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.school || '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.klass || '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.program || '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><span className="text-[10px] font-bold text-white/60">{r.source}</span></td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><span className="text-[10px] font-bold text-white/80">{r.status}</span></td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.registered ? new Date(r.registered).toLocaleDateString('en-GB') : '—'}</td>
                  </tr>
                ))}
                {peopleFiltered.length === 0 && <tr><td colSpan={9} className="px-3 py-12 text-center text-muted-foreground text-sm">No records match your filters.</td></tr>}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm min-w-[860px]">
              <thead className="sticky top-0 z-10 bg-[#14141f] text-[10px] uppercase tracking-widest text-muted-foreground shadow-sm">
                <tr>{['Name', 'Login Email', 'Password', 'Class', 'School', 'Status', 'Account', 'Registered'].map(h => <th key={h} className="text-left font-black px-3 py-3 whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {regsFiltered.map(r => (
                  <tr key={r.id} className="border-t border-white/5 even:bg-white/[0.015] hover:bg-violet-500/5 transition-colors">
                    <td className="px-3 py-2.5 font-bold text-white whitespace-nowrap">{r.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap"><button onClick={() => copy(r.email, r.id + 'e')} className="hover:text-white" title="Copy email">{r.email || '—'}{copied === r.id + 'e' && ' ✓'}</button></td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono"><button onClick={() => copy(r.password, r.id + 'p')} className="text-amber-300 hover:text-amber-200" title="Click to copy password">{showPw ? (r.password || '—') : '••••••'}{copied === r.id + 'p' && ' ✓'}</button></td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.klass || '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.school || '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><span className="text-[10px] font-bold text-white/80">{r.status}</span></td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><span className={`text-[10px] font-black ${ACCT_COLOR[r.account] ?? 'text-muted-foreground'}`}>{r.account}</span></td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.registered ? new Date(r.registered).toLocaleDateString('en-GB') : '—'}</td>
                  </tr>
                ))}
                {regsFiltered.length === 0 && <tr><td colSpan={8} className="px-3 py-12 text-center text-muted-foreground text-sm">{regsLoaded ? 'No registrations match your filters.' : 'Loading…'}</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground px-1">
        Showing <span className="text-white font-bold">{activeCount}</span> of {totalCount} {tab === 'people' ? 'records' : 'registrations'} ·
        {tab === 'people' ? ' click a row to open the full profile ·' : ' click an email or password to copy ·'} live data, no stale copies.
      </p>
    </div>
  );
}
