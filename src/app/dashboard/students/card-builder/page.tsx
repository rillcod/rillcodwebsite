'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useSearchParams } from 'next/navigation';
import {
  PaintBrushIcon, CreditCardIcon, PrinterIcon, ArrowDownTrayIcon,
  CheckCircleIcon, EyeIcon, ArrowUpIcon, ArrowDownIcon,
  MagnifyingGlassIcon,
} from '@/lib/icons';

// ─── Types ────────────────────────────────────────────────────────────────────

type FieldKey = 'school' | 'className' | 'email' | 'password' | 'programme' | 'studentId' | 'qr';

interface FieldConfig {
  key: FieldKey;
  label: string;
  visible: boolean;
}

interface TypoStyle {
  fontSize: string;   // e.g. "3.8mm"
  fontWeight: string; // "400" | "700" | "900"
  color: string;      // hex
  fontFamily: string; // "sans" | "mono"
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
  { key: 'school',     label: 'School',             visible: true  },
  { key: 'className',  label: 'Class',               visible: true  },
  { key: 'email',      label: 'Email',               visible: true  },
  { key: 'password',   label: 'Temporary Password',  visible: true  },
  { key: 'programme',  label: 'Programme',            visible: false },
  { key: 'studentId',  label: 'Student ID',           visible: true  },
  { key: 'qr',         label: 'QR Code',              visible: true  },
];

const DEFAULT_TYPO: CardConfig['typo'] = {
  orgName:     { fontSize: '2.5mm', fontWeight: '900', color: '#ffffff', fontFamily: 'sans' },
  orgWebsite:  { fontSize: '1.6mm', fontWeight: '700', color: 'rgba(255,255,255,0.85)', fontFamily: 'sans' },
  studentName: { fontSize: '3.8mm', fontWeight: '900', color: '#111827', fontFamily: 'sans' },
  school:      { fontSize: '1.9mm', fontWeight: '900', color: '#ea580c', fontFamily: 'sans' },
  fieldLabel:  { fontSize: '1.5mm', fontWeight: '700', color: '#9ca3af', fontFamily: 'sans' },
  fieldValue:  { fontSize: '2.1mm', fontWeight: '700', color: '#111827', fontFamily: 'mono' },
  accentValue: { fontSize: '2.2mm', fontWeight: '800', color: '#ea580c', fontFamily: 'mono' },
  footer:      { fontSize: '1.5mm', fontWeight: '600', color: '#9ca3af', fontFamily: 'sans' },
};

const DEFAULT_CONFIG: CardConfig = {
  accentColor: '#ea580c',
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
  fields: DEFAULT_FIELDS,
  typo: DEFAULT_TYPO,
};

const ROLE_PRESETS: Record<'student' | 'parent' | 'teacher', Partial<CardConfig>> = {
  student: {
    cardLabel: 'Student Access Card',
    footerRight: 'Student ID',
  },
  parent: {
    cardLabel: 'Parent Access Card',
    footerRight: 'Parent ID',
    fields: DEFAULT_FIELDS.map((f) => {
      if (f.key === 'password') return { ...f, visible: true, label: 'Temporary Password' };
      if (f.key === 'studentId') return { ...f, visible: true, label: 'Parent ID' };
      if (f.key === 'programme') return { ...f, visible: false };
      if (f.key === 'className') return { ...f, visible: false };
      if (f.key === 'school') return { ...f, visible: true, label: 'Home School' };
      return f;
    }),
  },
  teacher: {
    cardLabel: 'Teacher Access Card',
    footerRight: 'Staff ID',
    fields: DEFAULT_FIELDS.map((f) => {
      if (f.key === 'password') return { ...f, visible: true, label: 'Temporary Password' };
      if (f.key === 'studentId') return { ...f, visible: true, label: 'Staff ID' };
      if (f.key === 'programme') return { ...f, visible: true, label: 'Department' };
      if (f.key === 'className') return { ...f, visible: true, label: 'Role' };
      return f;
    }),
  },
};

// ─── Templates ───────────────────────────────────────────────────────────────

const TEMPLATES: { name: string; description: string; config: Partial<CardConfig> }[] = [
  {
    name: 'Formal Orange',
    description: 'Full-width orange header band — the default official look',
    config: {
      accentColor: '#ea580c',
      headerStyle: 'band',
      fields: DEFAULT_FIELDS,
    },
  },
  {
    name: 'Indigo Academy',
    description: 'Deep indigo — professional academic feel',
    config: {
      accentColor: '#4f46e5',
      headerStyle: 'band',
      fields: DEFAULT_FIELDS,
    },
  },
  {
    name: 'Emerald School',
    description: 'Green accent — clean and fresh',
    config: {
      accentColor: '#059669',
      headerStyle: 'band',
      fields: DEFAULT_FIELDS,
    },
  },
  {
    name: 'Classic Border',
    description: 'Subtle left-border accent — minimal and clean',
    config: {
      accentColor: '#ea580c',
      headerStyle: 'border',
      fields: DEFAULT_FIELDS,
    },
  },
  {
    name: 'Minimal',
    description: 'No coloured header — just the essentials',
    config: {
      accentColor: '#374151',
      headerStyle: 'minimal',
      fields: DEFAULT_FIELDS.map(f => ({ ...f, visible: ['school','email','password','studentId','qr'].includes(f.key) })),
    },
  },
  {
    name: 'Credentials Only',
    description: 'Email + password only — no personal info shown',
    config: {
      accentColor: '#ea580c',
      headerStyle: 'band',
      fields: DEFAULT_FIELDS.map(f => ({ ...f, visible: ['email','password','qr'].includes(f.key) })),
    },
  },
];

// ─── Extra Templates ──────────────────────────────────────────────────────────

TEMPLATES.push(
  {
    name: 'Royal Blue',
    description: 'Deep navy header — formal and academic',
    config: { accentColor: '#1d4ed8', headerStyle: 'band', fields: DEFAULT_FIELDS },
  },
  {
    name: 'Rose Gold',
    description: 'Warm rose accent — modern and distinctive',
    config: { accentColor: '#e11d48', headerStyle: 'band', fields: DEFAULT_FIELDS },
  },
  {
    name: 'Government Green',
    description: 'Deep green — official and authoritative',
    config: { accentColor: '#15803d', headerStyle: 'band', fields: DEFAULT_FIELDS },
  },
  {
    name: 'Dark Pro',
    description: 'Slate header — premium dark look',
    config: { accentColor: '#1e293b', headerStyle: 'band', fields: DEFAULT_FIELDS },
  },
  {
    name: 'Teal Academic',
    description: 'Teal side border — clean and fresh',
    config: { accentColor: '#0f766e', headerStyle: 'border', fields: DEFAULT_FIELDS },
  },
  {
    name: 'Violet Pro',
    description: 'Deep violet band — tech and innovation feel',
    config: { accentColor: '#7c3aed', headerStyle: 'band', fields: DEFAULT_FIELDS },
  },
);

