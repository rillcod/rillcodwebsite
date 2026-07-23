'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  PaintBrushIcon, CreditCardIcon, PrinterIcon, ArrowDownTrayIcon,
  CheckCircleIcon, ArrowUpIcon, ArrowDownIcon, MagnifyingGlassIcon,
  ChevronDownIcon, ChevronUpIcon, ArrowPathIcon, UserGroupIcon,
  UserPlusIcon, AcademicCapIcon, SparklesIcon, TrashIcon,
} from '@/lib/icons';
import { accessCardCodeForStudent, formatAccessCardCodeDisplay } from '@/lib/access-card-code';
import {
  buildStudentRosterRows,
  buildRosterClassGroups,
  buildRosterPdfGroups,
  compareClassNames,
  compareSectionNames,
  downloadStudentRosterPdf,
  ROSTER_EDUCATOR_HEADING,
  ROSTER_EDUCATOR_NOTE,
  ROSTER_EDUCATOR_STEPS,
  ROSTER_PARENT_HEADING,
  ROSTER_PARENT_STEPS,
  ROSTER_LEGACY_NOTE,
  formatRosterSectionDisplay,
  type StudentRosterRow,
} from '@/lib/cards/exportRoster';
import { mapRecordsToRosterInput } from '@/lib/rosters/map-to-roster-input';
import {
  buildHierarchyGroups,
  countHierarchy,
  listHierarchyGrades,
  listHierarchySchools,
  listHierarchySections,
  matchesHierarchyFilter,
  sortBySchoolHierarchy,
  type HierarchyFilterState,
  type HierarchyItemFields,
} from '@/lib/cards/cardHierarchy';
import { buildBulkPrintHtml, openPrintWindow, sortCardHolders, type CardHolder as PrintCardHolder, type CardConfig as PrintCardConfig } from '@/lib/cards/printCard';
import { LocalQr } from '@/components/cards/LocalQr';
import { permanentWipePortalUserClient, bulkPermanentWipeStudentsClient, wipeFailureMessage } from '@/lib/students/permanent-wipe-client';

// ─── Shared Types ────────────────────────────────────────────────────────────

type TabId = 'design' | 'manage';
type CardType = 'student' | 'parent' | 'teacher';
type StatusFilter = 'all' | 'active' | 'unissued' | 'revoked' | 'expired';
type ReportFilter = 'all' | 'published' | 'draft' | 'no_report';
type GroupMode = 'none' | 'grade' | 'section' | 'hierarchy';
type ReportStatusInput = { has_published_report?: boolean; has_draft_report?: boolean };

type DesignStudent = ReportStatusInput & {
  id: string;
  full_name?: string | null;
  email?: string | null;
  school_name?: string | null;
  grade?: string | null;
  section_class?: string | null;
  is_hidden?: boolean;
};

function reportBucket(s: ReportStatusInput): 'published' | 'draft' | 'none' {
  if (s.has_published_report) return 'published';
  if (s.has_draft_report) return 'draft';
  return 'none';
}

function matchesReportFilter(s: ReportStatusInput, filter: ReportFilter): boolean {
  if (filter === 'all') return true;
  return reportBucket(s) === filter;
}

function reportCountsFrom<T extends ReportStatusInput>(items: readonly T[]) {
  let published = 0;
  let draft = 0;
  let noReport = 0;
  items.forEach((s) => {
    const bucket = reportBucket(s);
    if (bucket === 'published') published += 1;
    else if (bucket === 'draft') draft += 1;
    else noReport += 1;
  });
  return { total: items.length, published, draft, noReport };
}

function reportDotClass(s: ReportStatusInput): string {
  const bucket = reportBucket(s);
  if (bucket === 'published') return 'bg-emerald-400';
  if (bucket === 'draft') return 'bg-sky-400';
  return 'bg-amber-400';
}

function reportDotTitle(s: ReportStatusInput): string {
  const bucket = reportBucket(s);
  if (bucket === 'published') return 'Progress report published this term';
  if (bucket === 'draft') return 'Report drafted, not published — needs attention';
  return 'No report this term — needs attention';
}

function designHierarchyPick(s: DesignStudent): HierarchyItemFields {
  return {
    school: s.school_name,
    grade: s.grade,
    section: s.section_class,
    name: s.full_name,
  };
}

const manageHierarchyPick = (r: {
  school?: string;
  gradeLevel?: string;
  sectionClass?: string;
  name?: string;
}): HierarchyItemFields => ({
  school: r.school,
  grade: r.gradeLevel,
  section: r.sectionClass,
  name: r.name,
});

function sectionFilterLabel(value: string): string {
  return value === '__NONE__' ? 'No section' : value;
}
type FieldKey = 'school' | 'className' | 'section' | 'email' | 'password' | 'programme' | 'studentId' | 'qr' | 'expiry';

interface FieldConfig { key: FieldKey; label: string; visible: boolean; }
interface TypoStyle { fontSize: string; fontWeight: string; color: string; fontFamily: string; }

interface CardConfig {
  accentColor: string; headerStyle: 'band' | 'border' | 'minimal';
  orgName: string; orgWebsite: string; cardLabel: string;
  footerLeft: string; footerRight: string;
  cornerRadius: 'sharp' | 'rounded' | 'pill';
  bgColor: string; showLogo: boolean; showPhotoSlot: boolean;
  cardOrientation: 'portrait' | 'landscape';
  width: string; height: string; qrScale?: number; logoScale?: number; headerScale?: number; showCardLabel?: boolean;
  badgeMode?: 'class' | 'label' | 'custom'; badgeText?: string;
  fields: FieldConfig[];
  typo: {
    orgName: TypoStyle; orgWebsite: TypoStyle; studentName: TypoStyle;
    school: TypoStyle; fieldLabel: TypoStyle; fieldValue: TypoStyle;
    accentValue: TypoStyle; footer: TypoStyle; cardLabel: TypoStyle;
  };
}

type PortalUser = { id: string; full_name: string; email: string | null; role: string; school_name?: string | null; grade?: string | null; section_class?: string | null; };
type DbCard = { id: string; card_number: string; verification_code: string; status: string; issued_at: string | null; expires_at: string | null; holder_id: string; holder_type: string; };
type CardRecord = { id: string; name: string; email: string; roleLabel: string; school: string; badge: string; gradeLevel: string; sectionClass: string; profileUrl: string; schoolId: string | null; isHidden?: boolean; has_published_report?: boolean; has_draft_report?: boolean };

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_FIELDS: FieldConfig[] = [
  { key: 'school',    label: 'School',            visible: true  },
  { key: 'className', label: 'Class',             visible: true  },
  { key: 'section',   label: 'Section',           visible: true  },
  { key: 'email',     label: 'Email',              visible: true  },
  { key: 'password',  label: 'Temporary Password', visible: true  },
  { key: 'programme', label: 'Programme',          visible: false },
  { key: 'studentId', label: 'Student ID',         visible: true  },
  { key: 'expiry',    label: 'Expiry Date',        visible: false },
  { key: 'qr',        label: 'QR Code',            visible: true  },
];

const DEFAULT_TYPO: CardConfig['typo'] = {
  orgName:     { fontSize: '2.5mm', fontWeight: '900', color: '#ffffff',              fontFamily: 'sans' },
  orgWebsite:  { fontSize: '1.6mm', fontWeight: '700', color: 'rgba(255,255,255,0.85)', fontFamily: 'sans' },
  studentName: { fontSize: '3.8mm', fontWeight: '900', color: '#111827',              fontFamily: 'sans' },
  school:      { fontSize: '1.9mm', fontWeight: '900', color: '#1A3A8F',              fontFamily: 'sans' },
  fieldLabel:  { fontSize: '1.5mm', fontWeight: '700', color: '#C41E3A',              fontFamily: 'sans' },
  fieldValue:  { fontSize: '2.1mm', fontWeight: '700', color: '#111827',              fontFamily: 'mono' },
  accentValue: { fontSize: '2.2mm', fontWeight: '800', color: '#1A3A8F',              fontFamily: 'mono' },
  footer:      { fontSize: '1.5mm', fontWeight: '600', color: '#9ca3af',              fontFamily: 'sans' },
  cardLabel:   { fontSize: '1.6mm', fontWeight: '900', color: '#ffffff',              fontFamily: 'sans' },
};

const DEFAULT_CONFIG: CardConfig = {
  accentColor: '#1A3A8F', headerStyle: 'band',
  orgName: 'RILLCOD TECHNOLOGIES', orgWebsite: 'www.rillcod.com',
  cardLabel: 'Student Access Card', footerLeft: 'rillcod.com/login', footerRight: 'Student ID',
  cornerRadius: 'sharp', bgColor: '#ffffff', showLogo: true, showPhotoSlot: false, showCardLabel: true,
  badgeMode: 'label', badgeText: '', logoScale: 1, headerScale: 1,
  cardOrientation: 'portrait', width: '54mm', height: '85.6mm',
  fields: DEFAULT_FIELDS, typo: DEFAULT_TYPO,
};

const ROLE_PRESETS: Record<'student'|'parent'|'teacher', Partial<CardConfig>> = {
  student: { cardLabel: 'Student Access Card', footerRight: 'Student ID' },
  parent: {
    cardLabel: 'Parent Access Card', footerRight: 'Parent ID',
    fields: DEFAULT_FIELDS.map(f => {
      if (f.key === 'password')  return { ...f, visible: true, label: 'Temporary Password' };
      if (f.key === 'studentId') return { ...f, visible: true, label: 'Parent ID' };
      if (f.key === 'programme') return { ...f, visible: false };
      if (f.key === 'className') return { ...f, visible: false };
      if (f.key === 'section')   return { ...f, visible: false };
      if (f.key === 'school')    return { ...f, visible: true, label: 'Home School' };
      return f;
    }),
  },
  teacher: {
    cardLabel: 'Teacher Access Card', footerRight: 'Staff ID',
    fields: DEFAULT_FIELDS.map(f => {
      if (f.key === 'password')  return { ...f, visible: true, label: 'Temporary Password' };
      if (f.key === 'studentId') return { ...f, visible: true, label: 'Staff ID' };
      if (f.key === 'programme') return { ...f, visible: true, label: 'Department' };
      if (f.key === 'className') return { ...f, visible: true, label: 'Role' };
      if (f.key === 'section')   return { ...f, visible: false };
      return f;
    }),
  },
};

// Single source of truth for turning a saved config (or nothing) into a complete CardConfig.
// Used by BOTH the Design tab and the Manage tab so their cards render identically — the
// Manage tab previously used a stripped fallback, which made its cards diverge from Design.
function buildCardConfig(rawConfig: any, type: CardType): CardConfig {
  const preset = ROLE_PRESETS[type];
  if (!rawConfig) {
    return { ...DEFAULT_CONFIG, ...preset, fields: (preset.fields as FieldConfig[]) ?? DEFAULT_FIELDS };
  }
  const parsed: any = { ...rawConfig };
  if (parsed.fields) {
    parsed.fields = DEFAULT_FIELDS.map((def) => {
      const stored = parsed.fields.find((f: FieldConfig) => f.key === def.key);
      if (!stored) return def;
      // Saved designs from the brief "Grade Level" label → restore "Class".
      const label = stored.key === 'className' && stored.label === 'Grade Level' ? 'Class' : stored.label;
      return { ...def, ...stored, label };
    });
  }
  if (parsed.typo) parsed.typo = { ...DEFAULT_TYPO, ...parsed.typo };
  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    ...Object.fromEntries(Object.entries(preset).filter(([k]) => !parsed[k])),
  } as CardConfig;
}

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
  name: 'ADAEZE OKONKWO', school: 'KEY TO SUCCESS EDUCATION CENTRE',
  email: 'adaeze.okonkwo@rillcod.com', password: 'Abc@12345',
  programme: 'Advanced STEM Track', gradeLevel: 'JSS 1', section: 'Alpha · Teen Dev',
  id: 'RC-A1B2C3D4',
};

const STATUS_META: Record<string,{label:string;color:string;bar:string}> = {
  active:   { label:'Active',     color:'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25', bar:'bg-emerald-500' },
  revoked:  { label:'Revoked',    color:'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/25',          bar:'bg-rose-500'   },
  expired:  { label:'Expired',    color:'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/25',       bar:'bg-amber-500'  },
  unissued: { label:'Not issued', color:'text-muted-foreground bg-muted border-border',             bar:'bg-border'  },
};

// ─── Helper Components ────────────────────────────────────────────────────────

function QrPlaceholder({ size = 60, color = '#374151' }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ display:'block' }}>
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

