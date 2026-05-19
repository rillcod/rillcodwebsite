'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  PaintBrushIcon, CreditCardIcon, PrinterIcon, ArrowDownTrayIcon,
  CheckCircleIcon, ArrowUpIcon, ArrowDownIcon,
  MagnifyingGlassIcon, ChevronDownIcon, ChevronUpIcon,
} from '@/lib/icons';

// ─── Types ────────────────────────────────────────────────────────────────────

type FieldKey = 'school' | 'className' | 'email' | 'password' | 'programme' | 'studentId' | 'qr' | 'expiry';

interface FieldConfig {
  key: FieldKey;
  label: string;
  visible: boolean;
}

interface TypoStyle {
  fontSize: string;
  fontWeight: string;
  color: string;
  fontFamily: string;
}

interface CardConfig {
  accentColor: string;
  headerStyle: 'band' | 'border' | 'minimal';
  orgName: string;
  orgWebsite: string;
  cardLabel: string;
  footerLeft: string;
  footerRight: string;
  cornerRadius: 'sharp' | 'rounded' | 'pill';
  bgColor: string;
  showLogo: boolean;
  showPhotoSlot: boolean;
  cardOrientation: 'portrait' | 'landscape';
  width: string;
  height: string;
  fields: FieldConfig[];
  typo: {
    orgName:    TypoStyle;
    orgWebsite: TypoStyle;
    studentName: TypoStyle;
    school:     TypoStyle;
    fieldLabel: TypoStyle;
    fieldValue: TypoStyle;
    accentValue: TypoStyle;
    footer:     TypoStyle;
  };
}

const DEFAULT_FIELDS: FieldConfig[] = [
  { key: 'school',     label: 'School',            visible: true  },
  { key: 'className',  label: 'Class',              visible: true  },
  { key: 'email',      label: 'Email',              visible: true  },
  { key: 'password',   label: 'Temporary Password', visible: true  },
  { key: 'programme',  label: 'Programme',           visible: false },
  { key: 'studentId',  label: 'Student ID',          visible: true  },
  { key: 'expiry',     label: 'Expiry Date',         visible: false },
  { key: 'qr',         label: 'QR Code',             visible: true  },
];

const DEFAULT_TYPO: CardConfig['typo'] = {
  orgName:     { fontSize: '2.5mm', fontWeight: '900', color: '#ffffff', fontFamily: 'sans' },
  orgWebsite:  { fontSize: '1.6mm', fontWeight: '700', color: 'rgba(255,255,255,0.85)', fontFamily: 'sans' },
  studentName: { fontSize: '3.8mm', fontWeight: '900', color: '#111827', fontFamily: 'sans' },
  school:      { fontSize: '1.9mm', fontWeight: '900', color: '#1A3A8F', fontFamily: 'sans' },
  fieldLabel:  { fontSize: '1.5mm', fontWeight: '700', color: '#C41E3A', fontFamily: 'sans' },
  fieldValue:  { fontSize: '2.1mm', fontWeight: '700', color: '#111827', fontFamily: 'mono' },
  accentValue: { fontSize: '2.2mm', fontWeight: '800', color: '#1A3A8F', fontFamily: 'mono' },
  footer:      { fontSize: '1.5mm', fontWeight: '600', color: '#9ca3af', fontFamily: 'sans' },
};

const DEFAULT_CONFIG: CardConfig = {
  accentColor: '#1A3A8F',
  headerStyle: 'band',
  orgName: 'RILLCOD TECHNOLOGIES',
  orgWebsite: 'www.rillcod.com',
  cardLabel: 'Student Access Card',
  footerLeft: 'rillcod.com/login',
  footerRight: 'Student ID',
  cornerRadius: 'sharp',
  bgColor: '#ffffff',
  showLogo: true,
  showPhotoSlot: false,
  cardOrientation: 'portrait',
  width: '54mm',
  height: '85.6mm',
  fields: DEFAULT_FIELDS,
  typo: DEFAULT_TYPO,
};

const ROLE_PRESETS: Record<'student' | 'parent' | 'teacher', Partial<CardConfig>> = {
  student: { cardLabel: 'Student Access Card', footerRight: 'Student ID' },
  parent: {
    cardLabel: 'Parent Access Card',
    footerRight: 'Parent ID',
    fields: DEFAULT_FIELDS.map(f => {
      if (f.key === 'password')  return { ...f, visible: true, label: 'Temporary Password' };
      if (f.key === 'studentId') return { ...f, visible: true, label: 'Parent ID' };
      if (f.key === 'programme') return { ...f, visible: false };
      if (f.key === 'className') return { ...f, visible: false };
      if (f.key === 'school')    return { ...f, visible: true, label: 'Home School' };
      return f;
    }),
  },
  teacher: {
    cardLabel: 'Teacher Access Card',
    footerRight: 'Staff ID',
    fields: DEFAULT_FIELDS.map(f => {
      if (f.key === 'password')  return { ...f, visible: true, label: 'Temporary Password' };
      if (f.key === 'studentId') return { ...f, visible: true, label: 'Staff ID' };
      if (f.key === 'programme') return { ...f, visible: true, label: 'Department' };
      if (f.key === 'className') return { ...f, visible: true, label: 'Role' };
      return f;
    }),
  },
};

const TEMPLATES = [
  { name: 'Navy Band',     color: '#1A3A8F', style: 'band'    as const },
  { name: 'Indigo',        color: '#4f46e5', style: 'band'    as const },
  { name: 'Emerald',       color: '#059669', style: 'band'    as const },
  { name: 'Crimson',       color: '#C41E3A', style: 'band'    as const },
  { name: 'Violet',        color: '#7c3aed', style: 'band'    as const },
  { name: 'Slate Dark',    color: '#1e293b', style: 'band'    as const },
  { name: 'Royal Blue',    color: '#1d4ed8', style: 'band'    as const },
  { name: 'Teal Border',   color: '#0f766e', style: 'border'  as const },
  { name: 'Navy Border',   color: '#1A3A8F', style: 'border'  as const },
  { name: 'Minimal Slate', color: '#374151', style: 'minimal' as const },
  { name: 'Minimal Navy',  color: '#1A3A8F', style: 'minimal' as const },
  { name: 'Gold',          color: '#b45309', style: 'band'    as const },
];

const PRESET_COLORS = [
  '#1A3A8F','#C41E3A','#4f46e5','#059669','#e11d48',
  '#1e293b','#d97706','#7c3aed','#0f766e','#15803d','#b45309','#1d4ed8',
];

const SAMPLE = {
  name: 'ADAEZE OKONKWO',
  school: 'KEY TO SUCCESS EDUCATION CENTRE',
  email: 'adaeze.okonkwo@rillcod.com',
  password: 'Abc@12345',
  programme: 'Advanced STEM Track',
  className: 'JSS3',
  id: 'RC-A1B2C3D4',
};

// ─── QR Placeholder ───────────────────────────────────────────────────────────

