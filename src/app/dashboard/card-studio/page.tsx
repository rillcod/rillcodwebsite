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
  UserPlusIcon, AcademicCapIcon, FunnelIcon, SparklesIcon,
} from '@/lib/icons';
import { accessCardCodeForStudent } from '@/lib/access-card-code';
import { buildBulkPrintHtml, openPrintWindow, type CardHolder as PrintCardHolder, type CardConfig as PrintCardConfig } from '@/lib/cards/printCard';
import { qrDataUrl } from '@/lib/cards/qr';
import { LocalQr } from '@/components/cards/LocalQr';

// ─── Shared Types ────────────────────────────────────────────────────────────

type TabId = 'design' | 'manage';
type CardType = 'student' | 'parent' | 'teacher';
type StatusFilter = 'all' | 'active' | 'unissued' | 'revoked' | 'expired';
type GroupMode = 'none' | 'class';
type FieldKey = 'school' | 'className' | 'email' | 'password' | 'programme' | 'studentId' | 'qr' | 'expiry';

interface FieldConfig { key: FieldKey; label: string; visible: boolean; }
interface TypoStyle { fontSize: string; fontWeight: string; color: string; fontFamily: string; }

interface CardConfig {
  accentColor: string; headerStyle: 'band' | 'border' | 'minimal';
  orgName: string; orgWebsite: string; cardLabel: string;
  footerLeft: string; footerRight: string;
  cornerRadius: 'sharp' | 'rounded' | 'pill';
  bgColor: string; showLogo: boolean; showPhotoSlot: boolean;
  cardOrientation: 'portrait' | 'landscape';
  width: string; height: string; qrScale?: number; fields: FieldConfig[];
  typo: {
    orgName: TypoStyle; orgWebsite: TypoStyle; studentName: TypoStyle;
    school: TypoStyle; fieldLabel: TypoStyle; fieldValue: TypoStyle;
    accentValue: TypoStyle; footer: TypoStyle;
  };
}

type PortalUser = { id: string; full_name: string; email: string | null; role: string; school_name?: string | null; section_class?: string | null; };
type DbCard = { id: string; card_number: string; verification_code: string; status: string; issued_at: string | null; expires_at: string | null; holder_id: string; holder_type: string; };
type CardRecord = { id: string; name: string; email: string; roleLabel: string; school: string; badge: string; sectionClass: string; profileUrl: string; schoolId: string | null; };

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_FIELDS: FieldConfig[] = [
  { key: 'school',    label: 'School',            visible: true  },
  { key: 'className', label: 'Class',              visible: true  },
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
};

const DEFAULT_CONFIG: CardConfig = {
  accentColor: '#1A3A8F', headerStyle: 'band',
  orgName: 'RILLCOD TECHNOLOGIES', orgWebsite: 'www.rillcod.com',
  cardLabel: 'Student Access Card', footerLeft: 'rillcod.com/login', footerRight: 'Student ID',
  cornerRadius: 'sharp', bgColor: '#ffffff', showLogo: true, showPhotoSlot: false,
  cardOrientation: 'portrait', width: '54mm', height: '85.6mm',
  fields: DEFAULT_FIELDS, typo: DEFAULT_TYPO,
};

