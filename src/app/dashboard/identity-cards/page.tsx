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
  FunnelIcon,
  Squares2X2Icon,
  ListBulletIcon,
} from '@/lib/icons';

type CardType = 'student' | 'parent' | 'teacher';
type StudioMode = 'issuance' | 'design';
type GroupMode = 'none' | 'class';

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
  /** Raw class/section value – used for grouping */
  sectionClass: string;
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Sorting / grouping state
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedSchool, setSelectedSchool] = useState<string>('all');
  const [groupMode, setGroupMode] = useState<GroupMode>('none');
  const [sortBy, setSortBy] = useState<'name' | 'class'>('name');

  const canAccess =
    profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';
  const canDesign = profile?.role === 'admin' || profile?.role === 'teacher';
  const canViewTeacherCards = profile?.role === 'admin';

  // ─── loaders ──────────────────────────────────────────────────────────────

  const loadConfig = async (type: CardType) => {
    try {
      const res = await fetch(`/api/admin/settings?type=${type}`, { cache: 'no-store' });
      const json = await res.json();
      const cfg = json?.config || {};
      setConfig({ ...FALLBACK_CONFIG, ...cfg });
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
      sectionClass: r.section_class || '',
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
      sectionClass: '',
      profileUrl: `${window.location.origin}/dashboard/parent-feedback`,
    }));

  const loadRecords = async (type: CardType) => {
    setLoading(true);
    setError(null);
    setSelectedClass('all');
    setSelectedSchool('all');
    try {
      if (type === 'parent') {
        if (profile?.role === 'school') {
          const res = await fetch('/api/portal-users?role=parent&scoped=true', { cache: 'no-store' });
          const json = await res.json();
          if (!res.ok) throw new Error(json?.error || 'Failed to load parents');
          const parentRows = (json?.data || []) as PortalUser[];
          setRecords(
            parentRows.map((r) => ({
              id: r.id,
              name: r.full_name || 'Unknown',
              email: r.email || 'N/A',
              roleLabel: 'Parent',
              school: r.school_name || 'Rillcod Academy',
              badge: 'Parent',
              sectionClass: '',
              profileUrl: `${window.location.origin}/dashboard/parent-feedback`,
            })),
          );
        } else {
          const res = await fetch('/api/parents/manage', { cache: 'no-store' });
          const json = await res.json();
          if (!res.ok) throw new Error(json?.error || 'Failed to load parents');
          setRecords(mapParents(json?.data || []));
        }
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
      if (t === 'teacher' && !canViewTeacherCards) setActiveType('student');
      else setActiveType(t);
    }
    if (m === 'issuance' || m === 'design') {
      if (m === 'design' && !canDesign) setMode('issuance');
      else setMode(m);
    }
    if (q) setQuery(q);
  }, [searchParams, canDesign, canViewTeacherCards]);

  useEffect(() => {
    if (!canAccess) return;
    loadRecords(activeType);
  }, [activeType, canAccess]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeType, query, selectedClass, selectedSchool, groupMode, sortBy]);

  // ─── derived data ──────────────────────────────────────────────────────────

  /** All unique classes in the current record set, sorted alphabetically */
  const allClasses = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => { if (r.sectionClass) set.add(r.sectionClass); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [records]);

  const allSchools = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.school) set.add(r.school);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [records]);

  const schoolLock =
    profile?.role === 'school' ? String(profile.school_name || '').trim() : '';

  const showSchoolFilter =
    !!schoolLock ||
    ((profile?.role === 'admin' || profile?.role === 'teacher') && allSchools.length > 1);

  /** Records after search + class filter + sort */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    let list = records.filter((r) => {
      const matchSearch =
        !q ||
        [r.name, r.email, r.school, r.badge, r.roleLabel, r.sectionClass].some((v) =>
          (v || '').toLowerCase().includes(q),
        );
      const matchClass =
        selectedClass === 'all' || r.sectionClass === selectedClass;
      const matchSchool = (() => {
        if (schoolLock) return (r.school || '') === schoolLock;
        if (selectedSchool === 'all') return true;
        return (r.school || '') === selectedSchool;
      })();
      return matchSearch && matchClass && matchSchool;
    });

    // Sort
    list = [...list].sort((a, b) => {
      if (sortBy === 'class') {
        const classCmp = (a.sectionClass || 'zzz').localeCompare(b.sectionClass || 'zzz');
        return classCmp !== 0 ? classCmp : a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });

    return list;
  }, [records, query, selectedClass, selectedSchool, sortBy, schoolLock]);

  /** Records grouped by class (only used when groupMode === 'class') */
  const grouped = useMemo(() => {
    const map = new Map<string, CardRecord[]>();
    filtered.forEach((r) => {
      const key = r.sectionClass || '— No Class —';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // ─── print ────────────────────────────────────────────────────────────────

  const printCards = (list: CardRecord[], title: string) => {
    if (!list.length) { alert('No records to print.'); return; }
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
        .section-title { font-size:3.5mm; font-weight:900; text-transform:uppercase; letter-spacing:.3mm; color:${acc}; border-bottom:0.5mm solid ${acc}40; padding-bottom:2mm; margin:6mm 0 4mm; }
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
      ${title ? `<div style="font-size:4mm;font-weight:900;text-transform:uppercase;letter-spacing:.3mm;margin-bottom:5mm;color:#111;">${title}</div>` : ''}
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
                  ${r.sectionClass ? `<div class="row"><div class="lbl">Class</div><div class="val">${r.sectionClass}</div></div>` : ''}
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
    if (!win) { alert('Pop-up blocked. Please allow pop-ups for printing.'); return; }
    win.document.write(html);
    win.document.close();
  };

  const printByClass = (className: string) => {
    const list = filtered.filter((r) => r.sectionClass === className);
    printCards(list, `Access Cards — ${className}`);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── render ───────────────────────────────────────────────────────────────

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

  const CardGrid = ({ list }: { list: CardRecord[] }) => (
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
      {list.map((r) => {
        const isSelected = selectedIds.has(r.id);
        const acc = config.accentColor;
        const code = `RC-${r.id.slice(0, 8).toUpperCase()}`;
        const qr = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(r.profileUrl)}`;
        const hStyle = config.headerStyle;

        return (
          <article
            key={r.id}
            className={`rounded-none overflow-hidden transition-all flex flex-col ${
              isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'ring-1 ring-border hover:ring-primary/40'
            }`}
          >
            {/* ── Mini card preview (matches print output) ── */}
            <div className="bg-white text-[#111] shadow-sm flex-1" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
              {/* Header */}
              {hStyle === 'band' && (
                <div style={{ background: acc, padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 18, height: 18, background: 'rgba(255,255,255,0.25)', borderRadius: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: 8, fontWeight: 900, color: '#fff', textTransform: 'uppercase', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{config.orgName}</div>
                    <div style={{ fontSize: 6, color: 'rgba(255,255,255,0.8)', fontWeight: 700, marginTop: 1 }}>{config.orgWebsite}</div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.22)', color: '#fff', padding: '2px 6px', fontSize: 6, fontWeight: 900, textTransform: 'uppercase', flexShrink: 0 }}>{config.cardLabel}</div>
                </div>
              )}
              {hStyle === 'border' && (
                <div style={{ borderLeft: `3px solid ${acc}`, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 8, fontWeight: 900, color: '#111', textTransform: 'uppercase' }}>{config.orgName}</div>
                    <div style={{ fontSize: 6, color: acc, fontWeight: 700, marginTop: 1 }}>{config.orgWebsite}</div>
                  </div>
                  <div style={{ background: acc, color: '#fff', padding: '2px 6px', fontSize: 6, fontWeight: 900, textTransform: 'uppercase', flexShrink: 0 }}>{config.cardLabel}</div>
                </div>
              )}
              {hStyle === 'minimal' && (
                <div style={{ borderBottom: `2px solid ${acc}`, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, fontSize: 8, fontWeight: 900, color: '#111', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{config.orgName}</div>
                  <div style={{ fontSize: 7, fontWeight: 900, color: acc, textTransform: 'uppercase', flexShrink: 0 }}>{config.cardLabel}</div>
                </div>
              )}

              {/* Body */}
              <div style={{ display: 'flex', minHeight: 72 }}>
                <div style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3, borderRight: '1px solid #f3f4f6', overflow: 'hidden' }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: '#111', textTransform: 'uppercase', lineHeight: 1.2, wordBreak: 'break-word' }}>{r.name}</div>
                  <div style={{ fontSize: 7, fontWeight: 700, color: acc, textTransform: 'uppercase', letterSpacing: 0.5 }}>{r.roleLabel}</div>
                  <div style={{ height: 1, background: '#f3f4f6', margin: '2px 0' }} />
                  <div>
                    <div style={{ fontSize: 6, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>School</div>
                    <div style={{ fontSize: 8, fontWeight: 800, fontFamily: 'monospace', color: acc, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.school}</div>
                  </div>
                  {r.sectionClass && (
                    <div>
                      <div style={{ fontSize: 6, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>Class</div>
                      <div style={{ fontSize: 8, fontWeight: 700, color: '#111' }}>{r.sectionClass}</div>
                    </div>
                  )}
                  <div style={{ marginTop: 2, display: 'inline-block', background: `${acc}18`, border: `1px solid ${acc}40`, color: acc, fontSize: 6, fontWeight: 800, padding: '1px 5px', textTransform: 'uppercase' }}>{r.badge}</div>
                </div>
                <div style={{ width: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '6px 4px', background: '#fafafa', flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt="" style={{ width: 40, height: 40, border: '1px solid #e5e7eb' }} />
                  <div style={{ fontSize: 5, color: '#9ca3af', textAlign: 'center', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.3 }}>Scan</div>
                  <div style={{ fontSize: 6, fontWeight: 900, fontFamily: 'monospace', color: acc, textAlign: 'center', wordBreak: 'break-all' }}>{code}</div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 10px', borderTop: '1px solid #f3f4f6', fontSize: 6, color: '#9ca3af', fontWeight: 600, background: '#fafafa' }}>
                <span>{config.footerLeft}</span>
                <span style={{ fontFamily: 'monospace', color: '#374151', fontWeight: 900 }}>{config.cardLabel}</span>
              </div>
            </div>

            {/* ── Actions bar ── */}
            <div className="bg-card border-t border-border flex items-center gap-2 p-2">
              <label
                className="inline-flex items-center gap-1.5 px-2 py-1.5 border border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground cursor-pointer hover:bg-muted transition-colors flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelected(r.id)}
                  className="accent-primary w-3 h-3"
                />
                Sel
              </label>
              <button
                onClick={(e) => { e.stopPropagation(); printCards([r], `${r.name} access card`); }}
                className="flex-1 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-all inline-flex items-center justify-center gap-1.5 hover:opacity-90"
                style={{ backgroundColor: acc }}
              >
                <PrinterIcon className="w-3 h-3" /> Print
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6">

        {/* ── Header ── */}
        <div className="relative overflow-hidden border border-border bg-card rounded-none">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -right-24 -top-20 w-56 h-56 rounded-full bg-primary/8 blur-[80px]" />
            <div className="absolute -left-16 -bottom-16 w-48 h-48 rounded-full bg-primary/6 blur-[70px]" />
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          </div>
          <div className="relative p-5 sm:p-7">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-1 h-5 bg-primary flex-shrink-0" />
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Identity Management</p>
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Card Studio</h1>
                  <p className="text-muted-foreground mt-1.5 text-sm max-w-2xl leading-relaxed">
                    Design and issue official access cards for students, parents, and teachers. Search, filter by class or school, select individual records or entire classes, and bulk-print directly to PDF — all from one place.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 pt-1">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    <UserGroupIcon className="w-3.5 h-3.5 text-primary" />
                    Students
                  </span>
                  <span className="text-border">·</span>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    <UserPlusIcon className="w-3.5 h-3.5 text-primary" />
                    Parents
                  </span>
                  {canViewTeacherCards && (
                    <>
                      <span className="text-border">·</span>
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        <AcademicCapIcon className="w-3.5 h-3.5 text-primary" />
                        Teachers
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 lg:flex-col lg:items-end">
                <div className="flex gap-2">
                  {canDesign && (
                    <button
                      onClick={() => setMode('design')}
                      className={`px-4 py-2.5 text-xs font-black uppercase tracking-widest rounded-none transition-all inline-flex items-center gap-2 ${
                        mode === 'design'
                          ? 'bg-primary text-white shadow-lg shadow-primary/20'
                          : 'bg-card border border-border hover:bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <SparklesIcon className="w-4 h-4" /> Design
                    </button>
                  )}
                  <button
                    onClick={() => setMode('issuance')}
                    className={`px-4 py-2.5 text-xs font-black uppercase tracking-widest rounded-none transition-all inline-flex items-center gap-2 ${
                      mode === 'issuance'
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                        : 'bg-card border border-border hover:bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <CreditCardIcon className="w-4 h-4" /> Issuance
                  </button>
                </div>
                <button
                  onClick={() => { loadConfig(activeType); loadRecords(activeType); }}
                  className="px-4 py-2.5 text-xs font-black uppercase tracking-widest bg-card border border-border hover:bg-muted rounded-none transition-all inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
                >
                  <ArrowPathIcon className="w-4 h-4" /> Refresh
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Design mode ── */}
        {mode === 'design' && canDesign && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <SparklesIcon className="w-4 h-4 text-primary" />
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Card Design Templates — customise accent colour, header style, and organisation details</p>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              {([
                {
                  type: 'student',
                  label: 'Student Cards',
                  desc: 'Colour, header style, school name, and footer text for student access cards',
                  icon: UserGroupIcon,
                },
                {
                  type: 'parent',
                  label: 'Parent Cards',
                  desc: 'Separate card design for parents — different accent or header variant from student cards',
                  icon: UserPlusIcon,
                },
                ...(canViewTeacherCards
                  ? [{ type: 'teacher' as CardType, label: 'Teacher Cards', desc: 'Staff-only card design — customise teacher and administrator card layout', icon: AcademicCapIcon }]
                  : []),
              ] as Array<{ type: CardType; label: string; desc: string; icon: any }>).map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.type} className="bg-card border border-border rounded-none p-5 space-y-4 group hover:border-primary/30 transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-9 h-9 bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground bg-muted px-2 py-1 border border-border">
                        {item.type}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-base font-black">{item.label}</h3>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.desc}</p>
                    </div>
                    <Link
                      href={`/dashboard/students/card-builder?type=${item.type}`}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-widest bg-primary hover:bg-primary text-white rounded-none transition-all w-full justify-center"
                    >
                      <SparklesIcon className="w-3.5 h-3.5" /> Open Builder
                    </Link>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Issuance mode ── */}
        {mode === 'issuance' && (
          <>
            {/* Type tabs + search */}
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-3">
              <div className="flex flex-wrap gap-2">
                {([
                  { key: 'student', label: 'Students', icon: UserGroupIcon },
                  { key: 'parent',  label: 'Parents',  icon: UserPlusIcon },
                  ...(canViewTeacherCards ? [{ key: 'teacher' as CardType, label: 'Teachers', icon: AcademicCapIcon }] : []),
                ] as Array<{ key: CardType; label: string; icon: any }>).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveType(tab.key)}
                    className={`px-4 py-2.5 text-xs font-black uppercase tracking-widest rounded-none border transition-all inline-flex items-center gap-2 ${
                      activeType === tab.key
                        ? 'bg-primary/15 border-primary/30 text-primary'
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
                  placeholder="Search name, email, school, class..."
                  className="w-full pl-9 pr-3 py-2.5 bg-card border border-border rounded-none text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            {/* ── Class filter / sort / group toolbar ── */}
            <div className="flex flex-wrap items-center gap-3 bg-card border border-border rounded-none p-3 sm:p-4">
              <FunnelIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />

              {/* School filter (role-sensitive) */}
              {showSchoolFilter && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">School</span>
                  {schoolLock ? (
                    <span className="px-3 py-2 bg-background border border-border rounded-none text-xs font-bold text-foreground max-w-[220px] truncate" title={schoolLock}>
                      {schoolLock}
                    </span>
                  ) : (
                    <select
                      value={selectedSchool}
                      onChange={(e) => setSelectedSchool(e.target.value)}
                      className="px-3 py-2 bg-background border border-border rounded-none text-xs font-bold focus:outline-none focus:border-primary cursor-pointer max-w-[220px]"
                    >
                      <option value="all">All Schools ({records.length})</option>
                      {allSchools.map((sch) => {
                        const count = records.filter((r) => r.school === sch).length;
                        return (
                          <option key={sch} value={sch}>
                            {sch} ({count})
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>
              )}

              {/* Class filter dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">Class</span>
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="px-3 py-2 bg-background border border-border rounded-none text-xs font-bold focus:outline-none focus:border-primary cursor-pointer"
                >
                  <option value="all">All Classes ({records.length})</option>
                  {allClasses.map((cls) => {
                    const count = records.filter((r) => r.sectionClass === cls).length;
                    return (
                      <option key={cls} value={cls}>
                        {cls} ({count})
                      </option>
                    );
                  })}
                  {records.some((r) => !r.sectionClass) && (
                    <option value="">— No Class —</option>
                  )}
                </select>
              </div>

              {/* Sort */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">Sort</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'name' | 'class')}
                  className="px-3 py-2 bg-background border border-border rounded-none text-xs font-bold focus:outline-none focus:border-primary cursor-pointer"
                >
                  <option value="name">By Name</option>
                  <option value="class">By Class → Name</option>
                </select>
              </div>

              {/* Group toggle (only relevant for students/teachers who have classes) */}
              {activeType !== 'parent' && allClasses.length > 0 && (
                <div className="flex items-center gap-1 ml-auto">
                  <button
                    onClick={() => setGroupMode('none')}
                    title="Flat view"
                    className={`p-2 rounded-none border transition-all ${groupMode === 'none' ? 'bg-primary/15 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                  >
                    <Squares2X2Icon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setGroupMode('class')}
                    title="Group by class"
                    className={`p-2 rounded-none border transition-all ${groupMode === 'class' ? 'bg-primary/15 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                  >
                    <ListBulletIcon className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Stats + bulk print bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border rounded-none p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
                {filtered.length} card holder{filtered.length === 1 ? '' : 's'}
                {selectedSchool !== 'all' && !schoolLock && (
                  <span className="ml-2 text-primary">· {selectedSchool}</span>
                )}
                {selectedClass !== 'all' && selectedClass !== '' && (
                  <span className="ml-2 text-primary">in {selectedClass}</span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {filtered.length > 0 && (
                  <button
                    onClick={() => setSelectedIds(new Set(filtered.map((r) => r.id)))}
                    className="px-4 py-2.5 text-xs font-black uppercase tracking-widest bg-card border border-border hover:bg-muted rounded-none transition-all inline-flex items-center gap-2"
                  >
                    Select Filtered ({filtered.length})
                  </button>
                )}
                {selectedIds.size > 0 && (
                  <>
                    <button
                      onClick={() => {
                        const selected = filtered.filter((r) => selectedIds.has(r.id));
                        printCards(selected, `${activeType} access cards — selected`);
                      }}
                      className="px-4 py-2.5 text-xs font-black uppercase tracking-widest bg-primary hover:bg-primary text-white rounded-none transition-all inline-flex items-center gap-2"
                    >
                      <PrinterIcon className="w-4 h-4" />
                      Print Selected ({selectedIds.size})
                    </button>
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      className="px-4 py-2.5 text-xs font-black uppercase tracking-widest bg-card border border-border hover:bg-muted rounded-none transition-all inline-flex items-center gap-2"
                    >
                      Clear Selection
                    </button>
                  </>
                )}
                {/* Print filtered (or selected class) */}
                <button
                  onClick={() => {
                    const parts: string[] = [];
                    if (selectedSchool !== 'all' && !schoolLock) parts.push(selectedSchool);
                    if (selectedClass !== 'all') parts.push(selectedClass || 'No Class');
                    const title =
                      parts.length > 0 ? `Access Cards — ${parts.join(' · ')}` : `${activeType} access cards`;
                    printCards(filtered, title);
                  }}
                  className="px-4 py-2.5 text-xs font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 text-white rounded-none transition-all inline-flex items-center gap-2"
                >
                  <PrinterIcon className="w-4 h-4" />
                  {selectedClass !== 'all' ? `Print Class` : 'Print Bulk'}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/25 text-rose-400 rounded-none text-sm font-bold">{error}</div>
            )}

            {/* ── Card grid / grouped view ── */}
            {loading ? (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-44 bg-card border border-border rounded-none animate-pulse" />
                ))}
              </div>
            ) : !loading && filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4 text-center border border-border border-dashed bg-card">
                <CreditCardIcon className="w-10 h-10 text-muted-foreground/30" />
                <div>
                  <p className="text-sm font-black text-muted-foreground uppercase tracking-widest">No card holders found</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    {query ? `No results for "${query}". Try a different search term.` : `No ${activeType}s available under your access scope.`}
                  </p>
                </div>
                {query && (
                  <button onClick={() => setQuery('')} className="text-xs font-black uppercase tracking-widest text-primary hover:text-primary transition-colors">
                    Clear Search
                  </button>
                )}
              </div>
            ) : groupMode === 'class' ? (
              /* Grouped by class */
              <div className="space-y-8">
                {grouped.map(([className, classRecords]) => (
                  <section key={className}>
                    {/* Class section header */}
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-1 h-6 flex-shrink-0"
                          style={{ backgroundColor: config.accentColor }}
                        />
                        <div>
                          <h2 className="text-base font-black uppercase tracking-widest">{className}</h2>
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                            {classRecords.length} student{classRecords.length === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          className === '— No Class —'
                            ? printCards(classRecords, 'Access Cards — No Class')
                            : printByClass(className)
                        }
                        className="px-3 py-2 text-[11px] font-black uppercase tracking-widest border border-border hover:bg-muted rounded-none transition-all inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
                      >
                        <PrinterIcon className="w-3.5 h-3.5" /> Print Class
                      </button>
                    </div>
                    <CardGrid list={classRecords} />
                  </section>
                ))}
              </div>
            ) : (
              /* Flat grid */
              <CardGrid list={filtered} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
