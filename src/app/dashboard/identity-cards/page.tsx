'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import {
  CreditCardIcon,
  UserGroupIcon,
  UserPlusIcon,
  AcademicCapIcon,
  MagnifyingGlassIcon,
  PrinterIcon,
  ArrowPathIcon,
  SparklesIcon,
} from '@/lib/icons';

type CardType = 'student' | 'parent' | 'teacher';
type StudioMode = 'issuance' | 'design';

type CardConfig = {
  accentColor?: string;
  orgName?: string;
  orgWebsite?: string;
  footerLeft?: string;
  cardLabel?: string;
  headerStyle?: 'band' | 'border' | 'minimal';
};

type PortalUser = {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
  school_name?: string | null;
  section_class?: string | null;
};

type ParentUser = {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  children?: Array<{ id: string; full_name: string; school_name?: string | null }>;
};

type CardRecord = {
  id: string;
  name: string;
  email: string;
  roleLabel: string;
  school: string;
  badge: string;
  profileUrl: string;
};

const FALLBACK_CONFIG: Required<CardConfig> = {
  accentColor: '#ea580c',
  orgName: 'RILLCOD TECHNOLOGIES',
  orgWebsite: 'www.rillcod.com',
  footerLeft: 'rillcod.com/login',
  cardLabel: 'Access Card',
  headerStyle: 'band',
};