function QrPlaceholder({ size = 60, color = '#374151' }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: 'block' }}>
      <rect x="5"  y="5"  width="38" height="38" fill="none" stroke={color} strokeWidth="5"/>
      <rect x="15" y="15" width="18" height="18" fill={color}/>
      <rect x="57" y="5"  width="38" height="38" fill="none" stroke={color} strokeWidth="5"/>
      <rect x="67" y="15" width="18" height="18" fill={color}/>
      <rect x="5"  y="57" width="38" height="38" fill="none" stroke={color} strokeWidth="5"/>
      <rect x="15" y="67" width="18" height="18" fill={color}/>
      <rect x="57" y="57" width="8"  height="8"  fill={color}/>
      <rect x="70" y="57" width="8"  height="8"  fill={color}/>
      <rect x="83" y="57" width="8"  height="8"  fill={color}/>
      <rect x="57" y="70" width="8"  height="8"  fill={color}/>
      <rect x="83" y="70" width="8"  height="8"  fill={color}/>
      <rect x="57" y="83" width="8"  height="8"  fill={color}/>
      <rect x="70" y="83" width="8"  height="8"  fill={color}/>
      <rect x="83" y="83" width="8"  height="8"  fill={color}/>
    </svg>
  );
}

// ─── Card Preview ─────────────────────────────────────────────────────────────