const FALLBACK_MANAGE: Required<Pick<CardConfig,'accentColor'|'orgName'|'orgWebsite'|'footerLeft'|'footerRight'|'cardLabel'|'headerStyle'|'width'|'height'|'bgColor'|'fields'>> = {
  accentColor: '#1A3A8F', orgName: 'RILLCOD TECHNOLOGIES', orgWebsite: 'www.rillcod.com',
  footerLeft: 'rillcod.com/login', footerRight: 'Student ID', cardLabel: 'Access Card',
  headerStyle: 'band', width: '54mm', height: '85.6mm', bgColor: '#ffffff', fields: [],
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
  name: 'ADAEZE OKONKWO', school: 'KEY TO SUCCESS EDUCATION CENTRE',
  email: 'adaeze.okonkwo@rillcod.com', password: 'Abc@12345',
  programme: 'Advanced STEM Track', className: 'JSS3', id: 'RC-A1B2C3D4',
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
  const infoFields = cfg.fields.filter(f => f.visible && f.key !== 'qr' && f.key !== 'className');
  const expDate = new Date(Date.now() + 365*24*60*60*1000).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  const sampleVal = (key: FieldKey): string => ({school:SAMPLE.school,className:SAMPLE.className,email:SAMPLE.email,password:SAMPLE.password,programme:SAMPLE.programme,studentId:SAMPLE.id,qr:'',expiry:expDate}[key]??'');
  const t = cfg.typo;
  const ff = (fam: string) => fam === 'mono' ? 'monospace' : "'Inter','Segoe UI',system-ui,sans-serif";
  const ts = (s: TypoStyle, extra?: React.CSSProperties): React.CSSProperties => ({
    fontSize:s.fontSize, fontWeight:parseInt(s.fontWeight), color:s.color, fontFamily:ff(s.fontFamily), ...extra,
  });
  const isAccentField = (k: FieldKey) => ['password','studentId','programme','expiry'].includes(k);

  const Header = () => {
    if (cfg.headerStyle === 'band') return (
      <div style={{background:acc,padding:'8px 12px',display:'flex',alignItems:'center',gap:7}}>
        <div style={{width:18,height:18,background:'rgba(255,255,255,0.3)',borderRadius:2,flexShrink:0}}/>
        <div>
          <div style={ts(t.orgName,{textTransform:'uppercase',lineHeight:1})}>{cfg.orgName}</div>
          <div style={ts(t.orgWebsite,{marginTop:2})}>{cfg.orgWebsite}</div>
        </div>
        {vis('className') && <div style={{marginLeft:'auto',background:'rgba(0,0,0,0.22)',color:'#fff',padding:'2px 7px',fontSize:8,fontWeight:900,textTransform:'uppercase',flexShrink:0}}>{SAMPLE.className}</div>}
      </div>
    );
    if (cfg.headerStyle === 'border') return (
      <div style={{display:'flex',alignItems:'center',gap:7,padding:'7px 10px',borderBottom:'1px solid #f3f4f6'}}>
        <div style={{width:16,height:16,background:'#e5e7eb',borderRadius:2,flexShrink:0}}/>
        <div>
          <div style={ts(t.orgName,{textTransform:'uppercase',lineHeight:1,color:'#111'})}>{cfg.orgName}</div>
          <div style={ts(t.orgWebsite,{marginTop:1,color:acc})}>{cfg.orgWebsite}</div>
        </div>
        {vis('className') && <div style={{marginLeft:'auto',background:acc,color:'#fff',padding:'2px 7px',fontSize:7,fontWeight:900,textTransform:'uppercase',flexShrink:0}}>{SAMPLE.className}</div>}
      </div>
    );
    return (
      <div style={{display:'flex',alignItems:'center',gap:7,padding:'7px 10px',borderBottom:`2px solid ${acc}`}}>
        <div style={{width:14,height:14,background:'#e5e7eb',borderRadius:2,flexShrink:0}}/>
        <div style={ts(t.orgName,{textTransform:'uppercase',color:'#111'})}>{cfg.orgName}</div>
        {vis('className') && <div style={{marginLeft:'auto',fontSize:7,fontWeight:900,color:acc,textTransform:'uppercase',flexShrink:0}}>{SAMPLE.className}</div>}
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

// ─── Manage Tab – Mini Card Preview ──────────────────────────────────────────

function ManageCardPreview({ r, config, dbCardsMap, selectedIds, toggleSelected, issueCard, updateCardStatus, reissueCard, isIssuingIds, isRevokingIds, printSingle }: {
  r: CardRecord; config: any; dbCardsMap: Map<string,DbCard>; selectedIds: Set<string>;
  toggleSelected: (id:string)=>void; issueCard: (r:CardRecord)=>void;
  updateCardStatus: (r:CardRecord,c:DbCard,s:'active'|'revoked')=>void;
  reissueCard: (r:CardRecord,c:DbCard)=>void;
  isIssuingIds: Set<string>; isRevokingIds: Set<string>; printSingle: (r:CardRecord)=>void;
}) {
  const dbCard = dbCardsMap.get(r.id);
  const status = dbCard ? dbCard.status : 'unissued';
  const sm = STATUS_META[status] || STATUS_META.unissued;
  const isSelected = selectedIds.has(r.id);
  const isIssuing  = isIssuingIds.has(r.id);
  const isRevoking = isRevokingIds.has(r.id);
  const acc   = config.accentColor || '#1A3A8F';
  const hStyle = config.headerStyle || 'band';
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
            <div style={{background:'rgba(0,0,0,0.22)',color:'#fff',padding:'2px 6px',fontSize:6,fontWeight:900,textTransform:'uppercase',flexShrink:0}}>{config.cardLabel}</div>
          </div>
        )}
        {hStyle==='border'&&(
          <div style={{borderLeft:`3px solid ${acc}`,padding:'6px 10px',display:'flex',alignItems:'center',gap:6,borderBottom:'1px solid #f3f4f6'}}>
            <div style={{flex:1}}>
              <div style={{fontSize:8,fontWeight:900,color:'#111',textTransform:'uppercase'}}>{config.orgName}</div>
              <div style={{fontSize:6,color:acc,fontWeight:700,marginTop:1}}>{config.orgWebsite}</div>
            </div>
            <div style={{background:acc,color:'#fff',padding:'2px 6px',fontSize:6,fontWeight:900,textTransform:'uppercase',flexShrink:0}}>{config.cardLabel}</div>
          </div>
        )}
        {hStyle==='minimal'&&(
          <div style={{borderBottom:`2px solid ${acc}`,padding:'6px 10px',display:'flex',alignItems:'center',gap:6}}>
            <div style={{flex:1,fontSize:8,fontWeight:900,color:'#111',textTransform:'uppercase',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{config.orgName}</div>
            <div style={{fontSize:7,fontWeight:900,color:acc,textTransform:'uppercase',flexShrink:0}}>{config.cardLabel}</div>
          </div>
        )}
        <div style={{display:'flex',minHeight:80}}>
          <div style={{flex:1,padding:'8px 10px',display:'flex',flexDirection:'column',gap:3,borderRight:'1px solid #f3f4f6',overflow:'hidden'}}>
            <div style={{fontSize:12,fontWeight:900,color:'#111',textTransform:'uppercase',lineHeight:1.2,wordBreak:'break-word'}}>{r.name}</div>
            <div style={{fontSize:7,fontWeight:700,color:acc,textTransform:'uppercase',letterSpacing:0.5}}>{r.roleLabel}</div>
            <div style={{height:1,background:'#f3f4f6',margin:'2px 0'}}/>
            <div><div style={{fontSize:6,color:'#9ca3af',textTransform:'uppercase',fontWeight:700}}>School</div>
              <div style={{fontSize:8,fontWeight:800,fontFamily:'monospace',color:acc,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.school}</div>
            </div>
            {r.sectionClass&&<div><div style={{fontSize:6,color:'#9ca3af',textTransform:'uppercase',fontWeight:700}}>Class</div>
              <div style={{fontSize:8,fontWeight:700,color:'#111'}}>{r.sectionClass}</div>
            </div>}
            {r.badge&&r.badge!==r.sectionClass&&<div style={{marginTop:2,display:'inline-block',background:`${acc}18`,border:`1px solid ${acc}40`,color:acc,fontSize:6,fontWeight:800,padding:'1px 5px',textTransform:'uppercase'}}>{r.badge}</div>}
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
      <div className="flex items-center gap-1.5 p-2 bg-muted/50 border-t border-border">
        <button onClick={()=>toggleSelected(r.id)} title={isSelected?'Deselect':'Select'}
          className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${isSelected?'bg-primary border-primary text-primary-foreground':'border-border text-muted-foreground hover:border-primary/50 hover:text-primary bg-background'}`}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            {isSelected&&<path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>}
            {!isSelected&&<rect x="1" y="1" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1"/>}
          </svg>
        </button>
        <button onClick={()=>printSingle(r)} title="Print this card"
          className="w-7 h-7 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center shrink-0 transition-colors bg-background">
          <PrinterIcon className="w-3.5 h-3.5"/>
        </button>
        <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0">
          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md border truncate shrink-0 ${sm.color}`}>{sm.label}</span>
          {!dbCard&&(
            <button onClick={()=>issueCard(r)} disabled={isIssuing}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-wide hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0">
              {isIssuing?<span className="w-2.5 h-2.5 border border-primary-foreground border-t-transparent rounded-full animate-spin"/>:'+'}
              Issue
            </button>
          )}
          {dbCard?.status==='revoked'&&(
            <button onClick={()=>updateCardStatus(r,dbCard,'active')} disabled={isRevoking}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-wide hover:bg-emerald-500/25 disabled:opacity-50 transition-colors shrink-0">
              {isRevoking?<span className="w-2.5 h-2.5 border border-emerald-500 border-t-transparent rounded-full animate-spin"/>:'↑'}
              Restore
            </button>
          )}
          {dbCard?.status==='active'&&(
            <>
              <button onClick={()=>{if(confirm(`Reissue card for ${r.name}? The current card stops working and a new card number + QR code are generated (e.g. for a lost or damaged card).`))reissueCard(r,dbCard)}} disabled={isRevoking}
                title="Replace lost/damaged card — old codes stop verifying"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-wide hover:bg-amber-500/20 disabled:opacity-50 transition-colors shrink-0">
                {isRevoking?<span className="w-2.5 h-2.5 border border-amber-500 border-t-transparent rounded-full animate-spin"/>:'↻'}
                Reissue
              </button>
              <button onClick={()=>{if(confirm(`Revoke card for ${r.name}?`))updateCardStatus(r,dbCard,'revoked')}} disabled={isRevoking}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase tracking-wide hover:bg-rose-500/20 disabled:opacity-50 transition-colors shrink-0">
                {isRevoking?<span className="w-2.5 h-2.5 border border-rose-500 border-t-transparent rounded-full animate-spin"/>:'×'}
                Revoke
              </button>
            </>
          )}
        </div>
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
  const schoolLock = isSchool ? String(profile?.school_name || '').trim() : '';

  // ══════════════════════════════════════════════════════════════════════════
  // DESIGN TAB STATE
  // ══════════════════════════════════════════════════════════════════════════
  const [cfg, setCfg] = useState<CardConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['templates','design']));
  const [previewZoom, setPreviewZoom] = useState(1.0);
  const [designStudents, setDesignStudents] = useState<any[]>([]);
  const [designStudentsLoading, setDesignStudentsLoading] = useState(false);
  const [designStudentsLoaded, setDesignStudentsLoaded] = useState(false);
  const [designSearch, setDesignSearch] = useState('');
  const [designSelectedIds, setDesignSelectedIds] = useState<Set<string>>(new Set());
  const [designSelectedSchool, setDesignSelectedSchool] = useState('all');
  const [designSelectedClass, setDesignSelectedClass] = useState('all');
  const [designGroupByClass, setDesignGroupByClass] = useState(false);

  // Mobile layout state for design tab: settings panels, preview screen, or generate panel
  const [designSubTab, setDesignSubTab] = useState<'settings' | 'preview' | 'generate'>('preview');

  // Load design config
  useEffect(() => {
    if (!canAccess) return;
    fetch(`/api/admin/settings?type=${cardType}`)
      .then(r => r.json())
      .then(data => {
        if (data.config) {
          const parsed = data.config;
          if (parsed.fields) {
            parsed.fields = DEFAULT_FIELDS.map((def: FieldConfig) => {
              const stored = parsed.fields.find((f: FieldConfig) => f.key === def.key);
              return stored ? { ...def, ...stored } : def;
            });
          }
          if (parsed.typo) parsed.typo = { ...DEFAULT_TYPO, ...parsed.typo };
          const preset = ROLE_PRESETS[cardType];
          setCfg({ ...DEFAULT_CONFIG, ...parsed, ...Object.fromEntries(Object.entries(preset).filter(([k]) => !parsed[k])) });
        } else {
          const preset = ROLE_PRESETS[cardType];
          setCfg({ ...DEFAULT_CONFIG, ...preset, fields: preset.fields ?? DEFAULT_FIELDS });
        }
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
    setCfg(prev => ({ ...prev, typo: { ...prev.typo, [elem]: { ...prev.typo[elem], ...patch } } }));

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
    const acc = cfg.accentColor;
    const vis = (key: FieldKey) => cfg.fields.find(f => f.key === key)?.visible ?? false;
    const infoFields = cfg.fields.filter(f => f.visible && f.key !== 'qr' && f.key !== 'className');
    const qrScale = cfg.qrScale ?? 1;
    const qrMm = (25 * qrScale).toFixed(1);
    const sampleQr = await qrDataUrl('https://rillcod.com/result-check/RC-SAMPLE1', 420);
    const expiry = new Date(Date.now()+365*24*60*60*1000).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
    const sampleData: Record<string,string> = { school:SAMPLE.school,email:SAMPLE.email,password:SAMPLE.password,programme:SAMPLE.programme,studentId:SAMPLE.id,className:SAMPLE.className,expiry };
    const logoUrl = window.location.origin + '/images/logo.png';
    const hdrHtml = cfg.headerStyle==='band'
      ? `<div class="chdr"><img src="${logoUrl}" class="logo"/><div><div class="org">${cfg.orgName}</div><div class="web">${cfg.orgWebsite}</div></div>${vis('className')?`<div class="cbadge">${sampleData.className}</div>`:''}</div>`
      : cfg.headerStyle==='border'
        ? `<div class="bhdr"><img src="${logoUrl}" class="logo"/><div><div class="org-b">${cfg.orgName}</div><div class="web-b">${cfg.orgWebsite}</div></div>${vis('className')?`<div class="bbadge">${sampleData.className}</div>`:''}</div>`
        : `<div class="mhdr"><img src="${logoUrl}" class="logo"/><div class="org-m">${cfg.orgName}</div>${vis('className')?`<div class="mbadge">${sampleData.className}</div>`:''}</div>`;
    const html = `<html><head><title>Sample Card</title>
    <style>
      @page{size:A4 portrait;margin:20mm}*{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Inter','Segoe UI',system-ui,sans-serif;background:#fff;display:flex;justify-content:center;padding-top:20mm}
      .card{border:1px solid #d1d5db;${cfg.headerStyle==='border'?`border-left:4px solid ${acc};`:''}width:${cfg.width};height:${cfg.height};display:flex;flex-direction:column;overflow:hidden;background:${cfg.bgColor}}
      .chdr{background:${acc};padding:10px 14px;display:flex;align-items:center;gap:8px}
      .bhdr{display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid #f3f4f6}
      .mhdr{display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:2px solid ${acc}}
      .logo{width:22px;height:22px;object-fit:contain;flex-shrink:0}
      .org{font-size:11px;font-weight:900;color:#fff;text-transform:uppercase;line-height:1}
      .web{font-size:7px;color:rgba(255,255,255,.8);font-weight:700;margin-top:2px}
      .org-b{font-size:10px;font-weight:900;color:#111;text-transform:uppercase}
      .web-b{font-size:7px;color:${acc};font-weight:700;margin-top:1.5px}
      .org-m{font-size:10px;font-weight:900;color:#111;text-transform:uppercase}
      .cbadge{margin-left:auto;background:rgba(0,0,0,.22);color:#fff;padding:.5mm 1.5mm;font-size:7px;font-weight:900;text-transform:uppercase}
      .bbadge{margin-left:auto;background:${acc};color:#fff;padding:.5mm 1.5mm;font-size:7px;font-weight:900;text-transform:uppercase}
      .mbadge{margin-left:auto;font-size:8px;font-weight:900;color:${acc};text-transform:uppercase}
      .cbody{display:flex;flex:1;overflow:hidden}
      .info{flex:1;padding:12px 14px;display:flex;flex-direction:column;gap:6px;border-right:1px solid #f3f4f6;overflow:hidden}
      .sname{font-size:16px;font-weight:900;color:#111;text-transform:uppercase;line-height:1.15}
      .sep{height:1px;background:#f3f4f6}
      .field{display:flex;flex-direction:column;gap:2px}
      .lbl{font-size:6px;font-weight:700;color:${cfg.typo.fieldLabel.color};text-transform:uppercase;letter-spacing:.5px}
      .val{font-size:10px;font-weight:700;font-family:monospace;color:${cfg.typo.fieldValue.color};word-break:break-all}
      .val-a{font-size:10px;font-weight:800;font-family:monospace;color:${cfg.typo.accentValue.color};word-break:break-all}
      .qrp{width:30%;min-width:${qrMm}mm;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:12px 8px;background:#fafafa;flex-shrink:0}
      .qr{width:100%;max-width:${qrMm}mm;height:auto;aspect-ratio:1;border:1px solid #e5e7eb}
      .qrl{font-size:6px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;text-align:center;font-weight:600}
      .qrc{font-size:7px;font-weight:900;font-family:monospace;color:${acc};text-align:center}
      .cftr{display:flex;justify-content:space-between;align-items:center;padding:6px 14px;border-top:1px solid #f3f4f6;font-size:7px;color:#9ca3af;font-weight:600;background:#fafafa}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
    <div class="card">
      ${hdrHtml}
      <div class="cbody">
        <div class="info">
          <div class="sname">${SAMPLE.name}</div><div class="sep"></div>
          ${infoFields.map(f => {const val=sampleData[f.key]??'';const accent=['password','studentId','programme','school','expiry'].includes(f.key);return `<div class="field"><div class="lbl">${f.label}</div><div class="${accent?'val-a':'val'}">${val}</div></div>`;}).join('')}
        </div>
        ${vis('qr')?`<div class="qrp"><img src="${sampleQr}" class="qr"/><div class="qrl">Scan to verify</div><div class="qrc">${SAMPLE.id}</div></div>`:''}
      </div>
      <div class="cftr"><span>${cfg.footerLeft}</span><span style="font-family:monospace;color:#374151;font-weight:900">${cfg.footerRight==='Student ID'?SAMPLE.id:cfg.footerRight}</span></div>
    </div>
    <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),500)}</script>
    </body></html>`;
    const win = window.open('','_blank');
    win?.document.write(html); win?.document.close();
  };

  // Design tab – load students for generate panel
  const loadDesignStudents = (force = false) => {
    if (designStudentsLoaded && !force) return;
    setDesignStudentsLoading(true);
    fetch('/api/portal-users?role=student&scoped=true&t=' + Date.now())
      .then(r => r.json())
      .then(j => {
        setDesignStudents((j.data ?? []).map((s: any) => ({ id:s.id,full_name:s.full_name,email:s.email??null,school_name:s.school_name??null,section_class:s.section_class??null })));
        setDesignStudentsLoaded(true);
      }).catch(()=>{}).finally(()=>setDesignStudentsLoading(false));
  };

  const designSchoolLock = isSchool ? String(profile?.school_name||'').trim() : '';
  const designAllSchools = useMemo(()=>{ const s=new Set(designStudents.map(x=>x.school_name?.trim()||'—'));return Array.from(s).sort(); },[designStudents]);
  const designAllClasses = useMemo(()=>{ const s=new Set<string>();designStudents.forEach(x=>{if(x.section_class?.trim())s.add(x.section_class.trim())});return Array.from(s).sort(); },[designStudents]);
  const showDesignSchoolFilter = !designSchoolLock && (isAdmin||isTeacher) && designAllSchools.length > 1;

  const visibleDesignStudents = useMemo(()=>{
    const q = designSearch.trim().toLowerCase();
    return designStudents.filter(s=>{
      const sch = s.school_name?.trim()||'—';
      if(designSchoolLock && sch!==designSchoolLock) return false;
      if(showDesignSchoolFilter && designSelectedSchool!=='all' && sch!==designSelectedSchool) return false;
      if(designSelectedClass!=='all'){if(designSelectedClass==='__NONE__'){if((s.section_class||'').trim())return false;}else if((s.section_class||'').trim()!==designSelectedClass)return false;}
      if(!q) return true;
      return [s.full_name,s.email,s.school_name,s.section_class].some((v:any)=>(v||'').toLowerCase().includes(q));
    });
  },[designStudents,designSearch,designSelectedSchool,designSelectedClass,designSchoolLock,showDesignSchoolFilter]); // eslint-disable-line

  const designGroupedByClass = useMemo(()=>{
    const groups = new Map<string,any[]>();
    visibleDesignStudents.forEach(s=>{ const cls=(s.section_class||'').trim()||'— No Class —';if(!groups.has(cls))groups.set(cls,[]);groups.get(cls)!.push(s); });
    return Array.from(groups.entries()).sort(([a],[b])=>a.localeCompare(b));
  },[visibleDesignStudents]);

  // Consolidated: design-tab bulk prints go through the shared card builder
  // (one template for the whole app; QR codes are generated locally).
  const printDesignCards = async (list: any[]) => {
    if(!list.length) return;
    const holders: PrintCardHolder[] = list.map((s:any) => ({
      id: s.id,
      full_name: s.full_name || 'Unknown',
      email: s.email ?? null,
      school_name: s.school_name ?? null,
      section_class: s.section_class ?? null,
    }));
    const html = await buildBulkPrintHtml(holders, cfg as unknown as PrintCardConfig, window.location.origin, { qrHint: 'Scan for result' });
    openPrintWindow(html);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // MANAGE TAB STATE
  // ══════════════════════════════════════════════════════════════════════════
  const [manageConfig, setManageConfig] = useState<any>(FALLBACK_MANAGE);
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
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedSchool, setSelectedSchool] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [groupMode, setGroupMode] = useState<GroupMode>('none');
  const [showFilters, setShowFilters] = useState(false);
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
      setManageConfig({ ...FALLBACK_MANAGE, ...(json?.config||{}) });
    } catch { setManageConfig(FALLBACK_MANAGE); }
  },[]);

  const loadDbCards = useCallback(async (type: CardType) => {
    try {
      const res = await fetch(`/api/cards?holder_type=${type}`,{cache:'no-store'});
      if(!res.ok) return;
      const json = await res.json();
      const map = new Map<string,DbCard>();
      for(const c of json.data??[]) if(c.holder_id && !map.has(c.holder_id)) map.set(c.holder_id,c);
      setDbCardsMap(map);
    } catch {}
  },[]);

  const loadRecords = useCallback(async (type: CardType) => {
    setManageLoading(true); setManageError(null); setSelectedClass('all'); setSelectedSchool('all');
    try {
      if(type==='parent') {
        const res = await fetch(isSchool?'/api/portal-users?role=parent&scoped=true':'/api/parents/manage',{cache:'no-store'});
        const json = await res.json();
        if(!res.ok) throw new Error(json?.error||'Failed to load parents');
        setRecords((json?.data||[]).map((r:any)=>({
          id:r.id,name:r.full_name||'Unknown',email:r.email||'N/A',roleLabel:'Parent',
          school:r.children?.[0]?.school_name||(r as any).school_name||'Rillcod Academy',
          badge:r.children?`${r.children.length} child${r.children.length===1?'':'ren'}`:'Parent',
          sectionClass:'',profileUrl:`${window.location.origin}/dashboard/parent-feedback`,schoolId:null,
        })));
      } else {
        const res = await fetch(`/api/portal-users?role=${type}&scoped=true`,{cache:'no-store'});
        const json = await res.json();
        if(!res.ok) throw new Error(json?.error||`Failed to load ${type}s`);
        setRecords((json?.data||[]).map((r:any)=>({
          id:r.id,name:r.full_name||'Unknown',email:r.email||'N/A',
          roleLabel:type==='teacher'?'Teacher':'Student',
          school:r.school_name||'Rillcod Academy',
          badge:r.section_class||(type==='teacher'?'Staff':'Student'),
          sectionClass:r.section_class||'',
          profileUrl:`${window.location.origin}/dashboard/profile`,
          schoolId:(r as any).school_id??null,
        })));
      }
    } catch(e:any) { setRecords([]); setManageError(e?.message||'Failed to load card holders'); }
    finally { setManageLoading(false); }
  },[isSchool]);

  // Load manage data when tab=manage or on card type change
  useEffect(()=>{
    if(!canAccess || activeTab!=='manage') return;
    loadManageConfig(cardType); loadRecords(cardType); loadDbCards(cardType);
    setSelectedIds(new Set()); setStatusFilter('all');
  },[cardType,canAccess,activeTab,loadManageConfig,loadRecords,loadDbCards]); // eslint-disable-line

  useEffect(()=>{ setSelectedIds(new Set()); },[manageQuery,selectedClass,selectedSchool,statusFilter]);

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

  const bulkIssueList = async (list: CardRecord[]) => {
    const unissued = list.filter(r=>!dbCardsMap.has(r.id));
    if(!unissued.length) return;
    setBulkIssuing(true); setBulkProgress({done:0,total:unissued.length}); let done=0;
    const results = await Promise.allSettled(unissued.map(async r=>{
      const res=await fetch('/api/cards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({holder_type:cardType,holder_id:r.id,school_id:r.schoolId,expires_at:issueExpiresAt()})});
      if(!res.ok){const j=await res.json();throw new Error(j.error||'Failed');}
      done++; setBulkProgress({done,total:unissued.length});
    }));
    const failed=results.filter(r=>r.status==='rejected').length;
    const succeeded=results.filter(r=>r.status==='fulfilled').length;
    if(failed) toast.error(`${failed} card(s) failed`);
    if(succeeded) toast.success(`${succeeded} card(s) issued`);
    await loadDbCards(cardType); setBulkIssuing(false); setBulkProgress(null);
  };

  const cardStatus = (r: CardRecord): string => { const c=dbCardsMap.get(r.id); return c?c.status:'unissued'; };

  const allClasses = useMemo(()=>{const s=new Set<string>();records.forEach(r=>{if(r.sectionClass)s.add(r.sectionClass)});return Array.from(s).sort((a,b)=>a.localeCompare(b));},[records]);
  const allSchools = useMemo(()=>{const s=new Set<string>();records.forEach(r=>{if(r.school)s.add(r.school)});return Array.from(s).sort((a,b)=>a.localeCompare(b));},[records]);

  const counts = useMemo(()=>{
    let issued=0,unissued=0,revoked=0,expired=0;
    records.forEach(r=>{const s=cardStatus(r);if(s==='active')issued++;else if(s==='unissued')unissued++;else if(s==='revoked')revoked++;else if(s==='expired')expired++;});
    return {total:records.length,issued,unissued,revoked,expired};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[records,dbCardsMap]);

  const filtered = useMemo(()=>{
    const q=manageQuery.trim().toLowerCase();
    return records.filter(r=>{
      const matchQ=!q||[r.name,r.email,r.school,r.badge,r.sectionClass].some(v=>(v||'').toLowerCase().includes(q));
      const matchClass=selectedClass==='all'||r.sectionClass===selectedClass;
      const matchSchool=schoolLock?(r.school||'')===schoolLock:selectedSchool==='all'||(r.school||'')===selectedSchool;
      const matchStatus=statusFilter==='all'||cardStatus(r)===statusFilter;
      return matchQ&&matchClass&&matchSchool&&matchStatus;
    }).sort((a,b)=>{const ca=a.sectionClass||'zzz',cb=b.sectionClass||'zzz';const cc=ca.localeCompare(cb);return cc!==0?cc:a.name.localeCompare(b.name);});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[records,manageQuery,selectedClass,selectedSchool,statusFilter,schoolLock,dbCardsMap]);

  const grouped = useMemo(()=>{
    const map=new Map<string,CardRecord[]>();
    filtered.forEach(r=>{const key=r.sectionClass||'— No Class —';if(!map.has(key))map.set(key,[]);map.get(key)!.push(r);});
    return Array.from(map.entries()).sort(([a],[b])=>a.localeCompare(b));
  },[filtered]);

  const toggleSelected = (id:string) => setSelectedIds(prev=>{
    const n=new Set(prev);
    if(n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  // Consolidated: manage-tab prints go through the shared card builder at the
  // exact card size from the saved design (QR codes generated locally).
  const printManageCards = async (list: CardRecord[], _title: string) => {
    if(!list.length){toast.error('No records to print');return;}
    const holders: PrintCardHolder[] = list.map(r=>{
      const dbCard=dbCardsMap.get(r.id);
      return {
        id: r.id,
        full_name: r.name,
        email: r.email==='N/A'?null:r.email,
        school_name: r.school,
        section_class: r.sectionClass||null,
        card_number: dbCard?.card_number??null,
        verification_code: dbCard?.verification_code??null,
        expires_at: dbCard?.expires_at??null,
        // RC-XXXXXXXX only: students use the deterministic student code (resolves to
        // their results); others use their card's RC verification_code (resolves to
        // identity). card_number (CARD-…) is never printed.
        card_code: r.roleLabel==='Student' ? accessCardCodeForStudent(r.id) : (dbCard?.verification_code ?? accessCardCodeForStudent(r.id)),
        role_label: r.roleLabel,
        // Don't repeat the class as a badge — it's already shown as the Class field.
        badge: r.badge === r.sectionClass ? null : r.badge,
      };
    });
    const html = await buildBulkPrintHtml(holders, manageConfig as PrintCardConfig, window.location.origin, { fixedSize:true, qrHint:'Scan to verify' });
    openPrintWindow(html);
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
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground/80 mb-2 font-bold">QR Size</div>
            <div className="flex gap-1.5 mb-2">
              {([{label:'Compact',v:0.85},{label:'Standard',v:1},{label:'Large',v:1.35}]).map(s=>{
                const active=(cfg.qrScale??1)===s.v;
                return (
                  <button key={s.label} onClick={()=>update({qrScale:s.v})}
                    className={`flex-1 py-1.5 text-[8px] font-bold uppercase border transition-all truncate rounded-md ${active?'border-primary bg-primary/10 text-primary':'border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                    {s.label}
                  </button>
                );
              })}
            </div>
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
            {([{key:'showLogo' as const,label:'Show Logo',desc:'Logo in header'},{key:'showPhotoSlot' as const,label:'Photo Slot',desc:'Student photo space'}]).map(opt=>(
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

        <SidebarSection title="Fields" open={openSections.has('fields')} onToggle={()=>toggleSection('fields')}>
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
            {([{elem:'orgName' as const,label:'Org Name'},{elem:'studentName' as const,label:'Student Name'},{elem:'school' as const,label:'School'},{elem:'fieldLabel' as const,label:'Field Labels'},{elem:'fieldValue' as const,label:'Field Values'},{elem:'accentValue' as const,label:'Accent Values'},{elem:'footer' as const,label:'Footer'}]).map(({elem,label})=>{
              const s=cfg.typo[elem];
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
              {showDesignSchoolFilter&&(
                <select value={designSelectedSchool} onChange={e=>setDesignSelectedSchool(e.target.value)}
                  className="w-full px-2 py-1.5 bg-background border border-border text-foreground text-[10px] focus:outline-none rounded">
                  <option value="all">All schools ({designStudents.length})</option>
                  {designAllSchools.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              )}
              {designAllClasses.length>0&&(
                <select value={designSelectedClass} onChange={e=>setDesignSelectedClass(e.target.value)}
                  className="w-full px-2 py-1.5 bg-background border border-border text-foreground text-[10px] focus:outline-none rounded">
                  <option value="all">All classes</option>
                  {designAllClasses.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              )}
              {designAllClasses.length>1&&(
                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <div onClick={()=>setDesignGroupByClass(g=>!g)} className={`w-7 h-3.5 rounded-full transition-all relative flex-shrink-0 ${designGroupByClass?'bg-primary':'bg-muted'}`}>
                    <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-transform ${designGroupByClass?'translate-x-3.5':'translate-x-0.5'}`}/>
                  </div>
                  <span className="text-[9px] text-muted-foreground">Group by class</span>
                </label>
              )}
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {visibleDesignStudents.length===0?(
                <div className="px-4 py-8 text-center text-[10px] text-muted-foreground">No students match filters.</div>
              ):designGroupByClass?(
                designGroupedByClass.map(([cls,classStudents])=>{
                  const classIds=classStudents.map(s=>s.id);
                  const allSel=classIds.every(id=>designSelectedIds.has(id));
                  return (
                    <div key={cls}>
                      <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/30 border-b border-border sticky top-0 z-10">
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex-1 truncate">{cls}</span>
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
                            className={`flex items-center gap-2.5 px-4 py-2 cursor-pointer transition-all border-b border-border/40 ${sel?'bg-primary/5 border-l-2 border-l-primary':'hover:bg-muted/40 border-l-2 border-l-transparent'}`}>
                            <div className={`w-3.5 h-3.5 border flex-shrink-0 flex items-center justify-center transition-all rounded ${sel?'bg-primary border-primary':'border-border'}`}>
                              {sel&&<span className="text-primary-foreground text-[8px]">✓</span>}
                            </div>
                            <p className="text-[10px] font-bold text-foreground truncate flex-1">{s.full_name}</p>
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
                        className={`flex items-center gap-2.5 px-4 py-2.5 cursor-pointer transition-all ${sel?'bg-primary/5 border-l-2 border-l-primary':'hover:bg-muted/40 border-l-2 border-l-transparent'}`}>
                        <div className={`w-4 h-4 border flex-shrink-0 flex items-center justify-center transition-all rounded ${sel?'bg-primary border-primary':'border-border'}`}>
                          {sel&&<span className="text-primary-foreground text-[9px]">✓</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold text-foreground truncate">{s.full_name}</p>
                          <p className="text-[9px] text-muted-foreground truncate">{s.section_class||'—'}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
        {!designStudentsLoaded&&(
          <div className="flex-1 flex items-center justify-center px-6 py-12">
            <p className="text-[10px] text-muted-foreground text-center leading-relaxed">Load students to select and print access cards using the saved template.</p>
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
            <button onClick={()=>setShowFilters(v=>!v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${showFilters?'bg-primary/10 border-primary/30 text-primary':'border-border text-muted-foreground hover:text-foreground bg-background hover:bg-muted'}`}>
              <FunnelIcon className="w-3.5 h-3.5"/> Filters
            </button>
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
          </div>
        </div>

        {/* Stats strip */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 pb-3 border-t border-border/40 pt-3">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none shrink-0 py-0.5">
            {([{label:'Total',value:counts.total,color:'text-foreground'},{label:'Issued',value:counts.issued,color:'text-emerald-500'},{label:'Unissued',value:counts.unissued,color:'text-muted-foreground'},{label:'Revoked',value:counts.revoked,color:'text-rose-500'},{label:'Expired',value:counts.expired,color:'text-amber-500'}]).map(s=>(
              <button key={s.label} onClick={()=>setStatusFilter(s.label==='Total'?'all':s.label.toLowerCase() as StatusFilter)}
                className={`shrink-0 px-2.5 py-1 rounded-lg text-center min-w-[56px] border transition-colors ${statusFilter===(s.label==='Total'?'all':s.label.toLowerCase())?'bg-primary/10 border-primary/30':'bg-background border-border hover:border-muted-foreground/30'}`}>
                <div className={`text-sm font-black ${s.color}`}>{s.value}</div>
                <div className="text-[8px] text-muted-foreground uppercase tracking-wider font-semibold">{s.label}</div>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto w-full sm:w-auto">
            {filtered.length>0&&selectedIds.size===0&&(
              <button onClick={()=>setSelectedIds(new Set(filtered.map(r=>r.id)))}
                className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wide border border-border text-muted-foreground hover:text-foreground rounded-lg transition-colors bg-background hover:bg-muted">
                Select all ({filtered.length})
              </button>
            )}
            {selectedIds.size>0&&(<>
              <button onClick={()=>setSelectedIds(new Set())} className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wide border border-border text-muted-foreground hover:text-foreground rounded-lg transition-colors bg-background hover:bg-muted">Clear ({selectedIds.size})</button>
              <button onClick={()=>printManageCards(filtered.filter(r=>selectedIds.has(r.id)),`Selected ${cardType} cards`)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors shadow">
                <PrinterIcon className="w-3 h-3"/> Print ({selectedIds.size})
              </button>
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
            <button onClick={()=>printManageCards(filtered,`${cardType} access cards`)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide border border-border text-muted-foreground hover:text-emerald-600 hover:border-emerald-500/30 rounded-lg transition-colors bg-background hover:bg-muted">
              <PrinterIcon className="w-3 h-3"/> Print All
            </button>
          </div>
        </div>

        {/* Collapsible filters */}
        {showFilters&&(
          <div className="flex flex-wrap items-center gap-4 px-4 pb-3 border-t border-border pt-3 bg-muted/10">
            {allSchools.length>1&&!schoolLock&&(
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">School</span>
                <select value={selectedSchool} onChange={e=>setSelectedSchool(e.target.value)}
                  className="text-xs bg-background border border-border rounded-lg px-2 py-1 text-foreground focus:outline-none focus:border-primary">
                  <option value="all">All ({records.length})</option>
                  {allSchools.map(s=><option key={s} value={s}>{s} ({records.filter(r=>r.school===s).length})</option>)}
                </select>
              </div>
            )}
            {allClasses.length>0&&(
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Class</span>
                <div className="flex gap-1 flex-wrap">
                  <button onClick={()=>setSelectedClass('all')} className={`px-2.5 py-0.5 rounded-full text-[10px] border transition-colors ${selectedClass==='all'?'bg-primary/10 border-primary/30 text-primary':'border-border text-muted-foreground hover:border-muted-foreground bg-background'}`}>All</button>
                  {allClasses.map(cls=>(
                    <button key={cls} onClick={()=>setSelectedClass(cls)} className={`px-2.5 py-0.5 rounded-full text-[10px] border transition-colors ${selectedClass===cls?'bg-primary/10 border-primary/30 text-primary':'border-border text-muted-foreground hover:border-muted-foreground bg-background'}`}>
                      {cls} <span className="text-muted-foreground/60 text-[9px] ml-0.5">({records.filter(r=>r.sectionClass===cls).length})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {cardType!=='parent'&&allClasses.length>0&&(
              <div className="flex items-center gap-2 sm:ml-auto">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Group</span>
                <button onClick={()=>setGroupMode(g=>g==='none'?'class':'none')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-colors ${groupMode==='class'?'bg-primary/10 border-primary/30 text-primary':'border-border text-muted-foreground hover:border-muted-foreground bg-background hover:bg-muted'}`}>
                  By Class
                </button>
              </div>
            )}
          </div>
        )}
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
        ):groupMode==='class'?(
          <div className="space-y-8">
            {grouped.map(([cls,list])=>(
              <section key={cls} className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-b border-border/60 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-1 bg-primary rounded"/>
                    <h2 className="text-sm font-black uppercase tracking-widest text-foreground">{cls}</h2>
                    <span className="text-[10px] text-muted-foreground font-semibold">({list.length} {cardType}{list.length!==1?'s':''})</span>
                  </div>
                  <div className="sm:ml-auto flex gap-2">
                    {list.some(r=>!dbCardsMap.has(r.id))&&(
                      <button disabled={bulkIssuing} onClick={()=>bulkIssueList(list)}
                        className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wide border border-primary/30 text-primary hover:bg-primary/5 rounded-lg disabled:opacity-50 transition-colors bg-background">
                        Issue Missing ({list.filter(r=>!dbCardsMap.has(r.id)).length})
                      </button>
                    )}
                    <button onClick={()=>printManageCards(list,`Access Cards — ${cls}`)}
                      className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide border border-border text-muted-foreground hover:text-foreground rounded-lg transition-colors bg-background hover:bg-muted">
                      <PrinterIcon className="w-3 h-3"/> Print Class
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {list.map(r=><ManageCardPreview key={r.id} r={r} config={manageConfig} dbCardsMap={dbCardsMap} selectedIds={selectedIds} toggleSelected={toggleSelected} issueCard={issueCard} updateCardStatus={updateCardStatus} reissueCard={reissueCard} isIssuingIds={isIssuingIds} isRevokingIds={isRevokingIds} printSingle={r=>printManageCards([r],`${r.name} — Access Card`)}/>)}
                </div>
              </section>
            ))}
          </div>
        ):(
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(r=><ManageCardPreview key={r.id} r={r} config={manageConfig} dbCardsMap={dbCardsMap} selectedIds={selectedIds} toggleSelected={toggleSelected} issueCard={issueCard} updateCardStatus={updateCardStatus} reissueCard={reissueCard} isIssuingIds={isIssuingIds} isRevokingIds={isRevokingIds} printSingle={r=>printManageCards([r],`${r.name} — Access Card`)}/>)}
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