export default function IdentityCardsPage() {
  const { profile, isLoading } = useAuth() as any;
  const searchParams = useSearchParams();
  const [activeType, setActiveType] = useState<CardType>('student');
  const [mode, setMode] = useState<StudioMode>('issuance');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<Required<CardConfig>>(FALLBACK_CONFIG);
  const [records, setRecords] = useState<CardRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const canAccess =
    profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';

  const loadConfig = async (type: CardType) => {
    try {
      const res = await fetch(`/api/admin/settings?type=${type}`, { cache: 'no-store' });
      const json = await res.json();
      const cfg = json?.config || {};
      setConfig({
        ...FALLBACK_CONFIG,
        ...cfg,
      });
    } catch {
      setConfig(FALLBACK_CONFIG);
    }
  };

  const mapPortalUsers = (rows: PortalUser[], type: CardType): CardRecord[] =>
    rows.map((r) => ({
      id: r.id,
      name: r.full_name || 'Unknown',
      email: r.email || 'N/A',
      roleLabel: type === 'teacher' ? 'Teacher' : 'Student',
      school: r.school_name || 'Rillcod Academy',
      badge: r.section_class || (type === 'teacher' ? 'Staff' : 'Student'),
      profileUrl: `${window.location.origin}/dashboard/profile`,
    }));

  const mapParents = (rows: ParentUser[]): CardRecord[] =>
    rows.map((r) => ({
      id: r.id,
      name: r.full_name || 'Unknown',
      email: r.email || 'N/A',
      roleLabel: 'Parent',
      school: r.children?.[0]?.school_name || 'Rillcod Academy',
      badge: `${r.children?.length || 0} child${(r.children?.length || 0) === 1 ? '' : 'ren'}`,
      profileUrl: `${window.location.origin}/dashboard/parent-feedback`,
    }));

  const loadRecords = async (type: CardType) => {
    setLoading(true);
    setError(null);
    try {
      if (type === 'parent') {
        const res = await fetch('/api/parents/manage', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Failed to load parents');
        setRecords(mapParents(json?.data || []));
      } else {
        const res = await fetch(`/api/portal-users?role=${type}&scoped=true`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `Failed to load ${type}s`);
        setRecords(mapPortalUsers(json?.data || [], type));
      }
    } catch (e: any) {
      setRecords([]);
      setError(e?.message || 'Failed to load card holders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canAccess) return;
    loadConfig(activeType);
  }, [canAccess, activeType]);

  useEffect(() => {
    const t = (searchParams.get('type') || '').toLowerCase();
    const q = searchParams.get('q') || '';
    const m = (searchParams.get('mode') || '').toLowerCase();
    if (t === 'student' || t === 'parent' || t === 'teacher') {
      setActiveType(t);
    }
    if (m === 'issuance' || m === 'design') {
      setMode(m);
    }
    if (q) setQuery(q);
  }, [searchParams]);

  useEffect(() => {
    if (!canAccess) return;
    loadRecords(activeType);
  }, [activeType, canAccess]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) =>
      [r.name, r.email, r.school, r.badge, r.roleLabel].some((v) => (v || '').toLowerCase().includes(q)),
    );
  }, [records, query]);

  const printCards = (list: CardRecord[], title: string) => {
    if (!list.length) {
      alert('No records to print.');
      return;
    }
    const acc = config.accentColor;
    const org = config.orgName;
    const site = config.orgWebsite;
    const foot = config.footerLeft;
    const logo = `${window.location.origin}/images/logo.png`;
    const hStyle = config.headerStyle;

    const html = `<!doctype html><html><head><title>${title}</title>
      <style>
        @page { size: A4 portrait; margin: 8mm; }
        * { box-sizing: border-box; }
        body { margin:0; font-family: Inter, system-ui, sans-serif; color:#111827; background:#fff; }
        .grid { display:grid; grid-template-columns:repeat(2, 1fr); gap:8mm; }
        .card { width:100%; min-height:62mm; border:1px solid #e5e7eb; display:flex; flex-direction:column; overflow:hidden; }
        .hdr-band { background:${acc}; color:#fff; padding:2.2mm 3mm; display:flex; align-items:center; gap:2mm; }
        .hdr-border { border-left:2.5mm solid ${acc}; padding:2.2mm 3mm; display:flex; align-items:center; gap:2mm; }
        .hdr-min { border-bottom:1px solid #e5e7eb; padding:2.2mm 3mm; display:flex; align-items:center; gap:2mm; }
        .logo { width:5mm; height:5mm; object-fit:contain; }
        .org { font-weight:900; font-size:2.5mm; text-transform:uppercase; line-height:1; }
        .web { font-size:1.8mm; opacity:.8; margin-top:.5mm; }
        .body { display:flex; flex:1; }
        .left { flex:1; padding:2.5mm 3mm; border-right:1px solid #f3f4f6; }
        .school { color:${acc}; font-size:1.8mm; font-weight:900; text-transform:uppercase; letter-spacing:.2mm; }
        .name { font-size:4mm; font-weight:900; margin:.8mm 0 1.2mm; text-transform:uppercase; line-height:1.2; }
        .row { margin:.8mm 0; }
        .lbl { color:#9ca3af; font-size:1.6mm; text-transform:uppercase; letter-spacing:.15mm; }
        .val { font-size:2.2mm; font-weight:700; }
        .badge { display:inline-block; background:${acc}15; border:1px solid ${acc}40; color:${acc}; font-size:1.7mm; font-weight:800; padding:.6mm 1.4mm; margin-top:1mm; }
        .right { width:23mm; background:#fafafa; padding:2mm; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:1mm; }
        .qr { width:16mm; height:16mm; border:1px solid #e5e7eb; }
        .code { color:${acc}; font-size:1.6mm; font-family:monospace; font-weight:900; text-align:center; }
        .ftr { border-top:1px solid #f3f4f6; background:#fafafa; color:#6b7280; display:flex; justify-content:space-between; padding:1.3mm 3mm; font-size:1.6mm; }
      </style></head><body>
      <div class="grid">
      ${list
        .map((r) => {
          const code = `RC-${r.id.slice(0, 8).toUpperCase()}`;
          const qr = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(r.profileUrl)}`;
          const hdrClass = hStyle === 'border' ? 'hdr-border' : hStyle === 'minimal' ? 'hdr-min' : 'hdr-band';
          return `<div class="card">
              <div class="${hdrClass}">
                <img class="logo" src="${logo}" />
                <div><div class="org">${org}</div><div class="web">${site}</div></div>
              </div>
              <div class="body">
                <div class="left">
                  <div class="school">${r.school}</div>
                  <div class="name">${r.name}</div>
                  <div class="row"><div class="lbl">Role</div><div class="val">${r.roleLabel}</div></div>
                  <div class="row"><div class="lbl">Email</div><div class="val">${r.email}</div></div>
                  <div class="badge">${r.badge}</div>
                </div>
                <div class="right">
                  <img class="qr" src="${qr}" />
                  <div class="code">${code}</div>
                </div>
              </div>
              <div class="ftr"><span>${foot}</span><span>${config.cardLabel}</span></div>
            </div>`;
        })
        .join('')}
      </div>
      <script>window.onload=()=>{window.print(); setTimeout(()=>window.close(), 500);};</script>
      </body></html>`;

    const win = window.open('', '_blank');
    if (!win) {
      alert('Pop-up blocked. Please allow pop-ups for printing.');
      return;
    }
    win.document.write(html);
    win.document.close();
  };

  if (isLoading) return null;
  if (!canAccess) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6 md:p-10">
        <div className="max-w-2xl mx-auto bg-card border border-border p-8 rounded-none">
          <h1 className="text-2xl font-black">Access denied</h1>
          <p className="text-muted-foreground mt-2">Identity card management is available to admin, school, and teacher roles.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6">
        <div className="relative overflow-hidden border border-border bg-card rounded-none p-5 sm:p-7">
          <div className="absolute -right-16 -top-16 w-40 h-40 bg-orange-500/10 blur-3xl pointer-events-none" />
          <div className="absolute -left-12 -bottom-12 w-36 h-36 bg-blue-500/10 blur-3xl pointer-events-none" />
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-orange-400 mb-2">Card Studio</p>
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight">Card Studio</h1>
              <p className="text-muted-foreground mt-2 text-sm sm:text-base">
                Manage design presets, issue cards for students, parents, and teachers, and print in bulk from one place.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setMode('design')}
                className={`px-4 py-2.5 text-xs font-black uppercase tracking-widest rounded-none transition-all inline-flex items-center gap-2 ${
                  mode === 'design'
                    ? 'bg-orange-600 text-white'
                    : 'bg-card border border-border hover:bg-muted'
                }`}
              >
                <SparklesIcon className="w-4 h-4" /> Design
              </button>
              <button
                onClick={() => setMode('issuance')}
                className={`px-4 py-2.5 text-xs font-black uppercase tracking-widest rounded-none transition-all inline-flex items-center gap-2 ${
                  mode === 'issuance'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-card border border-border hover:bg-muted'
                }`}
              >
                <CreditCardIcon className="w-4 h-4" /> Issuance
              </button>
              <button onClick={() => { loadConfig(activeType); loadRecords(activeType); }} className="px-4 py-2.5 text-xs font-black uppercase tracking-widest bg-card border border-border hover:bg-muted rounded-none transition-all inline-flex items-center gap-2">
                <ArrowPathIcon className="w-4 h-4" /> Refresh
              </button>
            </div>
          </div>
        </div>

        {mode === 'design' && (
          <div className="grid sm:grid-cols-3 gap-4">
            {([
              { type: 'student', label: 'Student Builder', desc: 'Configure student access cards' },
              { type: 'parent', label: 'Parent Builder', desc: 'Configure parent access cards' },
              { type: 'teacher', label: 'Teacher Builder', desc: 'Configure teacher access cards' },
            ] as Array<{ type: CardType; label: string; desc: string }>).map((item) => (
              <article key={item.type} className="bg-card border border-border rounded-none p-5 space-y-3">
                <h3 className="text-lg font-black">{item.label}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
                <Link
                  href={`/dashboard/students/card-builder?type=${item.type}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-widest bg-orange-600 hover:bg-orange-500 text-white rounded-none transition-all"
                >
                  <SparklesIcon className="w-4 h-4" /> Open Builder
                </Link>
              </article>
            ))}
          </div>
        )}

        {mode === 'issuance' && (
          <>
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-3">
          <div className="flex flex-wrap gap-2">
            {([
              { key: 'student', label: 'Students', icon: UserGroupIcon },
              { key: 'parent', label: 'Parents', icon: UserPlusIcon },
              { key: 'teacher', label: 'Teachers', icon: AcademicCapIcon },
            ] as Array<{ key: CardType; label: string; icon: any }>).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveType(tab.key)}
                className={`px-4 py-2.5 text-xs font-black uppercase tracking-widest rounded-none border transition-all inline-flex items-center gap-2 ${
                  activeType === tab.key
                    ? 'bg-orange-500/15 border-orange-500/30 text-orange-400'
                    : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <tab.icon className="w-4 h-4" /> {tab.label}
              </button>
            ))}
          </div>
          <div className="relative w-full xl:w-80">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, school..."
              className="w-full pl-9 pr-3 py-2.5 bg-card border border-border rounded-none text-sm focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border rounded-none p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
            {filtered.length} card holder{filtered.length === 1 ? '' : 's'} ready
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => printCards(filtered, `${activeType} access cards`)}
              className="px-4 py-2.5 text-xs font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 text-white rounded-none transition-all inline-flex items-center gap-2"
            >
              <PrinterIcon className="w-4 h-4" /> Print Bulk
            </button>
          </div>
        </div>

        {error && <div className="p-4 bg-rose-500/10 border border-rose-500/25 text-rose-400 rounded-none text-sm font-bold">{error}</div>}

        {loading ? (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-44 bg-card border border-border rounded-none animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((r) => (
              <article key={r.id} className="bg-card border border-border rounded-none overflow-hidden group hover:border-orange-500/30 transition-all">
                <div className="h-1.5" style={{ backgroundColor: config.accentColor }} />
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-black leading-tight line-clamp-2">{r.name}</h3>
                    <span className="text-[10px] px-2 py-1 border border-border bg-background uppercase tracking-widest font-black text-muted-foreground whitespace-nowrap">
                      {r.roleLabel}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1.5">
                    <p className="truncate"><span className="font-black text-foreground/70">Email:</span> {r.email}</p>
                    <p className="truncate"><span className="font-black text-foreground/70">School:</span> {r.school}</p>
                    <p className="truncate"><span className="font-black text-foreground/70">Tag:</span> {r.badge}</p>
                  </div>
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      onClick={() => printCards([r], `${r.name} access card`)}
                      className="flex-1 px-3 py-2.5 text-[11px] font-black uppercase tracking-widest bg-orange-600 hover:bg-orange-500 text-white rounded-none transition-all inline-flex items-center justify-center gap-2"
                    >
                      <CreditCardIcon className="w-4 h-4" /> Print Card
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}

