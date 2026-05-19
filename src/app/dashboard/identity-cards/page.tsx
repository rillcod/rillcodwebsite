'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import {
  CreditCardIcon, UserGroupIcon, UserPlusIcon, AcademicCapIcon,
  MagnifyingGlassIcon, PrinterIcon, ArrowPathIcon, SparklesIcon,
  FunnelIcon, ChevronDownIcon,
} from '@/lib/icons';

// ─── Types ────────────────────────────────────────────────────────────────────

type CardType    = 'student' | 'parent' | 'teacher';
type GroupMode   = 'none' | 'class';
type StatusFilter = 'all' | 'active' | 'unissued' | 'revoked' | 'expired';

type CardConfig = {
  accentColor?: string;
  orgName?: string;
  orgWebsite?: string;
  footerLeft?: string;
  footerRight?: string;
  cardLabel?: string;
  headerStyle?: 'band' | 'border' | 'minimal';
  fields?: Array<{ key: string; visible: boolean; label?: string }>;
  width?: string;
  height?: string;
  cornerRadius?: 'sharp' | 'rounded' | 'pill';
  bgColor?: string;
  cardOrientation?: 'portrait' | 'landscape';
  showLogo?: boolean;
};

type PortalUser = {
  id: string; full_name: string; email: string | null;
  role: string; school_name?: string | null; section_class?: string | null;
};
type ParentUser = {
  id: string; full_name: string; email: string; phone?: string | null;
  children?: Array<{ id: string; full_name: string; school_name?: string | null }>;
};
type DbCard = {
  id: string; card_number: string; verification_code: string;
  status: string; issued_at: string | null; expires_at: string | null;
  holder_id: string; holder_type: string;
};
type CardRecord = {
  id: string; name: string; email: string; roleLabel: string;
  school: string; badge: string; sectionClass: string;
  profileUrl: string; schoolId: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const FALLBACK_CONFIG: Required<CardConfig> = {
  accentColor: '#1A3A8F', orgName: 'RILLCOD TECHNOLOGIES',
  orgWebsite: 'www.rillcod.com', footerLeft: 'rillcod.com/login',
  footerRight: 'Student ID', cardLabel: 'Access Card',
  headerStyle: 'band', fields: [], width: '54mm', height: '85.6mm',
  cornerRadius: 'sharp', bgColor: '#ffffff', cardOrientation: 'portrait',
  showLogo: true,
};

const STATUS_META: Record<string, { label: string; color: string; bar: string }> = {
  active:   { label: 'Active',    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25', bar: 'bg-emerald-500' },
  revoked:  { label: 'Revoked',   color: 'text-rose-400 bg-rose-500/10 border-rose-500/25',         bar: 'bg-rose-500'   },
  expired:  { label: 'Expired',   color: 'text-amber-400 bg-amber-500/10 border-amber-500/25',       bar: 'bg-amber-500'  },
  unissued: { label: 'Not issued', color: 'text-[#52525b] bg-[#18181b] border-[#27272a]',            bar: 'bg-[#27272a]'  },
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function IdentityCardsPage() {
  const { profile, isLoading } = useAuth() as any;
  const searchParams = useSearchParams();

  const [activeType,       setActiveType]       = useState<CardType>('student');
  const [query,            setQuery]            = useState('');
  const [loading,          setLoading]          = useState(false);
  const [config,           setConfig]           = useState<Required<CardConfig>>(FALLBACK_CONFIG);
  const [records,          setRecords]          = useState<CardRecord[]>([]);
  const [error,            setError]            = useState<string | null>(null);
  const [selectedIds,      setSelectedIds]      = useState<Set<string>>(new Set());
  const [dbCardsMap,       setDbCardsMap]       = useState<Map<string, DbCard>>(new Map());
  const [isIssuingIds,     setIsIssuingIds]     = useState<Set<string>>(new Set());
  const [isRevokingIds,    setIsRevokingIds]    = useState<Set<string>>(new Set());
  const [bulkIssuing,      setBulkIssuing]      = useState(false);
  const [bulkProgress,     setBulkProgress]     = useState<{ done: number; total: number } | null>(null);
  const [selectedClass,    setSelectedClass]    = useState<string>('all');
  const [selectedSchool,   setSelectedSchool]   = useState<string>('all');
  const [statusFilter,     setStatusFilter]     = useState<StatusFilter>('all');
  const [groupMode,        setGroupMode]        = useState<GroupMode>('none');
  const [showFilters,      setShowFilters]      = useState(false);

  const isAdmin   = profile?.role === 'admin';
  const isTeacher = profile?.role === 'teacher';
  const isSchool  = profile?.role === 'school';
  const canAccess = isAdmin || isTeacher || isSchool;
  const canDesign = isAdmin || isTeacher;
  const canViewTeacherCards = isAdmin;
  const schoolLock = isSchool ? String(profile?.school_name || '').trim() : '';

  // ─── Data loading ──────────────────────────────────────────────────────────

  const loadConfig = useCallback(async (type: CardType) => {
    try {
      const res  = await fetch(`/api/admin/settings?type=${type}`, { cache: 'no-store' });
      const json = await res.json();
      setConfig({ ...FALLBACK_CONFIG, ...(json?.config || {}) } as any);
    } catch { setConfig(FALLBACK_CONFIG); }
  }, []);

  const loadCards = useCallback(async (type: CardType) => {
    try {
      const res  = await fetch(`/api/cards?holder_type=${type}`, { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      const map  = new Map<string, DbCard>();
      for (const c of json.data ?? []) {
        if (c.holder_id && !map.has(c.holder_id)) map.set(c.holder_id, c);
      }
      setDbCardsMap(map);
    } catch { /* silent */ }
  }, []);

  const loadRecords = useCallback(async (type: CardType) => {
    setLoading(true);
    setError(null);
    setSelectedClass('all');
    setSelectedSchool('all');
    try {
      if (type === 'parent') {
        const res  = await fetch(isSchool ? '/api/portal-users?role=parent&scoped=true' : '/api/parents/manage', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Failed to load parents');
        const rows: ParentUser[] = json?.data || [];
        setRecords(rows.map(r => ({
          id: r.id, name: r.full_name || 'Unknown', email: r.email || 'N/A',
          roleLabel: 'Parent',
          school: r.children?.[0]?.school_name || (r as any).school_name || 'Rillcod Academy',
          badge: r.children ? `${r.children.length} child${r.children.length === 1 ? '' : 'ren'}` : 'Parent',
          sectionClass: '', profileUrl: `${window.location.origin}/dashboard/parent-feedback`, schoolId: null,
        })));
      } else {
        const res  = await fetch(`/api/portal-users?role=${type}&scoped=true`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `Failed to load ${type}s`);
        const rows: PortalUser[] = json?.data || [];
        setRecords(rows.map(r => ({
          id: r.id, name: r.full_name || 'Unknown', email: r.email || 'N/A',
          roleLabel: type === 'teacher' ? 'Teacher' : 'Student',
          school: r.school_name || 'Rillcod Academy',
          badge: r.section_class || (type === 'teacher' ? 'Staff' : 'Student'),
          sectionClass: r.section_class || '',
          profileUrl: `${window.location.origin}/dashboard/profile`,
          schoolId: (r as any).school_id ?? null,
        })));
      }
    } catch (e: any) {
      setRecords([]);
      setError(e?.message || 'Failed to load card holders');
    } finally {
      setLoading(false);
    }
  }, [isSchool]);

  useEffect(() => {
    if (!canAccess) return;
    loadConfig(activeType);
    loadRecords(activeType);
    loadCards(activeType);
    setSelectedIds(new Set());
    setStatusFilter('all');
  }, [activeType, canAccess, loadConfig, loadRecords, loadCards]);

  useEffect(() => {
    const t = (searchParams.get('type') || '').toLowerCase() as CardType;
    if (['student', 'parent', 'teacher'].includes(t)) {
      if (t === 'teacher' && !canViewTeacherCards) return;
      setActiveType(t);
    }
  }, [searchParams, canViewTeacherCards]);

  useEffect(() => { setSelectedIds(new Set()); }, [query, selectedClass, selectedSchool, statusFilter]);

  // ─── Card actions ──────────────────────────────────────────────────────────

  const issueCard = async (record: CardRecord) => {
    setIsIssuingIds(prev => new Set(prev).add(record.id));
    try {
      const res = await fetch('/api/cards', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holder_type: activeType, holder_id: record.id, school_id: record.schoolId }),
      });
      if (!res.ok) { const j = await res.json(); toast.error(j.error || 'Failed to issue card'); return; }
      toast.success(`Card issued for ${record.name}`);
      await loadCards(activeType);
    } catch (e: any) { toast.error(e.message || 'Error issuing card'); }
    finally { setIsIssuingIds(prev => { const s = new Set(prev); s.delete(record.id); return s; }); }
  };

  const updateCardStatus = async (record: CardRecord, dbCard: DbCard, newStatus: 'active' | 'revoked') => {
    setIsRevokingIds(prev => new Set(prev).add(record.id));
    try {
      const res = await fetch(`/api/cards/${dbCard.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) { const j = await res.json(); toast.error(j.error || 'Failed'); return; }
      toast.success(newStatus === 'revoked' ? `Card revoked for ${record.name}` : `Card reactivated for ${record.name}`);
      await loadCards(activeType);
    } catch (e: any) { toast.error(e.message || 'Error'); }
    finally { setIsRevokingIds(prev => { const s = new Set(prev); s.delete(record.id); return s; }); }
  };

  // ─── Print ────────────────────────────────────────────────────────────────

  const printCards = (list: CardRecord[], title: string) => {
    if (!list.length) { toast.error('No records to print.'); return; }
    const { accentColor: acc, orgName: org, orgWebsite: site, footerLeft: foot,
            headerStyle: hStyle, cardLabel, width: cardW, height: cardH, bgColor: bgCol } = config;
    const logo         = `${window.location.origin}/images/logo.png`;
    const showExpiry   = config.fields?.find(f => f.key === 'expiry')?.visible ?? false;
    const expiryLabel  = config.fields?.find(f => f.key === 'expiry')?.label || 'Expiry';

    const html = `<!doctype html><html><head><title>${title}</title>
<style>
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:Inter,system-ui,sans-serif; color:#111827; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .section-title { font-size:3.5mm; font-weight:900; text-transform:uppercase; letter-spacing:.3mm; color:${acc}; border-bottom:.5mm solid ${acc}40; padding-bottom:2mm; margin:6mm 0 4mm; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,${cardW}); gap:6mm; justify-content:start; }
  .card { width:${cardW}; height:${cardH}; border:1px solid #e5e7eb; display:flex; flex-direction:column; overflow:hidden; background:${bgCol}; }
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
  .row { margin:.8mm 0; } .lbl { color:#9ca3af; font-size:1.6mm; text-transform:uppercase; letter-spacing:.15mm; }
  .val { font-size:2.2mm; font-weight:700; }
  .badge { display:inline-block; background:${acc}15; border:1px solid ${acc}40; color:${acc}; font-size:1.7mm; font-weight:800; padding:.6mm 1.4mm; margin-top:1mm; }
  .right { width:23mm; background:#fafafa; padding:2mm; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:1mm; }
  .qr { width:16mm; height:16mm; border:1px solid #e5e7eb; }
  .code { color:${acc}; font-size:1.6mm; font-family:monospace; font-weight:900; text-align:center; }
  .ftr { border-top:1px solid #f3f4f6; background:#fafafa; color:#6b7280; display:flex; justify-content:space-between; padding:1.3mm 3mm; font-size:1.6mm; }
</style></head><body>
${title ? `<div style="font-size:4mm;font-weight:900;text-transform:uppercase;letter-spacing:.3mm;margin-bottom:5mm;color:#111;">${title}</div>` : ''}
<div class="grid">
${list.map(r => {
  const dbCard   = dbCardsMap.get(r.id);
  const code     = dbCard?.card_number ?? `RC-${r.id.slice(0, 8).toUpperCase()}`;
  const verifyUrl = dbCard?.verification_code ? `${window.location.origin}/verify/${dbCard.verification_code}` : r.profileUrl;
  const qr       = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(verifyUrl)}`;
  const hdrClass = hStyle === 'border' ? 'hdr-border' : hStyle === 'minimal' ? 'hdr-min' : 'hdr-band';
  return `<div class="card">
  <div class="${hdrClass}"><img class="logo" src="${logo}" /><div><div class="org">${org}</div><div class="web">${site}</div></div></div>
  <div class="body"><div class="left">
    <div class="school">${r.school}</div><div class="name">${r.name}</div>
    <div class="row"><div class="lbl">Role</div><div class="val">${r.roleLabel}</div></div>
    <div class="row"><div class="lbl">Email</div><div class="val">${r.email}</div></div>
    ${r.sectionClass ? `<div class="row"><div class="lbl">Class</div><div class="val">${r.sectionClass}</div></div>` : ''}
    ${showExpiry && dbCard?.expires_at ? `<div class="row"><div class="lbl">${expiryLabel}</div><div class="val" style="color:${acc}">${new Date(dbCard.expires_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div></div>` : ''}
    <div class="badge">${r.badge}</div>
  </div><div class="right"><img class="qr" src="${qr}" /><div class="code">${code}</div></div></div>
  <div class="ftr"><span>${foot}</span><span>${cardLabel}</span></div>
</div>`;
}).join('')}
</div>
<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),500)};</script>
</body></html>`;
    const win = window.open('', '_blank');
    if (!win) { toast.error('Pop-up blocked — allow pop-ups to print.'); return; }
    win.document.write(html);
    win.document.close();
  };

  // ─── Derived data ──────────────────────────────────────────────────────────

  const allClasses = useMemo(() => {
    const s = new Set<string>();
    records.forEach(r => { if (r.sectionClass) s.add(r.sectionClass); });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [records]);

  const allSchools = useMemo(() => {
    const s = new Set<string>();
    records.forEach(r => { if (r.school) s.add(r.school); });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [records]);

  const cardStatus = (r: CardRecord): string => {
    const c = dbCardsMap.get(r.id);
    return c ? c.status : 'unissued';
  };

  const counts = useMemo(() => {
    let issued = 0, unissued = 0, revoked = 0, expired = 0;
    records.forEach(r => {
      const s = cardStatus(r);
      if (s === 'active') issued++;
      else if (s === 'unissued') unissued++;
      else if (s === 'revoked') revoked++;
      else if (s === 'expired') expired++;
    });
    return { total: records.length, issued, unissued, revoked, expired };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, dbCardsMap]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records
      .filter(r => {
        const matchQ      = !q || [r.name, r.email, r.school, r.badge, r.sectionClass].some(v => (v || '').toLowerCase().includes(q));
        const matchClass  = selectedClass === 'all' || r.sectionClass === selectedClass;
        const matchSchool = schoolLock ? (r.school || '') === schoolLock : selectedSchool === 'all' || (r.school || '') === selectedSchool;
        const matchStatus = statusFilter === 'all' || cardStatus(r) === statusFilter;
        return matchQ && matchClass && matchSchool && matchStatus;
      })
      .sort((a, b) => {
        const ca = a.sectionClass || 'zzz', cb = b.sectionClass || 'zzz';
        const cc = ca.localeCompare(cb);
        return cc !== 0 ? cc : a.name.localeCompare(b.name);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, query, selectedClass, selectedSchool, statusFilter, schoolLock, dbCardsMap]);

  const grouped = useMemo(() => {
    const map = new Map<string, CardRecord[]>();
    filtered.forEach(r => {
      const key = r.sectionClass || '— No Class —';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const toggleSelected = (id: string) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const bulkIssueList = async (list: CardRecord[]) => {
    const unissued = list.filter(r => !dbCardsMap.has(r.id));
    if (!unissued.length) return;
    setBulkIssuing(true);
    setBulkProgress({ done: 0, total: unissued.length });
    let done = 0;
    const results = await Promise.allSettled(unissued.map(async r => {
      const res = await fetch('/api/cards', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holder_type: activeType, holder_id: r.id, school_id: r.schoolId }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed'); }
      done++;
      setBulkProgress({ done, total: unissued.length });
    }));
    const failed    = results.filter(r => r.status === 'rejected').length;
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    if (failed)    toast.error(`${failed} card(s) failed to issue`);
    if (succeeded) toast.success(`${succeeded} card(s) issued`);
    await loadCards(activeType);
    setBulkIssuing(false);
    setBulkProgress(null);
  };

  // ─── Guard ────────────────────────────────────────────────────────────────

  if (isLoading) return null;
  if (!canAccess) return (
    <div className="flex items-center justify-center min-h-screen text-[#71717a]">
      <div className="text-center"><CreditCardIcon className="w-8 h-8 mx-auto mb-3 text-rose-400" />
        <p className="font-semibold text-white">Card Studio access is for staff only</p>
      </div>
    </div>
  );

  // ─── Card preview component ───────────────────────────────────────────────

  const CardPreview = ({ r }: { r: CardRecord }) => {
    const dbCard     = dbCardsMap.get(r.id);
    const status     = dbCard ? dbCard.status : 'unissued';
    const sm         = STATUS_META[status] || STATUS_META.unissued;
    const isSelected = selectedIds.has(r.id);
    const isIssuing  = isIssuingIds.has(r.id);
    const isRevoking = isRevokingIds.has(r.id);
    const acc        = config.accentColor;
    const hStyle     = config.headerStyle;
    const code       = dbCard?.card_number ?? `RC-${r.id.slice(0, 8).toUpperCase()}`;
    const verifyUrl  = dbCard?.verification_code ? `${window.location.origin}/verify/${dbCard.verification_code}` : r.profileUrl;
    const qr         = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(verifyUrl)}`;
    const showExpiry = config.fields?.find(f => f.key === 'expiry')?.visible ?? false;
    const expiryLabel = config.fields?.find(f => f.key === 'expiry')?.label || 'Expiry';
    const expiryVal  = dbCard?.expires_at ? new Date(dbCard.expires_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

    return (
      <div className={`flex flex-col rounded-xl overflow-hidden border transition-all ${isSelected ? 'border-[#f5a623] ring-1 ring-[#f5a623]/40' : 'border-[#27272a] hover:border-[#3f3f46]'}`}>
        {/* Status strip */}
        <div className={`h-1 w-full ${sm.bar}`} />

        {/* Mini card preview */}
        <div className="flex-1 bg-white text-[#111827]" style={{ fontFamily: 'Inter, system-ui, sans-serif', backgroundColor: config.bgColor || '#fff' }}>
          {hStyle === 'band' && (
            <div style={{ background: acc, padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 18, height: 18, background: 'rgba(255,255,255,0.25)', borderRadius: 2, flexShrink: 0 }} />
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 8, fontWeight: 900, color: '#fff', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{config.orgName}</div>
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
          <div style={{ display: 'flex', minHeight: 80 }}>
            <div style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3, borderRight: '1px solid #f3f4f6', overflow: 'hidden' }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: '#111', textTransform: 'uppercase', lineHeight: 1.2, wordBreak: 'break-word' }}>{r.name}</div>
              <div style={{ fontSize: 7, fontWeight: 700, color: acc, textTransform: 'uppercase', letterSpacing: 0.5 }}>{r.roleLabel}</div>
              <div style={{ height: 1, background: '#f3f4f6', margin: '2px 0' }} />
              <div><div style={{ fontSize: 6, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700 }}>School</div>
                <div style={{ fontSize: 8, fontWeight: 800, fontFamily: 'monospace', color: acc, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.school}</div>
              </div>
              {r.sectionClass && (
                <div><div style={{ fontSize: 6, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700 }}>Class</div>
                  <div style={{ fontSize: 8, fontWeight: 700, color: '#111' }}>{r.sectionClass}</div>
                </div>
              )}
              {showExpiry && (
                <div><div style={{ fontSize: 6, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700 }}>{expiryLabel}</div>
                  <div style={{ fontSize: 8, fontWeight: 700, fontFamily: 'monospace', color: acc }}>{expiryVal}</div>
                </div>
              )}
              <div style={{ marginTop: 2, display: 'inline-block', background: `${acc}18`, border: `1px solid ${acc}40`, color: acc, fontSize: 6, fontWeight: 800, padding: '1px 5px', textTransform: 'uppercase' }}>{r.badge}</div>
            </div>
            <div style={{ width: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '6px 4px', background: '#fafafa', flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="" style={{ width: 42, height: 42, border: '1px solid #e5e7eb' }} />
              <div style={{ fontSize: 6, fontWeight: 900, fontFamily: 'monospace', color: acc, textAlign: 'center', wordBreak: 'break-all' }}>{code}</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 10px', borderTop: '1px solid #f3f4f6', fontSize: 6, color: '#9ca3af', fontWeight: 600, background: '#fafafa' }}>
            <span>{config.footerLeft}</span>
            <span style={{ fontFamily: 'monospace', color: '#374151', fontWeight: 900 }}>{config.cardLabel}</span>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-1.5 p-2 bg-[#0f0f11] border-t border-[#1c1c1f]">
          {/* Select checkbox */}
          <button
            onClick={() => toggleSelected(r.id)}
            title={isSelected ? 'Deselect' : 'Select'}
            className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-[#f5a623] border-[#f5a623] text-[#09090b]' : 'border-[#27272a] text-[#52525b] hover:border-[#f5a623]/50 hover:text-[#f5a623]'}`}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              {isSelected && <path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
              {!isSelected && <rect x="1" y="1" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1" />}
            </svg>
          </button>

          {/* Print */}
          <button
            onClick={() => printCards([r], `${r.name} — Access Card`)}
            title="Print this card"
            className="w-7 h-7 rounded-lg border border-[#27272a] text-[#71717a] hover:text-white hover:border-[#52525b] flex items-center justify-center shrink-0 transition-colors"
          >
            <PrinterIcon className="w-3.5 h-3.5" />
          </button>

          {/* Status + action */}
          <div className="flex-1 flex items-center justify-end gap-1.5">
            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md border ${sm.color}`}>
              {sm.label}
            </span>
            {!dbCard && (
              <button
                onClick={() => issueCard(r)}
                disabled={isIssuing}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#f5a623] text-[#09090b] text-[10px] font-black uppercase tracking-wide hover:bg-[#fcd34d] disabled:opacity-50 transition-colors"
              >
                {isIssuing ? <span className="w-2.5 h-2.5 border border-[#09090b] border-t-transparent rounded-full animate-spin" /> : '+'}
                Issue
              </button>
            )}
            {dbCard?.status === 'revoked' && (
              <button
                onClick={() => updateCardStatus(r, dbCard, 'active')}
                disabled={isRevoking}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-wide hover:bg-emerald-500/25 disabled:opacity-50 transition-colors"
              >
                {isRevoking ? <span className="w-2.5 h-2.5 border border-emerald-400 border-t-transparent rounded-full animate-spin" /> : '↑'}
                Restore
              </button>
            )}
            {dbCard?.status === 'active' && (
              <button
                onClick={() => { if (confirm(`Revoke card for ${r.name}?`)) updateCardStatus(r, dbCard, 'revoked'); }}
                disabled={isRevoking}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-400 text-[10px] font-black uppercase tracking-wide hover:bg-rose-500/20 disabled:opacity-50 transition-colors"
              >
                {isRevoking ? <span className="w-2.5 h-2.5 border border-rose-400 border-t-transparent rounded-full animate-spin" /> : '×'}
                Revoke
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const CardGrid = ({ list }: { list: CardRecord[] }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {list.map(r => <CardPreview key={r.id} r={r} />)}
    </div>
  );

  const typeCount = (t: CardType) => {
    if (t !== activeType) return null;
    return records.length;
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-[#09090b] text-white overflow-hidden">

      {/* ── Top bar ───────────────────────────────────────────────────────────── */}
      <div className="flex-none border-b border-[#27272a] bg-[#0f0f11]">

        {/* Row 1: title + type tabs + search + actions */}
        <div className="flex items-center gap-3 px-4 py-2.5 overflow-x-auto scrollbar-none">
          <span className="text-xs font-black uppercase tracking-widest text-[#f5a623] shrink-0">Card Studio</span>

          {/* Type tabs */}
          <div className="flex gap-1 shrink-0">
            {([
              { key: 'student' as CardType, label: 'Students', icon: UserGroupIcon },
              { key: 'parent'  as CardType, label: 'Parents',  icon: UserPlusIcon },
              ...(canViewTeacherCards ? [{ key: 'teacher' as CardType, label: 'Teachers', icon: AcademicCapIcon }] : []),
            ]).map(tab => {
              const Icon = tab.icon;
              return (
                <button key={tab.key} onClick={() => setActiveType(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${activeType === tab.key ? 'bg-[#f5a623]/15 border-[#f5a623]/30 text-[#f5a623]' : 'bg-transparent border-[#27272a] text-[#71717a] hover:text-white hover:border-[#3f3f46]'}`}>
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {activeType === tab.key && records.length > 0 && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[#27272a] text-[#a1a1aa]">{records.length}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative shrink-0 w-52">
            <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#52525b]" />
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search name, class, school…"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#18181b] border border-[#27272a] rounded-lg text-white placeholder-[#52525b] focus:outline-none focus:border-[#f5a623]/50" />
          </div>

          <div className="ml-auto flex items-center gap-2 shrink-0">
            {/* Filter toggle */}
            <button onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${showFilters ? 'bg-[#f5a623]/10 border-[#f5a623]/30 text-[#f5a623]' : 'border-[#27272a] text-[#71717a] hover:text-white'}`}>
              <FunnelIcon className="w-3.5 h-3.5" />
              Filters
            </button>
            {/* Design / Card Builder */}
            {canDesign && (
              <Link href={`/dashboard/students/card-builder?type=${activeType}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-[#27272a] text-[#71717a] hover:text-white hover:border-[#f5a623]/40 transition-colors">
                <SparklesIcon className="w-3.5 h-3.5" /> Design
              </Link>
            )}
            {/* Refresh */}
            <button onClick={() => { loadConfig(activeType); loadRecords(activeType); loadCards(activeType); }}
              className="p-1.5 rounded-lg border border-[#27272a] text-[#71717a] hover:text-white transition-colors">
              <ArrowPathIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Row 2: stats strip */}
        <div className="flex items-center gap-2 px-4 pb-2 overflow-x-auto scrollbar-none">
          {[
            { label: 'Total',    value: counts.total,    color: 'text-white'         },
            { label: 'Issued',   value: counts.issued,   color: 'text-emerald-400'   },
            { label: 'Unissued', value: counts.unissued, color: 'text-[#71717a]'     },
            { label: 'Revoked',  value: counts.revoked,  color: 'text-rose-400'      },
            { label: 'Expired',  value: counts.expired,  color: 'text-amber-400'     },
          ].map(s => (
            <button key={s.label} onClick={() => setStatusFilter(s.label.toLowerCase() as StatusFilter === 'total' as any ? 'all' : s.label.toLowerCase() as StatusFilter)}
              className={`shrink-0 px-3 py-1 rounded-lg text-center min-w-[52px] border transition-colors ${statusFilter === (s.label === 'Total' ? 'all' : s.label.toLowerCase()) ? 'bg-[#27272a] border-[#3f3f46]' : 'bg-[#18181b] border-[#27272a] hover:border-[#3f3f46]'}`}>
              <div className={`text-sm font-black ${s.color}`}>{s.value}</div>
              <div className="text-[9px] text-[#52525b] uppercase tracking-wide">{s.label}</div>
            </button>
          ))}

          {/* Bulk actions */}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {filtered.length > 0 && selectedIds.size === 0 && (
              <button onClick={() => setSelectedIds(new Set(filtered.map(r => r.id)))}
                className="px-3 py-1 text-[10px] font-black uppercase tracking-wide border border-[#27272a] text-[#71717a] hover:text-white rounded-lg transition-colors">
                Select all ({filtered.length})
              </button>
            )}
            {selectedIds.size > 0 && (
              <>
                <button onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-1 text-[10px] font-black uppercase tracking-wide border border-[#27272a] text-[#71717a] hover:text-white rounded-lg transition-colors">
                  Clear ({selectedIds.size})
                </button>
                <button onClick={() => printCards(filtered.filter(r => selectedIds.has(r.id)), `Selected ${activeType} cards`)}
                  className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-black uppercase tracking-wide bg-[#f5a623] text-[#09090b] hover:bg-[#fcd34d] rounded-lg transition-colors">
                  <PrinterIcon className="w-3 h-3" /> Print ({selectedIds.size})
                </button>
              </>
            )}
            {filtered.some(r => !dbCardsMap.has(r.id)) && (
              <button disabled={bulkIssuing} onClick={() => bulkIssueList(filtered)}
                className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-black uppercase tracking-wide border border-[#f5a623]/30 text-[#f5a623] hover:bg-[#f5a623]/10 rounded-lg disabled:opacity-50 transition-colors">
                {bulkIssuing
                  ? <><span className="w-2.5 h-2.5 border border-[#f5a623] border-t-transparent rounded-full animate-spin" />{bulkProgress ? `${bulkProgress.done}/${bulkProgress.total}` : '…'}</>
                  : `Issue Missing (${filtered.filter(r => !dbCardsMap.has(r.id)).length})`}
              </button>
            )}
            <button onClick={() => printCards(filtered, `${activeType} access cards`)}
              className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-black uppercase tracking-wide border border-[#27272a] text-[#71717a] hover:text-emerald-400 hover:border-emerald-500/30 rounded-lg transition-colors">
              <PrinterIcon className="w-3 h-3" /> Print All
            </button>
          </div>
        </div>

        {/* Row 3: filters (collapsible) */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 px-4 pb-2.5 border-t border-[#1c1c1f] pt-2.5">
            {/* School filter */}
            {(allSchools.length > 1 && !schoolLock) && (
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-[#52525b]">School</span>
                <select value={selectedSchool} onChange={e => setSelectedSchool(e.target.value)}
                  className="text-xs bg-[#18181b] border border-[#27272a] rounded-lg px-2 py-1 text-[#a1a1aa] focus:outline-none">
                  <option value="all">All ({records.length})</option>
                  {allSchools.map(s => <option key={s} value={s}>{s} ({records.filter(r => r.school === s).length})</option>)}
                </select>
              </div>
            )}
            {/* Class filter */}
            {allClasses.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-[#52525b]">Class</span>
                <div className="flex gap-1 flex-wrap">
                  <button onClick={() => setSelectedClass('all')}
                    className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${selectedClass === 'all' ? 'bg-[#f5a623]/15 border-[#f5a623]/30 text-[#f5a623]' : 'border-[#27272a] text-[#71717a] hover:border-[#52525b]'}`}>
                    All
                  </button>
                  {allClasses.map(cls => (
                    <button key={cls} onClick={() => setSelectedClass(cls)}
                      className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${selectedClass === cls ? 'bg-[#f5a623]/15 border-[#f5a623]/30 text-[#f5a623]' : 'border-[#27272a] text-[#71717a] hover:border-[#52525b]'}`}>
                      {cls} <span className="text-[#52525b]">{records.filter(r => r.sectionClass === cls).length}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Group by class */}
            {activeType !== 'parent' && allClasses.length > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-[9px] font-black uppercase tracking-widest text-[#52525b]">Group</span>
                <button onClick={() => setGroupMode(g => g === 'none' ? 'class' : 'none')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-colors ${groupMode === 'class' ? 'bg-[#f5a623]/15 border-[#f5a623]/30 text-[#f5a623]' : 'border-[#27272a] text-[#71717a] hover:border-[#52525b]'}`}>
                  By Class
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Main content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/25 text-rose-400 rounded-xl text-sm font-bold">{error}</div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-52 bg-[#18181b] border border-[#27272a] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-center border border-dashed border-[#27272a] rounded-xl">
            <CreditCardIcon className="w-8 h-8 text-[#3f3f46]" />
            <div>
              <p className="text-sm font-semibold text-[#71717a]">No card holders found</p>
              <p className="text-xs text-[#52525b] mt-1">
                {query ? `No results for "${query}"` : `No ${activeType}s in your scope`}
              </p>
            </div>
            {query && (
              <button onClick={() => setQuery('')} className="text-xs font-black uppercase tracking-wide text-[#f5a623]">Clear search</button>
            )}
          </div>
        ) : groupMode === 'class' ? (
          <div className="space-y-6">
            {grouped.map(([cls, list]) => (
              <section key={cls}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-5 w-0.5 bg-[#f5a623] shrink-0" />
                  <h2 className="text-sm font-black uppercase tracking-widest text-white">{cls}</h2>
                  <span className="text-[10px] text-[#52525b]">{list.length} {activeType}{list.length !== 1 ? 's' : ''}</span>
                  <div className="ml-auto flex gap-2">
                    {list.some(r => !dbCardsMap.has(r.id)) && (
                      <button disabled={bulkIssuing} onClick={() => bulkIssueList(list)}
                        className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wide border border-[#f5a623]/30 text-[#f5a623] hover:bg-[#f5a623]/10 rounded-lg disabled:opacity-50 transition-colors">
                        Issue Missing ({list.filter(r => !dbCardsMap.has(r.id)).length})
                      </button>
                    )}
                    <button onClick={() => printCards(list, `Access Cards — ${cls}`)}
                      className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide border border-[#27272a] text-[#71717a] hover:text-white rounded-lg transition-colors">
                      <PrinterIcon className="w-3 h-3" /> Print Class
                    </button>
                  </div>
                </div>
                <CardGrid list={list} />
              </section>
            ))}
          </div>
        ) : (
          <CardGrid list={filtered} />
        )}
      </div>
    </div>
  );
}