function CardPreview({ cfg, scale = 1.3 }: { cfg: CardConfig; scale?: number }) {
  const acc = cfg.accentColor;
  const vis = (key: FieldKey) => cfg.fields.find(f => f.key === key)?.visible ?? false;
  const lbl = (key: FieldKey) => cfg.fields.find(f => f.key === key)?.label ?? key;
  const infoFields = cfg.fields.filter(f => f.visible && f.key !== 'qr' && f.key !== 'className');
  const expDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const sampleVal = (key: FieldKey): string => ({ school: SAMPLE.school, className: SAMPLE.className, email: SAMPLE.email, password: SAMPLE.password, programme: SAMPLE.programme, studentId: SAMPLE.id, qr: '', expiry: expDate }[key] ?? '');
  const t = cfg.typo;
  const ff = (fam: string) => fam === 'mono' ? 'monospace' : "'Inter','Segoe UI',system-ui,sans-serif";
  const ts = (s: TypoStyle, extra?: React.CSSProperties): React.CSSProperties => ({
    fontSize: s.fontSize, fontWeight: parseInt(s.fontWeight), color: s.color, fontFamily: ff(s.fontFamily), ...extra,
  });
  const isAccentField = (k: FieldKey) => ['password','studentId','programme','expiry'].includes(k);

  const Header = () => {
    if (cfg.headerStyle === 'band') return (
      <div style={{ background: acc, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 7 }}>
        <div style={{ width: 18, height: 18, background: 'rgba(255,255,255,0.3)', borderRadius: 2, flexShrink: 0 }} />
        <div>
          <div style={ts(t.orgName, { textTransform: 'uppercase', lineHeight: 1 })}>{cfg.orgName}</div>
          <div style={ts(t.orgWebsite, { marginTop: 2 })}>{cfg.orgWebsite}</div>
        </div>
        {vis('className') && (
          <div style={{ marginLeft: 'auto', background: 'rgba(0,0,0,0.22)', color: '#fff', padding: '2px 7px', fontSize: 8, fontWeight: 900, textTransform: 'uppercase', flexShrink: 0 }}>
            {SAMPLE.className}
          </div>
        )}
      </div>
    );
    if (cfg.headerStyle === 'border') return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ width: 16, height: 16, background: '#e5e7eb', borderRadius: 2, flexShrink: 0 }} />
        <div>
          <div style={ts(t.orgName, { textTransform: 'uppercase', lineHeight: 1, color: '#111' })}>{cfg.orgName}</div>
          <div style={ts(t.orgWebsite, { marginTop: 1, color: acc })}>{cfg.orgWebsite}</div>
        </div>
        {vis('className') && <div style={{ marginLeft: 'auto', background: acc, color: '#fff', padding: '2px 7px', fontSize: 7, fontWeight: 900, textTransform: 'uppercase', flexShrink: 0 }}>{SAMPLE.className}</div>}
      </div>
    );
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderBottom: `2px solid ${acc}` }}>
        <div style={{ width: 14, height: 14, background: '#e5e7eb', borderRadius: 2, flexShrink: 0 }} />
        <div style={ts(t.orgName, { textTransform: 'uppercase', color: '#111' })}>{cfg.orgName}</div>
        {vis('className') && <div style={{ marginLeft: 'auto', fontSize: 7, fontWeight: 900, color: acc, textTransform: 'uppercase', flexShrink: 0 }}>{SAMPLE.className}</div>}
      </div>
    );
  };

  return (
    <div style={{
      border: '1px solid #d1d5db',
      borderLeft: cfg.headerStyle === 'border' ? `4px solid ${acc}` : '1px solid #d1d5db',
      width: cfg.width, height: cfg.height,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: cfg.bgColor || '#fff', color: '#111827',
      boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
      margin: '0 auto',
      zoom: scale,
    }}>
      <Header />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5, borderRight: vis('qr') ? '1px solid #f3f4f6' : 'none', overflow: 'hidden' }}>
          <div style={ts(t.studentName, { textTransform: 'uppercase', lineHeight: 1.15 })}>{SAMPLE.name}</div>
          <div style={{ height: 1, background: '#f3f4f6' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden' }}>
            {infoFields.map(f => (
              <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <div style={ts(t.fieldLabel, { textTransform: 'uppercase', letterSpacing: 0.5 })}>{f.label}</div>
                <div style={ts(isAccentField(f.key) ? t.accentValue : f.key === 'school' ? t.school : t.fieldValue, { wordBreak: 'break-all', lineHeight: 1.1 })}>
                  {sampleVal(f.key)}
                </div>
              </div>
            ))}
          </div>
        </div>
        {vis('qr') && (
          <div style={{ width: '30%', minWidth: '25mm', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '10px 8px', background: '#fafafa', flexShrink: 0 }}>
            <QrPlaceholder size={54} color={acc} />
            <div style={ts(t.footer, { textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' })}>Scan to verify</div>
            <div style={ts(t.accentValue, { textAlign: 'center' })}>{SAMPLE.id}</div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 12px', borderTop: '1px solid #f3f4f6', background: '#fafafa' }}>
        <span style={ts(t.footer)}>{cfg.footerLeft}</span>
        <span style={ts(t.footer, { fontFamily: 'monospace', fontWeight: 700, color: '#374151' })}>{cfg.footerRight === 'Student ID' ? SAMPLE.id : cfg.footerRight}</span>
      </div>
    </div>
  );
}

// ─── Sidebar Section ──────────────────────────────────────────────────────────

function SidebarSection({ title, icon, children, open, onToggle }: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-white/5">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/5 transition-colors">
        {icon && <span className="text-white/40">{icon}</span>}
        <span className="text-[10px] font-black uppercase tracking-widest text-white/60 flex-1">{title}</span>
        {open ? <ChevronUpIcon className="w-3.5 h-3.5 text-white/30" /> : <ChevronDownIcon className="w-3.5 h-3.5 text-white/30" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

// ─── Real Student type ────────────────────────────────────────────────────────

interface RealStudent {
  id: string;
  full_name: string;
  email: string | null;
  school_name: string | null;
  section_class: string | null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CardBuilderPage() {
  const { profile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [cfg, setCfg] = useState<CardConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['templates', 'design']));
  const [students, setStudents] = useState<RealStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedSchoolGen, setSelectedSchoolGen] = useState('all');
  const [selectedClassGen, setSelectedClassGen] = useState('all');
  const [studentsLoaded, setStudentsLoaded] = useState(false);

  const cardType = (searchParams.get('type') || 'student').toLowerCase() as 'student' | 'parent' | 'teacher';

  const applyRolePreset = (base: CardConfig, roleType: string | null): CardConfig => {
    if (roleType !== 'student' && roleType !== 'parent' && roleType !== 'teacher') return base;
    const p = ROLE_PRESETS[roleType];
    return { ...base, ...p, fields: p.fields ? p.fields : base.fields };
  };

  useEffect(() => {
    const presetType = cardType;
    fetch(`/api/admin/settings?type=${presetType}`)
      .then(r => r.json())
      .then(data => {
        if (data.config) {
          const parsed = data.config;
          if (parsed.fields) {
            parsed.fields = DEFAULT_FIELDS.map(def => {
              const stored = parsed.fields.find((f: FieldConfig) => f.key === def.key);
              return stored ? { ...def, ...stored } : def;
            });
          }
          if (parsed.typo) parsed.typo = { ...DEFAULT_TYPO, ...parsed.typo };
          setCfg(applyRolePreset({ ...DEFAULT_CONFIG, ...parsed }, presetType));
          return;
        }
        setCfg(applyRolePreset(DEFAULT_CONFIG, presetType));
      })
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardType]);

  const allSchoolsGen = useMemo(() => {
    const set = new Set(students.map(s => s.school_name?.trim() || '— No school —'));
    return Array.from(set).sort();
  }, [students]);

  const allClassesGen = useMemo(() => {
    const set = new Set<string>();
    students.forEach(s => { if (s.section_class?.trim()) set.add(s.section_class.trim()); });
    return Array.from(set).sort();
  }, [students]);

  const visibleStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return students.filter(s => {
      const sch = s.school_name?.trim() || '— No school —';
      if (selectedSchoolGen !== 'all' && sch !== selectedSchoolGen) return false;
      const cl = (s.section_class || '').trim();
      if (selectedClassGen !== 'all') {
        if (selectedClassGen === '__NONE__') { if (cl) return false; }
        else if (cl !== selectedClassGen) return false;
      }
      if (!q) return true;
      return [s.full_name, s.email, s.school_name, s.section_class].some(v => (v || '').toLowerCase().includes(q));
    });
  }, [students, studentSearch, selectedSchoolGen, selectedClassGen]);

  if (authLoading || !profile) {
    return (
      <div className="flex items-center justify-center h-full bg-[#09090b]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const canUse = profile.role === 'admin' || profile.role === 'teacher' || (profile.role === 'school' && cardType === 'student');
  if (!canUse) return (
    <div className="flex items-center justify-center h-full bg-[#09090b] text-white">
      <p className="text-white/40">Access denied.</p>
    </div>
  );

  if (cardType === 'teacher' && profile.role !== 'admin') return (
    <div className="flex flex-col items-center justify-center h-full bg-[#09090b] text-white gap-4">
      <CreditCardIcon className="w-12 h-12 text-rose-500/30" />
      <p className="text-sm font-black uppercase tracking-widest text-white/60">Admin Only</p>
      <p className="text-white/30 text-xs text-center max-w-xs">Teacher card design is restricted to administrators.</p>
    </div>
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  const update = (patch: Partial<CardConfig>) => setCfg(prev => ({ ...prev, ...patch }));

  const toggleSection = (s: string) => setOpenSections(prev => {
    const n = new Set(prev);
    if (n.has(s)) n.delete(s); else n.add(s);
    return n;
  });

  const toggleField = (key: FieldKey) =>
    setCfg(prev => ({ ...prev, fields: prev.fields.map(f => f.key === key ? { ...f, visible: !f.visible } : f) }));

  const updateFieldLabel = (key: FieldKey, label: string) =>
    setCfg(prev => ({ ...prev, fields: prev.fields.map(f => f.key === key ? { ...f, label } : f) }));

  const moveField = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= cfg.fields.length) return;
    const arr = [...cfg.fields];
    [arr[index], arr[next]] = [arr[next], arr[index]];
    setCfg(prev => ({ ...prev, fields: arr }));
  };

  const updateTypo = (elem: keyof CardConfig['typo'], patch: Partial<TypoStyle>) =>
    setCfg(prev => ({ ...prev, typo: { ...prev.typo, [elem]: { ...prev.typo[elem], ...patch } } }));

  const handleSave = async () => {
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: cfg, type: cardType }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { alert('Failed to save design'); }
  };

  const handleReset = async () => {
    const resetCfg = applyRolePreset(DEFAULT_CONFIG, cardType);
    setCfg(resetCfg);
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: resetCfg, type: cardType }),
      });
    } catch { /* ignore */ }
  };

  const handlePrintSample = () => {
    const acc = cfg.accentColor;
    const vis = (key: FieldKey) => cfg.fields.find(f => f.key === key)?.visible ?? false;
    const infoFields = cfg.fields.filter(f => f.visible && f.key !== 'qr' && f.key !== 'className');
    const qUrl = encodeURIComponent('https://rillcod.com/student/sample');
    const expiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const sampleData: Record<string, string> = { school: SAMPLE.school, email: SAMPLE.email, password: SAMPLE.password, programme: SAMPLE.programme, studentId: SAMPLE.id, className: SAMPLE.className, expiry };
    const logoUrl = window.location.origin + '/logo.png';

    const hdrHtml = cfg.headerStyle === 'band'
      ? `<div class="chdr"><img src="${logoUrl}" class="logo" /><div><div class="org">${cfg.orgName}</div><div class="web">${cfg.orgWebsite}</div></div>${vis('className') ? `<div class="cbadge">${sampleData.className}</div>` : ''}</div>`
      : cfg.headerStyle === 'border'
        ? `<div class="bhdr"><img src="${logoUrl}" class="logo" /><div><div class="org-b">${cfg.orgName}</div><div class="web-b">${cfg.orgWebsite}</div></div>${vis('className') ? `<div class="bbadge">${sampleData.className}</div>` : ''}</div>`
        : `<div class="mhdr"><img src="${logoUrl}" class="logo" /><div class="org-m">${cfg.orgName}</div>${vis('className') ? `<div class="mbadge">${sampleData.className}</div>` : ''}</div>`;

    const html = `<html><head><title>Sample Card</title>
    <style>
      @page { size: A4 portrait; margin: 20mm; }
      * { box-sizing:border-box; margin:0; padding:0; }
      body { font-family:'Inter','Segoe UI',system-ui,sans-serif; background:#fff; display:flex; justify-content:center; padding-top:20mm; }
      .card { border:1px solid #d1d5db; ${cfg.headerStyle === 'border' ? `border-left:4px solid ${acc};` : ''} width:${cfg.width}; height:${cfg.height}; display:flex; flex-direction:column; overflow:hidden; background:${cfg.bgColor}; }
      .chdr { background:${acc}; padding:10px 14px; display:flex; align-items:center; gap:8px; }
      .bhdr { display:flex; align-items:center; gap:8px; padding:8px 14px; border-bottom:1px solid #f3f4f6; }
      .mhdr { display:flex; align-items:center; gap:8px; padding:8px 14px; border-bottom:2px solid ${acc}; }
      .logo { width:22px; height:22px; object-fit:contain; flex-shrink:0; }
      .org  { font-size:11px; font-weight:900; color:#fff; text-transform:uppercase; line-height:1; }
      .web  { font-size:7px; color:rgba(255,255,255,.8); font-weight:700; margin-top:2px; }
      .org-b { font-size:10px; font-weight:900; color:#111; text-transform:uppercase; line-height:1; }
      .web-b { font-size:7px; color:${acc}; font-weight:700; margin-top:1.5px; }
      .org-m { font-size:10px; font-weight:900; color:#111; text-transform:uppercase; }
      .cbadge { margin-left:auto; background:rgba(0,0,0,.22); color:#fff; padding:.5mm 1.5mm; font-size:7px; font-weight:900; text-transform:uppercase; }
      .bbadge { margin-left:auto; background:${acc}; color:#fff; padding:.5mm 1.5mm; font-size:7px; font-weight:900; text-transform:uppercase; }
      .mbadge { margin-left:auto; font-size:8px; font-weight:900; color:${acc}; text-transform:uppercase; }
      .cbody { display:flex; flex:1; overflow:hidden; }
      .info  { flex:1; padding:12px 14px; display:flex; flex-direction:column; gap:6px; border-right:1px solid #f3f4f6; overflow:hidden; }
      .sname { font-size:16px; font-weight:900; color:#111; text-transform:uppercase; line-height:1.15; }
      .sep   { height:1px; background:#f3f4f6; }
      .field { display:flex; flex-direction:column; gap:2px; }
      .lbl   { font-size:6px; font-weight:700; color:${cfg.typo.fieldLabel.color}; text-transform:uppercase; letter-spacing:.5px; }
      .val   { font-size:10px; font-weight:700; font-family:monospace; color:${cfg.typo.fieldValue.color}; word-break:break-all; }
      .val-a { font-size:10px; font-weight:800; font-family:monospace; color:${cfg.typo.accentValue.color}; word-break:break-all; }
      .qrp   { width:25%; min-width:20mm; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; padding:12px 10px; background:#fafafa; flex-shrink:0; }
      .qr    { width:100%; max-width:25mm; height:auto; aspect-ratio:1; border:1px solid #e5e7eb; display:block; }
      .qrl   { font-size:6px; color:#9ca3af; text-transform:uppercase; letter-spacing:.5px; text-align:center; font-weight:600; }
      .qrc   { font-size:7px; font-weight:900; font-family:monospace; color:${acc}; text-align:center; }
      .cftr  { display:flex; justify-content:space-between; align-items:center; padding:6px 14px; border-top:1px solid #f3f4f6; font-size:7px; color:#9ca3af; font-weight:600; background:#fafafa; }
      .cftr-id { font-family:monospace; color:#374151; font-weight:900; font-size:7px; }
      @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
    </style></head><body>
    <div class="card">
      ${hdrHtml}
      <div class="cbody">
        <div class="info">
          <div class="sname">${SAMPLE.name}</div>
          <div class="sep"></div>
          ${infoFields.map(f => {
            const val = sampleData[f.key as keyof typeof sampleData] ?? '';
            const accent = ['password','studentId','programme','school','expiry'].includes(f.key);
            return `<div class="field"><div class="lbl">${f.label}</div><div class="${accent ? 'val-a' : 'val'}">${val}</div></div>`;
          }).join('')}
        </div>
        ${vis('qr') ? `<div class="qrp"><img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qUrl}" class="qr" crossorigin="anonymous" /><div class="qrl">Scan to verify</div><div class="qrc">${SAMPLE.id}</div></div>` : ''}
      </div>
      <div class="cftr"><span>${cfg.footerLeft}</span><span class="cftr-id">${cfg.footerRight === 'Student ID' ? SAMPLE.id : cfg.footerRight}</span></div>
    </div>
    <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); }</script>
    </body></html>`;

    const win = window.open('', '_blank');
    win?.document.write(html);
    win?.document.close();
  };

  const handleExportSinglePDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const acc = cfg.accentColor;
    const vis = (key: FieldKey) => cfg.fields.find(f => f.key === key)?.visible ?? false;
    const infoFields = cfg.fields.filter(f => f.visible && f.key !== 'qr' && f.key !== 'className');
    const expiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const sampleData: Record<string, string> = { school: SAMPLE.school, email: SAMPLE.email, password: SAMPLE.password, programme: SAMPLE.programme, studentId: SAMPLE.id, className: SAMPLE.className, expiry };
    const r = (hex: string) => parseInt(hex.slice(1,3),16);
    const g = (hex: string) => parseInt(hex.slice(3,5),16);
    const b = (hex: string) => parseInt(hex.slice(5,7),16);
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const cardW = parseFloat(cfg.width), cardH = parseFloat(cfg.height);
    const cardX = (210 - cardW) / 2, cardY = 30;
    doc.setDrawColor(209,213,219); doc.setLineWidth(0.3);
    doc.rect(cardX, cardY, cardW, 75);
    if (cfg.headerStyle === 'band') {
      doc.setFillColor(r(acc), g(acc), b(acc));
      doc.rect(cardX, cardY, cardW, 12, 'F');
      doc.setFontSize(9); doc.setTextColor(255,255,255); doc.setFont('helvetica','bold');
      doc.text(cfg.orgName, cardX + 5, cardY + 5.5);
      doc.setFontSize(6); doc.setFont('helvetica','normal');
      doc.text(cfg.orgWebsite, cardX + 5, cardY + 9);
    }
    const bodyY = cardY + 16;
    doc.setFontSize(12); doc.setTextColor(17,24,39); doc.setFont('helvetica','bold');
    doc.text(SAMPLE.name, cardX + 4, bodyY + 6);
    let fy = bodyY + 14;
    infoFields.forEach(f => {
      const labelCol = cfg.typo.fieldLabel.color;
      doc.setFontSize(5.5); doc.setTextColor(r(labelCol), g(labelCol), b(labelCol)); doc.setFont('helvetica','normal');
      doc.text(f.label.toUpperCase(), cardX + 4, fy);
      doc.setFontSize(7.5); doc.setFont('courier','bold');
      const isAccent = ['password','studentId','programme','school','expiry'].includes(f.key);
      doc.setTextColor(isAccent ? r(acc) : 17, isAccent ? g(acc) : 24, isAccent ? b(acc) : 39);
      doc.text(doc.splitTextToSize(sampleData[f.key] ?? '', cardW - 8)[0], cardX + 4, fy + 4.5);
      fy += 11;
    });
    const ftrY = cardY + 70;
    doc.setFontSize(6); doc.setTextColor(156,163,175); doc.setFont('helvetica','normal');
    doc.text(cfg.footerLeft, cardX + 4, ftrY + 4);
    doc.setTextColor(55,65,81); doc.setFont('courier','bold');
    doc.text(cfg.footerRight === 'Student ID' ? SAMPLE.id : cfg.footerRight, cardX + cardW - 4, ftrY + 4, { align: 'right' });
    doc.save('rillcod_sample_card.pdf');
  };

  const handleExportBatchPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const acc = cfg.accentColor;
    const vis = (key: FieldKey) => cfg.fields.find(f => f.key === key)?.visible ?? false;
    const infoFields = cfg.fields.filter(f => f.visible && f.key !== 'qr' && f.key !== 'className');
    const expiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const sampleData: Record<string, string> = { school: SAMPLE.school, email: SAMPLE.email, password: SAMPLE.password, programme: SAMPLE.programme, studentId: SAMPLE.id, className: SAMPLE.className, expiry };
    const r = (hex: string) => parseInt(hex.slice(1,3),16);
    const g = (hex: string) => parseInt(hex.slice(3,5),16);
    const b = (hex: string) => parseInt(hex.slice(5,7),16);
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const marginX = 8, marginY = 8, gapX = 6, gapY = 6;
    const cardW = parseFloat(cfg.width), cardH = parseFloat(cfg.height);
    for (let i = 0; i < 8; i++) {
      const col = i % 2, row = Math.floor(i / 2);
      const x = marginX + col * (cardW + gapX);
      const y = marginY + row * (cardH + gapY);
      doc.setDrawColor(209,213,219); doc.setLineWidth(0.3);
      doc.rect(x, y, cardW, cardH);
      if (cfg.headerStyle === 'band') {
        doc.setFillColor(r(acc), g(acc), b(acc));
        doc.rect(x, y, cardW, 8, 'F');
        doc.setFontSize(5.5); doc.setTextColor(255,255,255); doc.setFont('helvetica','bold');
        doc.text(cfg.orgName, x + 3, y + 4);
        doc.setFontSize(3.5); doc.setFont('helvetica','normal');
        doc.text(cfg.orgWebsite, x + 3, y + 7);
        if (vis('className')) {
          const bw = SAMPLE.className.length * 1.5 + 4;
          doc.setFillColor(0,0,0); doc.rect(x + cardW - bw - 1, y + 1.5, bw, 5, 'F');
          doc.setFontSize(4); doc.setTextColor(255,255,255);
          doc.text(SAMPLE.className, x + cardW - bw/2 - 1, y + 5, { align: 'center' });
        }
      } else {
        doc.setFillColor(r(acc), g(acc), b(acc));
        doc.rect(x, y, 1.5, cardH, 'F');
        doc.setFontSize(5); doc.setTextColor(17,24,39); doc.setFont('helvetica','bold');
        doc.text(cfg.orgName, x + 4, y + 5);
        doc.setFontSize(3.5); doc.setTextColor(r(acc),g(acc),b(acc)); doc.setFont('helvetica','normal');
        doc.text(cfg.orgWebsite, x + 4, y + 8.5);
      }
      const bodyY = y + (cfg.headerStyle === 'band' ? 10 : 11);
      const ix = x + 4;
      doc.setFontSize(8); doc.setTextColor(17,24,39); doc.setFont('helvetica','bold');
      doc.text(SAMPLE.name, ix, bodyY + 4);
      doc.setDrawColor(243,244,246); doc.setLineWidth(0.2);
      doc.line(ix, bodyY + 6, x + cardW - (vis('qr') ? 22 : 3), bodyY + 6);
      let fy = bodyY + 10;
      infoFields.slice(0, 3).forEach(f => {
        const labelCol = cfg.typo.fieldLabel.color;
        doc.setFontSize(3.5); doc.setTextColor(r(labelCol), g(labelCol), b(labelCol)); doc.setFont('helvetica','normal');
        doc.text(f.label.toUpperCase(), ix, fy);
        doc.setFontSize(5); doc.setFont('courier','bold');
        const isAccent = ['password','studentId','programme','school','expiry'].includes(f.key);
        doc.setTextColor(isAccent ? r(acc) : 17, isAccent ? g(acc) : 24, isAccent ? b(acc) : 39);
        doc.text(doc.splitTextToSize(sampleData[f.key] ?? '', cardW - (vis('qr') ? 24 : 8))[0], ix, fy + 3.5);
        fy += 8;
      });
      doc.setDrawColor(243,244,246); doc.setLineWidth(0.2);
      doc.line(ix, y + cardH - 6, x + cardW - 2, y + cardH - 6);
      doc.setFontSize(3.5); doc.setTextColor(156,163,175); doc.setFont('helvetica','normal');
      doc.text(cfg.footerLeft, ix, y + cardH - 2.5);
      doc.setTextColor(55,65,81); doc.setFont('courier','bold');
      doc.text(SAMPLE.id, x + cardW - 2, y + cardH - 2.5, { align: 'right' });
    }
    doc.save('rillcod_batch_cards_sample.pdf');
  };

  const loadStudents = () => {
    if (studentsLoaded) return;
    setStudentsLoading(true);
    fetch('/api/portal-users?role=student&scoped=true')
      .then(r => r.json())
      .then(j => {
        setStudents((j.data ?? []).map((s: any) => ({
          id: s.id, full_name: s.full_name, email: s.email ?? null,
          school_name: s.school_name ?? null, section_class: s.section_class ?? null,
        })));
        setStudentsLoaded(true);
      })
      .catch(() => {})
      .finally(() => setStudentsLoading(false));
  };

  const toggleStudent = (id: string) =>
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const printSelectedCards = () => {
    const list = students.filter(s => selectedIds.has(s.id));
    if (!list.length) return;
    const acc = cfg.accentColor;
    const hs = cfg.headerStyle;
    const vis = (key: string) => cfg.fields.find(f => f.key === key)?.visible ?? false;
    const logo = `${window.location.origin}/images/logo.png`;

    const cardHtml = (s: RealStudent) => {
      const code = `RC-${s.id.slice(0, 8).toUpperCase()}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(`${window.location.origin}/verify/${s.id}`)}`;
      const hdrClass = hs === 'border' ? 'hdr-border' : hs === 'minimal' ? 'hdr-min' : 'hdr-band';
      const rows = [
        vis('school') && s.school_name ? `<div class="row"><div class="lbl">${cfg.fields.find(f=>f.key==='school')?.label||'School'}</div><div class="val-a">${s.school_name}</div></div>` : '',
        vis('className') && s.section_class ? `<div class="row"><div class="lbl">${cfg.fields.find(f=>f.key==='className')?.label||'Class'}</div><div class="val">${s.section_class}</div></div>` : '',
        vis('email') && s.email ? `<div class="row"><div class="lbl">${cfg.fields.find(f=>f.key==='email')?.label||'Email'}</div><div class="val">${s.email}</div></div>` : '',
        vis('studentId') ? `<div class="row"><div class="lbl">${cfg.fields.find(f=>f.key==='studentId')?.label||'Student ID'}</div><div class="val-a">${code}</div></div>` : '',
      ].filter(Boolean).join('');

      return `<div class="card">
        <div class="${hdrClass}">
          ${cfg.showLogo ? `<img class="logo" src="${logo}" />` : ''}
          <div><div class="org">${cfg.orgName}</div><div class="web">${cfg.orgWebsite}</div></div>
          <div class="cbadge">${cfg.cardLabel}</div>
        </div>
        <div class="body">
          <div class="left">
            <div class="name">${s.full_name}</div>
            <div class="sep"></div>
            ${rows}
          </div>
          ${vis('qr') ? `<div class="right"><img class="qr" src="${qrUrl}" /><div class="code">${code}</div></div>` : ''}
        </div>
        <div class="ftr"><span>${cfg.footerLeft}</span><span>${code}</span></div>
      </div>`;
    };

    const html = `<!doctype html><html><head><title>Access Cards</title>
    <style>
      @page { size: A4 portrait; margin: 8mm; }
      * { box-sizing:border-box; }
      body { margin:0; font-family:Inter,system-ui,sans-serif; color:#111827; background:#fff; }
      .grid { display:grid; grid-template-columns:repeat(2,1fr); gap:8mm; }
      .card { border:1px solid #e5e7eb; display:flex; flex-direction:column; overflow:hidden; background:${cfg.bgColor||'#fff'}; margin-bottom:8mm; }
      .hdr-band   { background:${acc}; color:#fff; padding:2.2mm 3mm; display:flex; align-items:center; gap:2mm; }
      .hdr-border { border-left:2.5mm solid ${acc}; padding:2.2mm 3mm; display:flex; align-items:center; gap:2mm; }
      .hdr-min    { border-bottom:1px solid #e5e7eb; padding:2.2mm 3mm; display:flex; align-items:center; gap:2mm; }
      .logo { width:5mm; height:5mm; object-fit:contain; }
      .org  { font-weight:900; font-size:2.5mm; text-transform:uppercase; line-height:1; }
      .web  { font-size:1.8mm; opacity:.8; margin-top:.5mm; }
      .cbadge { margin-left:auto; background:rgba(0,0,0,.22); color:#fff; padding:.5mm 1.5mm; font-size:1.6mm; font-weight:900; text-transform:uppercase; }
      .body { display:flex; flex:1; }
      .left { flex:1; padding:2.5mm 3mm; border-right:1px solid #f3f4f6; }
      .name { font-size:3.5mm; font-weight:900; margin:.8mm 0 1.2mm; text-transform:uppercase; line-height:1.2; }
      .sep  { height:.3mm; background:#f3f4f6; margin-bottom:1mm; }
      .row  { margin:.6mm 0; }
      .lbl  { color:${cfg.typo.fieldLabel.color}; font-size:1.5mm; text-transform:uppercase; }
      .val  { font-size:2mm; font-weight:700; }
      .val-a { font-size:2mm; font-weight:800; font-family:monospace; color:${acc}; }
      .right { width:22mm; background:#fafafa; padding:2mm; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:1mm; }
      .qr   { width:15mm; height:15mm; border:1px solid #e5e7eb; }
      .code { color:${acc}; font-size:1.5mm; font-family:monospace; font-weight:900; text-align:center; }
      .ftr  { border-top:1px solid #f3f4f6; background:#fafafa; color:#6b7280; display:flex; justify-content:space-between; padding:1.2mm 3mm; font-size:1.5mm; }
      @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
    </style></head><body>
    <div class="grid">${list.map(s => cardHtml(s)).join('')}</div>
    <script>window.onload=()=>{window.print(); setTimeout(()=>window.close(),500);};</script>
    </body></html>`;

    const win = window.open('', '_blank');
    if (!win) { alert('Pop-up blocked. Please allow pop-ups.'); return; }
    win.document.write(html);
    win.document.close();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const ROLE_TYPES: Array<'student' | 'parent' | 'teacher'> = ['student', 'parent', 'teacher'];

  return (
    <div className="flex flex-col h-full bg-[#09090b] text-white overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 h-12 border-b border-white/[0.07] flex items-center gap-3 px-4">
        <CreditCardIcon className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="text-[11px] font-black uppercase tracking-widest text-white hidden sm:block">Card Designer</span>

        {/* Role type selector */}
        <div className="flex gap-px bg-white/5 border border-white/10 p-px ml-1">
          {ROLE_TYPES.map(r => (
            <button key={r}
              onClick={() => { if (r !== cardType) router.push(`/dashboard/students/card-builder?type=${r}`); }}
              className={`px-3 py-1 text-[10px] font-black uppercase tracking-wide transition-all ${cardType === r ? 'bg-primary text-white' : 'text-white/40 hover:text-white/70'}`}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={handleReset} className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 border border-white/10 hover:border-white/20 transition-all">
            Reset
          </button>
          <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-white text-[10px] font-black uppercase tracking-widest transition-all">
            {saved ? <CheckCircleIcon className="w-3.5 h-3.5" /> : <ArrowDownTrayIcon className="w-3.5 h-3.5" />}
            {saved ? 'Saved!' : 'Save Design'}
          </button>
        </div>
      </div>

      {/* ── Main 3-column area ───────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left sidebar ─ config */}
        <div className="w-[268px] flex-shrink-0 border-r border-white/[0.07] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 hidden md:block">

          {/* Templates */}
          <SidebarSection title="Templates" icon={<PaintBrushIcon className="w-3.5 h-3.5" />} open={openSections.has('templates')} onToggle={() => toggleSection('templates')}>
            <div className="grid grid-cols-3 gap-1.5">
              {TEMPLATES.map(t => (
                <button key={t.name} title={t.name} onClick={() => update({ accentColor: t.color, headerStyle: t.style })}
                  className={`h-9 overflow-hidden border transition-all text-left ${cfg.accentColor === t.color && cfg.headerStyle === t.style ? 'border-primary ring-1 ring-primary' : 'border-white/10 hover:border-white/25'}`}
                >
                  {t.style === 'band'    && <div style={{ background: t.color }} className="w-full h-4" />}
                  {t.style === 'border'  && <div className="flex h-full"><div style={{ background: t.color }} className="w-1 flex-shrink-0" /><div className="flex-1 bg-white/5" /></div>}
                  {t.style === 'minimal' && <div className="flex flex-col h-full"><div style={{ borderBottom: `2px solid ${t.color}` }} className="bg-white/5 h-1/2" /><div className="flex-1" /></div>}
                  <div className="text-[8px] font-bold text-white/30 px-1 truncate">{t.name}</div>
                </button>
              ))}
            </div>
          </SidebarSection>

          {/* Design */}
          <SidebarSection title="Design" open={openSections.has('design')} onToggle={() => toggleSection('design')}>
            {/* Header style */}
            <div>
              <div className="text-[9px] uppercase tracking-widest text-white/30 mb-2">Header Style</div>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { value: 'band',    label: 'Band'   },
                  { value: 'border',  label: 'Border' },
                  { value: 'minimal', label: 'Minimal' },
                ] as const).map(s => (
                  <button key={s.value} onClick={() => update({ headerStyle: s.value })}
                    className={`py-2 border text-[9px] font-bold uppercase transition-all ${cfg.headerStyle === s.value ? 'border-primary bg-primary/10 text-primary' : 'border-white/10 text-white/40 hover:text-white/60'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Accent colour */}
            <div>
              <div className="text-[9px] uppercase tracking-widest text-white/30 mb-2">Accent Colour</div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {PRESET_COLORS.map(c => (
                  <button key={c} title={c} onClick={() => update({ accentColor: c })}
                    style={{ background: c }}
                    className={`w-7 h-7 transition-all relative ${cfg.accentColor === c ? 'ring-2 ring-white ring-offset-1 ring-offset-[#09090b] scale-110' : 'hover:scale-105 opacity-80 hover:opacity-100'}`}
                  >
                    {cfg.accentColor === c && <span className="absolute inset-0 flex items-center justify-center text-white text-[10px]">✓</span>}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={cfg.accentColor} onChange={e => update({ accentColor: e.target.value })}
                  className="w-8 h-7 cursor-pointer border border-white/10 bg-transparent p-0" />
                <input type="text" value={cfg.accentColor}
                  onChange={e => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && update({ accentColor: e.target.value })}
                  className="flex-1 px-2 py-1.5 bg-white/5 border border-white/10 text-white text-[11px] font-mono focus:outline-none focus:border-primary/50" />
              </div>
            </div>

            {/* Card size */}
            <div>
              <div className="text-[9px] uppercase tracking-widest text-white/30 mb-2">Size</div>
              <div className="flex gap-1.5 mb-2">
                {([
                  { label: 'CR80 Portrait',  w: '54mm',  h: '85.6mm' },
                  { label: 'CR80 Landscape', w: '85.6mm',h: '54mm'   },
                  { label: 'A7 Large',       w: '70mm',  h: '100mm'  },
                ] as const).map(s => (
                  <button key={s.label} onClick={() => update({ width: s.w, height: s.h })}
                    className={`flex-1 py-1.5 text-[8px] font-bold uppercase border transition-all truncate ${cfg.width === s.w && cfg.height === s.h ? 'border-primary bg-primary/10 text-primary' : 'border-white/10 text-white/40 hover:text-white/60'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <div className="text-[8px] text-white/30 mb-1">W (mm)</div>
                  <input type="text" value={cfg.width.replace('mm','')}
                    onChange={e => update({ width: e.target.value + 'mm' })}
                    className="w-full px-2 py-1.5 bg-white/5 border border-white/10 text-white text-[11px] font-mono focus:outline-none focus:border-primary/50" />
                </div>
                <div>
                  <div className="text-[8px] text-white/30 mb-1">H (mm)</div>
                  <input type="text" value={cfg.height.replace('mm','')}
                    onChange={e => update({ height: e.target.value + 'mm' })}
                    className="w-full px-2 py-1.5 bg-white/5 border border-white/10 text-white text-[11px] font-mono focus:outline-none focus:border-primary/50" />
                </div>
              </div>
            </div>

            {/* Background */}
            <div>
              <div className="text-[9px] uppercase tracking-widest text-white/30 mb-2">Background</div>
              <div className="flex gap-1.5 mb-2">
                {[{ label: 'White', value: '#ffffff' }, { label: 'Off-White', value: '#f9fafb' }, { label: 'Cream', value: '#fffbeb' }].map(c => (
                  <button key={c.value} onClick={() => update({ bgColor: c.value })} style={{ background: c.value }}
                    className={`flex-1 py-1.5 border text-[8px] font-bold text-gray-700 transition-all ${cfg.bgColor === c.value ? 'ring-2 ring-primary ring-offset-1 ring-offset-[#09090b]' : 'border-white/10'}`}>
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={cfg.bgColor} onChange={e => update({ bgColor: e.target.value })}
                  className="w-8 h-7 cursor-pointer border border-white/10 bg-transparent p-0" />
                <input type="text" value={cfg.bgColor}
                  onChange={e => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && update({ bgColor: e.target.value })}
                  className="flex-1 px-2 py-1.5 bg-white/5 border border-white/10 text-white text-[11px] font-mono focus:outline-none focus:border-primary/50" />
              </div>
            </div>

            {/* Corner radius */}
            <div>
              <div className="text-[9px] uppercase tracking-widest text-white/30 mb-2">Corners</div>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { value: 'sharp',   label: 'Sharp'   },
                  { value: 'rounded', label: 'Rounded' },
                  { value: 'pill',    label: 'Pill'    },
                ] as const).map(s => (
                  <button key={s.value} onClick={() => update({ cornerRadius: s.value })}
                    className={`py-2 border text-[9px] font-bold uppercase transition-all ${cfg.cornerRadius === s.value ? 'border-primary bg-primary/10 text-primary' : 'border-white/10 text-white/40 hover:text-white/60'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-2">
              {([
                { key: 'showLogo'     as const, label: 'Show Logo',       desc: 'Logo in header' },
                { key: 'showPhotoSlot'as const, label: 'Photo Slot',      desc: 'Student photo space' },
              ]).map(opt => (
                <label key={opt.key} className="flex items-center gap-3 cursor-pointer py-1">
                  <div onClick={() => update({ [opt.key]: !cfg[opt.key] })}
                    className={`w-8 h-4 rounded-full flex-shrink-0 transition-all relative ${cfg[opt.key] ? 'bg-primary' : 'bg-white/10'}`}>
                    <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${cfg[opt.key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-white/60">{opt.label}</div>
                    <div className="text-[8px] text-white/25">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </SidebarSection>

          {/* Fields */}
          <SidebarSection title="Fields" open={openSections.has('fields')} onToggle={() => toggleSection('fields')}>
            <div className="space-y-1.5">
              {cfg.fields.map((f, i) => (
                <div key={f.key} className={`flex items-center gap-1.5 px-2 py-2 border transition-all ${f.visible ? 'border-primary/30 bg-primary/5' : 'border-white/10'}`}>
                  <button onClick={() => toggleField(f.key)}
                    className={`w-4 h-4 border flex-shrink-0 flex items-center justify-center transition-all ${f.visible ? 'bg-primary border-primary' : 'border-white/20 hover:border-primary/50'}`}>
                    {f.visible && <span className="text-white text-[9px] leading-none">✓</span>}
                  </button>
                  <span className="text-[9px] font-black uppercase tracking-wider text-white/50 w-14 flex-shrink-0">{f.key}</span>
                  <input type="text" value={f.label} onChange={e => updateFieldLabel(f.key, e.target.value)}
                    className="flex-1 px-1.5 py-0.5 bg-white/5 border border-white/10 text-white/70 text-[10px] font-mono focus:outline-none focus:border-primary/40 min-w-0" />
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button onClick={() => moveField(i, -1)} disabled={i === 0}
                      className="w-4 h-3.5 flex items-center justify-center text-white/30 hover:text-white/70 disabled:opacity-10 transition-colors">
                      <ArrowUpIcon className="w-2.5 h-2.5" />
                    </button>
                    <button onClick={() => moveField(i, 1)} disabled={i === cfg.fields.length - 1}
                      className="w-4 h-3.5 flex items-center justify-center text-white/30 hover:text-white/70 disabled:opacity-10 transition-colors">
                      <ArrowDownIcon className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </SidebarSection>

          {/* Text */}
          <SidebarSection title="Text" open={openSections.has('text')} onToggle={() => toggleSection('text')}>
            <div className="space-y-3">
              {([
                { label: 'Org Name',    field: 'orgName'    as keyof CardConfig },
                { label: 'Website',     field: 'orgWebsite' as keyof CardConfig },
                { label: 'Card Label',  field: 'cardLabel'  as keyof CardConfig },
                { label: 'Footer Left', field: 'footerLeft' as keyof CardConfig },
                { label: 'Footer Right',field: 'footerRight'as keyof CardConfig },
              ]).map(({ label, field }) => (
                <div key={field}>
                  <div className="text-[8px] uppercase text-white/30 mb-1">{label}</div>
                  <input type="text" value={cfg[field] as string}
                    onChange={e => update({ [field]: e.target.value })}
                    className="w-full px-2 py-1.5 bg-white/5 border border-white/10 text-white text-[11px] font-mono focus:outline-none focus:border-primary/50" />
                </div>
              ))}
            </div>
          </SidebarSection>

          {/* Typography */}
          <SidebarSection title="Typography" open={openSections.has('typography')} onToggle={() => toggleSection('typography')}>
            <div className="space-y-3">
              {([
                { elem: 'orgName'     as const, label: 'Org Name'       },
                { elem: 'studentName' as const, label: 'Student Name'   },
                { elem: 'school'      as const, label: 'School'         },
                { elem: 'fieldLabel'  as const, label: 'Field Labels'   },
                { elem: 'fieldValue'  as const, label: 'Field Values'   },
                { elem: 'accentValue' as const, label: 'Accent Values'  },
                { elem: 'footer'      as const, label: 'Footer'         },
              ]).map(({ elem, label }) => {
                const s = cfg.typo[elem];
                return (
                  <div key={elem} className="border border-white/10 p-2 space-y-2">
                    <div className="text-[9px] font-black uppercase tracking-wider text-white/50">{label}</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <div className="text-[8px] text-white/30 mb-1">Size</div>
                        <input type="text" value={s.fontSize.replace('mm','')}
                          onChange={e => updateTypo(elem, { fontSize: e.target.value + 'mm' })}
                          className="w-full px-1.5 py-1 bg-white/5 border border-white/10 text-white text-[10px] font-mono focus:outline-none" />
                      </div>
                      <div>
                        <div className="text-[8px] text-white/30 mb-1">Weight</div>
                        <select value={s.fontWeight} onChange={e => updateTypo(elem, { fontWeight: e.target.value })}
                          className="w-full px-1 py-1 bg-white/5 border border-white/10 text-white text-[10px] focus:outline-none">
                          <option value="400">Regular</option>
                          <option value="600">Semi-Bold</option>
                          <option value="700">Bold</option>
                          <option value="800">Extra-Bold</option>
                          <option value="900">Black</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="color" value={s.color.startsWith('rgba') ? '#ffffff' : s.color}
                        onChange={e => updateTypo(elem, { color: e.target.value })}
                        className="w-7 h-6 cursor-pointer border border-white/10 bg-transparent p-0 flex-shrink-0" />
                      <input type="text" value={s.color} onChange={e => updateTypo(elem, { color: e.target.value })}
                        className="flex-1 px-1.5 py-1 bg-white/5 border border-white/10 text-white text-[9px] font-mono focus:outline-none min-w-0" />
                      <div className="flex gap-1">
                        {(['sans','mono'] as const).map(fam => (
                          <button key={fam} onClick={() => updateTypo(elem, { fontFamily: fam })}
                            className={`px-1.5 py-1 text-[8px] font-bold uppercase border transition-all ${s.fontFamily === fam ? 'bg-primary border-primary text-white' : 'border-white/10 text-white/30 hover:text-white/60'}`}>
                            {fam}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Preview swatch */}
                    <div className="bg-white px-3 py-1.5 overflow-hidden">
                      <span style={{ fontSize: s.fontSize, fontWeight: parseInt(s.fontWeight), color: s.color.startsWith('rgba') || s.color === '#ffffff' ? '#374151' : s.color, fontFamily: s.fontFamily === 'mono' ? 'monospace' : 'inherit' }}>
                        Sample — {label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </SidebarSection>
        </div>

        {/* Center: preview */}
        <div className="flex-1 flex flex-col items-center justify-center gap-6 overflow-auto p-6 min-w-0">
          <div className="text-[9px] uppercase tracking-widest text-white/20">Live Preview — Sample Data</div>
          <CardPreview cfg={cfg} scale={1.25} />
          <div className="flex flex-wrap gap-2 justify-center">
            <button onClick={handlePrintSample}
              className="flex items-center gap-1.5 px-4 py-2 border border-white/10 hover:border-white/25 text-white/50 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all">
              <PrinterIcon className="w-3.5 h-3.5" /> Print Sample
            </button>
            <button onClick={handleExportSinglePDF}
              className="flex items-center gap-1.5 px-4 py-2 border border-white/10 hover:border-white/25 text-white/50 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all">
              <ArrowDownTrayIcon className="w-3.5 h-3.5" /> PDF Single
            </button>
            <button onClick={handleExportBatchPDF}
              className="flex items-center gap-1.5 px-4 py-2 border border-white/10 hover:border-white/25 text-white/50 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all">
              <ArrowDownTrayIcon className="w-3.5 h-3.5" /> PDF 8×A4
            </button>
          </div>
          <p className="text-[9px] text-white/20 text-center max-w-xs">
            Save this design to apply it globally. All card prints — students page, bulk register, Card Studio — will use this layout.
          </p>
        </div>

        {/* Right: generate panel */}
        <div className="w-[260px] flex-shrink-0 border-l border-white/[0.07] flex flex-col overflow-hidden hidden lg:flex">
          <div className="flex-shrink-0 px-4 py-3 border-b border-white/[0.07]">
            <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">Generate Cards</div>
            <button onClick={loadStudents} disabled={studentsLoading}
              className="w-full flex items-center justify-center gap-2 py-2 bg-primary hover:bg-primary/90 text-white text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50">
              {studentsLoading
                ? <><div className="w-3 h-3 border-2 border-white/50 border-t-transparent rounded-full animate-spin" /> Loading…</>
                : studentsLoaded
                  ? <><CheckCircleIcon className="w-3.5 h-3.5" /> Reload Students</>
                  : <><ArrowDownTrayIcon className="w-3.5 h-3.5" /> Load Students</>
              }
            </button>
          </div>

          {students.length > 0 && (
            <>
              {/* Bulk actions */}
              <div className="flex-shrink-0 px-4 py-2.5 border-b border-white/[0.07] flex items-center gap-2 flex-wrap">
                <button onClick={() => setSelectedIds(new Set(visibleStudents.map(s => s.id)))}
                  className="text-[9px] font-black uppercase text-white/40 hover:text-white/70 transition-colors">
                  All ({visibleStudents.length})
                </button>
                <span className="text-white/10">|</span>
                <button onClick={() => setSelectedIds(new Set())}
                  className="text-[9px] font-black uppercase text-white/40 hover:text-white/70 transition-colors">
                  Clear
                </button>
                {selectedIds.size > 0 && (
                  <button onClick={printSelectedCards}
                    className="ml-auto flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-black uppercase tracking-wide transition-all">
                    <PrinterIcon className="w-3 h-3" /> {selectedIds.size}
                  </button>
                )}
              </div>

              {/* Filters */}
              <div className="flex-shrink-0 px-4 py-2.5 border-b border-white/[0.07] space-y-2">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30" />
                  <input value={studentSearch} onChange={e => setStudentSearch(e.target.value)}
                    placeholder="Search students…"
                    className="w-full pl-6 pr-3 py-1.5 bg-white/5 border border-white/10 text-white/70 text-[10px] placeholder-white/20 focus:outline-none focus:border-primary/40" />
                </div>
                {allSchoolsGen.length > 1 && (
                  <select value={selectedSchoolGen} onChange={e => setSelectedSchoolGen(e.target.value)}
                    className="w-full px-2 py-1.5 bg-white/5 border border-white/10 text-white/60 text-[10px] focus:outline-none truncate">
                    <option value="all">All schools ({students.length})</option>
                    {allSchoolsGen.map(sch => (
                      <option key={sch} value={sch}>{sch} ({students.filter(x => (x.school_name?.trim() || '— No school —') === sch).length})</option>
                    ))}
                  </select>
                )}
                {allClassesGen.length > 0 && (
                  <select value={selectedClassGen} onChange={e => setSelectedClassGen(e.target.value)}
                    className="w-full px-2 py-1.5 bg-white/5 border border-white/10 text-white/60 text-[10px] focus:outline-none">
                    <option value="all">All classes</option>
                    {allClassesGen.map(cls => (
                      <option key={cls} value={cls}>{cls} ({students.filter(x => (x.section_class || '').trim() === cls).length})</option>
                    ))}
                    {students.some(s => !(s.section_class || '').trim()) && (
                      <option value="__NONE__">No class assigned</option>
                    )}
                  </select>
                )}
              </div>

              {/* Student list */}
              <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 divide-y divide-white/[0.04]">
                {visibleStudents.length === 0 ? (
                  <div className="px-4 py-8 text-center text-[10px] text-white/25">No students match filters.</div>
                ) : visibleStudents.map(s => {
                  const sel = selectedIds.has(s.id);
                  const code = `RC-${s.id.slice(0, 8).toUpperCase()}`;
                  return (
                    <div key={s.id} onClick={() => toggleStudent(s.id)}
                      className={`flex items-center gap-2.5 px-4 py-2.5 cursor-pointer transition-all ${sel ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-white/[0.04] border-l-2 border-l-transparent'}`}>
                      <div className={`w-4 h-4 border flex-shrink-0 flex items-center justify-center transition-all ${sel ? 'bg-primary border-primary' : 'border-white/20'}`}>
                        {sel && <span className="text-white text-[9px]">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-white/80 truncate">{s.full_name}</p>
                        <p className="text-[9px] text-white/30 truncate">{s.section_class || '—'}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[9px] font-mono font-bold text-primary/70">{code}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {!studentsLoaded && (
            <div className="flex-1 flex items-center justify-center px-4">
              <p className="text-[10px] text-white/20 text-center leading-relaxed">
                Load students to select and print their access cards using this design.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