function SidebarSection({ title, icon, children, open, onToggle }: {
  title: string; icon?: React.ReactNode; children: React.ReactNode; open: boolean; onToggle: () => void;
}) {
  return (
    <div className="border-b border-border">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/50 transition-colors">
        {icon && <span className="text-muted-foreground/60">{icon}</span>}
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex-1">{title}</span>
        {open ? <ChevronUpIcon className="w-3.5 h-3.5 text-muted-foreground/40" /> : <ChevronDownIcon className="w-3.5 h-3.5 text-muted-foreground/40" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

// ─── Card Preview (Design tab live preview) ───────────────────────────────────

function CardPreview({ cfg, scale = 1.25 }: { cfg: CardConfig; scale?: number }) {
  const acc = cfg.accentColor;
  const vis = (key: FieldKey) => cfg.fields.find(f => f.key === key)?.visible ?? false;
  const lbl = (key: FieldKey) => cfg.fields.find(f => f.key === key)?.label ?? key;
  // Class (canonical grade) shows as a body field — except when the header badge already shows it.
  const infoFields = cfg.fields.filter(f => f.visible && f.key !== 'qr' && !(f.key === 'className' && (cfg.badgeMode ?? 'label') === 'class'));
  const expDate = new Date(Date.now() + 365*24*60*60*1000).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  const sampleVal = (key: FieldKey): string => ({school:SAMPLE.school,className:SAMPLE.gradeLevel,section:SAMPLE.section,email:SAMPLE.email,password:SAMPLE.password,programme:SAMPLE.programme,studentId:SAMPLE.id,qr:'',expiry:expDate}[key]??'');
  const t = cfg.typo;
  const badgeMode = cfg.badgeMode ?? 'label';
  const badge = badgeMode==='class' ? SAMPLE.gradeLevel : badgeMode==='custom' ? (cfg.badgeText||'') : cfg.cardLabel;
  const showBadge = cfg.showCardLabel!==false && !!badge;
  const badgeColor = cfg.typo?.cardLabel?.color;
  const logoScale = cfg.logoScale ?? 1;
  const headerScale = cfg.headerScale ?? 1;
  const ff = (fam: string) => fam === 'mono' ? 'monospace' : "'Inter','Segoe UI',system-ui,sans-serif";
  const ts = (s: TypoStyle, extra?: React.CSSProperties): React.CSSProperties => ({
    fontSize:s.fontSize, fontWeight:parseInt(s.fontWeight), color:s.color, fontFamily:ff(s.fontFamily), ...extra,
  });
  const isAccentField = (k: FieldKey) => ['password','studentId','programme','expiry'].includes(k);

  const Header = () => {
    if (cfg.headerStyle === 'band') return (
      <div style={{background:acc,padding:`${8*headerScale}px 12px`,display:'flex',alignItems:'center',gap:7}}>
        <div style={{width:18*logoScale,height:18*logoScale,background:'rgba(255,255,255,0.3)',borderRadius:2,flexShrink:0}}/>
        <div>
          <div style={ts(t.orgName,{textTransform:'uppercase',lineHeight:1})}>{cfg.orgName}</div>
          <div style={ts(t.orgWebsite,{marginTop:2})}>{cfg.orgWebsite}</div>
        </div>
        {showBadge && <div style={{marginLeft:'auto',background:'rgba(0,0,0,0.22)',color:badgeColor||'#fff',padding:'2px 7px',fontSize:8,fontWeight:900,textTransform:'uppercase',flexShrink:0}}>{badge}</div>}
      </div>
    );
    if (cfg.headerStyle === 'border') return (
      <div style={{display:'flex',alignItems:'center',gap:7,padding:`${7*headerScale}px 10px`,borderBottom:'1px solid #f3f4f6'}}>
        <div style={{width:16*logoScale,height:16*logoScale,background:'#e5e7eb',borderRadius:2,flexShrink:0}}/>
        <div>
          <div style={ts(t.orgName,{textTransform:'uppercase',lineHeight:1,color:'#111'})}>{cfg.orgName}</div>
          <div style={ts(t.orgWebsite,{marginTop:1,color:acc})}>{cfg.orgWebsite}</div>
        </div>
        {showBadge && <div style={{marginLeft:'auto',background:acc,color:badgeColor||'#fff',padding:'2px 7px',fontSize:7,fontWeight:900,textTransform:'uppercase',flexShrink:0}}>{badge}</div>}
      </div>
    );
    return (
      <div style={{display:'flex',alignItems:'center',gap:7,padding:`${7*headerScale}px 10px`,borderBottom:`2px solid ${acc}`}}>
        <div style={{width:14*logoScale,height:14*logoScale,background:'#e5e7eb',borderRadius:2,flexShrink:0}}/>
        <div style={ts(t.orgName,{textTransform:'uppercase',color:'#111'})}>{cfg.orgName}</div>
        {showBadge && <div style={{marginLeft:'auto',fontSize:7,fontWeight:900,color:badgeColor||acc,textTransform:'uppercase',flexShrink:0}}>{badge}</div>}
      </div>
    );
  };

  const radius = cfg.cornerRadius === 'pill' ? 24 : cfg.cornerRadius === 'rounded' ? 12 : 0;

  return (
    <div style={{border:'1px solid #d1d5db',borderLeft:cfg.headerStyle==='border'?`4px solid ${acc}`:'1px solid #d1d5db',borderRadius:radius,width:cfg.width,height:cfg.height,display:'flex',flexDirection:'column',overflow:'hidden',background:cfg.bgColor||'#fff',color:'#111827',boxShadow:'0 20px 40px rgba(0,0,0,0.15)',margin:'0 auto',transform:`scale(${scale})`,transformOrigin:'center center'}}>
      <Header />
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        <div style={{flex:1,padding:'10px 12px',display:'flex',flexDirection:'column',gap:5,borderRight:vis('qr')?'1px solid #f3f4f6':'none',overflow:'hidden'}}>
          <div style={{display:'flex',alignItems:'flex-start',gap:8}}>
            {cfg.showPhotoSlot && (
              <div style={{width:38,height:48,background:'#f3f4f6',border:'1px solid #e5e7eb',borderRadius:3,display:'flex',alignItems:'center',justifyContent:'center',fontSize:6,fontWeight:900,color:'#9ca3af',letterSpacing:0.5,flexShrink:0}}>PHOTO</div>
            )}
            <div style={ts(t.studentName,{textTransform:'uppercase',lineHeight:1.15})}>{SAMPLE.name}</div>
          </div>
          <div style={{height:1,background:'#f3f4f6'}}/>
          <div style={{display:'flex',flexDirection:'column',gap:4,overflow:'hidden'}}>
            {infoFields.map(f => (
              <div key={f.key} style={{display:'flex',flexDirection:'column',gap:1}}>
                <div style={ts(t.fieldLabel,{textTransform:'uppercase',letterSpacing:0.5})}>{f.label}</div>
                <div style={ts(isAccentField(f.key)?t.accentValue:f.key==='school'?t.school:t.fieldValue,{wordBreak:'break-all',lineHeight:1.1})}>{sampleVal(f.key)}</div>
              </div>
            ))}
          </div>
        </div>
        {vis('qr') && (
          <div style={{width:'30%',minWidth:'25mm',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:5,padding:'10px 8px',background:'#fafafa',flexShrink:0}}>
            <QrPlaceholder size={Math.round(54*(cfg.qrScale??1))} color={acc}/>
            <div style={ts(t.footer,{textTransform:'uppercase',letterSpacing:0.5,textAlign:'center'})}>Scan to verify</div>
            <div style={ts(t.accentValue,{textAlign:'center'})}>{SAMPLE.id}</div>
          </div>
        )}
      </div>
      <div style={{display:'flex',justifyContent:'space-between',padding:'4px 12px',borderTop:'1px solid #f3f4f6',background:'#fafafa'}}>
        <span style={ts(t.footer)}>{cfg.footerLeft}</span>
        <span style={ts(t.footer,{fontFamily:'monospace',fontWeight:700,color:'#374151'})}>{cfg.footerRight==='Student ID'?SAMPLE.id:cfg.footerRight}</span>
      </div>
    </div>
  );
}

// ─── Manage Tab – Roster table (name + class + RC) ───────────────────────────

function RosterClassInstructions({ className }: { className?: string }) {
  const label = className ? `Distribution guide — ${className}` : 'Distribution guide';
  return (
    <div className="border-b border-border/60 bg-muted/20 overflow-hidden">
      <p className="text-[9px] font-black uppercase tracking-widest text-foreground text-center py-2 border-b border-border/60 bg-muted/40">{label}</p>
      <div className="grid grid-cols-2 text-[11px] text-muted-foreground">
        <div className="border-r border-border/60 bg-indigo-50/40 dark:bg-indigo-950/20">
          <p className="text-[9px] font-black uppercase tracking-widest text-indigo-900 dark:text-indigo-200 px-3 py-1.5 border-b border-border/50 bg-indigo-100/80 dark:bg-indigo-900/30">{ROSTER_EDUCATOR_HEADING}</p>
          <div className="px-3 py-2">
            <p className="text-[10px] italic text-muted-foreground mb-2 leading-relaxed">{ROSTER_EDUCATOR_NOTE}</p>
            <ol className="list-decimal list-inside space-y-1 leading-relaxed">
              {ROSTER_EDUCATOR_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </div>
        <div className="bg-emerald-50/30 dark:bg-emerald-950/15">
          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-900 dark:text-emerald-200 px-3 py-1.5 border-b border-border/50 bg-emerald-100/80 dark:bg-emerald-900/30">{ROSTER_PARENT_HEADING}</p>
          <div className="px-3 py-2">
            <ol className="list-decimal list-inside space-y-1 leading-relaxed">
              {ROSTER_PARENT_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

function ManageRosterTable({
  rows,
  className,
  hideClassColumn = false,
  compact = false,
}: {
  rows: StudentRosterRow[];
  className?: string;
  hideClassColumn?: boolean;
  compact?: boolean;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
        No student RC numbers in this selection.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
      {className && !compact && (
        <div className="border-b border-primary/20 bg-primary/5 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[9px] font-black uppercase tracking-[0.14em] text-primary shrink-0">Official RC Roster</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-foreground truncate">Class: {className}</span>
            <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{rows.length} student{rows.length === 1 ? '' : 's'}</span>
          </div>
        </div>
      )}
      {!compact && <RosterClassInstructions className={className} />}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest">
            <tr>
              <th className={`${compact ? 'px-3 py-2' : 'px-4 py-3'} w-12 text-center`}>#</th>
              <th className={compact ? 'px-3 py-2' : 'px-4 py-3'}>Student Name</th>
              {!hideClassColumn && <th className={compact ? 'px-3 py-2' : 'px-4 py-3'}>Class</th>}
              <th className={compact ? 'px-3 py-2' : 'px-4 py-3'}>Section</th>
              <th className={`${compact ? 'px-3 py-2' : 'px-4 py-3'} text-center`}>RC Number</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((row, index) => (
              <tr key={`${row.name}-${row.rcNumber}-${index}`} className={`hover:bg-muted/30 ${index % 2 === 1 ? 'bg-muted/20' : ''}`}>
                <td className={`${compact ? 'px-3 py-1.5' : 'px-4 py-3'} text-center text-muted-foreground font-semibold text-xs`}>{index + 1}</td>
                <td className={`${compact ? 'px-3 py-1.5' : 'px-4 py-3'} font-semibold text-foreground text-xs`}>{row.name}</td>
                {!hideClassColumn && <td className={`${compact ? 'px-3 py-1.5' : 'px-4 py-3'} text-foreground text-xs`}>{row.className || '—'}</td>}
                <td className={`${compact ? 'px-3 py-1.5' : 'px-4 py-3'} text-muted-foreground text-xs text-center font-semibold whitespace-nowrap`}>{formatRosterSectionDisplay(row.section)}</td>
                <td className={`${compact ? 'px-3 py-1.5' : 'px-4 py-3'} text-center`}>
                  <span className="inline-block font-mono font-bold tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded text-[11px]">{row.rcDisplay}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!compact && (
      <div className="border-t border-border/60 px-3 py-2 text-[10px] italic text-muted-foreground leading-relaxed">
        {ROSTER_LEGACY_NOTE}
      </div>
      )}
    </div>
  );
}

// ─── Manage Tab – Mini Card Preview ──────────────────────────────────────────

function ManageCardPreview({ r, config, dbCardsMap, selectedIds, toggleSelected, issueCard, updateCardStatus, reissueCard, isIssuingIds, isRevokingIds, printSingle, canDelete, permanentlyDeleteHolder, isDeletingIds }: {
  r: CardRecord; config: any; dbCardsMap: Map<string,DbCard>; selectedIds: Set<string>;
  toggleSelected: (id:string)=>void; issueCard: (r:CardRecord)=>void;
  updateCardStatus: (r:CardRecord,c:DbCard,s:'active'|'revoked')=>void;
  reissueCard: (r:CardRecord,c:DbCard)=>void;
  isIssuingIds: Set<string>; isRevokingIds: Set<string>; printSingle: (r:CardRecord)=>void;
  canDelete: boolean; permanentlyDeleteHolder: (r: CardRecord) => void; isDeletingIds: Set<string>;
}) {
  const dbCard = dbCardsMap.get(r.id);
  const status = dbCard ? dbCard.status : 'unissued';
  const sm = STATUS_META[status] || STATUS_META.unissued;
  const isSelected = selectedIds.has(r.id);
  const isIssuing  = isIssuingIds.has(r.id);
  const isRevoking = isRevokingIds.has(r.id);
  const isDeleting = isDeletingIds.has(r.id);
  const acc = config.accentColor || '#1A3A8F';
  const hStyle = config.headerStyle || 'band';
  const badgeMode = config.badgeMode ?? 'label';
  const badge = badgeMode==='class' ? (r.gradeLevel||'') : badgeMode==='custom' ? (config.badgeText||'') : config.cardLabel;
  const showBadge = config.showCardLabel!==false && !!badge;
  const gradeField = config.fields?.find((f: FieldConfig) => f.key === 'className');
  const sectionField = config.fields?.find((f: FieldConfig) => f.key === 'section');
  const showGrade = gradeField?.visible !== false && r.gradeLevel && badgeMode !== 'class';
  const showSection = sectionField?.visible !== false && r.sectionClass;
  const badgeColor = config.typo?.cardLabel?.color;
  // RC-XXXXXXXX is the one canonical card code — students use the deterministic student
  // code, others use their card's RC verification_code. Never CARD-…/card_number.
  const code  = r.roleLabel==='Student' ? accessCardCodeForStudent(r.id) : (dbCard?.verification_code ?? accessCardCodeForStudent(r.id));
  const verifyUrl = `${window.location.origin}/result-check/${code}`;

  return (
    <div className={`flex flex-col rounded-xl overflow-hidden border transition-all bg-card ${isSelected?'border-primary ring-1 ring-primary/40':'border-border hover:border-muted-foreground/30'}`}>
      <div className={`h-1 w-full ${sm.bar}`}/>
      <div className="flex-1 bg-white text-[#111827] max-w-full overflow-hidden" style={{fontFamily:'Inter,system-ui,sans-serif',backgroundColor:config.bgColor||'#fff'}}>
        {hStyle==='band'&&(
          <div style={{background:acc,padding:'7px 10px',display:'flex',alignItems:'center',gap:6}}>
            <div style={{width:18,height:18,background:'rgba(255,255,255,0.25)',borderRadius:2,flexShrink:0}}/>
            <div style={{flex:1,overflow:'hidden'}}>
              <div style={{fontSize:8,fontWeight:900,color:'#fff',textTransform:'uppercase',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{config.orgName}</div>
              <div style={{fontSize:6,color:'rgba(255,255,255,0.8)',fontWeight:700,marginTop:1}}>{config.orgWebsite}</div>
            </div>
            {showBadge && <div style={{background:'rgba(0,0,0,0.22)',color:badgeColor||'#fff',padding:'2px 6px',fontSize:6,fontWeight:900,textTransform:'uppercase',flexShrink:0}}>{badge}</div>}
          </div>
        )}
        {hStyle==='border'&&(
          <div style={{borderLeft:`3px solid ${acc}`,padding:'6px 10px',display:'flex',alignItems:'center',gap:6,borderBottom:'1px solid #f3f4f6'}}>
            <div style={{flex:1}}>
              <div style={{fontSize:8,fontWeight:900,color:'#111',textTransform:'uppercase'}}>{config.orgName}</div>
              <div style={{fontSize:6,color:acc,fontWeight:700,marginTop:1}}>{config.orgWebsite}</div>
            </div>
            {showBadge && <div style={{background:acc,color:badgeColor||'#fff',padding:'2px 6px',fontSize:6,fontWeight:900,textTransform:'uppercase',flexShrink:0}}>{badge}</div>}
          </div>
        )}
        {hStyle==='minimal'&&(
          <div style={{borderBottom:`2px solid ${acc}`,padding:'6px 10px',display:'flex',alignItems:'center',gap:6}}>
            <div style={{flex:1,fontSize:8,fontWeight:900,color:'#111',textTransform:'uppercase',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{config.orgName}</div>
            {showBadge && <div style={{fontSize:7,fontWeight:900,color:badgeColor||acc,textTransform:'uppercase',flexShrink:0}}>{badge}</div>}
          </div>
        )}
        <div style={{display:'flex',minHeight:80}}>
          <div style={{flex:1,padding:'8px 10px',display:'flex',flexDirection:'column',gap:3,borderRight:'1px solid #f3f4f6',overflow:'hidden'}}>
            <div style={{fontSize:12,fontWeight:900,color:'#111',textTransform:'uppercase',lineHeight:1.2,wordBreak:'break-word'}}>{r.name}{r.isHidden && <span style={{marginLeft:4,fontSize:7,color:'#be123c'}}>(hidden)</span>}</div>
            <div style={{fontSize:7,fontWeight:700,color:acc,textTransform:'uppercase',letterSpacing:0.5}}>{r.roleLabel}</div>
            <div style={{height:1,background:'#f3f4f6',margin:'2px 0'}}/>
            <div><div style={{fontSize:6,color:'#9ca3af',textTransform:'uppercase',fontWeight:700}}>School</div>
              <div style={{fontSize:8,fontWeight:800,fontFamily:'monospace',color:acc,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.school}</div>
            </div>
            {showGrade&&<div><div style={{fontSize:6,color:'#9ca3af',textTransform:'uppercase',fontWeight:700}}>{gradeField?.label||'Class'}</div>
              <div style={{fontSize:8,fontWeight:700,color:'#111'}}>{r.gradeLevel}</div>
            </div>}
            {showSection&&<div><div style={{fontSize:6,color:'#9ca3af',textTransform:'uppercase',fontWeight:700}}>{sectionField?.label||'Section'}</div>
              <div style={{fontSize:8,fontWeight:700,color:'#111'}}>{r.sectionClass}</div>
            </div>}
            {r.badge&&r.badge!==r.gradeLevel&&r.badge!==r.sectionClass&&<div style={{marginTop:2,display:'inline-block',background:`${acc}18`,border:`1px solid ${acc}40`,color:acc,fontSize:6,fontWeight:800,padding:'1px 5px',textTransform:'uppercase'}}>{r.badge}</div>}
          </div>
          <div style={{width:Math.max(60,Math.round(42*(config.qrScale??1))+18),display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:3,padding:'6px 4px',background:'#fafafa',flexShrink:0}}>
            <LocalQr data={verifyUrl} size={160} style={{width:Math.round(42*(config.qrScale??1)),height:Math.round(42*(config.qrScale??1)),border:'1px solid #e5e7eb'}}/>
            <div style={{fontSize:6,fontWeight:900,fontFamily:'monospace',color:acc,textAlign:'center',wordBreak:'break-all'}}>{code}</div>
          </div>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',padding:'4px 10px',borderTop:'1px solid #f3f4f6',fontSize:6,color:'#9ca3af',fontWeight:600,background:'#fafafa'}}>
          <span>{config.footerLeft}</span>
          <span style={{fontFamily:'monospace',color:'#374151',fontWeight:900}}>{config.cardLabel}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 p-2 bg-muted/50 border-t border-border">
        <button onClick={()=>toggleSelected(r.id)} title={isSelected?'Deselect':'Select'}
          className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${isSelected?'bg-primary border-primary text-primary-foreground':'border-border text-muted-foreground hover:border-primary/50 hover:text-primary bg-background'}`}>
          <svg width="11" height="11" viewBox="0 0 10 10" fill="none">
            {isSelected&&<path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>}
            {!isSelected&&<rect x="1" y="1" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1"/>}
          </svg>
        </button>
        <button onClick={()=>printSingle(r)} title="Print this card"
          className="w-8 h-8 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center shrink-0 transition-colors bg-background">
          <PrinterIcon className="w-4 h-4"/>
        </button>
        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1.5 rounded-md border shrink-0 ${sm.color}`}>{sm.label}</span>
        <div className="flex items-center gap-1.5 ml-auto">
          {!dbCard&&(
            <button onClick={()=>issueCard(r)} disabled={isIssuing}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-wide hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0">
              {isIssuing?<span className="w-2.5 h-2.5 border border-primary-foreground border-t-transparent rounded-full animate-spin"/>:'+'}
              Issue
            </button>
          )}
          {dbCard?.status==='revoked'&&(
            <button onClick={()=>updateCardStatus(r,dbCard,'active')} disabled={isRevoking}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-wide hover:bg-emerald-500/25 disabled:opacity-50 transition-colors shrink-0">
              {isRevoking?<span className="w-2.5 h-2.5 border border-emerald-500 border-t-transparent rounded-full animate-spin"/>:'↑'}
              Restore
            </button>
          )}
          {dbCard?.status==='active'&&(
            <>
              <button onClick={()=>{if(confirm(`Reissue card for ${r.name}? The current card stops working and a new card number + QR code are generated (e.g. for a lost or damaged card).`))reissueCard(r,dbCard)}} disabled={isRevoking}
                title="Replace lost/damaged card — old codes stop verifying"
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-wide hover:bg-amber-500/20 disabled:opacity-50 transition-colors shrink-0">
                {isRevoking?<span className="w-2.5 h-2.5 border border-amber-500 border-t-transparent rounded-full animate-spin"/>:'↻'}
                Reissue
              </button>
              <button onClick={()=>{if(confirm(`Revoke card for ${r.name}?`))updateCardStatus(r,dbCard,'revoked')}} disabled={isRevoking}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase tracking-wide hover:bg-rose-500/20 disabled:opacity-50 transition-colors shrink-0">
                {isRevoking?<span className="w-2.5 h-2.5 border border-rose-500 border-t-transparent rounded-full animate-spin"/>:'×'}
                Revoke
              </button>
            </>
          )}
          {canDelete && (
            <button onClick={()=>permanentlyDeleteHolder(r)} disabled={isDeleting} title="Permanently delete this account and all records"
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600/15 border border-rose-600/35 text-rose-700 dark:text-rose-300 text-[10px] font-black uppercase tracking-wide hover:bg-rose-600/25 disabled:opacity-50 transition-colors shrink-0">
              {isDeleting ? <span className="w-2.5 h-2.5 border border-rose-600 border-t-transparent rounded-full animate-spin"/> : <TrashIcon className="w-3.5 h-3.5"/>}
              Wipe
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Manage Tab – compact LIST row (default view; grid is opt-in) ─────────────
function ManageCardRow({ r, dbCardsMap, selectedIds, toggleSelected, issueCard, updateCardStatus, reissueCard, isIssuingIds, isRevokingIds, printSingle, canDelete, permanentlyDeleteHolder, isDeletingIds }: {
  r: CardRecord; dbCardsMap: Map<string,DbCard>; selectedIds: Set<string>;
  toggleSelected: (id:string)=>void; issueCard: (r:CardRecord)=>void;
  updateCardStatus: (r:CardRecord,c:DbCard,s:'active'|'revoked')=>void;
  reissueCard: (r:CardRecord,c:DbCard)=>void;
  isIssuingIds: Set<string>; isRevokingIds: Set<string>; printSingle: (r:CardRecord)=>void;
  canDelete: boolean; permanentlyDeleteHolder: (r: CardRecord) => void; isDeletingIds: Set<string>;
}) {
  const dbCard = dbCardsMap.get(r.id);
  const status = dbCard ? dbCard.status : 'unissued';
  const sm = STATUS_META[status] || STATUS_META.unissued;
  const isSelected = selectedIds.has(r.id);
  const isIssuing = isIssuingIds.has(r.id);
  const isRevoking = isRevokingIds.has(r.id);
  const isDeleting = isDeletingIds.has(r.id);
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${isSelected?'bg-primary/5':''} ${r.isHidden?'bg-rose-500/5':''} hover:bg-muted/40`}>
      <button onClick={()=>toggleSelected(r.id)} className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${isSelected?'bg-primary border-primary':'border-border'}`}>
        {isSelected&&<span className="text-primary-foreground text-[8px]">✓</span>}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground flex items-center gap-1.5">
          <span className="truncate">{r.name}{r.isHidden && <span className="ml-1.5 text-[9px] font-black uppercase tracking-wide text-rose-500">Hidden</span>}</span>
          {r.roleLabel === 'Student' && (
            <span title={reportDotTitle(r)}
              className={`w-2 h-2 rounded-full flex-shrink-0 ${reportDotClass(r)}`} />
          )}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">{[r.roleLabel, r.gradeLevel, r.sectionClass].filter(Boolean).join(' · ') || '—'}</p>
      </div>
      <span className={`hidden sm:inline text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md border shrink-0 ${sm.color}`}>{sm.label}</span>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button onClick={()=>printSingle(r)} title="Print card" className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"><PrinterIcon className="w-4 h-4"/></button>
        {!dbCard&&(
          <button onClick={()=>issueCard(r)} disabled={isIssuing} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-wide disabled:opacity-50 transition-colors">{isIssuing?'…':'Issue'}</button>
        )}
        {dbCard?.status==='revoked'&&(
          <button onClick={()=>updateCardStatus(r,dbCard,'active')} disabled={isRevoking} className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-wide disabled:opacity-50 transition-colors">Restore</button>
        )}
        {dbCard?.status==='active'&&(
          <>
            <button onClick={()=>{if(confirm(`Reissue card for ${r.name}? The current card stops working and a new card number + QR code are generated.`))reissueCard(r,dbCard)}} disabled={isRevoking} title="Replace lost/damaged card" className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-wide disabled:opacity-50 transition-colors">Reissue</button>
            <button onClick={()=>{if(confirm(`Revoke card for ${r.name}?`))updateCardStatus(r,dbCard,'revoked')}} disabled={isRevoking} className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase tracking-wide disabled:opacity-50 transition-colors">Revoke</button>
          </>
        )}
        {canDelete && (
          <button onClick={()=>permanentlyDeleteHolder(r)} disabled={isDeleting} title="Permanently wipe account and all records"
            className="p-1.5 rounded-lg border border-rose-600/30 text-rose-600 dark:text-rose-400 hover:bg-rose-600/10 disabled:opacity-50 transition-colors">
            {isDeleting ? <span className="w-3.5 h-3.5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin inline-block"/> : <TrashIcon className="w-4 h-4"/>}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function CardStudioPage() {
  const { profile, isLoading } = useAuth() as any;
  const searchParams = useSearchParams();
  const router = useRouter();

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>(() =>
    (searchParams.get('tab') === 'manage' ? 'manage' : 'design')
  );

  const switchTab = (t: TabId) => {
    setActiveTab(t);
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set('tab', t);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // ── Card type (shared between tabs) ───────────────────────────────────────
  const [cardType, setCardType] = useState<CardType>(() => {
    const t = (searchParams.get('type') || 'student').toLowerCase() as CardType;
    return ['student','parent','teacher'].includes(t) ? t : 'student';
  });

  const applyCardType = (t: CardType) => {
    setCardType(t);
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set('type', t);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // ── Access ─────────────────────────────────────────────────────────────────
  const isAdmin   = profile?.role === 'admin';
  const isTeacher = profile?.role === 'teacher';
  const isSchool  = profile?.role === 'school';
  const canAccess = isAdmin || isTeacher || isSchool;
  const canDesign = isAdmin || isTeacher;
  const canViewTeacherCards = isAdmin;
  const canDeleteAccounts = cardType === 'student' ? (isAdmin || isTeacher) : isAdmin;
  const schoolLock = isSchool ? String(profile?.school_name || '').trim() : '';

  // ══════════════════════════════════════════════════════════════════════════
  // DESIGN TAB STATE
  // ══════════════════════════════════════════════════════════════════════════
  const [cfg, setCfg] = useState<CardConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['templates','design','fields']));
  const [previewZoom, setPreviewZoom] = useState(1.0);
  const [designStudents, setDesignStudents] = useState<DesignStudent[]>([]);
  const [designStudentsLoading, setDesignStudentsLoading] = useState(false);
  const [designStudentsLoaded, setDesignStudentsLoaded] = useState(false);
  const [designSearch, setDesignSearch] = useState('');
  const [designSelectedIds, setDesignSelectedIds] = useState<Set<string>>(new Set());
  const [designSelectedSchool, setDesignSelectedSchool] = useState('all');
  const [designSelectedGrade, setDesignSelectedGrade] = useState('all');
  const [designSelectedClass, setDesignSelectedClass] = useState('all');
  const [designGroupMode, setDesignGroupMode] = useState<GroupMode>('hierarchy');
  const [designReportFilter, setDesignReportFilter] = useState<ReportFilter>('all');

  // Mobile layout state for design tab: settings panels, preview screen, or generate panel
  const [designSubTab, setDesignSubTab] = useState<'settings' | 'preview' | 'generate'>('preview');

  // Load design config
  useEffect(() => {
    if (!canAccess) return;
    fetch(`/api/admin/settings?type=${cardType}`)
      .then(r => r.json())
      .then(data => {
        setCfg(buildCardConfig(data?.config, cardType));
      }).catch(() => {});
  }, [cardType, canAccess]); // eslint-disable-line

  const update = (patch: Partial<CardConfig>) => setCfg(prev => ({ ...prev, ...patch }));
  const toggleSection = (s: string) => setOpenSections(prev => {
    const n = new Set(prev);
    if (n.has(s)) n.delete(s); else n.add(s);
    return n;
  });
  const toggleField = (key: FieldKey) => setCfg(prev => ({ ...prev, fields: prev.fields.map(f => f.key === key ? { ...f, visible: !f.visible } : f) }));
  const updateFieldLabel = (key: FieldKey, label: string) => setCfg(prev => ({ ...prev, fields: prev.fields.map(f => f.key === key ? { ...f, label } : f) }));
  const moveField = (index: number, dir: -1|1) => {
    const next = index + dir;
    if (next < 0 || next >= cfg.fields.length) return;
    const arr = [...cfg.fields]; [arr[index], arr[next]] = [arr[next], arr[index]];
    setCfg(prev => ({ ...prev, fields: arr }));
  };
  const updateTypo = (elem: keyof CardConfig['typo'], patch: Partial<TypoStyle>) =>
    // Base on DEFAULT_TYPO so a style missing from an older saved config (e.g. cardLabel)
    // is always complete after an edit.
    setCfg(prev => ({ ...prev, typo: { ...prev.typo, [elem]: { ...DEFAULT_TYPO[elem], ...prev.typo[elem], ...patch } } }));

  const handleSave = async () => {
    try {
      await fetch('/api/admin/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ config:cfg, type:cardType }) });
      setSaved(true); setLastSaved(new Date()); setTimeout(() => setSaved(false), 2500);
      toast.success('Design saved!');
    } catch { toast.error('Failed to save design'); }
  };

  const handleReset = async () => {
    const preset = ROLE_PRESETS[cardType];
    const resetCfg = { ...DEFAULT_CONFIG, ...preset, fields: preset.fields ?? DEFAULT_FIELDS };
    setCfg(resetCfg);
    try { await fetch('/api/admin/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ config:resetCfg, type:cardType }) }); }
    catch { /* ignore */ }
  };

  const handlePrintSample = async () => {
    // Use the exact same shared template as real prints so the sample reflects every
    // setting (badge mode, corners, logo/header/QR scale, card-label colour, etc.).
    const holder: PrintCardHolder = {
      id: 'sample',
      full_name: SAMPLE.name,
      email: SAMPLE.email,
      school_name: SAMPLE.school,
      grade: SAMPLE.gradeLevel,
      section_class: SAMPLE.section,
      temp_password: SAMPLE.password,
      card_code: SAMPLE.id,
    };
    const html = await buildBulkPrintHtml([holder], cfg as unknown as PrintCardConfig, window.location.origin, { fixedSize: true, qrHint: 'Scan to verify' });
    openPrintWindow(html);
  };

  // Design tab – load students for generate panel
  const loadDesignStudents = (force = false) => {
    if (designStudentsLoaded && !force) return;
    setDesignStudentsLoading(true);
    const hiddenQS = designShowHidden ? '&deleted_only=true' : '';
    fetch('/api/portal-users?role=student&scoped=true&with_reports=1' + hiddenQS + '&t=' + Date.now())
      .then(r => r.json())
      .then(j => {
        setDesignStudents((j.data ?? []).map((s: any) => ({
          id: s.id,
          full_name: s.full_name,
          email: s.email ?? null,
          school_name: s.school_name ?? null,
          grade: s.grade ?? null,
          section_class: s.section_class ?? null,
          has_published_report: !!s.has_published_report,
          has_draft_report: !!s.has_draft_report,
          is_hidden: !!s.is_deleted,
        })));
        setDesignStudentsLoaded(true);
      }).catch(()=>{}).finally(()=>setDesignStudentsLoading(false));
  };

  const designSchoolLock = isSchool ? String(profile?.school_name||'').trim() : '';
  const designSelectClass = 'w-full px-2 py-1.5 bg-background border border-border text-foreground text-[10px] focus:outline-none focus:border-primary rounded disabled:opacity-50 disabled:cursor-not-allowed';

  const designHierarchyPool = useMemo((): DesignStudent[] => {
    const q = designSearch.trim().toLowerCase();
    return designStudents.filter((s) => {
      const sch = s.school_name?.trim() || '—';
      if (designSchoolLock && sch !== designSchoolLock) return false;
      if (!matchesReportFilter(s, designReportFilter)) return false;
      if (!q) return true;
      return [s.full_name, s.email, s.school_name, s.grade, s.section_class].some((v: unknown) =>
        String(v || '').toLowerCase().includes(q),
      );
    });
  }, [designStudents, designSearch, designSchoolLock, designReportFilter]);

  const designMultiSchool = useMemo(() => {
    const set = new Set<string>();
    designHierarchyPool.forEach((s) => set.add(s.school_name?.trim() || '—'));
    return set.size > 1;
  }, [designHierarchyPool]);

  const showDesignSchoolFilter = !designSchoolLock && (isAdmin || isTeacher) && designMultiSchool;

  const designHierarchyFilter = useMemo((): HierarchyFilterState => ({
    schoolLock: designSchoolLock || undefined,
    school: showDesignSchoolFilter ? designSelectedSchool : 'all',
    grade: designSelectedGrade,
    section: designSelectedClass,
  }), [designSchoolLock, showDesignSchoolFilter, designSelectedSchool, designSelectedGrade, designSelectedClass]);

  const designHierarchySchools = useMemo(
    () => listHierarchySchools(designHierarchyPool, designHierarchyPick, designHierarchyFilter),
    [designHierarchyPool, designHierarchyFilter],
  );
  const designHierarchyGrades = useMemo(
    () => listHierarchyGrades(designHierarchyPool, designHierarchyPick, designHierarchyFilter),
    [designHierarchyPool, designHierarchyFilter],
  );
  const designHierarchySections = useMemo(
    () => listHierarchySections(designHierarchyPool, designHierarchyPick, designHierarchyFilter),
    [designHierarchyPool, designHierarchyFilter],
  );

  const designGradesNeedSchool = showDesignSchoolFilter && designSelectedSchool === 'all';
  const designSectionsNeedClass = designSelectedGrade === 'all' && designHierarchyGrades.length > 1;

  useEffect(() => {
    if (designSelectedGrade !== 'all' && !designHierarchyGrades.includes(designSelectedGrade)) {
      setDesignSelectedGrade('all');
      setDesignSelectedClass('all');
    }
  }, [designHierarchyGrades, designSelectedGrade]);

  useEffect(() => {
    if (
      designSelectedClass !== 'all'
      && designSelectedClass !== '__NONE__'
      && !designHierarchySections.includes(designSelectedClass)
    ) {
      setDesignSelectedClass('all');
    }
  }, [designHierarchySections, designSelectedClass]);

  const designReportCounts = useMemo(() => reportCountsFrom(designHierarchyPool), [designHierarchyPool]);
  const designFiltersActive = designReportFilter !== 'all'
    || designSelectedSchool !== 'all'
    || designSelectedGrade !== 'all'
    || designSelectedClass !== 'all'
    || designGroupMode !== 'hierarchy'
    || !!designSearch.trim();
  const resetDesignFilters = () => {
    setDesignReportFilter('all');
    setDesignSelectedSchool('all');
    setDesignSelectedGrade('all');
    setDesignSelectedClass('all');
    setDesignGroupMode('hierarchy');
    setDesignSearch('');
  };

  const visibleDesignStudents = useMemo((): DesignStudent[] => {
    const list = designHierarchyPool.filter((s) =>
      matchesHierarchyFilter<DesignStudent>(s, designHierarchyPick, designHierarchyFilter),
    );
    return sortBySchoolHierarchy<DesignStudent>(list, designHierarchyPick);
  }, [designHierarchyPool, designHierarchyFilter]);

  const designGroupedByGrade = useMemo((): [string, DesignStudent[]][] => {
    const groups = new Map<string, DesignStudent[]>();
    visibleDesignStudents.forEach((s) => {
      const g = (s.grade || '').trim() || '— No Class —';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(s);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => compareClassNames(a, b));
  }, [visibleDesignStudents]);

  const designGroupedBySection = useMemo((): [string, DesignStudent[]][] => {
    const groups = new Map<string, DesignStudent[]>();
    visibleDesignStudents.forEach((s) => {
      const cls = (s.section_class || '').trim() || '— No Section —';
      if (!groups.has(cls)) groups.set(cls, []);
      groups.get(cls)!.push(s);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => compareSectionNames(a, b));
  }, [visibleDesignStudents]);

  const designGroupedByHierarchy = useMemo(
    () => buildHierarchyGroups<DesignStudent>(visibleDesignStudents, designHierarchyPick),
    [visibleDesignStudents],
  );

  const designGrouped: [string, DesignStudent[]][] | null = designGroupMode === 'hierarchy'
    ? null
    : designGroupMode === 'grade'
      ? designGroupedByGrade
      : designGroupedBySection;

  const cardHoldersFromDesignStudents = (list: any[]): PrintCardHolder[] => list.map((s:any) => ({
    id: s.id,
    full_name: s.full_name || 'Unknown',
    email: s.email ?? null,
    school_name: s.school_name ?? null,
    grade: s.grade ?? null,
    section_class: s.section_class ?? null,
    card_code: accessCardCodeForStudent(s.id),
  }));

  const printDesignCards = async (list: any[], title = 'Access Cards', opts?: { groupBy?: 'none' | 'grade' | 'section' }) => {
    if(!list.length) return;
    const holders = sortCardHolders(cardHoldersFromDesignStudents(list));
    const grades = new Set(holders.map(h => (h.grade ?? '').trim()).filter(Boolean));
    const groupBy = opts?.groupBy ?? (grades.size > 1 ? 'grade' : 'none');
    const html = await buildBulkPrintHtml(holders, cfg as unknown as PrintCardConfig, window.location.origin, {
      fixedSize: true,
      qrHint: 'Scan for result',
      title,
      groupBy,
    });
    openPrintWindow(html);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // MANAGE TAB STATE
  // ══════════════════════════════════════════════════════════════════════════
  const [manageConfig, setManageConfig] = useState<CardConfig>(() => buildCardConfig(null, 'student'));
  const [records, setRecords] = useState<CardRecord[]>([]);
  const [dbCardsMap, setDbCardsMap] = useState<Map<string,DbCard>>(new Map());
  const [manageLoading, setManageLoading] = useState(false);
  const [manageError, setManageError] = useState<string|null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isIssuingIds, setIsIssuingIds] = useState<Set<string>>(new Set());
  const [isRevokingIds, setIsRevokingIds] = useState<Set<string>>(new Set());
  const [bulkIssuing, setBulkIssuing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{done:number;total:number}|null>(null);
  const [manageQuery, setManageQuery] = useState('');
  const [manageView, setManageView] = useState<'list'|'grid'|'roster'>('list'); // Manage tab: list by default, roster for teacher distribution
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedGrade, setSelectedGrade] = useState('all');
  const [selectedSchool, setSelectedSchool] = useState('all');
  /** Roster tab: tick which classes (grades) to include in one PDF print. */
  const [selectedRosterGrades, setSelectedRosterGrades] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [reportFilter, setReportFilter] = useState<ReportFilter>('all');
  const [groupMode, setGroupMode] = useState<GroupMode>('hierarchy');
  const [showHiddenAccounts, setShowHiddenAccounts] = useState(false);
  const [designShowHidden, setDesignShowHidden] = useState(false);
  const [isDeletingIds, setIsDeletingIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Card validity applied when issuing (0 = no expiry)
  const [issueValidityMonths, setIssueValidityMonths] = useState(0);

  const issueExpiresAt = useCallback((): string | null => {
    if (!issueValidityMonths) return null;
    const d = new Date();
    d.setMonth(d.getMonth() + issueValidityMonths);
    return d.toISOString();
  }, [issueValidityMonths]);

  const loadManageConfig = useCallback(async (type: CardType) => {
    try {
      const res = await fetch(`/api/admin/settings?type=${type}`,{cache:'no-store'});
      const json = await res.json();
      // Same builder as the Design tab → Manage cards render identically to the design.
      setManageConfig(buildCardConfig(json?.config, type));
    } catch { setManageConfig(buildCardConfig(null, type)); }
  },[]);

  const loadDbCards = useCallback(async (type: CardType) => {
    try {
      const res = await fetch(`/api/cards?holder_type=${type}&slim=true`,{cache:'no-store'});
      if(!res.ok) return;
      const json = await res.json();
      const map = new Map<string,DbCard>();
      for(const c of json.data??[]) if(c.holder_id && !map.has(c.holder_id)) map.set(c.holder_id,c);
      setDbCardsMap(map);
    } catch {}
  },[]);

  const loadRecords = useCallback(async (type: CardType, hiddenOnly = showHiddenAccounts) => {
    setManageLoading(true); setManageError(null); setSelectedClass('all'); setSelectedGrade('all'); setSelectedSchool('all');
    try {
      const hiddenQS = hiddenOnly ? '&deleted_only=true' : '';
      if(type==='parent') {
        const res = await fetch(isSchool?'/api/portal-users?role=parent&scoped=true':'/api/parents/manage',{cache:'no-store'});
        const json = await res.json();
        if(!res.ok) throw new Error(json?.error||'Failed to load parents');
        setRecords((json?.data||[]).map((r:any)=>({
          id:r.id,name:r.full_name||'Unknown',email:r.email||'N/A',roleLabel:'Parent',
          school:r.children?.[0]?.school_name||(r as any).school_name||'Rillcod Academy',
          badge:r.children?`${r.children.length} child${r.children.length===1?'':'ren'}`:'Parent',
          gradeLevel:'', sectionClass:'', profileUrl:`${window.location.origin}/dashboard/parent-feedback`,schoolId:null,
          isHidden: !!(r as any).is_deleted,
        })));
      } else {
        const reportQS = type === 'student' ? '&with_reports=1' : '';
        const res = await fetch(`/api/portal-users?role=${type}&scoped=true${reportQS}${hiddenQS}`,{cache:'no-store'});
        const json = await res.json();
        if(!res.ok) throw new Error(json?.error||`Failed to load ${type}s`);
        setRecords((json?.data||[]).map((r:any)=>({
          id:r.id,name:r.full_name||'Unknown',email:r.email||'N/A',
          roleLabel:type==='teacher'?'Teacher':'Student',
          school:r.school_name||'Rillcod Academy',
          badge:type==='teacher'?'Staff':'',
          gradeLevel:r.grade||'',
          sectionClass:r.section_class||'',
          profileUrl:`${window.location.origin}/dashboard/profile`,
          schoolId:(r as any).school_id??null,
          isHidden: !!r.is_deleted,
          has_published_report: type === 'student' ? !!r.has_published_report : undefined,
          has_draft_report: type === 'student' ? !!r.has_draft_report : undefined,
        })));
      }
    } catch(e:any) { setRecords([]); setManageError(e?.message||'Failed to load card holders'); }
    finally { setManageLoading(false); }
  },[isSchool, showHiddenAccounts]);

  // Load manage data when tab=manage or on card type change
  useEffect(()=>{
    if(!canAccess || activeTab!=='manage') return;
    loadManageConfig(cardType); loadRecords(cardType); loadDbCards(cardType);
    setSelectedIds(new Set()); setStatusFilter('all'); setReportFilter('all');
  },[cardType,canAccess,activeTab,showHiddenAccounts,loadManageConfig,loadRecords,loadDbCards]); // eslint-disable-line

  useEffect(()=>{ setSelectedIds(new Set()); },[manageQuery,selectedClass,selectedGrade,selectedSchool,statusFilter,reportFilter]);

  useEffect(() => { setSelectedRosterGrades(new Set()); }, [selectedSchool, schoolLock]);

  // Card actions
  const issueCard = async (record: CardRecord) => {
    setIsIssuingIds(prev=>new Set(prev).add(record.id));
    try {
      const res = await fetch('/api/cards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({holder_type:cardType,holder_id:record.id,school_id:record.schoolId,expires_at:issueExpiresAt()})});
      if(!res.ok){const j=await res.json();toast.error(j.error||'Failed to issue card');return;}
      toast.success(`Card issued for ${record.name}`); await loadDbCards(cardType);
    } catch(e:any){toast.error(e.message||'Error issuing card');}
    finally{setIsIssuingIds(prev=>{const s=new Set(prev);s.delete(record.id);return s;});}
  };

  const updateCardStatus = async (record: CardRecord, dbCard: DbCard, newStatus:'active'|'revoked') => {
    setIsRevokingIds(prev=>new Set(prev).add(record.id));
    try {
      const res = await fetch(`/api/cards/${dbCard.id}/status`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:newStatus})});
      if(!res.ok){const j=await res.json();toast.error(j.error||'Failed');return;}
      toast.success(newStatus==='revoked'?`Card revoked for ${record.name}`:`Card reactivated for ${record.name}`);
      await loadDbCards(cardType);
    } catch(e:any){toast.error(e.message||'Error');}
    finally{setIsRevokingIds(prev=>{const s=new Set(prev);s.delete(record.id);return s;});}
  };

  const reissueCard = async (record: CardRecord, dbCard: DbCard) => {
    setIsRevokingIds(prev=>new Set(prev).add(record.id));
    try {
      const res = await fetch(`/api/cards/${dbCard.id}/reissue`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason:'reissued via Card Studio'})});
      if(!res.ok){const j=await res.json();toast.error(j.error||'Failed to reissue card');return;}
      toast.success(`New card issued for ${record.name} — reprint the card so the QR matches`);
      await loadDbCards(cardType);
    } catch(e:any){toast.error(e.message||'Error reissuing card');}
    finally{setIsRevokingIds(prev=>{const s=new Set(prev);s.delete(record.id);return s;});}
  };

  const removeRecordsLocally = (ids: string[]) => {
    const gone = new Set(ids);
    setRecords(prev => prev.filter(r => !gone.has(r.id)));
    setSelectedIds(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
    setDesignStudents(prev => prev.filter(s => !gone.has(s.id)));
    setDesignSelectedIds(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
  };

  const permanentlyDeleteHolder = async (record: CardRecord, confirmDestroy = false) => {
    if (!canDeleteAccounts) return;
    setIsDeletingIds(prev => new Set(prev).add(record.id));
    try {
      const result = await permanentWipePortalUserClient(record.id, record.name, confirmDestroy);
      const failure = wipeFailureMessage(result);
      if (failure) {
        toast.error(failure);
        return;
      }
      if (!result.ok) return;
      toast.success(`${record.name} permanently wiped — auth login and all records removed`);
      removeRecordsLocally([record.id]);
      await loadDbCards(cardType);
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    } finally {
      setIsDeletingIds(prev => { const s = new Set(prev); s.delete(record.id); return s; });
    }
  };

  const bulkPermanentlyDelete = async (idsArg?: string[], confirmDestroy = false) => {
    const ids = idsArg ?? [...selectedIds];
    if (!canDeleteAccounts || ids.length === 0) return;
    if (!confirmDestroy && !confirm(`Permanently wipe ${ids.length} account(s) and all their records?\n\nThis cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      if (cardType === 'student') {
        const json = await bulkPermanentWipeStudentsClient(ids, confirmDestroy);
        if (Array.isArray(json.needsConfirmation) && json.needsConfirmation.length > 0) {
          const lines = json.needsConfirmation.map((n: any) => `• ${n.name}: ${n.valuables?.summary ?? 'has records'}`).join('\n');
          if (confirm(`${json.deleted?.length ?? 0} wiped.\n\nThese still have paid cards or published reports:\n\n${lines}\n\nWipe these too — permanently?`)) {
            await bulkPermanentlyDelete(json.needsConfirmation.map((n: any) => n.id), true);
            return;
          }
        }
        removeRecordsLocally(json.deleted ?? []);
        toast.success(`${json.deleted?.length ?? 0} account(s) permanently wiped`);
        if (json.blocked?.length) toast.error(`${json.blocked.length} could not be wiped`);
      } else {
        for (const id of ids) {
          const record = records.find(r => r.id === id);
          if (record) await permanentlyDeleteHolder(record, confirmDestroy);
        }
      }
      await loadDbCards(cardType);
    } catch (e: any) {
      toast.error(e.message || 'Bulk wipe failed');
    } finally {
      setBulkDeleting(false);
    }
  };

  const purgeAllHidden = async (confirmDestroy = false) => {
    if (!canDeleteAccounts) return;
    const count = records.filter(r => r.isHidden).length;
    if (!count) { toast.error('No hidden accounts in this list'); return; }
    if (!confirmDestroy && !confirm(`Permanently wipe ALL ${count} hidden ${cardType}(s) shown here?\n\nEvery owned record, card, and login is destroyed. This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const res = await fetch('/api/portal-users/purge-hidden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: cardType, confirmDestroy, ids: records.filter(r => r.isHidden).map(r => r.id) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Purge failed');
      if (Array.isArray(json.needsConfirmation) && json.needsConfirmation.length > 0) {
        const lines = json.needsConfirmation.map((n: any) => `• ${n.name}: ${n.valuables?.summary ?? 'has records'}`).join('\n');
        if (confirm(`${json.deleted?.length ?? 0} wiped.\n\nStill blocked (paid card / published report):\n\n${lines}\n\nForce-wipe these too?`)) {
          const flaggedIds = json.needsConfirmation.map((n: any) => n.id);
          const retry = await fetch('/api/portal-users/purge-hidden', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: cardType, confirmDestroy: true, ids: flaggedIds }),
          });
          const retryJson = await retry.json();
          if (retry.ok) removeRecordsLocally(retryJson.deleted ?? []);
          toast.success(`${(json.deleted?.length ?? 0) + (retryJson.deleted?.length ?? 0)} hidden account(s) permanently wiped`);
          await loadDbCards(cardType);
          return;
        }
      }
      removeRecordsLocally(json.deleted ?? []);
      toast.success(`${json.deleted?.length ?? 0} hidden account(s) permanently wiped`);
      if (json.blocked?.length) toast.error(`${json.blocked.length} could not be wiped`);
      await loadDbCards(cardType);
    } catch (e: any) {
      toast.error(e.message || 'Purge failed');
    } finally {
      setBulkDeleting(false);
    }
  };

  const bulkIssueList = async (list: CardRecord[]) => {
    if(!list.length) return;
    setBulkIssuing(true); setBulkProgress(null);
    try {
      // The server decides who is actually missing a card and issues only those — we just
      // hand it the holder ids, so the browser never loads the full card set.
      const res = await fetch('/api/cards/issue-missing',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({holder_type:cardType,holder_ids:list.map(r=>r.id),expires_at:issueExpiresAt()})});
      const j = await res.json().catch(()=>({}));
      if(!res.ok){ toast.error(j.error||'Failed to issue cards'); }
      else {
        if(j.issued) toast.success(`${j.issued} card(s) issued`);
        if(j.failed) toast.error(`${j.failed} failed${j.failures?.[0]?.error?` — ${j.failures[0].error}`:''}`);
        if(!j.issued && !j.failed) toast.success('All cards already issued');
      }
    } catch(e:any){ toast.error(e?.message||'Failed to issue cards'); }
    await loadDbCards(cardType); setBulkIssuing(false); setBulkProgress(null);
  };

  const cardStatus = (r: CardRecord): string => { const c=dbCardsMap.get(r.id); return c?c.status:'unissued'; };

  const manageHierarchyPool = useMemo(() => {
    const q = manageQuery.trim().toLowerCase();
    return records.filter((r) => {
      if (schoolLock && (r.school || '') !== schoolLock) return false;
      const matchQ = !q || [r.name, r.email, r.school, r.badge, r.gradeLevel, r.sectionClass].some((v) =>
        (v || '').toLowerCase().includes(q),
      );
      const matchStatus = statusFilter === 'all' || cardStatus(r) === statusFilter;
      const matchReport = matchesReportFilter(r, reportFilter);
      return matchQ && matchStatus && matchReport;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, manageQuery, statusFilter, reportFilter, schoolLock, dbCardsMap]);

  const manageHierarchyFilter = useMemo((): HierarchyFilterState => ({
    schoolLock: schoolLock || undefined,
    school: selectedSchool,
    grade: selectedGrade,
    section: selectedClass,
  }), [schoolLock, selectedSchool, selectedGrade, selectedClass]);

  const manageHierarchySchools = useMemo(
    () => listHierarchySchools(manageHierarchyPool, manageHierarchyPick, manageHierarchyFilter),
    [manageHierarchyPool, manageHierarchyFilter],
  );
  const manageHierarchyGrades = useMemo(
    () => listHierarchyGrades(manageHierarchyPool, manageHierarchyPick, manageHierarchyFilter),
    [manageHierarchyPool, manageHierarchyFilter],
  );
  const manageHierarchySections = useMemo(
    () => listHierarchySections(manageHierarchyPool, manageHierarchyPick, manageHierarchyFilter),
    [manageHierarchyPool, manageHierarchyFilter],
  );

  const manageGradesNeedSchool = manageHierarchySchools.length > 1 && !schoolLock && selectedSchool === 'all';
  const manageSectionsNeedClass = selectedGrade === 'all' && manageHierarchyGrades.length > 1;

  useEffect(() => {
    if (selectedGrade !== 'all' && !manageHierarchyGrades.includes(selectedGrade)) {
      setSelectedGrade('all');
      setSelectedClass('all');
    }
  }, [manageHierarchyGrades, selectedGrade]);

  useEffect(() => {
    if (
      selectedClass !== 'all'
      && selectedClass !== '__NONE__'
      && !manageHierarchySections.includes(selectedClass)
    ) {
      setSelectedClass('all');
    }
  }, [manageHierarchySections, selectedClass]);

  const manageFiltersActive = statusFilter !== 'all'
    || reportFilter !== 'all'
    || selectedSchool !== 'all'
    || selectedGrade !== 'all'
    || selectedClass !== 'all'
    || groupMode !== 'hierarchy'
    || !!manageQuery.trim();

  const resetManageFilters = () => {
    setStatusFilter('all');
    setReportFilter('all');
    setSelectedSchool('all');
    setSelectedGrade('all');
    setSelectedClass('all');
    setGroupMode('hierarchy');
    setManageQuery('');
  };

  const manageSelectClass = 'text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 text-foreground focus:outline-none focus:border-primary min-w-0 max-w-full disabled:opacity-50 disabled:cursor-not-allowed';

  const counts = useMemo(()=>{
    let issued=0,unissued=0,revoked=0,expired=0;
    records.forEach(r=>{const s=cardStatus(r);if(s==='active')issued++;else if(s==='unissued')unissued++;else if(s==='revoked')revoked++;else if(s==='expired')expired++;});
    return {total:records.length,issued,unissued,revoked,expired};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[records,dbCardsMap]);

  const reportCounts = useMemo(() => reportCountsFrom(manageHierarchyPool), [manageHierarchyPool]);

  const filtered = useMemo(() => {
    const list = manageHierarchyPool.filter((r) =>
      matchesHierarchyFilter(r, manageHierarchyPick, manageHierarchyFilter),
    );
    return sortBySchoolHierarchy(list, manageHierarchyPick);
  }, [manageHierarchyPool, manageHierarchyFilter]);

  const groupedByGrade = useMemo(()=>{
    const map=new Map<string,CardRecord[]>();
    filtered.forEach(r=>{const key=r.gradeLevel||'— No Class —';if(!map.has(key))map.set(key,[]);map.get(key)!.push(r);});
    return Array.from(map.entries()).sort(([a],[b])=>compareClassNames(a,b));
  },[filtered]);

  const groupedBySection = useMemo(()=>{
    const map=new Map<string,CardRecord[]>();
    filtered.forEach(r=>{const key=r.sectionClass||'— No Section —';if(!map.has(key))map.set(key,[]);map.get(key)!.push(r);});
    return Array.from(map.entries()).sort(([a],[b])=>compareSectionNames(a,b));
  },[filtered]);

  const groupedByHierarchy = useMemo(
    () => buildHierarchyGroups(filtered, manageHierarchyPick),
    [filtered],
  );

  const grouped = groupMode === 'hierarchy' ? null : groupMode === 'grade' ? groupedByGrade : groupedBySection;

  const toggleSelected = (id:string) => setSelectedIds(prev=>{
    const n=new Set(prev);
    if(n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  // Consolidated: manage-tab prints go through the shared card builder at the
  // exact card size from the saved design (QR codes generated locally).
  const printManageCards = async (
    list: CardRecord[],
    title: string,
    opts?: { groupBy?: 'none' | 'grade' | 'section' },
  ) => {
    if(!list.length){toast.error('No records to print');return;}
    const holders: PrintCardHolder[] = sortCardHolders(list.map(r=>{
      const dbCard=dbCardsMap.get(r.id);
      return {
        id: r.id,
        full_name: r.name,
        email: r.email==='N/A'?null:r.email,
        school_name: r.school,
        grade: r.gradeLevel || null,
        section_class: r.sectionClass||null,
        card_number: dbCard?.card_number??null,
        verification_code: dbCard?.verification_code??null,
        expires_at: dbCard?.expires_at??null,
        card_code: r.roleLabel==='Student' ? accessCardCodeForStudent(r.id) : (dbCard?.verification_code ?? accessCardCodeForStudent(r.id)),
        role_label: r.roleLabel,
        badge: (r.badge === r.gradeLevel || r.badge === r.sectionClass) ? null : r.badge,
      };
    }));
    const grades = new Set(holders.map(h => (h.grade ?? '').trim()).filter(Boolean));
    const groupBy = opts?.groupBy ?? (grades.size > 1 ? 'grade' : 'none');
    const html = await buildBulkPrintHtml(holders, manageConfig as unknown as PrintCardConfig, window.location.origin, {
      fixedSize: true,
      qrHint: 'Scan to verify',
      title,
      groupBy,
    });
    openPrintWindow(html);
  };

  const rosterDate = () => new Date().toISOString().slice(0, 10);

  const filteredRosterRows = useMemo(
    () => buildStudentRosterRows(
      mapRecordsToRosterInput(filtered.filter((r) => r.has_published_report)),
      window.location.origin,
    ),
    [filtered],
  );

  const rosterClassGroups = useMemo(
    () => buildRosterClassGroups(filteredRosterRows),
    [filteredRosterRows],
  );

  /** Grades in current school scope — for one-tap class roster print. */
  const rosterQuickGrades = useMemo(() => {
    const schoolScope = schoolLock || (selectedSchool !== 'all' ? selectedSchool : null);
    const map = new Map<string, { withReport: number; records: CardRecord[] }>();
    filtered.forEach((r) => {
      if (schoolScope && (r.school || '') !== schoolScope) return;
      const grade = r.gradeLevel || '— No Class —';
      if (!map.has(grade)) map.set(grade, { withReport: 0, records: [] });
      const entry = map.get(grade)!;
      entry.records.push(r);
      if (r.has_published_report) entry.withReport += 1;
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => compareClassNames(a, b))
      .map(([grade, stats]) => ({ grade, ...stats }));
  }, [filtered, selectedSchool, schoolLock]);

  const rosterScopeLabel = schoolLock
    || (selectedSchool !== 'all' ? selectedSchool : 'All schools');

  const rosterSchoolRequired = manageHierarchySchools.length > 1 && !schoolLock && selectedSchool === 'all';

  const toggleRosterGrade = (grade: string) => {
    setSelectedRosterGrades((prev) => {
      const next = new Set(prev);
      if (next.has(grade)) next.delete(grade);
      else next.add(grade);
      return next;
    });
  };

  const selectAllRosterGrades = () => {
    setSelectedRosterGrades(new Set(
      rosterQuickGrades.filter((g) => g.withReport > 0).map((g) => g.grade),
    ));
  };

  const clearRosterGrades = () => setSelectedRosterGrades(new Set());

  const recordsForSelectedRosterGrades = useCallback(() => {
    const schoolScope = schoolLock || (selectedSchool !== 'all' ? selectedSchool : null);
    return filtered.filter((r) => {
      const g = r.gradeLevel || '— No Class —';
      if (!selectedRosterGrades.has(g)) return false;
      if (schoolScope && (r.school || '') !== schoolScope) return false;
      return true;
    });
  }, [filtered, selectedRosterGrades, selectedSchool, schoolLock]);

  const printSelectedRosterGrades = async () => {
    if (rosterSchoolRequired) {
      toast.error('Select a school first, then tick the classes you want');
      return;
    }
    if (selectedRosterGrades.size === 0) {
      toast.error('Tick at least one class to print');
      return;
    }
    const grades = Array.from(selectedRosterGrades).sort(compareClassNames);
    const title = grades.length === 1
      ? `RC roster — ${grades[0]}`
      : `RC roster — ${rosterScopeLabel} (${grades.length} classes)`;
    await printManageRosterPdf(recordsForSelectedRosterGrades(), title, { splitByClass: true });
  };

  const saveSelectedRosterGrades = async () => {
    if (rosterSchoolRequired) {
      toast.error('Select a school first, then tick the classes you want');
      return;
    }
    if (selectedRosterGrades.size === 0) {
      toast.error('Tick at least one class to download');
      return;
    }
    const grades = Array.from(selectedRosterGrades).sort(compareClassNames);
    const label = grades.length === 1 ? `rc-roster-${grades[0]}` : `${cardType}-rc-roster-selected`;
    await saveManageRosterPdf(recordsForSelectedRosterGrades(), label, { splitByClass: true });
  };

  const rosterPreviewGroups = useMemo(() => {
    if (selectedRosterGrades.size === 0) return rosterClassGroups;
    return rosterClassGroups.filter((g) => selectedRosterGrades.has(g.className));
  }, [rosterClassGroups, selectedRosterGrades]);

  const selectedRosterStudentCount = useMemo(
    () => rosterPreviewGroups.reduce((n, g) => n + g.rows.length, 0),
    [rosterPreviewGroups],
  );

  const rosterPdfOptions = (
    rows: StudentRosterRow[],
    title: string,
    splitByClass: boolean,
    groupMode: 'class' | 'section' = 'class',
  ) => ({
    title,
    orgName: manageConfig.orgName,
    orgWebsite: manageConfig.orgWebsite,
    accentColor: manageConfig.accentColor,
    origin: typeof window !== 'undefined' ? window.location.origin : undefined,
    pdfGroups: splitByClass ? buildRosterPdfGroups(rows, groupMode) : undefined,
    groupMode: splitByClass ? groupMode : undefined,
  });

  const printManageRosterPdf = async (
    list: CardRecord[],
    title: string,
    opts?: { splitByClass?: boolean; groupMode?: 'class' | 'section' },
  ) => {
    const eligible = list.filter((r) => r.has_published_report);
    if (!eligible.length) {
      toast.error('No students with published reports in this selection');
      return;
    }
    if (eligible.length < list.length) {
      toast.message(`${eligible.length} with published results · ${list.length - eligible.length} skipped (no report yet)`);
    }
    const rows = buildStudentRosterRows(mapRecordsToRosterInput(eligible), window.location.origin);
    if (!rows.length) {
      toast.error('No student RC numbers to print');
      return;
    }
    const groups = buildRosterPdfGroups(rows, opts?.groupMode ?? 'class');
    const splitByClass = opts?.splitByClass ?? groups.length > 1;
    const ok = await downloadStudentRosterPdf(rows, {
      ...rosterPdfOptions(rows, title, splitByClass, opts?.groupMode ?? 'class'),
      mode: 'print',
    });
    if (!ok) toast.error('Pop-up blocked — allow pop-ups to print the roster PDF');
    else toast.success(
      splitByClass && groups.length > 1
        ? `Roster PDF ready — ${groups.length} classes · ${rows.length} students`
        : `Roster PDF ready — ${rows.length} student${rows.length === 1 ? '' : 's'}`,
    );
  };

  const saveManageRosterPdf = async (
    list: CardRecord[],
    label: string,
    opts?: { splitByClass?: boolean; groupMode?: 'class' | 'section' },
  ) => {
    const eligible = list.filter((r) => r.has_published_report);
    if (!eligible.length) {
      toast.error('No students with published reports in this selection');
      return;
    }
    if (eligible.length < list.length) {
      toast.message(`${eligible.length} with published results · ${list.length - eligible.length} skipped (no report yet)`);
    }
    const rows = buildStudentRosterRows(mapRecordsToRosterInput(eligible), window.location.origin);
    if (!rows.length) {
      toast.error('No student RC numbers to export');
      return;
    }
    const groups = buildRosterPdfGroups(rows, opts?.groupMode ?? 'class');
    const splitByClass = opts?.splitByClass ?? groups.length > 1;
    await downloadStudentRosterPdf(rows, {
      ...rosterPdfOptions(rows, label, splitByClass, opts?.groupMode ?? 'class'),
      filename: `${label.replace(/\s+/g, '-').toLowerCase()}-${rosterDate()}.pdf`,
      mode: 'save',
    });
    toast.success(
      splitByClass && groups.length > 1
        ? `Saved roster PDF — ${groups.length} classes · ${rows.length} students`
        : `Saved roster PDF — ${rows.length} student${rows.length === 1 ? '' : 's'}`,
    );
  };

  // ── Guards ────────────────────────────────────────────────────────────────
  if (isLoading) return null;
  if (!canAccess) return (
    <div className="flex items-center justify-center min-h-screen bg-background text-muted-foreground">
      <div className="text-center">
        <CreditCardIcon className="w-8 h-8 mx-auto mb-3 text-rose-400"/>
        <p className="font-semibold text-foreground">Card Studio access is for staff only</p>
      </div>
    </div>
  );

  const CARD_TYPES: CardType[] = ['student','parent',...(canViewTeacherCards?['teacher' as CardType]:[])];

  // ── Design Tab Render ─────────────────────────────────────────────────────
  const renderDesignTab = () => (
    <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden relative">
      {/* Mobile sub-tabs */}
      <div className="flex md:hidden border-b border-border bg-card shrink-0">
        {[
          { id: 'settings' as const, label: 'Settings', icon: PaintBrushIcon },
          { id: 'preview' as const, label: 'Preview', icon: CreditCardIcon },
          { id: 'generate' as const, label: 'Generate', icon: UserPlusIcon },
        ].map(t => {
          const Icon = t.icon;
          const active = designSubTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setDesignSubTab(t.id)}
              className={`flex-1 py-3 flex flex-col items-center gap-1 border-b-2 text-[10px] font-bold uppercase transition-all ${
                active ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Left sidebar: Settings */}
      <div className={`${designSubTab === 'settings' ? 'block w-full' : 'hidden'} md:block md:w-[268px] md:flex-shrink-0 md:border-r md:border-border overflow-y-auto scrollbar-thin`}>
        <SidebarSection title="Templates" icon={<PaintBrushIcon className="w-3.5 h-3.5"/>} open={openSections.has('templates')} onToggle={()=>toggleSection('templates')}>
          <div className="grid grid-cols-3 gap-1.5">
            {TEMPLATES.map(t=>(
              <button key={t.name} title={t.name} onClick={()=>update({accentColor:t.color,headerStyle:t.style})}
                className={`h-9 overflow-hidden border transition-all text-left bg-background ${cfg.accentColor===t.color&&cfg.headerStyle===t.style?'border-primary ring-1 ring-primary':'border-border hover:border-muted-foreground/30'}`}>
                {t.style==='band'&&<div style={{background:t.color}} className="w-full h-4"/>}
                {t.style==='border'&&<div className="flex h-full"><div style={{background:t.color}} className="w-1 flex-shrink-0"/><div className="flex-1 bg-muted/30"/></div>}
                {t.style==='minimal'&&<div className="flex flex-col h-full"><div style={{borderBottom:`2px solid ${t.color}`}} className="bg-muted/30 h-1/2"/><div className="flex-1"/></div>}
                <div className="text-[8px] font-bold text-muted-foreground px-1 truncate mt-0.5">{t.name}</div>
              </button>
            ))}
          </div>
        </SidebarSection>

        <SidebarSection title="Design" open={openSections.has('design')} onToggle={()=>toggleSection('design')}>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground/80 mb-2 font-bold">Header Style</div>
            <div className="grid grid-cols-3 gap-1.5">
              {(['band','border','minimal'] as const).map(s=>(
                <button key={s} onClick={()=>update({headerStyle:s})}
                  className={`py-2 border text-[9px] font-bold uppercase transition-all rounded-md ${cfg.headerStyle===s?'border-primary bg-primary/10 text-primary':'border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground/80 mb-2 font-bold">Accent Color</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {PRESET_COLORS.map(c=>(
                <button key={c} title={c} onClick={()=>update({accentColor:c})} style={{background:c}}
                  className={`w-7 h-7 transition-all relative rounded-md ${cfg.accentColor===c?'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110':'hover:scale-105 opacity-80 hover:opacity-100'}`}>
                  {cfg.accentColor===c&&<span className="absolute inset-0 flex items-center justify-center text-white text-[10px] font-bold">✓</span>}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input type="color" value={cfg.accentColor} onChange={e=>update({accentColor:e.target.value})} className="w-8 h-7 cursor-pointer border border-border bg-transparent p-0 rounded"/>
              <input type="text" value={cfg.accentColor} onChange={e=>/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)&&update({accentColor:e.target.value})}
                className="flex-1 px-2 py-1.5 bg-background border border-border text-foreground text-[11px] font-mono focus:outline-none focus:border-primary rounded-md"/>
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground/80 mb-2 font-bold">Card Size</div>
            <div className="flex gap-1.5 mb-2">
              {([{label:'CR80 Portrait',w:'54mm',h:'85.6mm'},{label:'CR80 Landscape',w:'85.6mm',h:'54mm'},{label:'A7 Large',w:'70mm',h:'100mm'}]).map(s=>(
                <button key={s.label} onClick={()=>update({width:s.w,height:s.h})}
                  className={`flex-1 py-1.5 text-[8px] font-bold uppercase border transition-all truncate rounded-md ${cfg.width===s.w&&cfg.height===s.h?'border-primary bg-primary/10 text-primary':'border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                  {s.label}
                </button>
              ))}
            </div>
            {/* Custom dimensions (mm) — overrides the presets above. */}
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 flex-1">
                <span className="text-[8px] font-bold uppercase text-muted-foreground/70">W</span>
                <input type="number" min={30} max={150} step={0.1} value={parseFloat(cfg.width)||''}
                  onChange={e=>{const v=parseFloat(e.target.value);if(!isNaN(v)&&v>0)update({width:`${Math.min(150,Math.max(30,v))}mm`});}}
                  className="w-full px-2 py-1.5 bg-background border border-border text-foreground text-[11px] font-mono focus:outline-none focus:border-primary rounded-md"/>
              </label>
              <span className="text-[10px] text-muted-foreground/50 font-bold">×</span>
              <label className="flex items-center gap-1.5 flex-1">
                <span className="text-[8px] font-bold uppercase text-muted-foreground/70">H</span>
                <input type="number" min={30} max={150} step={0.1} value={parseFloat(cfg.height)||''}
                  onChange={e=>{const v=parseFloat(e.target.value);if(!isNaN(v)&&v>0)update({height:`${Math.min(150,Math.max(30,v))}mm`});}}
                  className="w-full px-2 py-1.5 bg-background border border-border text-foreground text-[11px] font-mono focus:outline-none focus:border-primary rounded-md"/>
              </label>
              <span className="text-[8px] font-bold uppercase text-muted-foreground/50">mm</span>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground/80 font-bold">QR Size</div>
              <span className="text-[9px] font-mono font-bold text-primary">{Math.round((cfg.qrScale??1)*100)}%</span>
            </div>
            <div className="flex gap-1.5 mb-2">
              {([{label:'Compact',v:0.85},{label:'Standard',v:1},{label:'Large',v:1.35}]).map(s=>{
                const active=Math.abs((cfg.qrScale??1)-s.v)<0.001;
                return (
                  <button key={s.label} onClick={()=>update({qrScale:s.v})}
                    className={`flex-1 py-1.5 text-[8px] font-bold uppercase border transition-all truncate rounded-md ${active?'border-primary bg-primary/10 text-primary':'border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                    {s.label}
                  </button>
                );
              })}
            </div>
            {/* Free scaling — drag to any size between 50% and 200%. */}
            <input type="range" min={0.5} max={2} step={0.05} value={cfg.qrScale??1}
              onChange={e=>update({qrScale:parseFloat(e.target.value)})}
              className="w-full accent-primary cursor-pointer"/>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground/80 mb-2 font-bold">Header Badge</div>
            <select value={cfg.badgeMode??'label'} onChange={e=>update({badgeMode:e.target.value as CardConfig['badgeMode']})}
              className="w-full px-2 py-1.5 bg-background border border-border text-foreground text-[11px] focus:outline-none focus:border-primary rounded-md">
              <option value="label">Access Card label</option>
              <option value="class">Class</option>
              <option value="custom">Custom text</option>
            </select>
            {(cfg.badgeMode??'label')==='custom' && (
              <input type="text" value={cfg.badgeText||''} onChange={e=>update({badgeText:e.target.value})} placeholder="Badge text"
                className="w-full mt-1.5 px-2 py-1.5 bg-background border border-border text-foreground text-[11px] font-mono focus:outline-none focus:border-primary rounded-md"/>
            )}
            {(cfg.badgeMode??'label')==='class' && (
              <p className="text-[9px] text-muted-foreground/60 mt-1">Shows each student&apos;s <span className="font-semibold">Class</span> (JSS 1, SS 2…) in the header badge. The Class body field is hidden automatically.</p>
            )}
            <p className="text-[9px] text-muted-foreground/60 mt-1">Colour it under Typography → Card Label; hide it with the Card Label toggle.</p>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground/80 mb-2 font-bold">Corners</div>
            <div className="flex gap-1.5">
              {([{label:'Sharp',v:'sharp'},{label:'Rounded',v:'rounded'},{label:'Pill',v:'pill'}] as const).map(s=>(
                <button key={s.v} onClick={()=>update({cornerRadius:s.v})}
                  className={`flex-1 py-1.5 text-[8px] font-bold uppercase border transition-all rounded-md ${cfg.cornerRadius===s.v?'border-primary bg-primary/10 text-primary':'border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground/80 font-bold">Logo Size</div>
              <span className="text-[9px] font-mono font-bold text-primary">{Math.round((cfg.logoScale??1)*100)}%</span>
            </div>
            <input type="range" min={0.5} max={2} step={0.05} value={cfg.logoScale??1}
              onChange={e=>update({logoScale:parseFloat(e.target.value)})} className="w-full accent-primary cursor-pointer"/>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground/80 font-bold">Header Size</div>
              <span className="text-[9px] font-mono font-bold text-primary">{Math.round((cfg.headerScale??1)*100)}%</span>
            </div>
            <input type="range" min={0.5} max={2} step={0.05} value={cfg.headerScale??1}
              onChange={e=>update({headerScale:parseFloat(e.target.value)})} className="w-full accent-primary cursor-pointer"/>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground/80 mb-2 font-bold">Background</div>
            <div className="flex gap-1.5 mb-2">
              {[{label:'White',value:'#ffffff'},{label:'Off-White',value:'#f9fafb'},{label:'Cream',value:'#fffbeb'}].map(c=>(
                <button key={c.value} onClick={()=>update({bgColor:c.value})} style={{background:c.value}}
                  className={`flex-1 py-1.5 border text-[8px] font-bold text-gray-700 transition-all rounded-md ${cfg.bgColor===c.value?'ring-2 ring-primary ring-offset-2 ring-offset-background':'border-border'}`}>
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input type="color" value={cfg.bgColor} onChange={e=>update({bgColor:e.target.value})} className="w-8 h-7 cursor-pointer border border-border bg-transparent p-0 rounded"/>
              <input type="text" value={cfg.bgColor} onChange={e=>/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)&&update({bgColor:e.target.value})}
                className="flex-1 px-2 py-1.5 bg-background border border-border text-foreground text-[11px] font-mono focus:outline-none focus:border-primary rounded-md"/>
            </div>
          </div>
          <div className="space-y-2">
            {([{key:'showLogo' as const,label:'Show Logo',desc:'Logo in header'},{key:'showPhotoSlot' as const,label:'Photo Slot',desc:'Student photo space'},{key:'showCardLabel' as const,label:'Card Label',desc:'“Student Access Card” badge'}]).map(opt=>(
              <label key={opt.key} className="flex items-center gap-3 cursor-pointer py-1">
                <div onClick={()=>update({[opt.key]:!cfg[opt.key]})}
                  className={`w-8 h-4 rounded-full flex-shrink-0 transition-all relative ${cfg[opt.key]?'bg-primary':'bg-muted'}`}>
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${cfg[opt.key]?'translate-x-4':'translate-x-0.5'}`}/>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-foreground">{opt.label}</div>
                  <div className="text-[8px] text-muted-foreground">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </SidebarSection>

        <SidebarSection title="Card Fields" icon={<CreditCardIcon className="w-3.5 h-3.5"/>} open={openSections.has('fields')} onToggle={()=>toggleSection('fields')}>
          <p className="text-[9px] text-muted-foreground/70 leading-relaxed mb-2">Tick to show a field, edit its label, or reorder with the arrows.</p>
          <div className="space-y-1.5">
            {cfg.fields.map((f,i)=>(
              <div key={f.key} className={`flex items-center gap-1.5 px-2 py-2 border transition-all rounded-lg bg-card ${f.visible?'border-primary/30 bg-primary/5':'border-border'}`}>
                <button onClick={()=>toggleField(f.key)}
                  className={`w-4 h-4 border flex-shrink-0 flex items-center justify-center transition-all rounded ${f.visible?'bg-primary border-primary':'border-border hover:border-primary/50'}`}>
                  {f.visible&&<span className="text-primary-foreground text-[9px] leading-none">✓</span>}
                </button>
                <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground w-14 flex-shrink-0 truncate">{f.key}</span>
                <input type="text" value={f.label} onChange={e=>updateFieldLabel(f.key,e.target.value)}
                  className="flex-1 px-1.5 py-0.5 bg-background border border-border text-foreground text-[10px] font-mono focus:outline-none focus:border-primary min-w-0 rounded"/>
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button onClick={()=>moveField(i,-1)} disabled={i===0} className="w-4 h-3.5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-10 transition-colors"><ArrowUpIcon className="w-2.5 h-2.5"/></button>
                  <button onClick={()=>moveField(i,1)} disabled={i===cfg.fields.length-1} className="w-4 h-3.5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-10 transition-colors"><ArrowDownIcon className="w-2.5 h-2.5"/></button>
                </div>
              </div>
            ))}
          </div>
        </SidebarSection>

        <SidebarSection title="Text" open={openSections.has('text')} onToggle={()=>toggleSection('text')}>
          <div className="space-y-3">
            {([{label:'Org Name',field:'orgName'},{label:'Website',field:'orgWebsite'},{label:'Card Label',field:'cardLabel'},{label:'Footer Left',field:'footerLeft'},{label:'Footer Right',field:'footerRight'}] as const).map(({label,field})=>(
              <div key={field}>
                <div className="text-[8px] uppercase text-muted-foreground mb-1 font-bold">{label}</div>
                <input type="text" value={cfg[field] as string} onChange={e=>update({[field]:e.target.value})}
                  className="w-full px-2 py-1.5 bg-background border border-border text-foreground text-[11px] font-mono focus:outline-none focus:border-primary rounded-md"/>
              </div>
            ))}
          </div>
        </SidebarSection>

        <SidebarSection title="Typography" open={openSections.has('typography')} onToggle={()=>toggleSection('typography')}>
          <div className="space-y-3">
            {([{elem:'cardLabel' as const,label:'Card Label'},{elem:'orgName' as const,label:'Org Name'},{elem:'studentName' as const,label:'Student Name'},{elem:'school' as const,label:'School'},{elem:'fieldLabel' as const,label:'Field Labels'},{elem:'fieldValue' as const,label:'Field Values'},{elem:'accentValue' as const,label:'Accent Values'},{elem:'footer' as const,label:'Footer'}]).map(({elem,label})=>{
              const s=cfg.typo[elem]??DEFAULT_TYPO[elem];
              return (
                <div key={elem} className="border border-border p-2.5 rounded-lg space-y-2 bg-background">
                  <div className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">{label}</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div><div className="text-[8px] text-muted-foreground mb-1">Size</div>
                      <input type="text" value={s.fontSize.replace('mm','')} onChange={e=>updateTypo(elem,{fontSize:e.target.value+'mm'})}
                        className="w-full px-1.5 py-1 bg-card border border-border text-foreground text-[10px] font-mono focus:outline-none rounded"/></div>
                    <div><div className="text-[8px] text-muted-foreground mb-1">Weight</div>
                      <select value={s.fontWeight} onChange={e=>updateTypo(elem,{fontWeight:e.target.value})}
                        className="w-full px-1 py-1 bg-card border border-border text-foreground text-[10px] focus:outline-none rounded">
                        <option value="400">Regular</option><option value="600">Semi-Bold</option><option value="700">Bold</option><option value="800">Extra-Bold</option><option value="900">Black</option>
                      </select></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="color" value={s.color.startsWith('rgba')?'#ffffff':s.color} onChange={e=>updateTypo(elem,{color:e.target.value})} className="w-7 h-6 cursor-pointer border border-border bg-transparent p-0 flex-shrink-0 rounded"/>
                    <input type="text" value={s.color} onChange={e=>updateTypo(elem,{color:e.target.value})} className="flex-1 px-1.5 py-1 bg-card border border-border text-foreground text-[9px] font-mono focus:outline-none min-w-0 rounded"/>
                    <div className="flex gap-1">
                      {(['sans','mono'] as const).map(fam=>(
                        <button key={fam} onClick={()=>updateTypo(elem,{fontFamily:fam})}
                          className={`px-1.5 py-1 text-[8px] font-bold uppercase border transition-all rounded ${s.fontFamily===fam?'bg-primary border-primary text-primary-foreground':'border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}>{fam}</button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white px-3 py-1.5 overflow-hidden border border-border rounded">
                    <span style={{fontSize:s.fontSize,fontWeight:parseInt(s.fontWeight),color:s.color.startsWith('rgba')||s.color==='#ffffff'?'#374151':s.color,fontFamily:s.fontFamily==='mono'?'monospace':'inherit'}}>
                      Sample — {label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </SidebarSection>
      </div>

      {/* Center: Live Preview */}
      <div className={`${designSubTab === 'preview' ? 'flex' : 'hidden'} md:flex md:flex-1 flex-col items-center justify-center gap-5 overflow-auto p-4 md:p-6 min-w-0 bg-background`}>
        <div className="flex items-center gap-3">
          <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">Live Preview</span>
          <div className="flex items-center gap-1 bg-card border border-border px-2 py-1 rounded-md">
            <button onClick={()=>setPreviewZoom(z=>Math.max(0.6,+(z-0.1).toFixed(2)))} className="text-muted-foreground hover:text-foreground text-[12px] font-bold px-1 transition-colors">−</button>
            <span className="text-[9px] text-muted-foreground font-mono w-10 text-center">{Math.round(previewZoom*100)}%</span>
            <button onClick={()=>setPreviewZoom(z=>Math.min(1.8,+(z-0.1).toFixed(2)))} className="text-muted-foreground hover:text-foreground text-[12px] font-bold px-1 transition-colors">+</button>
            <button onClick={()=>setPreviewZoom(1.0)} className="text-[9px] text-muted-foreground/60 hover:text-foreground ml-1.5 transition-colors border-l border-border pl-1.5">Reset</button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-8 max-w-full overflow-hidden">
          <CardPreview cfg={cfg} scale={previewZoom}/>
        </div>
        {lastSaved&&<p className="text-[9px] text-muted-foreground">Last saved: {lastSaved.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</p>}
        <div className="flex flex-wrap gap-2 justify-center">
          <button onClick={handlePrintSample} className="flex items-center gap-1.5 px-4 py-2 border border-border hover:border-muted-foreground/30 bg-card hover:bg-muted text-foreground text-[10px] font-black uppercase tracking-widest transition-all rounded-lg">
            <PrinterIcon className="w-3.5 h-3.5"/> Print Sample
          </button>
        </div>
        <p className="text-[9px] text-muted-foreground text-center max-w-xs px-4">All card prints use this design saved globally.</p>
      </div>

      {/* Right sidebar: Generate panel */}
      <div className={`${designSubTab === 'generate' ? 'flex' : 'hidden'} lg:flex lg:w-[272px] lg:flex-shrink-0 lg:border-l lg:border-border flex-col overflow-hidden bg-card`}>
        <div className="flex-shrink-0 px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Generate Cards</div>
            {designStudentsLoaded&&<span className="text-[9px] text-muted-foreground font-mono font-bold">{designStudents.length} students</span>}
          </div>
          <div className="flex gap-1.5">
            <button onClick={()=>loadDesignStudents(false)} disabled={designStudentsLoading||designStudentsLoaded}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40 rounded-lg">
              {designStudentsLoading?<><div className="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"/>Loading…</>:<><ArrowDownTrayIcon className="w-3.5 h-3.5"/>Load Students</>}
            </button>
            {designStudentsLoaded&&(
              <button onClick={()=>loadDesignStudents(true)} disabled={designStudentsLoading} title="Refresh" className="px-3 py-2 border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-[10px] font-black uppercase transition-all disabled:opacity-40 rounded-lg">↺</button>
            )}
          </div>
          {canDeleteAccounts && (
            <label className="flex items-center gap-2 cursor-pointer px-1">
              <input type="checkbox" checked={designShowHidden} onChange={(e) => { setDesignShowHidden(e.target.checked); setDesignStudentsLoaded(false); setTimeout(() => loadDesignStudents(true), 0); }}
                className="rounded border-border"/>
              <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Show hidden / soft-deleted</span>
            </label>
          )}
        </div>
        {designStudentsLoaded&&(
          <>
            <div className="flex-shrink-0 px-4 py-2.5 border-b border-border space-y-2 bg-muted/20">
              <div className="flex items-center gap-2 text-[9px] font-mono">
                <span className="text-primary font-bold">{designSelectedIds.size}</span><span className="text-muted-foreground">selected /</span>
                <span className="text-foreground font-bold">{visibleDesignStudents.length}</span><span className="text-muted-foreground">visible</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={()=>setDesignSelectedIds(new Set(visibleDesignStudents.map(s=>s.id)))} className="px-2 py-1.5 bg-background hover:bg-muted border border-border text-[9px] font-black uppercase text-muted-foreground hover:text-foreground transition-all rounded">✓ All</button>
                <button onClick={()=>setDesignSelectedIds(new Set())} className="px-2 py-1.5 bg-background hover:bg-muted border border-border text-[9px] font-black uppercase text-muted-foreground hover:text-foreground transition-all rounded">✗ Clear</button>
                {designSelectedIds.size>0&&(
                  <button onClick={()=>printDesignCards(designStudents.filter(s=>designSelectedIds.has(s.id)))}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-black uppercase transition-all rounded">
                    <PrinterIcon className="w-3 h-3"/> Print {designSelectedIds.size}
                  </button>
                )}
              </div>
            </div>
            <div className="flex-shrink-0 px-4 py-2.5 border-b border-border space-y-2">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/60"/>
                <input value={designSearch} onChange={e=>setDesignSearch(e.target.value)} placeholder="Search name, class…"
                  className="w-full pl-7 pr-3 py-1.5 bg-background border border-border text-foreground text-[10px] placeholder-muted-foreground/50 focus:outline-none focus:border-primary rounded"/>
              </div>
              {designFiltersActive && (
                <button type="button" onClick={resetDesignFilters}
                  className="w-full px-2 py-1.5 rounded border border-border text-[9px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  Reset filters
                </button>
              )}
              <select value={designReportFilter} onChange={e=>setDesignReportFilter(e.target.value as ReportFilter)} aria-label="Progress report"
                className={`${designSelectClass} ${designReportFilter !== 'all' ? 'border-primary/40 bg-primary/5' : ''}`}>
                <option value="all">All students ({designReportCounts.total})</option>
                <option value="published">Published report ({designReportCounts.published})</option>
                <option value="draft">Draft only ({designReportCounts.draft})</option>
                <option value="no_report">No report ({designReportCounts.noReport})</option>
              </select>
              {showDesignSchoolFilter && (
                <select
                  value={designSelectedSchool}
                  onChange={(e) => {
                    setDesignSelectedSchool(e.target.value);
                    setDesignSelectedGrade('all');
                    setDesignSelectedClass('all');
                  }}
                  aria-label="School"
                  className={`${designSelectClass} ${designSelectedSchool !== 'all' ? 'border-primary/40 bg-primary/5' : ''}`}
                >
                  <option value="all">All schools ({designHierarchyPool.length})</option>
                  {designHierarchySchools.map((s) => (
                    <option key={s} value={s}>
                      {s} ({countHierarchy(designHierarchyPool, designHierarchyPick, designHierarchyFilter, 'school', s)})
                    </option>
                  ))}
                </select>
              )}
              {designHierarchyGrades.length > 0 && (
                <select
                  value={designSelectedGrade}
                  disabled={designGradesNeedSchool}
                  onChange={(e) => {
                    setDesignSelectedGrade(e.target.value);
                    setDesignSelectedClass('all');
                  }}
                  aria-label="Class (grade)"
                  className={`${designSelectClass} ${designSelectedGrade !== 'all' ? 'border-primary/40 bg-primary/5' : ''}`}
                >
                  <option value="all">
                    {designGradesNeedSchool ? 'Pick school first' : `All classes (${designHierarchyPool.length})`}
                  </option>
                  {designHierarchyGrades.map((g) => (
                    <option key={g} value={g}>
                      {g} ({countHierarchy(designHierarchyPool, designHierarchyPick, designHierarchyFilter, 'grade', g)})
                    </option>
                  ))}
                </select>
              )}
              {designHierarchySections.length > 0 && (
                <select
                  value={designSelectedClass}
                  disabled={designSectionsNeedClass}
                  onChange={(e) => setDesignSelectedClass(e.target.value)}
                  aria-label="Section"
                  className={`${designSelectClass} ${designSelectedClass !== 'all' ? 'border-primary/40 bg-primary/5' : ''}`}
                >
                  <option value="all">
                    {designSectionsNeedClass ? 'Pick class first' : `All sections (${designHierarchyPool.length})`}
                  </option>
                  {designHierarchySections.map((c) => (
                    <option key={c} value={c}>
                      {sectionFilterLabel(c)} ({countHierarchy(designHierarchyPool, designHierarchyPick, designHierarchyFilter, 'section', c)})
                    </option>
                  ))}
                </select>
              )}
              {(designHierarchyGrades.length > 1 || designHierarchySections.length > 1) && (
                <select value={designGroupMode} onChange={e=>setDesignGroupMode(e.target.value as GroupMode)} aria-label="Layout"
                  className={`${designSelectClass} ${designGroupMode !== 'hierarchy' ? 'border-primary/40 bg-primary/5' : ''}`}>
                  <option value="hierarchy">School → class → section</option>
                  <option value="none">Flat list</option>
                  {designHierarchyGrades.length > 1 && <option value="grade">Group by class</option>}
                  {designHierarchySections.length > 1 && <option value="section">Group by section</option>}
                </select>
              )}
              <p className="text-[8px] text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400"/> Published</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-400"/> Draft</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400"/> No report</span>
              </p>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {visibleDesignStudents.length===0?(
                <div className="px-4 py-8 text-center text-[10px] text-muted-foreground">No students match filters.</div>
              ):designGroupMode==='hierarchy'?(
                designGroupedByHierarchy.map(({ className, sections }) => (
                  <div key={className}>
                    <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 border-b border-border sticky top-0 z-20">
                      <span className="text-[9px] font-black uppercase tracking-widest text-foreground flex-1 truncate">Class: {className}</span>
                      <button
                        onClick={() => void printDesignCards(
                          sections.flatMap((sec) => sec.items),
                          `Class — ${className}`,
                          { groupBy: 'section' },
                        )}
                        className="text-[8px] font-bold text-emerald-600 hover:text-emerald-500 transition-colors whitespace-nowrap"
                      >
                        Print class
                      </button>
                    </div>
                    {sections.map(({ sectionName, items }) => {
                      const sectionIds = items.map((s) => s.id);
                      const allSel = sectionIds.every((id) => designSelectedIds.has(id));
                      return (
                        <div key={`${className}-${sectionName}`}>
                          <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/20 border-b border-border/60 sticky top-8 z-10">
                            <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground flex-1 truncate">
                              Section: {sectionName}
                            </span>
                            <button
                              onClick={() => void printDesignCards(items, `Section — ${sectionName}`, { groupBy: 'none' })}
                              className="text-[8px] font-bold text-emerald-600 hover:text-emerald-500 transition-colors whitespace-nowrap"
                            >
                              Print
                            </button>
                            <button
                              onClick={() => setDesignSelectedIds((prev) => {
                                const n = new Set(prev);
                                if (allSel) sectionIds.forEach((id) => n.delete(id));
                                else sectionIds.forEach((id) => n.add(id));
                                return n;
                              })}
                              className="text-[8px] font-bold text-primary hover:text-primary/80 transition-colors whitespace-nowrap"
                            >
                              {allSel ? '✗ Desel' : `✓ ${items.length}`}
                            </button>
                          </div>
                          {items.map((s) => {
                            const sel = designSelectedIds.has(s.id);
                            return (
                              <div key={s.id} onClick={() => setDesignSelectedIds((prev) => {
                                const n = new Set(prev);
                                if (n.has(s.id)) n.delete(s.id); else n.add(s.id);
                                return n;
                              })}
                                className={`flex items-center gap-2.5 px-4 py-2.5 cursor-pointer transition-all border-b border-border/40 ${sel ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-muted/40 border-l-2 border-l-transparent'}`}>
                                <div className={`w-4 h-4 border flex-shrink-0 flex items-center justify-center transition-all rounded ${sel ? 'bg-primary border-primary' : 'border-border'}`}>
                                  {sel && <span className="text-primary-foreground text-[8px]">✓</span>}
                                </div>
                                <p className="text-[10px] font-bold text-foreground truncate flex-1">{s.full_name}{s.is_hidden && <span className="ml-1 text-[8px] text-rose-500">HIDDEN</span>}</p>
                                <span title={reportDotTitle(s)} className={`w-2 h-2 rounded-full flex-shrink-0 ${reportDotClass(s)}`} />
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))
              ):designGroupMode!=='none'?(
                (designGrouped ?? []).map(([groupLabel,classStudents])=>{
                  const classIds=classStudents.map(s=>s.id);
                  const allSel=classIds.every(id=>designSelectedIds.has(id));
                  const groupPrefix = designGroupMode === 'grade' ? 'Class' : 'Section';
                  return (
                    <div key={groupLabel}>
                      <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/30 border-b border-border sticky top-0 z-10">
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex-1 truncate">{groupPrefix}: {groupLabel}</span>
                        <button onClick={()=>void printDesignCards(classStudents, `${groupPrefix} — ${groupLabel}`, { groupBy: 'none' })}
                          className="text-[8px] font-bold text-emerald-600 hover:text-emerald-500 transition-colors whitespace-nowrap">
                          Print
                        </button>
                        <button onClick={()=>setDesignSelectedIds(prev=>{
                          const n=new Set(prev);
                          if(allSel) classIds.forEach(id=>n.delete(id)); else classIds.forEach(id=>n.add(id));
                          return n;
                        })}
                          className="text-[8px] font-bold text-primary hover:text-primary/80 transition-colors whitespace-nowrap">
                          {allSel?'✗ Desel':`✓ ${classStudents.length}`}
                        </button>
                      </div>
                      {classStudents.map(s=>{
                        const sel=designSelectedIds.has(s.id);
                        return (
                          <div key={s.id} onClick={()=>setDesignSelectedIds(prev=>{
                            const n=new Set(prev);
                            if(n.has(s.id)) n.delete(s.id); else n.add(s.id);
                            return n;
                          })}
                            className={`flex items-center gap-2.5 px-4 py-2.5 cursor-pointer transition-all border-b border-border/40 ${sel?'bg-primary/5 border-l-2 border-l-primary':'hover:bg-muted/40 border-l-2 border-l-transparent'}`}>
                            <div className={`w-4 h-4 border flex-shrink-0 flex items-center justify-center transition-all rounded ${sel?'bg-primary border-primary':'border-border'}`}>
                              {sel&&<span className="text-primary-foreground text-[8px]">✓</span>}
                            </div>
                            <p className="text-[10px] font-bold text-foreground truncate flex-1">{s.full_name}{s.is_hidden && <span className="ml-1 text-[8px] text-rose-500">HIDDEN</span>}</p>
                            <span title={reportDotTitle(s)}
                              className={`w-2 h-2 rounded-full flex-shrink-0 ${reportDotClass(s)}`} />
                            {canDeleteAccounts && (
                              <button type="button" onClick={(e) => { e.stopPropagation(); permanentlyDeleteHolder({ id: s.id, name: s.full_name || 'Unknown', email: s.email || 'N/A', roleLabel: 'Student', school: s.school_name || '', badge: '', gradeLevel: s.grade || '', sectionClass: s.section_class || '', profileUrl: '', schoolId: null, isHidden: !!s.is_hidden }); }}
                                className="p-1 rounded border border-rose-600/30 text-rose-500 hover:bg-rose-600/10" title="Permanently wipe account">
                                <TrashIcon className="w-3 h-3"/>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              ):(
                <div className="divide-y divide-border/40">
                  {visibleDesignStudents.map(s=>{
                    const sel=designSelectedIds.has(s.id);
                    return (
                      <div key={s.id} onClick={()=>setDesignSelectedIds(prev=>{
                        const n=new Set(prev);
                        if(n.has(s.id)) n.delete(s.id); else n.add(s.id);
                        return n;
                      })}
                        className={`flex items-center gap-2.5 px-4 py-3 cursor-pointer transition-all ${sel?'bg-primary/5 border-l-2 border-l-primary':'hover:bg-muted/40 border-l-2 border-l-transparent'}`}>
                        <div className={`w-4 h-4 border flex-shrink-0 flex items-center justify-center transition-all rounded ${sel?'bg-primary border-primary':'border-border'}`}>
                          {sel&&<span className="text-primary-foreground text-[9px]">✓</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold text-foreground truncate">{s.full_name}{s.is_hidden && <span className="ml-1 text-[8px] text-rose-500">HIDDEN</span>}</p>
                          <p className="text-[9px] text-muted-foreground truncate">{[s.grade, s.section_class].filter(Boolean).join(' · ') || '—'}</p>
                        </div>
                        <span title={reportDotTitle(s)}
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${reportDotClass(s)}`} />
                        {canDeleteAccounts && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); permanentlyDeleteHolder({ id: s.id, name: s.full_name || 'Unknown', email: s.email || 'N/A', roleLabel: 'Student', school: s.school_name || '', badge: '', gradeLevel: s.grade || '', sectionClass: s.section_class || '', profileUrl: '', schoolId: null, isHidden: !!s.is_hidden }); }}
                            className="p-1 rounded border border-rose-600/30 text-rose-500 hover:bg-rose-600/10" title="Permanently wipe account">
                            <TrashIcon className="w-3 h-3"/>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
        {!designStudentsLoaded&&(
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <UserGroupIcon className="w-9 h-9 text-muted-foreground/30"/>
            <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[190px]">Load students to select and print access cards using the saved template.</p>
            <button onClick={()=>loadDesignStudents(false)} disabled={designStudentsLoading}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-[10px] font-black uppercase tracking-widest rounded-lg transition-all disabled:opacity-40">
              {designStudentsLoading?<><div className="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"/>Loading…</>:<><ArrowDownTrayIcon className="w-3.5 h-3.5"/>Load Students</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // ── Manage Tab Render ─────────────────────────────────────────────────────
  const renderManageTab = () => (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-background">
      {/* Manage toolbar row 1: type tabs + search + actions */}
      <div className="flex-none border-b border-border bg-card">
        <div className="flex flex-col md:flex-row md:items-center gap-3 px-4 py-3">
          <div className="flex gap-1 overflow-x-auto scrollbar-none pb-1 md:pb-0 shrink-0">
            {CARD_TYPES.map(tab=>{
              const Icon = tab==='student'?UserGroupIcon:tab==='parent'?UserPlusIcon:AcademicCapIcon;
              return (
                <button key={tab} onClick={()=>applyCardType(tab)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${cardType===tab?'bg-primary/10 border-primary/30 text-primary':'bg-transparent border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                  <Icon className="w-3.5 h-3.5"/>
                  {tab}s
                  {cardType===tab&&records.length>0&&<span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground ml-1">{records.length}</span>}
                </button>
              );
            })}
          </div>
          <div className="relative w-full md:w-56">
            <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60"/>
            <input value={manageQuery} onChange={e=>setManageQuery(e.target.value)} placeholder="Search name, class, school…"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"/>
          </div>
          <div className="flex items-center gap-2 md:ml-auto w-full md:w-auto overflow-x-auto scrollbar-none pt-1 md:pt-0">
            {manageFiltersActive && (
              <button onClick={resetManageFilters}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-border text-muted-foreground hover:text-foreground bg-background hover:bg-muted transition-colors shrink-0">
                Reset filters
              </button>
            )}
            {canDesign&&(
              <button onClick={()=>switchTab('design')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors bg-background hover:bg-muted">
                <SparklesIcon className="w-3.5 h-3.5"/> Design
              </button>
            )}
            <button onClick={()=>{loadManageConfig(cardType);loadRecords(cardType);loadDbCards(cardType);}}
              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors bg-background">
              <ArrowPathIcon className="w-4 h-4"/>
            </button>
            {canDeleteAccounts && cardType === 'student' && (
              <button onClick={()=>{ setShowHiddenAccounts(v => !v); setSelectedIds(new Set()); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${showHiddenAccounts?'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400':'border-border text-muted-foreground hover:text-foreground bg-background hover:bg-muted'}`}>
                {showHiddenAccounts ? 'Active only' : 'Show hidden'}
              </button>
            )}
          </div>
        </div>

        {showHiddenAccounts && canDeleteAccounts && records.length > 0 && (
          <div className="px-4 pb-2 flex flex-wrap items-center gap-2 border-t border-border/40 pt-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-rose-500">Hidden accounts — soft-deleted but still in database</span>
            <button disabled={bulkDeleting} onClick={()=>purgeAllHidden()}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide border border-rose-600/35 text-rose-600 dark:text-rose-400 hover:bg-rose-600/10 rounded-lg disabled:opacity-50 transition-colors bg-background">
              <TrashIcon className="w-3 h-3"/> Wipe all hidden ({records.length})
            </button>
          </div>
        )}

        <div className="px-4 pb-3 border-t border-border/40 pt-3 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value as StatusFilter)} aria-label="Card status"
              className={`${manageSelectClass} ${statusFilter !== 'all' ? 'border-primary/40 bg-primary/5' : ''}`}>
              <option value="all">All statuses ({counts.total})</option>
              <option value="active">Issued ({counts.issued})</option>
              <option value="unissued">Unissued ({counts.unissued})</option>
              <option value="revoked">Revoked ({counts.revoked})</option>
              <option value="expired">Expired ({counts.expired})</option>
            </select>
            {cardType === 'student' && (
              <select value={reportFilter} onChange={e=>setReportFilter(e.target.value as ReportFilter)} aria-label="Progress report"
                className={`${manageSelectClass} ${reportFilter !== 'all' ? 'border-primary/40 bg-primary/5' : ''}`}>
                <option value="all">All students ({reportCounts.total})</option>
                <option value="published">Published report ({reportCounts.published})</option>
                <option value="draft">Draft only ({reportCounts.draft})</option>
                <option value="no_report">No report ({reportCounts.noReport})</option>
              </select>
            )}
            {manageHierarchySchools.length > 1 && !schoolLock && (
              <select
                value={selectedSchool}
                onChange={(e) => {
                  setSelectedSchool(e.target.value);
                  setSelectedGrade('all');
                  setSelectedClass('all');
                  setSelectedRosterGrades(new Set());
                }}
                aria-label="School"
                className={`${manageSelectClass} max-w-[220px] ${selectedSchool !== 'all' ? 'border-primary/40 bg-primary/5' : ''}`}
              >
                <option value="all">All schools ({manageHierarchyPool.length})</option>
                {manageHierarchySchools.map((s) => (
                  <option key={s} value={s}>
                    {s} ({countHierarchy(manageHierarchyPool, manageHierarchyPick, manageHierarchyFilter, 'school', s)})
                  </option>
                ))}
              </select>
            )}
            {manageHierarchyGrades.length > 0 && cardType === 'student' && (
              <select
                value={selectedGrade}
                disabled={manageGradesNeedSchool}
                onChange={(e) => {
                  setSelectedGrade(e.target.value);
                  setSelectedClass('all');
                  setSelectedRosterGrades(new Set());
                }}
                aria-label="Class (grade)"
                className={`${manageSelectClass} max-w-[200px] ${selectedGrade !== 'all' ? 'border-primary/40 bg-primary/5' : ''}`}
              >
                <option value="all">
                  {manageGradesNeedSchool ? 'Pick school first' : `All classes (${manageHierarchyPool.length})`}
                </option>
                {manageHierarchyGrades.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade} ({countHierarchy(manageHierarchyPool, manageHierarchyPick, manageHierarchyFilter, 'grade', grade)})
                  </option>
                ))}
              </select>
            )}
            {manageHierarchySections.length > 0 && (
              <select
                value={selectedClass}
                disabled={manageSectionsNeedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                aria-label="Section"
                className={`${manageSelectClass} max-w-[200px] ${selectedClass !== 'all' ? 'border-primary/40 bg-primary/5' : ''}`}
              >
                <option value="all">
                  {manageSectionsNeedClass ? 'Pick class first' : `All sections (${manageHierarchyPool.length})`}
                </option>
                {manageHierarchySections.map((cls) => (
                  <option key={cls} value={cls}>
                    {sectionFilterLabel(cls)} ({countHierarchy(manageHierarchyPool, manageHierarchyPick, manageHierarchyFilter, 'section', cls)})
                  </option>
                ))}
              </select>
            )}
            {cardType !== 'parent' && (manageHierarchyGrades.length > 0 || manageHierarchySections.length > 0) && (
              <select value={groupMode} onChange={e=>setGroupMode(e.target.value as GroupMode)} aria-label="Layout"
                className={`${manageSelectClass} ${groupMode !== 'hierarchy' ? 'border-primary/40 bg-primary/5' : ''}`}>
                <option value="hierarchy">School → class → section</option>
                <option value="none">Flat list</option>
                {manageHierarchyGrades.length > 0 && <option value="grade">Group by class</option>}
                {manageHierarchySections.length > 0 && <option value="section">Group by section</option>}
              </select>
            )}
            <span className="text-[10px] text-muted-foreground ml-auto hidden sm:inline">
              <span className="font-semibold text-foreground">{filtered.length}</span>
              {filtered.length !== counts.total ? ` of ${counts.total}` : ''} shown
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* List (default) / Grid view toggle */}
            <div className="flex items-center rounded-lg border border-border overflow-hidden bg-background">
              <button onClick={()=>setManageView('list')} title="List view" className={`px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide transition-colors ${manageView==='list'?'bg-primary text-primary-foreground':'text-muted-foreground hover:text-foreground'}`}>List</button>
              <button onClick={()=>setManageView('grid')} title="Grid view" className={`px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide transition-colors ${manageView==='grid'?'bg-primary text-primary-foreground':'text-muted-foreground hover:text-foreground'}`}>Grid</button>
              {cardType === 'student' && (
                <button onClick={()=>{ setManageView('roster'); if (reportFilter === 'all') setReportFilter('published'); }} title="RC roster — tap a class to print"
                  className={`px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide transition-colors ${manageView==='roster'?'bg-primary text-primary-foreground':'text-muted-foreground hover:text-foreground'}`}>Roster</button>
              )}
            </div>
            {filtered.length>0&&selectedIds.size===0&&(
              <button onClick={()=>setSelectedIds(new Set(filtered.map(r=>r.id)))}
                className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wide border border-border text-muted-foreground hover:text-foreground rounded-lg transition-colors bg-background hover:bg-muted">
                Select all ({filtered.length})
              </button>
            )}
            {selectedIds.size>0&&(<>
              <button onClick={()=>setSelectedIds(new Set())} className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wide border border-border text-muted-foreground hover:text-foreground rounded-lg transition-colors bg-background hover:bg-muted">Clear ({selectedIds.size})</button>
              {canDeleteAccounts && (
                <button disabled={bulkDeleting} onClick={()=>bulkPermanentlyDelete()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide border border-rose-600/35 text-rose-600 dark:text-rose-400 hover:bg-rose-600/10 rounded-lg disabled:opacity-50 transition-colors bg-background">
                  {bulkDeleting ? <span className="w-2.5 h-2.5 border border-rose-600 border-t-transparent rounded-full animate-spin"/> : <TrashIcon className="w-3 h-3"/>}
                  Wipe ({selectedIds.size})
                </button>
              )}
              {manageView !== 'roster' && (
              <button onClick={()=>printManageCards(filtered.filter(r=>selectedIds.has(r.id)),`Selected ${cardType} cards`)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors shadow">
                <PrinterIcon className="w-3 h-3"/> Print cards ({selectedIds.size})
              </button>
              )}
              {cardType === 'student' && (
                <button onClick={()=>void printManageRosterPdf(filtered.filter(r=>selectedIds.has(r.id)), `Selected students — RC roster`)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide rounded-lg transition-colors shadow ${
                    manageView === 'roster'
                      ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                      : 'border border-primary/30 text-primary hover:bg-primary/5 bg-background'
                  }`}>
                  <PrinterIcon className="w-3 h-3"/> {manageView === 'roster' ? `Print roster (${selectedIds.size})` : `Roster PDF (${selectedIds.size})`}
                </button>
              )}
            </>)}
            {filtered.some(r=>!dbCardsMap.has(r.id))&&(<>
              <select value={issueValidityMonths} onChange={e=>setIssueValidityMonths(Number(e.target.value))}
                title="How long newly issued cards stay valid"
                className="text-[10px] font-black uppercase tracking-wide bg-background border border-border rounded-lg px-2 py-1.5 text-muted-foreground focus:outline-none focus:border-primary cursor-pointer">
                <option value={0}>No expiry</option>
                <option value={6}>Valid 6 months</option>
                <option value={12}>Valid 1 year</option>
                <option value={24}>Valid 2 years</option>
                <option value={36}>Valid 3 years</option>
              </select>
              <button disabled={bulkIssuing} onClick={()=>bulkIssueList(filtered)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide border border-primary/30 text-primary hover:bg-primary/5 rounded-lg disabled:opacity-50 transition-colors bg-background">
                {bulkIssuing?<><span className="w-2.5 h-2.5 border border-primary border-t-transparent rounded-full animate-spin"/>{bulkProgress?`${bulkProgress.done}/${bulkProgress.total}`:'…'}</>:`Issue Missing (${filtered.filter(r=>!dbCardsMap.has(r.id)).length})`}
              </button>
            </>)}
            {manageView !== 'roster' && (
            <button onClick={()=>printManageCards(filtered,`${cardType} access cards`, { groupBy: groupMode === 'section' ? 'section' : 'grade' })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide border border-border text-muted-foreground hover:text-emerald-600 hover:border-emerald-500/30 rounded-lg transition-colors bg-background hover:bg-muted">
              <PrinterIcon className="w-3 h-3"/> Print All Cards
            </button>
            )}
            {cardType === 'student' && filteredRosterRows.length > 0 && (
              <>
                <button onClick={()=>void printManageRosterPdf(filtered, `${cardType} RC roster`, { splitByClass: true })}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide bg-emerald-600 text-white hover:bg-emerald-500 rounded-lg transition-colors shadow">
                  <PrinterIcon className="w-3 h-3"/> Print All Classes
                </button>
                <button onClick={()=>void saveManageRosterPdf(filtered, `${cardType}-rc-roster`, { splitByClass: true })}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide border border-border text-muted-foreground hover:text-foreground rounded-lg transition-colors bg-background hover:bg-muted">
                  <ArrowDownTrayIcon className="w-3 h-3"/> Download All Classes
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Manage content area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {manageError&&<div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 rounded-xl text-sm font-bold">{manageError}</div>}
        {manageLoading?(
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({length:8}).map((_,i)=><div key={i} className="h-52 bg-card border border-border rounded-xl animate-pulse"/>)}
          </div>
        ):filtered.length===0?(
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-center border border-dashed border-border rounded-xl bg-card/50">
            <CreditCardIcon className="w-8 h-8 text-muted-foreground/40"/>
            <div>
              <p className="text-sm font-semibold text-muted-foreground">No card holders found</p>
              <p className="text-xs text-muted-foreground/60 mt-1">{manageQuery?`No results for "${manageQuery}"`:`No ${cardType}s in your scope`}</p>
            </div>
            {manageQuery&&<button onClick={()=>setManageQuery('')} className="text-xs font-black uppercase tracking-wide text-primary hover:underline">Clear search</button>}
          </div>
        ):manageView !== 'roster' && groupMode==='hierarchy'?(
          <div className="space-y-8">
            {groupedByHierarchy.map(({ className, sections }) => (
              <section key={className} className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-b border-border/60 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-1 bg-primary rounded"/>
                    <h2 className="text-sm font-black uppercase tracking-widest text-foreground">Class: {className}</h2>
                    <span className="text-[10px] text-muted-foreground font-semibold">
                      ({sections.reduce((n, s) => n + s.items.length, 0)} {cardType}{sections.reduce((n, s) => n + s.items.length, 0) !== 1 ? 's' : ''})
                    </span>
                  </div>
                  <div className="sm:ml-auto flex gap-2">
                    <button
                      onClick={() => void printManageCards(
                        sections.flatMap((sec) => sec.items),
                        `Access Cards — ${className}`,
                        { groupBy: 'section' },
                      )}
                      className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide border border-border text-muted-foreground hover:text-foreground rounded-lg transition-colors bg-background hover:bg-muted"
                    >
                      <PrinterIcon className="w-3 h-3"/> Print Class
                    </button>
                    {cardType === 'student' && (
                      <button
                        onClick={() => void printManageRosterPdf(
                          sections.flatMap((sec) => sec.items),
                          `RC roster — ${className}`,
                          { splitByClass: false, groupMode: 'section' },
                        )}
                        className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide border border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 rounded-lg transition-colors bg-background"
                      >
                        <PrinterIcon className="w-3 h-3"/> Roster PDF
                      </button>
                    )}
                  </div>
                </div>
                {sections.map(({ sectionName, items: sectionItems }) => (
                  <div key={`${className}-${sectionName}`} className="space-y-3 pl-3 border-l border-border/50">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Section: {sectionName}</h3>
                        <span className="text-[10px] text-muted-foreground font-semibold">({sectionItems.length})</span>
                      </div>
                      <div className="sm:ml-auto flex gap-2">
                        <button
                          onClick={() => void printManageCards(sectionItems, `Access Cards — ${sectionName}`, { groupBy: 'none' })}
                          className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide border border-border text-muted-foreground hover:text-foreground rounded-lg transition-colors bg-background hover:bg-muted"
                        >
                          <PrinterIcon className="w-3 h-3"/> Print Section
                        </button>
                        {cardType === 'student' && (
                          <button
                            onClick={() => void printManageRosterPdf(sectionItems, `RC roster — ${sectionName}`, { splitByClass: false })}
                            className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide border border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 rounded-lg transition-colors bg-background"
                          >
                            <PrinterIcon className="w-3 h-3"/> Roster
                          </button>
                        )}
                      </div>
                    </div>
                    {manageView === 'grid' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {sectionItems.map((r) => (
                          <ManageCardPreview key={r.id} r={r} config={manageConfig} dbCardsMap={dbCardsMap} selectedIds={selectedIds} toggleSelected={toggleSelected} issueCard={issueCard} updateCardStatus={updateCardStatus} reissueCard={reissueCard} isIssuingIds={isIssuingIds} isRevokingIds={isRevokingIds} printSingle={(r) => printManageCards([r], `${r.name} — Access Card`)} canDelete={canDeleteAccounts} permanentlyDeleteHolder={permanentlyDeleteHolder} isDeletingIds={isDeletingIds}/>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/60 bg-card">
                        {sectionItems.map((r) => (
                          <ManageCardRow key={r.id} r={r} dbCardsMap={dbCardsMap} selectedIds={selectedIds} toggleSelected={toggleSelected} issueCard={issueCard} updateCardStatus={updateCardStatus} reissueCard={reissueCard} isIssuingIds={isIssuingIds} isRevokingIds={isRevokingIds} printSingle={(r) => printManageCards([r], `${r.name} — Access Card`)} canDelete={canDeleteAccounts} permanentlyDeleteHolder={permanentlyDeleteHolder} isDeletingIds={isDeletingIds}/>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </section>
            ))}
          </div>
        ):manageView !== 'roster' && groupMode!=='none'?(
          <div className="space-y-8">
            {(grouped ?? []).map(([groupLabel,list])=>(
              <section key={groupLabel} className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-b border-border/60 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-1 bg-primary rounded"/>
                    <h2 className="text-sm font-black uppercase tracking-widest text-foreground">
                      {groupMode === 'grade' ? `Class: ${groupLabel}` : groupLabel}
                    </h2>
                    <span className="text-[10px] text-muted-foreground font-semibold">({list.length} {cardType}{list.length!==1?'s':''})</span>
                  </div>
                  <div className="sm:ml-auto flex gap-2">
                    {list.some(r=>!dbCardsMap.has(r.id))&&(
                      <button disabled={bulkIssuing} onClick={()=>bulkIssueList(list)}
                        className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wide border border-primary/30 text-primary hover:bg-primary/5 rounded-lg disabled:opacity-50 transition-colors bg-background">
                        Issue Missing ({list.filter(r=>!dbCardsMap.has(r.id)).length})
                      </button>
                    )}
                    <button onClick={()=>printManageCards(list,`Access Cards — ${groupLabel}`, { groupBy: 'none' })}
                      className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide border border-border text-muted-foreground hover:text-foreground rounded-lg transition-colors bg-background hover:bg-muted">
                      <PrinterIcon className="w-3 h-3"/> Print {groupMode === 'grade' ? 'Class' : 'Section'}
                    </button>
                    {cardType === 'student' && (
                      <button onClick={()=>void printManageRosterPdf(list, `RC roster — ${groupLabel}`, { splitByClass: false })}
                        className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide border border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 rounded-lg transition-colors bg-background">
                        <PrinterIcon className="w-3 h-3"/> Roster PDF
                      </button>
                    )}
                  </div>
                </div>
                {manageView === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {list.map(r=><ManageCardPreview key={r.id} r={r} config={manageConfig} dbCardsMap={dbCardsMap} selectedIds={selectedIds} toggleSelected={toggleSelected} issueCard={issueCard} updateCardStatus={updateCardStatus} reissueCard={reissueCard} isIssuingIds={isIssuingIds} isRevokingIds={isRevokingIds} printSingle={r=>printManageCards([r],`${r.name} — Access Card`)} canDelete={canDeleteAccounts} permanentlyDeleteHolder={permanentlyDeleteHolder} isDeletingIds={isDeletingIds}/>)}
                  </div>
                ):(
                  <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/60 bg-card">
                    {list.map(r=><ManageCardRow key={r.id} r={r} dbCardsMap={dbCardsMap} selectedIds={selectedIds} toggleSelected={toggleSelected} issueCard={issueCard} updateCardStatus={updateCardStatus} reissueCard={reissueCard} isIssuingIds={isIssuingIds} isRevokingIds={isRevokingIds} printSingle={r=>printManageCards([r],`${r.name} — Access Card`)} canDelete={canDeleteAccounts} permanentlyDeleteHolder={permanentlyDeleteHolder} isDeletingIds={isDeletingIds}/>)}
                  </div>
                )}
              </section>
            ))}
          </div>
        ):manageView==='roster' && cardType === 'student'?(
          <div className="space-y-3">
            <div className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 space-y-2">
              {rosterSchoolRequired ? (
                <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                  Pick a school in the filter bar above, then tick the class(es) you want to print.
                </p>
              ) : rosterQuickGrades.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">No classes found for this school selection.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wide text-foreground shrink-0">Pick class</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">· {rosterScopeLabel}</span>
                    <span className="hidden sm:inline text-[10px] text-muted-foreground">·</span>
                    <button type="button" onClick={selectAllRosterGrades}
                      className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wide border border-border text-muted-foreground hover:text-foreground rounded-md bg-background hover:bg-muted">
                      All with results
                    </button>
                    <button type="button" onClick={clearRosterGrades} disabled={selectedRosterGrades.size === 0}
                      className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wide border border-border text-muted-foreground hover:text-foreground rounded-md bg-background hover:bg-muted disabled:opacity-40">
                      Clear
                    </button>
                    {selectedRosterGrades.size > 0 && (
                      <span className="text-[10px] text-muted-foreground sm:ml-auto">
                        <span className="font-semibold text-foreground">{selectedRosterGrades.size}</span> class{selectedRosterGrades.size === 1 ? '' : 'es'} ·{' '}
                        <span className="font-semibold text-foreground">{selectedRosterStudentCount}</span> students
                      </span>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
                      <button type="button" disabled={selectedRosterGrades.size === 0 || rosterSchoolRequired}
                        onClick={() => void printSelectedRosterGrades()}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide bg-emerald-600 text-white hover:bg-emerald-500 rounded-md disabled:opacity-40">
                        <PrinterIcon className="w-3 h-3"/> Print{selectedRosterGrades.size > 0 ? ` (${selectedRosterGrades.size})` : ''}
                      </button>
                      <button type="button" disabled={selectedRosterGrades.size === 0 || rosterSchoolRequired}
                        onClick={() => void saveSelectedRosterGrades()}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide border border-border text-muted-foreground hover:text-foreground rounded-md bg-background hover:bg-muted disabled:opacity-40">
                        <ArrowDownTrayIcon className="w-3 h-3"/> Save
                      </button>
                      <button onClick={()=>void printManageRosterPdf(filtered, `${cardType} RC roster`, { splitByClass: true })}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide border border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 rounded-md bg-background">
                        <PrinterIcon className="w-3 h-3"/> Print all
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {rosterQuickGrades.map(({ grade, withReport }) => {
                      const checked = selectedRosterGrades.has(grade);
                      const disabled = withReport === 0 || rosterSchoolRequired;
                      return (
                        <label
                          key={grade}
                          title={withReport > 0 ? `${withReport} with published results` : 'No published results'}
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 cursor-pointer transition-colors whitespace-nowrap ${
                            disabled
                              ? 'border-border/60 bg-muted/30 opacity-50 cursor-not-allowed'
                              : checked
                                ? 'border-emerald-500/50 bg-emerald-500/10'
                                : 'border-border/60 bg-background hover:border-emerald-500/35 hover:bg-emerald-500/5'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleRosterGrade(grade)}
                            className="h-3.5 w-3.5 rounded border-border text-emerald-600 focus:ring-emerald-500/30 shrink-0"
                          />
                          <span className="text-[10px] font-black uppercase tracking-wide text-foreground">{grade}</span>
                          <span className="text-[10px] text-muted-foreground">({withReport})</span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <details className="rounded-lg border border-border/60 overflow-hidden text-[10px] text-muted-foreground">
              <summary className="cursor-pointer font-black uppercase tracking-wide text-foreground text-[9px] select-none px-3 py-2 bg-muted/30 border-b border-border/50">
                Distribution guide · {filteredRosterRows.length} students · {rosterClassGroups.length} classes
              </summary>
              <div className="grid grid-cols-2">
                <div className="border-r border-border/60 bg-indigo-50/40 dark:bg-indigo-950/20">
                  <p className="text-[9px] font-black uppercase tracking-widest text-indigo-900 dark:text-indigo-200 px-3 py-1.5 border-b border-border/50 bg-indigo-100/80 dark:bg-indigo-900/30">{ROSTER_EDUCATOR_HEADING}</p>
                  <div className="px-3 py-2">
                    <p className="italic mb-1">{ROSTER_EDUCATOR_NOTE}</p>
                    <ol className="list-decimal list-inside space-y-0.5">
                      {ROSTER_EDUCATOR_STEPS.map((step) => <li key={step}>{step}</li>)}
                    </ol>
                  </div>
                </div>
                <div className="bg-emerald-50/30 dark:bg-emerald-950/15">
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-900 dark:text-emerald-200 px-3 py-1.5 border-b border-border/50 bg-emerald-100/80 dark:bg-emerald-900/30">{ROSTER_PARENT_HEADING}</p>
                  <div className="px-3 py-2">
                    <ol className="list-decimal list-inside space-y-0.5">
                      {ROSTER_PARENT_STEPS.map((step) => <li key={step}>{step}</li>)}
                    </ol>
                  </div>
                </div>
              </div>
            </details>

            {rosterPreviewGroups.length === 0 ? (
              <ManageRosterTable rows={[]} />
            ) : rosterPreviewGroups.map((group) => {
              const classChecked = selectedRosterGrades.has(group.className);
              const classDisabled = group.rows.length === 0 || rosterSchoolRequired;
              return (
              <section key={group.className} className="space-y-1.5">
                <div className="flex items-center gap-2 min-w-0 flex-nowrap">
                  <label
                    title={`Select ${group.className} for batch print`}
                    className={`inline-flex items-center shrink-0 ${classDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <input
                      type="checkbox"
                      checked={classChecked}
                      disabled={classDisabled}
                      onChange={() => toggleRosterGrade(group.className)}
                      className="h-3.5 w-3.5 rounded border-border text-emerald-600 focus:ring-emerald-500/30"
                    />
                  </label>
                  <div className="h-3.5 w-0.5 bg-emerald-500 shrink-0"/>
                  <h2 className="text-[11px] font-black uppercase tracking-wide text-foreground shrink-0">{group.className}</h2>
                  <span className="text-[10px] text-muted-foreground shrink-0">· {group.rows.length} students</span>
                  <div className="ml-auto flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => {
                        const classRecords = filtered.filter((r) => r.gradeLevel === group.className || (!r.gradeLevel && group.className === '— No Class —'));
                        void printManageRosterPdf(classRecords, `RC roster — ${group.className}`, { splitByClass: false });
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide border border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 rounded-md bg-background"
                    >
                      <PrinterIcon className="w-3 h-3"/> Print
                    </button>
                    <button
                      onClick={() => {
                        const classRecords = filtered.filter((r) => r.gradeLevel === group.className || (!r.gradeLevel && group.className === '— No Class —'));
                        void saveManageRosterPdf(classRecords, `rc-roster-${group.className}`, { splitByClass: false });
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide border border-border text-muted-foreground hover:text-foreground rounded-md bg-background hover:bg-muted"
                    >
                      <ArrowDownTrayIcon className="w-3 h-3"/> Save
                    </button>
                  </div>
                </div>
                <ManageRosterTable
                  rows={group.rows}
                  className={group.className}
                  hideClassColumn
                  compact
                />
              </section>
            );})}

            <p className="text-[10px] italic text-muted-foreground px-1">{ROSTER_LEGACY_NOTE}</p>
          </div>
        ):manageView==='grid'?(
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(r=><ManageCardPreview key={r.id} r={r} config={manageConfig} dbCardsMap={dbCardsMap} selectedIds={selectedIds} toggleSelected={toggleSelected} issueCard={issueCard} updateCardStatus={updateCardStatus} reissueCard={reissueCard} isIssuingIds={isIssuingIds} isRevokingIds={isRevokingIds} printSingle={r=>printManageCards([r],`${r.name} — Access Card`)} canDelete={canDeleteAccounts} permanentlyDeleteHolder={permanentlyDeleteHolder} isDeletingIds={isDeletingIds}/>)}
          </div>
        ):(
          <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/60 bg-card">
            {filtered.map(r=><ManageCardRow key={r.id} r={r} dbCardsMap={dbCardsMap} selectedIds={selectedIds} toggleSelected={toggleSelected} issueCard={issueCard} updateCardStatus={updateCardStatus} reissueCard={reissueCard} isIssuingIds={isIssuingIds} isRevokingIds={isRevokingIds} printSingle={r=>printManageCards([r],`${r.name} — Access Card`)} canDelete={canDeleteAccounts} permanentlyDeleteHolder={permanentlyDeleteHolder} isDeletingIds={isDeletingIds}/>)}
          </div>
        )}
      </div>
    </div>
  );

  // ── Main shell ────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 min-h-[48px] border-b border-border flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:px-4 sm:py-0 bg-card">
        <div className="flex flex-wrap items-center gap-3 w-full">
          <div className="flex items-center gap-2">
            <CreditCardIcon className="w-4 h-4 text-primary flex-shrink-0"/>
            <span className="text-[11px] font-black uppercase tracking-widest text-foreground hidden xs:block">Card Studio</span>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-px bg-muted border border-border p-0.5 rounded-lg">
            {([{id:'design' as TabId,label:'Design'},{id:'manage' as TabId,label:'Manage'}]).map(t=>(
              <button key={t.id} onClick={()=>switchTab(t.id)}
                className={`px-3.5 py-1 text-[10px] font-black uppercase tracking-wide rounded-md transition-all ${activeTab===t.id?'bg-primary text-primary-foreground shadow-sm':'text-muted-foreground hover:text-foreground'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Card type selector */}
          <div className="flex gap-px bg-muted border border-border p-0.5 rounded-lg">
            {CARD_TYPES.map(t=>(
              <button key={t} onClick={()=>applyCardType(t)}
                className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wide rounded-md transition-all ${cardType===t?'bg-background text-foreground shadow-sm':'text-muted-foreground hover:text-foreground'}`}>
                {t}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {activeTab==='design'&&canDesign&&(<>
              <button onClick={handleReset} className="px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground border border-border hover:bg-muted bg-background transition-all rounded-md">Reset</button>
              <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-[9px] font-black uppercase tracking-widest transition-all rounded-md shadow-sm">
                {saved?<CheckCircleIcon className="w-3.5 h-3.5"/>:<ArrowDownTrayIcon className="w-3.5 h-3.5"/>}
                {saved?'Saved!':'Save Design'}
              </button>
            </>)}
            {activeTab==='manage'&&(
              <button onClick={()=>switchTab('design')} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors bg-background">
                <SparklesIcon className="w-3.5 h-3.5"/> Design Mode
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
        {activeTab==='design'?renderDesignTab():renderManageTab()}
      </div>
    </div>
  );
}