const PRESET_COLORS = [
  { label: 'Orange',  value: '#ea580c' },
  { label: 'Indigo',  value: '#4f46e5' },
  { label: 'Emerald', value: '#059669' },
  { label: 'Rose',    value: '#e11d48' },
  { label: 'Slate',   value: '#1e293b' },
  { label: 'Amber',   value: '#d97706' },
  { label: 'Violet',  value: '#7c3aed' },
  { label: 'Teal',    value: '#0f766e' },
  { label: 'Navy',    value: '#1d4ed8' },
  { label: 'Green',   value: '#15803d' },
  { label: 'Crimson', value: '#b91c1c' },
  { label: 'Gold',    value: '#b45309' },
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

const STORAGE_KEY = 'rillcod_card_builder_config';

// ─── QR Placeholder SVG ───────────────────────────────────────────────────────

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

// ─── Live Card Preview ────────────────────────────────────────────────────────

function CardPreview({ cfg }: { cfg: CardConfig }) {
  const acc = cfg.accentColor;
  const vis = (key: FieldKey) => cfg.fields.find(f => f.key === key)?.visible ?? false;
  const lbl = (key: FieldKey) => cfg.fields.find(f => f.key === key)?.label ?? key;

  const infoFields = cfg.fields.filter(f => f.visible && f.key !== 'qr' && f.key !== 'className');

  const sampleVal = (key: FieldKey): string => ({
    school: SAMPLE.school, className: SAMPLE.className, email: SAMPLE.email,
    password: SAMPLE.password, programme: SAMPLE.programme, studentId: SAMPLE.id, qr: '',
  }[key]);

  const t = cfg.typo;
  const ff = (fam: string) => fam === 'mono' ? 'monospace' : "'Inter','Segoe UI',system-ui,sans-serif";
  const ts = (s: TypoStyle, extra?: React.CSSProperties): React.CSSProperties => ({
    fontSize: s.fontSize, fontWeight: parseInt(s.fontWeight), color: s.color,
    fontFamily: ff(s.fontFamily), ...extra,
  });

  const isAccentField = (k: FieldKey) => ['password','studentId','programme'].includes(k);

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
    <div style={{ border: '1px solid #d1d5db', borderLeft: cfg.headerStyle === 'border' ? `4px solid ${acc}` : '1px solid #d1d5db', width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff', color: '#111827' }}>
      <Header />
      <div style={{ display: 'flex', flex: 1 }}>
        <div style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5, borderRight: vis('qr') ? '1px solid #f3f4f6' : 'none', overflow: 'hidden' }}>
          <div style={ts(t.studentName, { textTransform: 'uppercase', lineHeight: 1.15 })}>{SAMPLE.name}</div>
          <div style={{ height: 1, background: '#f3f4f6' }} />
          {infoFields.map(f => (
            <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <div style={ts(t.fieldLabel, { textTransform: 'uppercase', letterSpacing: 0.5 })}>{f.label}</div>
              <div style={ts(isAccentField(f.key) ? t.accentValue : f.key === 'school' ? t.school : t.fieldValue, { wordBreak: 'break-all' })}>
                {sampleVal(f.key)}
              </div>
            </div>
          ))}
        </div>
        {vis('qr') && (
          <div style={{ width: '30%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '10px 8px', background: '#fafafa', flexShrink: 0 }}>
            <QrPlaceholder size={72} color={acc} />
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

// ─── Page ─────────────────────────────────────────────────────────────────────

interface RealStudent {
  id: string;
  full_name: string;
  email: string | null;
  school_name: string | null;
  section_class: string | null;
}

function studentSchoolLabel(s: RealStudent) {
  return s.school_name?.trim() || '— No school —';
}

export default function CardBuilderPage() {
  const { profile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const [cfg, setCfg] = useState<CardConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'templates' | 'design' | 'fields' | 'text' | 'typography' | 'generate'>('templates');
  // Generate tab state
  const [students, setStudents] = useState<RealStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedSchoolGen, setSelectedSchoolGen] = useState<string>('all');
  const [selectedClassGen, setSelectedClassGen] = useState<string>('all');

  const applyRolePreset = (base: CardConfig, roleType: string | null): CardConfig => {
    if (roleType !== 'student' && roleType !== 'parent' && roleType !== 'teacher') return base;
    const p = ROLE_PRESETS[roleType];
    return {
      ...base,
      ...p,
      fields: p.fields ? p.fields : base.fields,
    };
  };

  useEffect(() => {
    const presetType = (searchParams.get('type') || 'student').toLowerCase();
    fetch(`/api/admin/settings?type=${presetType}`)
      .then(res => res.json())
      .then(data => {
        if (data.config) {
          const parsed = data.config;
          if (parsed.fields) {
            const mergedFields = DEFAULT_FIELDS.map(def => {
              const stored = parsed.fields.find((f: FieldConfig) => f.key === def.key);
              return stored ? { ...def, ...stored } : def;
            });
            parsed.fields = mergedFields;
          }
          if (parsed.typo) parsed.typo = { ...DEFAULT_TYPO, ...parsed.typo };
          setCfg(applyRolePreset({ ...DEFAULT_CONFIG, ...parsed }, presetType));
          return;
        }
        setCfg(applyRolePreset(DEFAULT_CONFIG, presetType));
      })
      .catch(console.error);
  }, [searchParams]);

  const allSchoolsGen = useMemo(() => {
    const set = new Set(students.map(studentSchoolLabel));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [students]);

  const allClassesGen = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.section_class?.trim()) set.add(s.section_class.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [students]);

  const hasStudentsWithoutClass = useMemo(
    () => students.some((s) => !(s.section_class || '').trim()),
    [students],
  );

  const schoolLockGen = profile?.role === 'school' ? String(profile.school_name || '').trim() : '';

  const showSchoolFilterGen =
    !!schoolLockGen ||
    ((profile?.role === 'admin' || profile?.role === 'teacher') && allSchoolsGen.length > 1);

  const showClassFilterGen = allClassesGen.length > 0 || hasStudentsWithoutClass;

  const visibleStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return students.filter((s) => {
      const sch = studentSchoolLabel(s);
      if (schoolLockGen && sch !== schoolLockGen && (s.school_name || '').trim() !== schoolLockGen) {
        return false;
      }
      if (
        (profile?.role === 'admin' || profile?.role === 'teacher') &&
        allSchoolsGen.length > 1 &&
        selectedSchoolGen !== 'all' &&
        sch !== selectedSchoolGen
      ) {
        return false;
      }
      const cl = (s.section_class || '').trim();
      if (selectedClassGen !== 'all') {
        if (selectedClassGen === '__NONE__') {
          if (cl) return false;
        } else if (cl !== selectedClassGen) return false;
      }
      if (!q) return true;
      return [s.full_name, s.email, s.school_name, s.section_class].some((v) =>
        (v || '').toLowerCase().includes(q),
      );
    });
  }, [
    students,
    studentSearch,
    selectedSchoolGen,
    selectedClassGen,
    schoolLockGen,
    profile?.role,
    allSchoolsGen.length,
  ]);

  if (authLoading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const cardType = (searchParams.get('type') || 'student').toLowerCase();

  const canUseStudentBuilder =
    profile.role === 'admin' ||
    profile.role === 'teacher' ||
    (profile.role === 'school' && cardType === 'student');

  if (!canUseStudentBuilder) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <p className="text-muted-foreground">Access denied.</p>
      </div>
    );
  }

  // Teacher cards are admin-only
  if (cardType === 'teacher' && profile.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
        <CreditCardIcon className="w-16 h-16 text-rose-500/30" />
        <p className="text-lg font-black text-foreground">Admin Only</p>
        <p className="text-muted-foreground text-sm text-center max-w-sm">Teacher access card design is restricted to administrators. Contact your admin to update the teacher card template.</p>
      </div>
    );
  }

  const loadStudents = () => {
    if (students.length > 0) return;
    setStudentsLoading(true);
    fetch('/api/portal-users?role=student&scoped=true')
      .then(r => r.json())
      .then(j => setStudents((j.data ?? []).map((s: any) => ({
        id: s.id,
        full_name: s.full_name,
        email: s.email ?? null,
        school_name: s.school_name ?? null,
        section_class: s.section_class ?? null,
      }))))
      .catch(() => {})
      .finally(() => setStudentsLoading(false));
  };

  const toggleStudent = (id: string) =>
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const printStudentCards = (list: RealStudent[]) => {
    if (!list.length) return;
    const acc = cfg.accentColor;
    const logo = `${window.location.origin}/images/logo.png`;
    const hStyle = cfg.headerStyle;
    const vis = (key: FieldKey) => cfg.fields.find(f => f.key === key)?.visible ?? false;

    const cardHtml = (s: RealStudent) => {
      const code = `RC-${s.id.slice(0, 8).toUpperCase()}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(`${window.location.origin}/verify/${s.id}`)}`;
      const hdrClass = hStyle === 'border' ? 'hdr-border' : hStyle === 'minimal' ? 'hdr-min' : 'hdr-band';
      const fieldRows = [
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
            ${s.school_name ? `<div class="school">${s.school_name}</div>` : ''}
            <div class="name">${s.full_name}</div>
            ${fieldRows}
          </div>
          ${vis('qr') ? `<div class="right"><img class="qr" src="${qrUrl}" /><div class="code">${code}</div></div>` : ''}
        </div>
        <div class="ftr"><span>${cfg.footerLeft}</span><span>${code}</span></div>
      </div>`;
    };

    const html = `<!doctype html><html><head><title>Student Access Cards</title>
    <style>
      @page { size: A4 portrait; margin: 8mm; }
      * { box-sizing:border-box; }
      body { margin:0; font-family:Inter,system-ui,sans-serif; color:#111827; background:#fff; }
      .grid { display:grid; grid-template-columns:repeat(2, 1fr); gap:8mm; }
      .card { width:100%; min-height:62mm; border:1px solid #e5e7eb; display:flex; flex-direction:column; overflow:hidden; background:${cfg.bgColor||'#fff'}; }
      .hdr-band { background:${acc}; color:#fff; padding:2.2mm 3mm; display:flex; align-items:center; gap:2mm; }
      .hdr-border { border-left:2.5mm solid ${acc}; padding:2.2mm 3mm; display:flex; align-items:center; gap:2mm; }
      .hdr-min { border-bottom:1px solid #e5e7eb; padding:2.2mm 3mm; display:flex; align-items:center; gap:2mm; }
      .logo { width:5mm; height:5mm; object-fit:contain; }
      .org { font-weight:900; font-size:2.5mm; text-transform:uppercase; line-height:1; }
      .web { font-size:1.8mm; opacity:.8; margin-top:.5mm; }
      .cbadge { margin-left:auto; background:rgba(0,0,0,0.22); color:#fff; padding:.5mm 1.5mm; font-size:1.6mm; font-weight:900; text-transform:uppercase; }
      .body { display:flex; flex:1; }
      .left { flex:1; padding:2.5mm 3mm; border-right:1px solid #f3f4f6; }
      .school { color:${acc}; font-size:1.8mm; font-weight:900; text-transform:uppercase; }
      .name { font-size:4mm; font-weight:900; margin:.8mm 0 1.2mm; text-transform:uppercase; line-height:1.2; }
      .row { margin:.6mm 0; }
      .lbl { color:#9ca3af; font-size:1.5mm; text-transform:uppercase; }
      .val { font-size:2mm; font-weight:700; }
      .val-a { font-size:2mm; font-weight:800; font-family:monospace; color:${acc}; }
      .right { width:22mm; background:#fafafa; padding:2mm; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:1mm; }
      .qr { width:15mm; height:15mm; border:1px solid #e5e7eb; }
      .code { color:${acc}; font-size:1.5mm; font-family:monospace; font-weight:900; text-align:center; }
      .ftr { border-top:1px solid #f3f4f6; background:#fafafa; color:#6b7280; display:flex; justify-content:space-between; padding:1.2mm 3mm; font-size:1.5mm; }
      @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
    </style></head><body>
    <div class="grid">${list.map(s => cardHtml(s)).join('')}</div>
    <script>window.onload=()=>{window.print(); setTimeout(()=>window.close(),500);};</script>
    </body></html>`;

    const win = window.open('', '_blank');
    if (!win) { alert('Pop-up blocked. Please allow pop-ups.'); return; }
    win.document.write(html); win.document.close();
  };

  const update = (patch: Partial<CardConfig>) => setCfg(prev => ({ ...prev, ...patch }));

  const applyTemplate = (t: typeof TEMPLATES[0]) => {
    setCfg(prev => ({
      ...prev,
      ...t.config,
      fields: t.config.fields ? t.config.fields : prev.fields,
    }));
  };

  const toggleField = (key: FieldKey) =>
    setCfg(prev => ({
      ...prev,
      fields: prev.fields.map(f => f.key === key ? { ...f, visible: !f.visible } : f),
    }));

  const updateFieldLabel = (key: FieldKey, label: string) =>
    setCfg(prev => ({
      ...prev,
      fields: prev.fields.map(f => f.key === key ? { ...f, label } : f),
    }));

  const moveField = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= cfg.fields.length) return;
    const arr = [...cfg.fields];
    [arr[index], arr[next]] = [arr[next], arr[index]];
    setCfg(prev => ({ ...prev, fields: arr }));
  };

  const handleSave = async () => {
    const rolePreset = (searchParams.get('type') || 'student').toLowerCase();
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: cfg, type: rolePreset }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      alert('Failed to save config');
    }
  };

  const handleReset = async () => {
    const rolePreset = (searchParams.get('type') || 'student').toLowerCase();
    setCfg(DEFAULT_CONFIG);
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: DEFAULT_CONFIG, type: rolePreset }),
      });
    } catch (err) { /* ignore */ }
  };

  const buildPrintHtml = (sample = true) => {
    const acc = cfg.accentColor;
    const vis = (key: FieldKey) => cfg.fields.find(f => f.key === key)?.visible ?? false;
    const lbl = (key: FieldKey) => cfg.fields.find(f => f.key === key)?.label ?? key;
    const logoUrl = window.location.origin + '/logo.png';

    const infoFields = cfg.fields.filter(f => f.visible && f.key !== 'qr' && f.key !== 'className');
    const qUrl = encodeURIComponent('https://rillcod.com/student/sample');

    const sampleData = { school: SAMPLE.school, email: SAMPLE.email, password: SAMPLE.password, programme: SAMPLE.programme, studentId: SAMPLE.id, className: SAMPLE.className };

    const bandHdr = `
      <div class="chdr">
        <img src="${logoUrl}" class="logo" />
        <div><div class="org-name">${cfg.orgName}</div><div class="org-web">${cfg.orgWebsite}</div></div>
        ${vis('className') ? `<div class="cbadge">${sampleData.className}</div>` : ''}
      </div>`;
    const borderHdr = `
      <div class="bhdr">
        <img src="${logoUrl}" class="logo" />
        <div><div class="org-name-b">${cfg.orgName}</div><div class="org-web-b">${cfg.orgWebsite}</div></div>
        ${vis('className') ? `<div class="bbadge">${sampleData.className}</div>` : ''}
      </div>`;
    const minimalHdr = `
      <div class="mhdr">
        <img src="${logoUrl}" class="logo" />
        <div class="org-name-m">${cfg.orgName}</div>
        ${vis('className') ? `<div class="mbadge">${sampleData.className}</div>` : ''}
      </div>`;

    const hdr = cfg.headerStyle === 'band' ? bandHdr : cfg.headerStyle === 'border' ? borderHdr : minimalHdr;

    return `<html><head><title>Sample Access Card</title>
    <style>
      @page { size: A4 portrait; margin: 20mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family:'Inter','Segoe UI',system-ui,sans-serif; background:#fff; display:flex; justify-content:center; }
      .card { border:1px solid #d1d5db; ${cfg.headerStyle === 'border' ? `border-left:4px solid ${acc};` : ''} width:100%; max-width:480px; display:flex; flex-direction:column; overflow:hidden; }
      .chdr { background:${acc}; padding:12px 18px; display:flex; align-items:center; gap:10px; }
      .cbadge { margin-left:auto; background:rgba(0,0,0,0.22); color:#fff; padding:5px 12px; font-size:9px; font-weight:900; text-transform:uppercase; letter-spacing:1px; flex-shrink:0; }
      .org-name { font-size:14px; font-weight:900; color:#fff; text-transform:uppercase; line-height:1; }
      .org-web { font-size:9px; color:rgba(255,255,255,0.8); font-weight:700; margin-top:3px; }
      .bhdr { display:flex; align-items:center; gap:10px; padding:10px 16px; border-bottom:1px solid #f3f4f6; }
      .org-name-b { font-size:13px; font-weight:900; color:#111; text-transform:uppercase; line-height:1; }
      .org-web-b { font-size:8px; color:${acc}; font-weight:700; margin-top:2px; }
      .bbadge { margin-left:auto; background:${acc}; color:#fff; padding:4px 10px; font-size:9px; font-weight:900; text-transform:uppercase; flex-shrink:0; }
      .mhdr { display:flex; align-items:center; gap:10px; padding:9px 16px; border-bottom:2px solid ${acc}; }
      .org-name-m { font-size:11px; font-weight:900; color:#111; text-transform:uppercase; }
      .mbadge { margin-left:auto; font-size:9px; font-weight:900; color:${acc}; text-transform:uppercase; flex-shrink:0; }
      .logo { width:32px; height:32px; object-fit:contain; flex-shrink:0; }
      .cbody { display:flex; min-height:160px; }
      .info { flex:1; padding:18px 20px; display:flex; flex-direction:column; gap:10px; border-right:1px solid #f3f4f6; overflow:hidden; }
      .sname { font-size:22px; font-weight:900; color:#111; text-transform:uppercase; line-height:1.15; }
      .sep { height:1px; background:#f3f4f6; }
      .field { display:flex; flex-direction:column; gap:3px; }
      .lbl { font-size:7.5px; font-weight:700; color:#9ca3af; text-transform:uppercase; letter-spacing:1px; }
      .val { font-size:13px; font-weight:700; font-family:monospace; color:#111; word-break:break-all; }
      .val-a { font-size:13px; font-weight:800; font-family:monospace; color:${acc}; word-break:break-all; }
      .qrp { width:160px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; padding:18px 16px; background:#fafafa; flex-shrink:0; }
      .qr { width:130px; height:130px; border:1px solid #e5e7eb; display:block; }
      .qrl { font-size:7px; color:#9ca3af; text-transform:uppercase; letter-spacing:1px; text-align:center; font-weight:600; }
      .qrc { font-size:9px; font-weight:900; font-family:monospace; color:${acc}; text-align:center; }
      .cftr { display:flex; justify-content:space-between; align-items:center; padding:8px 18px; border-top:1px solid #f3f4f6; font-size:7.5px; color:#9ca3af; font-weight:600; background:#fafafa; }
      .cftr-id { font-family:monospace; color:#374151; font-weight:900; font-size:8px; }
      @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
    </style></head><body>
    <div class="card">
      ${hdr}
      <div class="cbody">
        <div class="info">
          <div class="sname">${SAMPLE.name}</div>
          <div class="sep"></div>
          ${infoFields.map(f => {
            const val = sampleData[f.key as keyof typeof sampleData] ?? '';
            const accent = ['password','studentId','programme','school'].includes(f.key);
            return `<div class="field"><div class="lbl">${f.label}</div><div class="${accent ? 'val-a' : 'val'}">${val}</div></div>`;
          }).join('')}
        </div>
        ${vis('qr') ? `
        <div class="qrp">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qUrl}" class="qr" crossorigin="anonymous" />
          <div class="qrl">Scan to verify</div>
          <div class="qrc">${SAMPLE.id}</div>
        </div>` : ''}
      </div>
      <div class="cftr">
        <span>${cfg.footerLeft}</span>
        <span class="cftr-id">${cfg.footerRight === 'Student ID' ? SAMPLE.id : cfg.footerRight}</span>
      </div>
    </div>
    <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); }</script>
    </body></html>`;
  };

  const handlePrintSample = () => {
    const win = window.open('', '_blank');
    win?.document.write(buildPrintHtml());
    win?.document.close();
  };

  // jsPDF single-card export
  const handleExportSinglePDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const acc = cfg.accentColor;
    const vis = (key: FieldKey) => cfg.fields.find(f => f.key === key)?.visible ?? false;
    const lbl = (key: FieldKey) => cfg.fields.find(f => f.key === key)?.label ?? key;
    const infoFields = cfg.fields.filter(f => f.visible && f.key !== 'qr' && f.key !== 'className');
    const sampleData: Record<string, string> = { school: SAMPLE.school, email: SAMPLE.email, password: SAMPLE.password, programme: SAMPLE.programme, studentId: SAMPLE.id, className: SAMPLE.className };
    const r = (hex: string) => parseInt(hex.slice(1,3),16);
    const g = (hex: string) => parseInt(hex.slice(3,5),16);
    const b = (hex: string) => parseInt(hex.slice(5,7),16);

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const cardW = 130, cardX = (210 - cardW) / 2;
    const cardY = 30;

    // Card border
    doc.setDrawColor(209, 213, 219); doc.setLineWidth(0.3);
    doc.rect(cardX, cardY, cardW, 75);

    // Header
    if (cfg.headerStyle === 'band') {
      doc.setFillColor(r(acc), g(acc), b(acc));
      doc.rect(cardX, cardY, cardW, 12, 'F');
      doc.setFontSize(9); doc.setTextColor(255,255,255); doc.setFont('helvetica','bold');
      doc.text(cfg.orgName, cardX + 5, cardY + 5.5);
      doc.setFontSize(6); doc.setFont('helvetica','normal');
      doc.text(cfg.orgWebsite, cardX + 5, cardY + 9);
      if (vis('className')) {
        doc.setFillColor(0,0,0,0.3); const bw = SAMPLE.className.length * 2.2 + 6;
        doc.setFillColor(0,0,0); doc.rect(cardX + cardW - bw - 2, cardY + 3, bw, 6, 'F');
        doc.setFontSize(6); doc.setTextColor(255,255,255); doc.text(SAMPLE.className, cardX + cardW - bw/2 - 2, cardY + 7.2, {align:'center'});
      }
    } else if (cfg.headerStyle === 'border') {
      doc.setFillColor(r(acc), g(acc), b(acc));
      doc.rect(cardX, cardY, 2, 75, 'F');
      doc.setFontSize(9); doc.setTextColor(17,24,39); doc.setFont('helvetica','bold');
      doc.text(cfg.orgName, cardX + 5, cardY + 7);
      doc.setFontSize(6); doc.setTextColor(r(acc), g(acc), b(acc)); doc.setFont('helvetica','normal');
      doc.text(cfg.orgWebsite, cardX + 5, cardY + 11);
    } else {
      doc.setDrawColor(r(acc), g(acc), b(acc)); doc.setLineWidth(0.8);
      doc.line(cardX, cardY + 11, cardX + cardW, cardY + 11);
      doc.setFontSize(9); doc.setTextColor(17,24,39); doc.setFont('helvetica','bold');
      doc.text(cfg.orgName, cardX + 5, cardY + 7);
    }

    // Body
    const bodyY = cardY + (cfg.headerStyle === 'band' ? 16 : 15);
    const qrW = vis('qr') ? 30 : 0;
    const infoW = cardW - qrW - 8;

    doc.setFontSize(12); doc.setTextColor(17,24,39); doc.setFont('helvetica','bold');
    doc.text(SAMPLE.name, cardX + 4, bodyY + 6);
    doc.setDrawColor(243,244,246); doc.setLineWidth(0.2);
    doc.line(cardX + 4, bodyY + 9, cardX + 4 + infoW - 2, bodyY + 9);

    let fy = bodyY + 14;
    infoFields.forEach(f => {
      doc.setFontSize(5.5); doc.setTextColor(156,163,175); doc.setFont('helvetica','normal');
      doc.text(f.label.toUpperCase(), cardX + 4, fy);
      doc.setFontSize(7.5); doc.setFont('courier','bold');
      const isAccent = ['password','studentId','programme','school'].includes(f.key);
      doc.setTextColor(isAccent ? r(acc) : 17, isAccent ? g(acc) : 24, isAccent ? b(acc) : 39);
      doc.text(doc.splitTextToSize(sampleData[f.key] ?? '', infoW)[0], cardX + 4, fy + 4.5);
      fy += 11;
    });

    // Footer
    const ftrY = cardY + 70;
    doc.setDrawColor(243,244,246); doc.setLineWidth(0.2);
    doc.line(cardX + 2, ftrY, cardX + cardW - 2, ftrY);
    doc.setFontSize(6); doc.setTextColor(156,163,175); doc.setFont('helvetica','normal');
    doc.text(cfg.footerLeft, cardX + 4, ftrY + 4);
    doc.setTextColor(55,65,81); doc.setFont('courier','bold');
    doc.text(cfg.footerRight === 'Student ID' ? SAMPLE.id : cfg.footerRight, cardX + cardW - 4, ftrY + 4, {align:'right'});

    doc.save('rillcod_sample_card.pdf');
  };

  // jsPDF batch export (8 per A4, same style as batch print)
  const handleExportBatchPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const acc = cfg.accentColor;
    const vis = (key: FieldKey) => cfg.fields.find(f => f.key === key)?.visible ?? false;
    const infoFields = cfg.fields.filter(f => f.visible && f.key !== 'qr' && f.key !== 'className');
    const sampleData: Record<string, string> = { school: SAMPLE.school, email: SAMPLE.email, password: SAMPLE.password, programme: SAMPLE.programme, studentId: SAMPLE.id, className: SAMPLE.className };
    const r = (hex: string) => parseInt(hex.slice(1,3),16);
    const g = (hex: string) => parseInt(hex.slice(3,5),16);
    const b = (hex: string) => parseInt(hex.slice(5,7),16);

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const marginX = 8, marginY = 8, gap = 3;
    const cardW = (210 - marginX * 2 - gap) / 2;
    const cardH = (297 - marginY * 2 - gap * 3) / 4;

    // Print 8 sample cards (2 cols × 4 rows)
    for (let i = 0; i < 8; i++) {
      const col = i % 2, row = Math.floor(i / 2);
      const x = marginX + col * (cardW + gap);
      const y = marginY + row * (cardH + gap);

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
          doc.setFillColor(0,0,0);
          doc.rect(x + cardW - bw - 1, y + 1.5, bw, 5, 'F');
          doc.setFontSize(4); doc.setTextColor(255,255,255);
          doc.text(SAMPLE.className, x + cardW - bw/2 - 1, y + 5, {align:'center'});
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

      let fy2 = bodyY + 10;
      infoFields.slice(0, 3).forEach(f => {
        doc.setFontSize(3.5); doc.setTextColor(156,163,175); doc.setFont('helvetica','normal');
        doc.text(f.label.toUpperCase(), ix, fy2);
        doc.setFontSize(5); doc.setFont('courier','bold');
        const isAccent = ['password','studentId','programme','school'].includes(f.key);
        doc.setTextColor(isAccent ? r(acc) : 17, isAccent ? g(acc) : 24, isAccent ? b(acc) : 39);
        doc.text(doc.splitTextToSize(sampleData[f.key] ?? '', cardW - (vis('qr') ? 24 : 8))[0], ix, fy2 + 3.5);
        fy2 += 8;
      });

      doc.setDrawColor(243,244,246); doc.setLineWidth(0.2);
      doc.line(ix, y + cardH - 6, x + cardW - 2, y + cardH - 6);
      doc.setFontSize(3.5); doc.setTextColor(156,163,175); doc.setFont('helvetica','normal');
      doc.text(cfg.footerLeft, ix, y + cardH - 2.5);
      doc.setTextColor(55,65,81); doc.setFont('courier','bold');
      doc.text(SAMPLE.id, x + cardW - 2, y + cardH - 2.5, {align:'right'});
    }

    doc.save('rillcod_batch_cards_sample.pdf');
  };

  const updateTypo = (elem: keyof CardConfig['typo'], patch: Partial<TypoStyle>) =>
    setCfg(prev => ({ ...prev, typo: { ...prev.typo, [elem]: { ...prev.typo[elem], ...patch } } }));

  const tabs = [
    { key: 'templates',  label: 'Templates'  },
    { key: 'design',     label: 'Design'     },
    { key: 'fields',     label: 'Fields'     },
    { key: 'text',       label: 'Text'       },
    { key: 'typography', label: 'Typography' },
    { key: 'generate',   label: 'Generate'   },
  ] as const;

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-orange-600 flex items-center justify-center rotate-3 border border-orange-400/20 shadow-xl shadow-orange-600/10 hover:rotate-6 transition-transform flex-shrink-0">
            <CreditCardIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-foreground italic tracking-tighter uppercase">Access Card Builder</h1>
            <p className="text-muted-foreground text-[9px] uppercase font-bold tracking-[0.4em] mt-1">Customise the student access card design</p>
          </div>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <button onClick={handleReset} className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 transition-all">
              Reset
            </button>
            <button onClick={handleSave} className="flex items-center gap-2 px-5 py-2 bg-orange-600 hover:bg-orange-500 text-white text-[9px] font-black uppercase tracking-widest transition-all">
              {saved ? <CheckCircleIcon className="w-4 h-4" /> : <ArrowDownTrayIcon className="w-4 h-4" />}
              {saved ? 'Saved!' : 'Save Design'}
            </button>
            <button onClick={handlePrintSample} className="flex items-center gap-2 px-5 py-2 bg-card hover:bg-muted text-foreground text-[9px] font-black uppercase tracking-widest border border-border transition-all">
              <PrinterIcon className="w-4 h-4" />
              Print Sample
            </button>
            <button onClick={handleExportSinglePDF} className="flex items-center gap-2 px-5 py-2 bg-card hover:bg-muted text-foreground text-[9px] font-black uppercase tracking-widest border border-border transition-all">
              <ArrowDownTrayIcon className="w-4 h-4" />
              PDF (Single)
            </button>
            <button onClick={handleExportBatchPDF} className="flex items-center gap-2 px-5 py-2 bg-card hover:bg-muted text-foreground text-[9px] font-black uppercase tracking-widest border border-border transition-all">
              <ArrowDownTrayIcon className="w-4 h-4" />
              PDF (8×A4)
            </button>
          </div>
        </div>

        <div className={`grid gap-8 ${activeTab === 'generate' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[1fr_380px]'}`}>

          {/* ── Config Panel ──────────────────────────────────────────── */}
          <div>
            {/* Tab bar — scrollable on mobile */}
            <div className="flex bg-card border border-border mb-6 overflow-x-auto">
              {tabs.map(t => (
                <button
                  key={t.key}
                  onClick={() => { setActiveTab(t.key); if (t.key === 'generate') loadStudents(); }}
                  className={`px-4 sm:px-5 py-2.5 text-[9px] font-black uppercase tracking-[0.2em] whitespace-nowrap transition-all flex-shrink-0 ${activeTab === t.key ? 'bg-orange-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Templates ── */}
            {activeTab === 'templates' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {TEMPLATES.map(t => (
                  <button
                    key={t.name}
                    onClick={() => applyTemplate(t)}
                    className="bg-card border border-border p-4 text-left hover:border-orange-500/50 transition-all group"
                  >
                    {/* Mini preview swatch */}
                    <div className="w-full h-10 mb-3 overflow-hidden border border-border/50">
                      {(t.config.headerStyle ?? 'band') === 'band' && (
                        <div style={{ background: t.config.accentColor ?? '#ea580c', height: '100%', display: 'flex', alignItems: 'center', padding: '0 8px', gap: 6 }}>
                          <div style={{ width: 12, height: 12, background: 'rgba(255,255,255,0.3)', borderRadius: 2 }} />
                          <div style={{ height: 6, background: 'rgba(255,255,255,0.6)', borderRadius: 2, flex: 1 }} />
                        </div>
                      )}
                      {(t.config.headerStyle ?? 'band') === 'border' && (
                        <div style={{ borderLeft: `4px solid ${t.config.accentColor ?? '#ea580c'}`, height: '100%', background: '#fff', display: 'flex', alignItems: 'center', padding: '0 8px', gap: 6 }}>
                          <div style={{ height: 6, background: '#e5e7eb', borderRadius: 2, flex: 1 }} />
                        </div>
                      )}
                      {(t.config.headerStyle ?? 'band') === 'minimal' && (
                        <div style={{ borderBottom: `2px solid ${t.config.accentColor ?? '#374151'}`, height: '100%', background: '#fff', display: 'flex', alignItems: 'center', padding: '0 8px' }}>
                          <div style={{ height: 6, background: '#e5e7eb', borderRadius: 2, flex: 1 }} />
                        </div>
                      )}
                    </div>
                    <div className="text-[11px] font-black text-foreground group-hover:text-orange-400 transition-colors">{t.name}</div>
                    <div className="text-[9px] text-muted-foreground mt-1 leading-relaxed">{t.description}</div>
                  </button>
                ))}
              </div>
            )}

            {/* ── Design ── */}
            {activeTab === 'design' && (
              <div className="space-y-6">
                {/* Header style */}
                <div className="bg-card border border-border p-5">
                  <h2 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
                    <PaintBrushIcon className="w-3.5 h-3.5" /> Header Style
                  </h2>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { value: 'band',    label: 'Colour Band',   desc: 'Full-width header' },
                      { value: 'border',  label: 'Side Border',   desc: 'Left accent stripe' },
                      { value: 'minimal', label: 'Minimal',        desc: 'Thin bottom line' },
                    ] as const).map(s => (
                      <button
                        key={s.value}
                        onClick={() => update({ headerStyle: s.value })}
                        className={`p-3 border text-left transition-all ${cfg.headerStyle === s.value ? 'border-orange-500 bg-orange-500/5' : 'border-border hover:border-border/60'}`}
                      >
                        <div className={`w-full h-6 mb-2 ${
                          s.value === 'band'    ? 'bg-orange-600' :
                          s.value === 'border'  ? 'border-l-4 border-orange-600 bg-card border border-border' :
                                                  'border-b-2 border-orange-600 bg-card'
                        }`} />
                        <div className="text-[9px] font-black uppercase tracking-widest text-foreground">{s.label}</div>
                        <div className="text-[8px] text-muted-foreground mt-0.5">{s.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accent colour */}
                <div className="bg-card border border-border p-5">
                  <h2 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-4">Accent Colour</h2>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c.value}
                        title={c.label}
                        onClick={() => update({ accentColor: c.value })}
                        style={{ background: c.value }}
                        className={`w-9 h-9 transition-all relative ${cfg.accentColor === c.value ? 'ring-2 ring-white ring-offset-2 ring-offset-card scale-110' : 'hover:scale-105'}`}
                      >
                        {cfg.accentColor === c.value && (
                          <span className="absolute inset-0 flex items-center justify-center text-white text-xs">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground">Custom</label>
                    <input
                      type="color"
                      value={cfg.accentColor}
                      onChange={e => update({ accentColor: e.target.value })}
                      className="w-10 h-9 cursor-pointer border border-border bg-transparent p-0"
                    />
                    <input
                      type="text"
                      value={cfg.accentColor}
                      onChange={e => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && update({ accentColor: e.target.value })}
                      className="w-28 px-3 py-2 bg-background border border-border text-foreground text-xs font-mono focus:outline-none focus:border-orange-500/50"
                    />
                  </div>
                </div>

                {/* Card Shape */}
                <div className="bg-card border border-border p-5">
                  <h2 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-4">Card Corners</h2>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { value: 'sharp',   label: 'Sharp',   desc: 'No radius — crisp, formal' },
                      { value: 'rounded', label: 'Rounded', desc: 'Soft corners — modern' },
                      { value: 'pill',    label: 'Pill',    desc: 'Heavy radius — casual' },
                    ] as const).map(s => (
                      <button key={s.value} onClick={() => update({ cornerRadius: s.value })}
                        className={`p-3 border text-left transition-all ${cfg.cornerRadius === s.value ? 'border-orange-500 bg-orange-500/5' : 'border-border hover:border-border/60'}`}>
                        <div className={`w-full h-6 mb-2 bg-card border border-border ${s.value === 'rounded' ? 'rounded-md' : s.value === 'pill' ? 'rounded-xl' : ''}`} />
                        <div className="text-[9px] font-black uppercase tracking-widest text-foreground">{s.label}</div>
                        <div className="text-[8px] text-muted-foreground mt-0.5">{s.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Card Background */}
                <div className="bg-card border border-border p-5">
                  <h2 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-4">Card Background</h2>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {[
                      { label: 'White',     value: '#ffffff' },
                      { label: 'Off-White', value: '#f9fafb' },
                      { label: 'Light',     value: '#f3f4f6' },
                      { label: 'Cream',     value: '#fffbeb' },
                    ].map(c => (
                      <button key={c.value} onClick={() => update({ bgColor: c.value })}
                        style={{ background: c.value }}
                        className={`h-9 border text-[8px] font-bold text-foreground/80 transition-all ${cfg.bgColor === c.value ? 'ring-2 ring-orange-500 ring-offset-1' : 'border-border hover:border-orange-400'}`}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground">Custom</label>
                    <input type="color" value={cfg.bgColor} onChange={e => update({ bgColor: e.target.value })}
                      className="w-10 h-9 cursor-pointer border border-border bg-transparent p-0" />
                    <input type="text" value={cfg.bgColor}
                      onChange={e => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && update({ bgColor: e.target.value })}
                      className="w-28 px-3 py-2 bg-background border border-border text-foreground text-xs font-mono focus:outline-none focus:border-orange-500/50" />
                  </div>
                </div>

                {/* Toggles */}
                <div className="bg-card border border-border p-5 space-y-4">
                  <h2 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2">Card Options</h2>
                  {([
                    { key: 'showLogo',     label: 'Show Logo Placeholder', desc: 'Displays school logo space in the header' },
                    { key: 'showPhotoSlot', label: 'Show Photo Slot', desc: 'Adds a student photo placeholder on the card' },
                  ] as { key: keyof CardConfig; label: string; desc: string }[]).map(opt => (
                    <label key={opt.key} className="flex items-start gap-3 cursor-pointer">
                      <div onClick={() => update({ [opt.key]: !(cfg as any)[opt.key] })}
                        className={`w-10 h-5 rounded-full flex-shrink-0 transition-all relative mt-0.5 ${(cfg as any)[opt.key] ? 'bg-orange-600' : 'bg-muted'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-card shadow transition-transform ${(cfg as any)[opt.key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </div>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-foreground">{opt.label}</div>
                        <div className="text-[9px] text-muted-foreground mt-0.5">{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* ── Fields ── */}
            {activeTab === 'fields' && (
              <div className="bg-card border border-border p-5">
                <h2 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Fields</h2>
                <p className="text-[9px] text-muted-foreground mb-5">Toggle visibility and reorder fields. The order here is the order on the card.</p>
                <div className="space-y-2">
                  {cfg.fields.map((f, i) => (
                    <div key={f.key} className={`flex items-center gap-2 px-3 py-2.5 border transition-all ${f.visible ? 'border-orange-500/30 bg-orange-500/5' : 'border-border'}`}>
                      {/* Toggle */}
                      <button
                        onClick={() => toggleField(f.key)}
                        className={`w-5 h-5 border flex-shrink-0 flex items-center justify-center transition-all ${f.visible ? 'bg-orange-600 border-orange-600' : 'border-border hover:border-orange-500/50'}`}
                      >
                        {f.visible && <span className="text-white text-[10px] leading-none">✓</span>}
                      </button>

                      {/* Key label */}
                      <span className="text-[10px] font-black uppercase tracking-widest text-foreground w-24 flex-shrink-0">{f.key}</span>

                      {/* Custom label input */}
                      <input
                        type="text"
                        value={f.label}
                        onChange={e => updateFieldLabel(f.key, e.target.value)}
                        placeholder="Label on card"
                        className="flex-1 px-2 py-1 bg-background border border-border text-foreground text-xs font-mono focus:outline-none focus:border-orange-500/50 min-w-0"
                      />

                      {/* Reorder */}
                      <div className="flex flex-col gap-0.5 flex-shrink-0">
                        <button onClick={() => moveField(i, -1)} disabled={i === 0} className="w-5 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                          <ArrowUpIcon className="w-3 h-3" />
                        </button>
                        <button onClick={() => moveField(i, 1)} disabled={i === cfg.fields.length - 1} className="w-5 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                          <ArrowDownIcon className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Typography ── */}
            {activeTab === 'typography' && (
              <div className="bg-card border border-border p-5 space-y-5">
                <h2 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Typography</h2>
                <p className="text-[9px] text-muted-foreground">Control font size, weight, colour, and family for each text element on the card.</p>
                {([
                  { elem: 'orgName'     as const, label: 'Org Name (Header)'    },
                  { elem: 'orgWebsite'  as const, label: 'Org Website (Header)' },
                  { elem: 'studentName' as const, label: 'Student Name'          },
                  { elem: 'school'      as const, label: 'School Name'           },
                  { elem: 'fieldLabel'  as const, label: 'Field Labels'          },
                  { elem: 'fieldValue'  as const, label: 'Field Values'          },
                  { elem: 'accentValue' as const, label: 'Accent Values (password / ID)' },
                  { elem: 'footer'      as const, label: 'Footer Text'           },
                ]).map(({ elem, label }) => {
                  const s = cfg.typo[elem];
                  return (
                    <div key={elem} className="border border-border p-3 space-y-2">
                      <div className="text-[9px] font-black uppercase tracking-widest text-foreground">{label}</div>
                      <div className="grid grid-cols-2 gap-2">
                        {/* Font size */}
                        <div>
                          <label className="block text-[8px] uppercase text-muted-foreground mb-1">Size (mm)</label>
                          <input
                            type="text"
                            value={s.fontSize.replace('mm','')}
                            onChange={e => updateTypo(elem, { fontSize: e.target.value + 'mm' })}
                            className="w-full px-2 py-1.5 bg-background border border-border text-foreground text-xs font-mono focus:outline-none focus:border-orange-500/50"
                          />
                        </div>
                        {/* Font weight */}
                        <div>
                          <label className="block text-[8px] uppercase text-muted-foreground mb-1">Weight</label>
                          <select
                            value={s.fontWeight}
                            onChange={e => updateTypo(elem, { fontWeight: e.target.value })}
                            className="w-full px-2 py-1.5 bg-background border border-border text-foreground text-xs focus:outline-none focus:border-orange-500/50"
                          >
                            <option value="400">Regular (400)</option>
                            <option value="600">Semi-Bold (600)</option>
                            <option value="700">Bold (700)</option>
                            <option value="800">Extra-Bold (800)</option>
                            <option value="900">Black (900)</option>
                          </select>
                        </div>
                        {/* Color */}
                        <div>
                          <label className="block text-[8px] uppercase text-muted-foreground mb-1">Colour</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={s.color.startsWith('rgba') ? '#ffffff' : s.color}
                              onChange={e => updateTypo(elem, { color: e.target.value })}
                              className="w-8 h-7 cursor-pointer border border-border bg-transparent p-0 flex-shrink-0"
                            />
                            <input
                              type="text"
                              value={s.color}
                              onChange={e => updateTypo(elem, { color: e.target.value })}
                              className="flex-1 px-2 py-1 bg-background border border-border text-foreground text-[10px] font-mono focus:outline-none min-w-0"
                            />
                          </div>
                        </div>
                        {/* Font family */}
                        <div>
                          <label className="block text-[8px] uppercase text-muted-foreground mb-1">Family</label>
                          <div className="flex gap-1.5">
                            {(['sans','mono'] as const).map(fam => (
                              <button
                                key={fam}
                                onClick={() => updateTypo(elem, { fontFamily: fam })}
                                className={`flex-1 py-1.5 text-[8px] font-bold uppercase border transition-all ${s.fontFamily === fam ? 'bg-orange-600 border-orange-600 text-white' : 'border-border text-muted-foreground hover:text-foreground'}`}
                              >
                                {fam === 'sans' ? 'Sans' : 'Mono'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      {/* Preview swatch */}
                      <div className="bg-background border border-border/50 px-3 py-1.5 overflow-hidden">
                        <span style={{ fontSize: s.fontSize, fontWeight: parseInt(s.fontWeight), color: s.color.startsWith('rgba') || s.color === '#ffffff' ? '#374151' : s.color, fontFamily: s.fontFamily === 'mono' ? 'monospace' : 'inherit' }}>
                          Sample Text — {label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Text & Labels ── */}
            {activeTab === 'text' && (
              <div className="bg-card border border-border p-5 space-y-4">
                <h2 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2">Text & Labels</h2>
                {([
                  { label: 'Organisation Name',  field: 'orgName',   hint: 'Displayed in the card header' },
                  { label: 'Website',             field: 'orgWebsite',hint: 'Displayed under the org name' },
                  { label: 'Card Label',          field: 'cardLabel', hint: 'Used as the card type badge' },
                  { label: 'Footer — Left Text',  field: 'footerLeft',hint: 'e.g. rillcod.com/login' },
                  { label: 'Footer — Right Text', field: 'footerRight', hint: 'Type "Student ID" to auto-show the ID code' },
                ] as { label: string; field: keyof CardConfig; hint: string }[]).map(({ label, field, hint }) => (
                  <div key={field}>
                    <label className="block text-[9px] uppercase font-bold tracking-widest text-muted-foreground mb-1">{label}</label>
                    <input
                      type="text"
                      value={cfg[field] as string}
                      onChange={e => update({ [field]: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-border text-foreground text-sm focus:outline-none focus:border-orange-500/50 font-mono"
                    />
                    <p className="text-[9px] text-muted-foreground mt-1">{hint}</p>
                  </div>
                ))}
              </div>
            )}

            {/* ── Generate Tab ── */}
            {activeTab === 'generate' && (
              <div className="space-y-5">
                {/* Header */}
                <div className="bg-card border border-border p-5">
                  <h2 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Generate Real Cards</h2>
                  <p className="text-[9px] text-muted-foreground mb-4">Select students and print or download their actual access cards using the current design.</p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => { loadStudents(); }}
                      className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-[9px] font-black uppercase tracking-widest transition-all">
                      {studentsLoading ? <ArrowDownTrayIcon className="w-3.5 h-3.5 animate-spin" /> : <ArrowDownTrayIcon className="w-3.5 h-3.5" />}
                      {studentsLoading ? 'Loading…' : 'Load Students'}
                    </button>
                    {selectedIds.size > 0 && (
                      <>
                        <button onClick={() => printStudentCards(students.filter(s => selectedIds.has(s.id)))}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest transition-all">
                          <PrinterIcon className="w-3.5 h-3.5" />
                          Print {selectedIds.size} Card{selectedIds.size > 1 ? 's' : ''}
                        </button>
                        <button onClick={() => setSelectedIds(new Set())}
                          className="flex items-center gap-2 px-4 py-2 bg-card border border-border text-muted-foreground hover:text-foreground text-[9px] font-black uppercase tracking-widest transition-all">
                          Clear
                        </button>
                      </>
                    )}
                    {visibleStudents.length > 0 && (
                      <button onClick={() => setSelectedIds(new Set(visibleStudents.map(s => s.id)))}
                        className="flex items-center gap-2 px-4 py-2 bg-card border border-border text-muted-foreground hover:text-foreground text-[9px] font-black uppercase tracking-widest transition-all">
                        Select All ({visibleStudents.length})
                      </button>
                    )}
                  </div>
                </div>

                {/* Search */}
                {students.length > 0 && (
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input value={studentSearch} onChange={e => setStudentSearch(e.target.value)}
                      placeholder="Search students by name, email, school, class…"
                      className="w-full pl-9 pr-4 py-2.5 bg-card border border-border text-foreground text-xs placeholder-muted-foreground focus:outline-none focus:border-orange-500/50 font-mono" />
                  </div>
                )}

                {/* School / class filters (role-sensitive) */}
                {students.length > 0 && (showSchoolFilterGen || showClassFilterGen) && (
                  <div className="flex flex-wrap items-center gap-3 bg-card border border-border p-3">
                    {showSchoolFilterGen && (
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">School</span>
                        {schoolLockGen ? (
                          <span className="px-3 py-2 bg-background border border-border text-xs font-bold truncate max-w-[200px]" title={schoolLockGen}>
                            {schoolLockGen}
                          </span>
                        ) : (
                          <select
                            value={selectedSchoolGen}
                            onChange={(e) => setSelectedSchoolGen(e.target.value)}
                            className="px-3 py-2 bg-background border border-border text-xs font-bold focus:outline-none focus:border-orange-500 max-w-[220px]"
                          >
                            <option value="all">All schools ({students.length})</option>
                            {allSchoolsGen.map((sch) => (
                              <option key={sch} value={sch}>
                                {sch} ({students.filter((x) => studentSchoolLabel(x) === sch).length})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                    {showClassFilterGen && (
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">Class</span>
                        <select
                          value={selectedClassGen}
                          onChange={(e) => setSelectedClassGen(e.target.value)}
                          className="px-3 py-2 bg-background border border-border text-xs font-bold focus:outline-none focus:border-orange-500 max-w-[200px]"
                        >
                          <option value="all">All classes</option>
                          {allClassesGen.map((cls) => (
                            <option key={cls} value={cls}>
                              {cls} ({students.filter((x) => (x.section_class || '').trim() === cls).length})
                            </option>
                          ))}
                          {hasStudentsWithoutClass && (
                            <option value="__NONE__">No class assigned</option>
                          )}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Student list */}
                {studentsLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : students.length > 0 ? (
                  <div className="bg-card border border-border">
                    <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
                      {visibleStudents.length === 0 ? (
                        <div className="px-4 py-10 text-center text-xs text-muted-foreground font-bold">
                          No students match the current filters.
                        </div>
                      ) : (
                        visibleStudents.map((s) => {
                          const selected = selectedIds.has(s.id);
                          const code = `RC-${s.id.slice(0, 8).toUpperCase()}`;
                          return (
                            <div key={s.id} onClick={() => toggleStudent(s.id)}
                              className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all ${selected ? 'bg-orange-500/5 border-l-2 border-l-orange-500' : 'hover:bg-muted/40'}`}>
                              <div className={`w-5 h-5 border flex-shrink-0 flex items-center justify-center transition-all ${selected ? 'bg-orange-600 border-orange-600' : 'border-border'}`}>
                                {selected && <span className="text-white text-[10px]">✓</span>}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-black text-foreground truncate">{s.full_name}</p>
                                <p className="text-[9px] text-muted-foreground truncate">{s.email || '—'} {s.section_class ? `· ${s.section_class}` : ''}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-[9px] font-mono font-bold text-orange-400">{code}</p>
                                {s.school_name && <p className="text-[8px] text-muted-foreground truncate max-w-[100px]">{s.school_name}</p>}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : null}

                {/* Bulk Register link */}
                <div className="bg-primary/[0.06] border border-primary/20 p-4 text-xs text-blue-300/80">
                  <p className="font-bold text-blue-300 mb-0.5">Tip: Bulk Register &amp; Print</p>
                  <p>After bulk-registering students, come back here and use <strong>Load Students</strong> to immediately generate their access cards.</p>
                </div>
              </div>
            )}
          </div>

          {/* ── Live Preview (hidden on generate tab on mobile) ──────── */}
          {activeTab !== 'generate' && (
          <div className="lg:sticky lg:top-6 self-start">
            <div className="bg-card border border-border p-5">
              <div className="flex items-center gap-2 mb-5">
                <EyeIcon className="w-3.5 h-3.5 text-muted-foreground" />
                <h2 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Live Preview</h2>
                <span className="text-[9px] text-muted-foreground ml-auto italic">Sample data</span>
              </div>
              <div className="overflow-x-auto">
                <CardPreview cfg={cfg} />
              </div>
              <div className="mt-4 pt-4 border-t border-border space-y-2">
                <p className="text-[9px] text-muted-foreground leading-relaxed">
                  Click <strong className="text-foreground">Save Design</strong> to apply this design globally. All access card prints (Students page, Bulk Register) will use this layout.
                </p>
                <button onClick={handlePrintSample} className="w-full flex items-center justify-center gap-2 py-2.5 border border-border hover:border-orange-500/40 hover:bg-orange-500/5 text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all">
                  <PrinterIcon className="w-3.5 h-3.5" />
                  Print Sample
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={handleExportSinglePDF} className="flex items-center justify-center gap-1.5 py-2.5 border border-border hover:border-orange-500/40 hover:bg-orange-500/5 text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all">
                    <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                    PDF Single
                  </button>
                  <button onClick={handleExportBatchPDF} className="flex items-center justify-center gap-1.5 py-2.5 border border-border hover:border-orange-500/40 hover:bg-orange-500/5 text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all">
                    <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                    PDF 8×A4
                  </button>
                </div>
              </div>
            </div>
          </div>
          )}

        </div>
      </div>
    </div>
  );
}
