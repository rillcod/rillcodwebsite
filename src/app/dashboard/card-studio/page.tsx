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
  width: string; height: string; fields: FieldConfig[];
  typo: {
    orgName: TypoStyle; orgWebsite: TypoStyle; studentName: TypoStyle;
    school: TypoStyle; fieldLabel: TypoStyle; fieldValue: TypoStyle;
    accentValue: TypoStyle; footer: TypoStyle;
  };
}

type PortalUser = { id: string; full_name: string; email: string | null; role: string; school_name?: string | null; section_class?: string | null; };
type ParentUser = { id: string; full_name: string; email: string; phone?: string | null; children?: Array<{ id: string; full_name: string; school_name?: string | null }>; };
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
  active:   { label:'Active',     color:'text-emerald-400 bg-emerald-500/10 border-emerald-500/25', bar:'bg-emerald-500' },
  revoked:  { label:'Revoked',    color:'text-rose-400 bg-rose-500/10 border-rose-500/25',          bar:'bg-rose-500'   },
  expired:  { label:'Expired',    color:'text-amber-400 bg-amber-500/10 border-amber-500/25',       bar:'bg-amber-500'  },
  unissued: { label:'Not issued', color:'text-[#52525b] bg-[#18181b] border-[#27272a]',             bar:'bg-[#27272a]'  },
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

  return (
    <div style={{border:'1px solid #d1d5db',borderLeft:cfg.headerStyle==='border'?`4px solid ${acc}`:'1px solid #d1d5db',width:cfg.width,height:cfg.height,display:'flex',flexDirection:'column',overflow:'hidden',background:cfg.bgColor||'#fff',color:'#111827',boxShadow:'0 20px 40px rgba(0,0,0,0.4)',margin:'0 auto',zoom:scale}}>
      <Header />
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        <div style={{flex:1,padding:'10px 12px',display:'flex',flexDirection:'column',gap:5,borderRight:vis('qr')?'1px solid #f3f4f6':'none',overflow:'hidden'}}>
          <div style={ts(t.studentName,{textTransform:'uppercase',lineHeight:1.15})}>{SAMPLE.name}</div>
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
            <QrPlaceholder size={54} color={acc}/>
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

function ManageCardPreview({ r, config, dbCardsMap, selectedIds, toggleSelected, issueCard, updateCardStatus, isIssuingIds, isRevokingIds, printSingle }: {
  r: CardRecord; config: any; dbCardsMap: Map<string,DbCard>; selectedIds: Set<string>;
  toggleSelected: (id:string)=>void; issueCard: (r:CardRecord)=>void;
  updateCardStatus: (r:CardRecord,c:DbCard,s:'active'|'revoked')=>void;
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
  const code  = dbCard?.card_number ?? `RC-${r.id.slice(0,8).toUpperCase()}`;
  const verifyUrl = dbCard?.verification_code ? `${window.location.origin}/verify/${dbCard.verification_code}` : r.profileUrl;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(verifyUrl)}`;

  return (
    <div className={`flex flex-col rounded-xl overflow-hidden border transition-all ${isSelected?'border-[#f5a623] ring-1 ring-[#f5a623]/40':'border-[#27272a] hover:border-[#3f3f46]'}`}>
      <div className={`h-1 w-full ${sm.bar}`}/>
      <div className="flex-1 bg-white text-[#111827]" style={{fontFamily:'Inter,system-ui,sans-serif',backgroundColor:config.bgColor||'#fff'}}>
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
            <div style={{marginTop:2,display:'inline-block',background:`${acc}18`,border:`1px solid ${acc}40`,color:acc,fontSize:6,fontWeight:800,padding:'1px 5px',textTransform:'uppercase'}}>{r.badge}</div>
          </div>
          <div style={{width:60,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:3,padding:'6px 4px',background:'#fafafa',flexShrink:0}}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="" style={{width:42,height:42,border:'1px solid #e5e7eb'}}/>
            <div style={{fontSize:6,fontWeight:900,fontFamily:'monospace',color:acc,textAlign:'center',wordBreak:'break-all'}}>{code}</div>
          </div>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',padding:'4px 10px',borderTop:'1px solid #f3f4f6',fontSize:6,color:'#9ca3af',fontWeight:600,background:'#fafafa'}}>
          <span>{config.footerLeft}</span>
          <span style={{fontFamily:'monospace',color:'#374151',fontWeight:900}}>{config.cardLabel}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 p-2 bg-[#0f0f11] border-t border-[#1c1c1f]">
        <button onClick={()=>toggleSelected(r.id)} title={isSelected?'Deselect':'Select'}
          className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${isSelected?'bg-[#f5a623] border-[#f5a623] text-[#09090b]':'border-[#27272a] text-[#52525b] hover:border-[#f5a623]/50 hover:text-[#f5a623]'}`}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            {isSelected&&<path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>}
            {!isSelected&&<rect x="1" y="1" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1"/>}
          </svg>
        </button>
        <button onClick={()=>printSingle(r)} title="Print this card"
          className="w-7 h-7 rounded-lg border border-[#27272a] text-[#71717a] hover:text-white hover:border-[#52525b] flex items-center justify-center shrink-0 transition-colors">
          <PrinterIcon className="w-3.5 h-3.5"/>
        </button>
        <div className="flex-1 flex items-center justify-end gap-1.5">
          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md border ${sm.color}`}>{sm.label}</span>
          {!dbCard&&(
            <button onClick={()=>issueCard(r)} disabled={isIssuing}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#f5a623] text-[#09090b] text-[10px] font-black uppercase tracking-wide hover:bg-[#fcd34d] disabled:opacity-50 transition-colors">
              {isIssuing?<span className="w-2.5 h-2.5 border border-[#09090b] border-t-transparent rounded-full animate-spin"/>:'+'}
              Issue
            </button>
          )}
          {dbCard?.status==='revoked'&&(
            <button onClick={()=>updateCardStatus(r,dbCard,'active')} disabled={isRevoking}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-wide hover:bg-emerald-500/25 disabled:opacity-50 transition-colors">
              {isRevoking?<span className="w-2.5 h-2.5 border border-emerald-400 border-t-transparent rounded-full animate-spin"/>:'↑'}
              Restore
            </button>
          )}
          {dbCard?.status==='active'&&(
            <button onClick={()=>{if(confirm(`Revoke card for ${r.name}?`))updateCardStatus(r,dbCard,'revoked')}} disabled={isRevoking}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-400 text-[10px] font-black uppercase tracking-wide hover:bg-rose-500/20 disabled:opacity-50 transition-colors">
              {isRevoking?<span className="w-2.5 h-2.5 border border-rose-400 border-t-transparent rounded-full animate-spin"/>:'×'}
              Revoke
            </button>
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
  const [previewZoom, setPreviewZoom] = useState(1.25);
  const [designStudents, setDesignStudents] = useState<any[]>([]);
  const [designStudentsLoading, setDesignStudentsLoading] = useState(false);
  const [designStudentsLoaded, setDesignStudentsLoaded] = useState(false);
  const [designSearch, setDesignSearch] = useState('');
  const [designSelectedIds, setDesignSelectedIds] = useState<Set<string>>(new Set());
  const [designSelectedSchool, setDesignSelectedSchool] = useState('all');
  const [designSelectedClass, setDesignSelectedClass] = useState('all');
  const [designGroupByClass, setDesignGroupByClass] = useState(false);

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
  const toggleSection = (s: string) => setOpenSections(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
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

  const handlePrintSample = () => {
    const acc = cfg.accentColor;
    const vis = (key: FieldKey) => cfg.fields.find(f => f.key === key)?.visible ?? false;
    const infoFields = cfg.fields.filter(f => f.visible && f.key !== 'qr' && f.key !== 'className');
    const qUrl = encodeURIComponent('https://rillcod.com/student/sample');
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
      .qrp{width:25%;min-width:20mm;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:12px 10px;background:#fafafa;flex-shrink:0}
      .qr{width:100%;max-width:25mm;height:auto;aspect-ratio:1;border:1px solid #e5e7eb}
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
        ${vis('qr')?`<div class="qrp"><img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qUrl}" class="qr" crossorigin="anonymous"/><div class="qrl">Scan to verify</div><div class="qrc">${SAMPLE.id}</div></div>`:''}
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

  const printDesignCards = (list: any[]) => {
    if(!list.length) return;
    const acc=cfg.accentColor; const hs=cfg.headerStyle;
    const vis=(key:string)=>cfg.fields.find(f=>f.key===key)?.visible??false;
    const logo=`${window.location.origin}/images/logo.png`;
    const cardHtml=(s:any)=>{
      const code=`RC-${s.id.slice(0,8).toUpperCase()}`;
      const qrUrl=`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(`${window.location.origin}/verify/${s.id}`)}`;
      const hdrClass=hs==='border'?'hdr-border':hs==='minimal'?'hdr-min':'hdr-band';
      const rows=[
        vis('school')&&s.school_name?`<div class="row"><div class="lbl">${cfg.fields.find(f=>f.key==='school')?.label||'School'}</div><div class="val-a">${s.school_name}</div></div>`:'',
        vis('className')&&s.section_class?`<div class="row"><div class="lbl">Class</div><div class="val">${s.section_class}</div></div>`:'',
        vis('email')&&s.email?`<div class="row"><div class="lbl">Email</div><div class="val">${s.email}</div></div>`:'',
        vis('studentId')?`<div class="row"><div class="lbl">Student ID</div><div class="val-a">${code}</div></div>`:'',
      ].filter(Boolean).join('');
      return `<div class="card"><div class="${hdrClass}">${cfg.showLogo?`<img class="logo" src="${logo}"/>`:''}
        <div><div class="org">${cfg.orgName}</div><div class="web">${cfg.orgWebsite}</div></div>
        <div class="cbadge">${cfg.cardLabel}</div></div>
        <div class="body"><div class="left"><div class="name">${s.full_name}</div><div class="sep"></div>${rows}</div>
        ${vis('qr')?`<div class="right"><img class="qr" src="${qrUrl}"/><div class="code">${code}</div></div>`:''}</div>
        <div class="ftr"><span>${cfg.footerLeft}</span><span>${code}</span></div></div>`;
    };
    const html=`<!doctype html><html><head><title>Access Cards</title>
    <style>
      @page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}
      body{margin:0;font-family:Inter,system-ui,sans-serif;color:#111827;background:#fff}
      .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8mm}
      .card{border:1px solid #e5e7eb;display:flex;flex-direction:column;overflow:hidden;background:${cfg.bgColor||'#fff'}}
      .hdr-band{background:${acc};color:#fff;padding:2.2mm 3mm;display:flex;align-items:center;gap:2mm}
      .hdr-border{border-left:2.5mm solid ${acc};padding:2.2mm 3mm;display:flex;align-items:center;gap:2mm}
      .hdr-min{border-bottom:1px solid #e5e7eb;padding:2.2mm 3mm;display:flex;align-items:center;gap:2mm}
      .logo{width:5mm;height:5mm;object-fit:contain}.org{font-weight:900;font-size:2.5mm;text-transform:uppercase;line-height:1}
      .web{font-size:1.8mm;opacity:.8;margin-top:.5mm}.cbadge{margin-left:auto;background:rgba(0,0,0,.22);color:#fff;padding:.5mm 1.5mm;font-size:1.6mm;font-weight:900;text-transform:uppercase}
      .body{display:flex;flex:1}.left{flex:1;padding:2.5mm 3mm;border-right:1px solid #f3f4f6}
      .name{font-size:3.5mm;font-weight:900;margin:.8mm 0 1.2mm;text-transform:uppercase;line-height:1.2}
      .sep{height:.3mm;background:#f3f4f6;margin-bottom:1mm}.row{margin:.6mm 0}
      .lbl{color:${cfg.typo.fieldLabel.color};font-size:1.5mm;text-transform:uppercase}.val{font-size:2mm;font-weight:700}
      .val-a{font-size:2mm;font-weight:800;font-family:monospace;color:${acc}}
      .right{width:22mm;background:#fafafa;padding:2mm;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:1mm}
      .qr{width:15mm;height:15mm;border:1px solid #e5e7eb}.code{color:${acc};font-size:1.5mm;font-family:monospace;font-weight:900;text-align:center}
      .ftr{border-top:1px solid #f3f4f6;background:#fafafa;color:#6b7280;display:flex;justify-content:space-between;padding:1.2mm 3mm;font-size:1.5mm}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
    <div class="grid">${list.map(s=>cardHtml(s)).join('')}</div>
    <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),500)}</script>
    </body></html>`;
    const win=window.open('','_blank');
    if(!win){toast.error('Pop-up blocked');return;}
    win.document.write(html);win.document.close();
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
      const res = await fetch('/api/cards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({holder_type:cardType,holder_id:record.id,school_id:record.schoolId})});
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

  const bulkIssueList = async (list: CardRecord[]) => {
    const unissued = list.filter(r=>!dbCardsMap.has(r.id));
    if(!unissued.length) return;
    setBulkIssuing(true); setBulkProgress({done:0,total:unissued.length}); let done=0;
    const results = await Promise.allSettled(unissued.map(async r=>{
      const res=await fetch('/api/cards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({holder_type:cardType,holder_id:r.id,school_id:r.schoolId})});
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

  const toggleSelected = (id:string) => setSelectedIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});

  const printManageCards = (list: CardRecord[], title: string) => {
    if(!list.length){toast.error('No records to print');return;}
    const {accentColor:acc,orgName:org,orgWebsite:site,footerLeft:foot,headerStyle:hStyle,cardLabel,width:cardW,height:cardH,bgColor:bgCol} = manageConfig;
    const logo=`${window.location.origin}/images/logo.png`;
    const showExpiry=manageConfig.fields?.find((f:any)=>f.key==='expiry')?.visible??false;
    const expiryLabel=manageConfig.fields?.find((f:any)=>f.key==='expiry')?.label||'Expiry';
    const html=`<!doctype html><html><head><title>${title}</title>
<style>
  @page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}
  body{margin:0;font-family:Inter,system-ui,sans-serif;color:#111827;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,${cardW});gap:6mm;justify-content:start}
  .card{width:${cardW};height:${cardH};border:1px solid #e5e7eb;display:flex;flex-direction:column;overflow:hidden;background:${bgCol}}
  .hdr-band{background:${acc};color:#fff;padding:2.2mm 3mm;display:flex;align-items:center;gap:2mm}
  .hdr-border{border-left:2.5mm solid ${acc};padding:2.2mm 3mm;display:flex;align-items:center;gap:2mm}
  .hdr-min{border-bottom:1px solid #e5e7eb;padding:2.2mm 3mm;display:flex;align-items:center;gap:2mm}
  .logo{width:5mm;height:5mm;object-fit:contain}.org{font-weight:900;font-size:2.5mm;text-transform:uppercase;line-height:1}
  .web{font-size:1.8mm;opacity:.8;margin-top:.5mm}
  .body{display:flex;flex:1}.left{flex:1;padding:2.5mm 3mm;border-right:1px solid #f3f4f6}
  .school{color:${acc};font-size:1.8mm;font-weight:900;text-transform:uppercase;letter-spacing:.2mm}
  .name{font-size:4mm;font-weight:900;margin:.8mm 0 1.2mm;text-transform:uppercase;line-height:1.2}
  .row{margin:.8mm 0}.lbl{color:#9ca3af;font-size:1.6mm;text-transform:uppercase;letter-spacing:.15mm}.val{font-size:2.2mm;font-weight:700}
  .badge{display:inline-block;background:${acc}15;border:1px solid ${acc}40;color:${acc};font-size:1.7mm;font-weight:800;padding:.6mm 1.4mm;margin-top:1mm}
  .right{width:23mm;background:#fafafa;padding:2mm;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:1mm}
  .qr{width:16mm;height:16mm;border:1px solid #e5e7eb}.code{color:${acc};font-size:1.6mm;font-family:monospace;font-weight:900;text-align:center}
  .ftr{border-top:1px solid #f3f4f6;background:#fafafa;color:#6b7280;display:flex;justify-content:space-between;padding:1.3mm 3mm;font-size:1.6mm}
</style></head><body>
<div class="grid">
${list.map(r=>{
  const dbCard=dbCardsMap.get(r.id);
  const code=dbCard?.card_number??`RC-${r.id.slice(0,8).toUpperCase()}`;
  const verifyUrl=dbCard?.verification_code?`${window.location.origin}/verify/${dbCard.verification_code}`:r.profileUrl;
  const qr=`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(verifyUrl)}`;
  const hdrClass=hStyle==='border'?'hdr-border':hStyle==='minimal'?'hdr-min':'hdr-band';
  return `<div class="card"><div class="${hdrClass}"><img class="logo" src="${logo}"/><div><div class="org">${org}</div><div class="web">${site}</div></div></div>
  <div class="body"><div class="left"><div class="school">${r.school}</div><div class="name">${r.name}</div>
  <div class="row"><div class="lbl">Role</div><div class="val">${r.roleLabel}</div></div>
  <div class="row"><div class="lbl">Email</div><div class="val">${r.email}</div></div>
  ${r.sectionClass?`<div class="row"><div class="lbl">Class</div><div class="val">${r.sectionClass}</div></div>`:''}
  ${showExpiry&&dbCard?.expires_at?`<div class="row"><div class="lbl">${expiryLabel}</div><div class="val" style="color:${acc}">${new Date(dbCard.expires_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div></div>`:''}
  <div class="badge">${r.badge}</div></div>
  <div class="right"><img class="qr" src="${qr}"/><div class="code">${code}</div></div></div>
  <div class="ftr"><span>${foot}</span><span>${cardLabel}</span></div></div>`;
}).join('')}
</div>
<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),500)}</script>
</body></html>`;
    const win=window.open('','_blank');
    if(!win){toast.error('Pop-up blocked');return;}
    win.document.write(html);win.document.close();
  };

  // ── Guards ────────────────────────────────────────────────────────────────
  if (isLoading) return null;
  if (!canAccess) return (
    <div className="flex items-center justify-center min-h-screen bg-[#09090b] text-[#71717a]">
      <div className="text-center">
        <CreditCardIcon className="w-8 h-8 mx-auto mb-3 text-rose-400"/>
        <p className="font-semibold text-white">Card Studio access is for staff only</p>
      </div>
    </div>
  );

  const CARD_TYPES: CardType[] = ['student','parent',...(canViewTeacherCards?['teacher' as CardType]:[])];

  // ── Design Tab Render ─────────────────────────────────────────────────────
  const renderDesignTab = () => (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left sidebar */}
      <div className="w-[268px] flex-shrink-0 border-r border-white/[0.07] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 hidden md:block">
        <SidebarSection title="Templates" icon={<PaintBrushIcon className="w-3.5 h-3.5"/>} open={openSections.has('templates')} onToggle={()=>toggleSection('templates')}>
          <div className="grid grid-cols-3 gap-1.5">
            {TEMPLATES.map(t=>(
              <button key={t.name} title={t.name} onClick={()=>update({accentColor:t.color,headerStyle:t.style})}
                className={`h-9 overflow-hidden border transition-all text-left ${cfg.accentColor===t.color&&cfg.headerStyle===t.style?'border-primary ring-1 ring-primary':'border-white/10 hover:border-white/25'}`}>
                {t.style==='band'&&<div style={{background:t.color}} className="w-full h-4"/>}
                {t.style==='border'&&<div className="flex h-full"><div style={{background:t.color}} className="w-1 flex-shrink-0"/><div className="flex-1 bg-white/5"/></div>}
                {t.style==='minimal'&&<div className="flex flex-col h-full"><div style={{borderBottom:`2px solid ${t.color}`}} className="bg-white/5 h-1/2"/><div className="flex-1"/></div>}
                <div className="text-[8px] font-bold text-white/30 px-1 truncate">{t.name}</div>
              </button>
            ))}
          </div>
        </SidebarSection>

        <SidebarSection title="Design" open={openSections.has('design')} onToggle={()=>toggleSection('design')}>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-white/30 mb-2">Header Style</div>
            <div className="grid grid-cols-3 gap-1.5">
              {(['band','border','minimal'] as const).map(s=>(
                <button key={s} onClick={()=>update({headerStyle:s})}
                  className={`py-2 border text-[9px] font-bold uppercase transition-all ${cfg.headerStyle===s?'border-primary bg-primary/10 text-primary':'border-white/10 text-white/40 hover:text-white/60'}`}>
                  {s.charAt(0).toUpperCase()+s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-white/30 mb-2">Accent Colour</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {PRESET_COLORS.map(c=>(
                <button key={c} title={c} onClick={()=>update({accentColor:c})} style={{background:c}}
                  className={`w-7 h-7 transition-all relative ${cfg.accentColor===c?'ring-2 ring-white ring-offset-1 ring-offset-[#09090b] scale-110':'hover:scale-105 opacity-80 hover:opacity-100'}`}>
                  {cfg.accentColor===c&&<span className="absolute inset-0 flex items-center justify-center text-white text-[10px]">✓</span>}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input type="color" value={cfg.accentColor} onChange={e=>update({accentColor:e.target.value})} className="w-8 h-7 cursor-pointer border border-white/10 bg-transparent p-0"/>
              <input type="text" value={cfg.accentColor} onChange={e=>/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)&&update({accentColor:e.target.value})}
                className="flex-1 px-2 py-1.5 bg-white/5 border border-white/10 text-white text-[11px] font-mono focus:outline-none focus:border-primary/50"/>
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-white/30 mb-2">Card Size</div>
            <div className="flex gap-1.5 mb-2">
              {([{label:'CR80 Portrait',w:'54mm',h:'85.6mm'},{label:'CR80 Landscape',w:'85.6mm',h:'54mm'},{label:'A7 Large',w:'70mm',h:'100mm'}]).map(s=>(
                <button key={s.label} onClick={()=>update({width:s.w,height:s.h})}
                  className={`flex-1 py-1.5 text-[8px] font-bold uppercase border transition-all truncate ${cfg.width===s.w&&cfg.height===s.h?'border-primary bg-primary/10 text-primary':'border-white/10 text-white/40 hover:text-white/60'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-white/30 mb-2">Background</div>
            <div className="flex gap-1.5 mb-2">
              {[{label:'White',value:'#ffffff'},{label:'Off-White',value:'#f9fafb'},{label:'Cream',value:'#fffbeb'}].map(c=>(
                <button key={c.value} onClick={()=>update({bgColor:c.value})} style={{background:c.value}}
                  className={`flex-1 py-1.5 border text-[8px] font-bold text-gray-700 transition-all ${cfg.bgColor===c.value?'ring-2 ring-primary ring-offset-1 ring-offset-[#09090b]':'border-white/10'}`}>
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input type="color" value={cfg.bgColor} onChange={e=>update({bgColor:e.target.value})} className="w-8 h-7 cursor-pointer border border-white/10 bg-transparent p-0"/>
              <input type="text" value={cfg.bgColor} onChange={e=>/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)&&update({bgColor:e.target.value})}
                className="flex-1 px-2 py-1.5 bg-white/5 border border-white/10 text-white text-[11px] font-mono focus:outline-none focus:border-primary/50"/>
            </div>
          </div>
          <div className="space-y-2">
            {([{key:'showLogo' as const,label:'Show Logo',desc:'Logo in header'},{key:'showPhotoSlot' as const,label:'Photo Slot',desc:'Student photo space'}]).map(opt=>(
              <label key={opt.key} className="flex items-center gap-3 cursor-pointer py-1">
                <div onClick={()=>update({[opt.key]:!cfg[opt.key]})}
                  className={`w-8 h-4 rounded-full flex-shrink-0 transition-all relative ${cfg[opt.key]?'bg-primary':'bg-white/10'}`}>
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${cfg[opt.key]?'translate-x-4':'translate-x-0.5'}`}/>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-white/60">{opt.label}</div>
                  <div className="text-[8px] text-white/25">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </SidebarSection>

        <SidebarSection title="Fields" open={openSections.has('fields')} onToggle={()=>toggleSection('fields')}>
          <div className="space-y-1.5">
            {cfg.fields.map((f,i)=>(
              <div key={f.key} className={`flex items-center gap-1.5 px-2 py-2 border transition-all ${f.visible?'border-primary/30 bg-primary/5':'border-white/10'}`}>
                <button onClick={()=>toggleField(f.key)}
                  className={`w-4 h-4 border flex-shrink-0 flex items-center justify-center transition-all ${f.visible?'bg-primary border-primary':'border-white/20 hover:border-primary/50'}`}>
                  {f.visible&&<span className="text-white text-[9px] leading-none">✓</span>}
                </button>
                <span className="text-[9px] font-black uppercase tracking-wider text-white/50 w-14 flex-shrink-0">{f.key}</span>
                <input type="text" value={f.label} onChange={e=>updateFieldLabel(f.key,e.target.value)}
                  className="flex-1 px-1.5 py-0.5 bg-white/5 border border-white/10 text-white/70 text-[10px] font-mono focus:outline-none focus:border-primary/40 min-w-0"/>
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button onClick={()=>moveField(i,-1)} disabled={i===0} className="w-4 h-3.5 flex items-center justify-center text-white/30 hover:text-white/70 disabled:opacity-10 transition-colors"><ArrowUpIcon className="w-2.5 h-2.5"/></button>
                  <button onClick={()=>moveField(i,1)} disabled={i===cfg.fields.length-1} className="w-4 h-3.5 flex items-center justify-center text-white/30 hover:text-white/70 disabled:opacity-10 transition-colors"><ArrowDownIcon className="w-2.5 h-2.5"/></button>
                </div>
              </div>
            ))}
          </div>
        </SidebarSection>

        <SidebarSection title="Text" open={openSections.has('text')} onToggle={()=>toggleSection('text')}>
          <div className="space-y-3">
            {([{label:'Org Name',field:'orgName'},{label:'Website',field:'orgWebsite'},{label:'Card Label',field:'cardLabel'},{label:'Footer Left',field:'footerLeft'},{label:'Footer Right',field:'footerRight'}] as const).map(({label,field})=>(
              <div key={field}>
                <div className="text-[8px] uppercase text-white/30 mb-1">{label}</div>
                <input type="text" value={cfg[field] as string} onChange={e=>update({[field]:e.target.value})}
                  className="w-full px-2 py-1.5 bg-white/5 border border-white/10 text-white text-[11px] font-mono focus:outline-none focus:border-primary/50"/>
              </div>
            ))}
          </div>
        </SidebarSection>

        <SidebarSection title="Typography" open={openSections.has('typography')} onToggle={()=>toggleSection('typography')}>
          <div className="space-y-3">
            {([{elem:'orgName' as const,label:'Org Name'},{elem:'studentName' as const,label:'Student Name'},{elem:'school' as const,label:'School'},{elem:'fieldLabel' as const,label:'Field Labels'},{elem:'fieldValue' as const,label:'Field Values'},{elem:'accentValue' as const,label:'Accent Values'},{elem:'footer' as const,label:'Footer'}]).map(({elem,label})=>{
              const s=cfg.typo[elem];
              return (
                <div key={elem} className="border border-white/10 p-2 space-y-2">
                  <div className="text-[9px] font-black uppercase tracking-wider text-white/50">{label}</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div><div className="text-[8px] text-white/30 mb-1">Size</div>
                      <input type="text" value={s.fontSize.replace('mm','')} onChange={e=>updateTypo(elem,{fontSize:e.target.value+'mm'})}
                        className="w-full px-1.5 py-1 bg-white/5 border border-white/10 text-white text-[10px] font-mono focus:outline-none"/></div>
                    <div><div className="text-[8px] text-white/30 mb-1">Weight</div>
                      <select value={s.fontWeight} onChange={e=>updateTypo(elem,{fontWeight:e.target.value})}
                        className="w-full px-1 py-1 bg-white/5 border border-white/10 text-white text-[10px] focus:outline-none">
                        <option value="400">Regular</option><option value="600">Semi-Bold</option><option value="700">Bold</option><option value="800">Extra-Bold</option><option value="900">Black</option>
                      </select></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="color" value={s.color.startsWith('rgba')?'#ffffff':s.color} onChange={e=>updateTypo(elem,{color:e.target.value})} className="w-7 h-6 cursor-pointer border border-white/10 bg-transparent p-0 flex-shrink-0"/>
                    <input type="text" value={s.color} onChange={e=>updateTypo(elem,{color:e.target.value})} className="flex-1 px-1.5 py-1 bg-white/5 border border-white/10 text-white text-[9px] font-mono focus:outline-none min-w-0"/>
                    <div className="flex gap-1">
                      {(['sans','mono'] as const).map(fam=>(
                        <button key={fam} onClick={()=>updateTypo(elem,{fontFamily:fam})}
                          className={`px-1.5 py-1 text-[8px] font-bold uppercase border transition-all ${s.fontFamily===fam?'bg-primary border-primary text-white':'border-white/10 text-white/30 hover:text-white/60'}`}>{fam}</button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white px-3 py-1.5 overflow-hidden">
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

      {/* Center: live preview */}
      <div className="flex-1 flex flex-col items-center justify-center gap-5 overflow-auto p-6 min-w-0">
        <div className="flex items-center gap-3">
          <span className="text-[9px] uppercase tracking-widest text-white/20">Live Preview — Sample Data</span>
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 px-2 py-1">
            <button onClick={()=>setPreviewZoom(z=>Math.max(0.6,+(z-0.15).toFixed(2)))} className="text-white/40 hover:text-white text-[11px] font-bold px-1 transition-colors">−</button>
            <span className="text-[9px] text-white/30 font-mono w-10 text-center">{Math.round(previewZoom*100)}%</span>
            <button onClick={()=>setPreviewZoom(z=>Math.min(2.0,+(z+0.15).toFixed(2)))} className="text-white/40 hover:text-white text-[11px] font-bold px-1 transition-colors">+</button>
            <button onClick={()=>setPreviewZoom(1.25)} className="text-[8px] text-white/20 hover:text-white/50 ml-1 transition-colors">Reset</button>
          </div>
        </div>
        <CardPreview cfg={cfg} scale={previewZoom}/>
        {lastSaved&&<p className="text-[9px] text-white/20">Last saved: {lastSaved.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</p>}
        <div className="flex flex-wrap gap-2 justify-center">
          <button onClick={handlePrintSample} className="flex items-center gap-1.5 px-4 py-2 border border-white/10 hover:border-white/25 text-white/50 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all">
            <PrinterIcon className="w-3.5 h-3.5"/> Print Sample
          </button>
        </div>
        <p className="text-[9px] text-white/20 text-center max-w-xs">Save to apply globally. All card prints use this design.</p>
      </div>

      {/* Right: generate panel */}
      <div className="w-[272px] flex-shrink-0 border-l border-white/[0.07] flex flex-col overflow-hidden hidden lg:flex">
        <div className="flex-shrink-0 px-4 py-3 border-b border-white/[0.07]">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Generate Cards</div>
            {designStudentsLoaded&&<span className="text-[9px] text-white/25 font-mono">{designStudents.length} students</span>}
          </div>
          <div className="flex gap-1.5">
            <button onClick={()=>loadDesignStudents(false)} disabled={designStudentsLoading||designStudentsLoaded}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-primary hover:bg-primary/90 text-white text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40">
              {designStudentsLoading?<><div className="w-3 h-3 border-2 border-white/50 border-t-transparent rounded-full animate-spin"/>Loading…</>:<><ArrowDownTrayIcon className="w-3.5 h-3.5"/>Load Students</>}
            </button>
            {designStudentsLoaded&&(
              <button onClick={()=>loadDesignStudents(true)} disabled={designStudentsLoading} title="Refresh" className="px-3 py-2 border border-white/10 hover:border-white/25 text-white/40 hover:text-white text-[10px] font-black uppercase transition-all disabled:opacity-40">↺</button>
            )}
          </div>
        </div>
        {designStudentsLoaded&&(
          <>
            <div className="flex-shrink-0 px-4 py-2.5 border-b border-white/[0.07] space-y-2">
              <div className="flex items-center gap-2 text-[9px] font-mono">
                <span className="text-primary font-bold">{designSelectedIds.size}</span><span className="text-white/20">selected /</span>
                <span className="text-white/40">{visibleDesignStudents.length}</span><span className="text-white/20">visible</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={()=>setDesignSelectedIds(new Set(visibleDesignStudents.map(s=>s.id)))} className="px-2 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black uppercase text-white/50 hover:text-white transition-all">✓ All</button>
                <button onClick={()=>setDesignSelectedIds(new Set())} className="px-2 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black uppercase text-white/50 hover:text-white transition-all">✗ Clear</button>
                {designSelectedIds.size>0&&(
                  <button onClick={()=>printDesignCards(designStudents.filter(s=>designSelectedIds.has(s.id)))}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-black uppercase transition-all">
                    <PrinterIcon className="w-3 h-3"/> Print {designSelectedIds.size}
                  </button>
                )}
              </div>
            </div>
            <div className="flex-shrink-0 px-4 py-2.5 border-b border-white/[0.07] space-y-2">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30"/>
                <input value={designSearch} onChange={e=>setDesignSearch(e.target.value)} placeholder="Search name, class…"
                  className="w-full pl-6 pr-3 py-1.5 bg-white/5 border border-white/10 text-white/70 text-[10px] placeholder-white/20 focus:outline-none focus:border-primary/40"/>
              </div>
              {showDesignSchoolFilter&&(
                <select value={designSelectedSchool} onChange={e=>setDesignSelectedSchool(e.target.value)}
                  className="w-full px-2 py-1.5 bg-white/5 border border-white/10 text-white/60 text-[10px] focus:outline-none">
                  <option value="all">All schools ({designStudents.length})</option>
                  {designAllSchools.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              )}
              {designAllClasses.length>0&&(
                <select value={designSelectedClass} onChange={e=>setDesignSelectedClass(e.target.value)}
                  className="w-full px-2 py-1.5 bg-white/5 border border-white/10 text-white/60 text-[10px] focus:outline-none">
                  <option value="all">All classes</option>
                  {designAllClasses.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              )}
              {designAllClasses.length>1&&(
                <label className="flex items-center gap-2 cursor-pointer">
                  <div onClick={()=>setDesignGroupByClass(g=>!g)} className={`w-7 h-3.5 rounded-full transition-all relative flex-shrink-0 ${designGroupByClass?'bg-primary':'bg-white/10'}`}>
                    <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-transform ${designGroupByClass?'translate-x-3.5':'translate-x-0.5'}`}/>
                  </div>
                  <span className="text-[9px] text-white/40">Group by class</span>
                </label>
              )}
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
              {visibleDesignStudents.length===0?(
                <div className="px-4 py-8 text-center text-[10px] text-white/25">No students match filters.</div>
              ):designGroupByClass?(
                designGroupedByClass.map(([cls,classStudents])=>{
                  const classIds=classStudents.map(s=>s.id);
                  const allSel=classIds.every(id=>designSelectedIds.has(id));
                  return (
                    <div key={cls}>
                      <div className="flex items-center gap-2 px-4 py-1.5 bg-white/[0.03] border-b border-white/[0.04] sticky top-0">
                        <span className="text-[9px] font-black uppercase tracking-widest text-white/40 flex-1 truncate">{cls}</span>
                        <button onClick={()=>setDesignSelectedIds(prev=>{const n=new Set(prev);allSel?classIds.forEach(id=>n.delete(id)):classIds.forEach(id=>n.add(id));return n;})}
                          className="text-[8px] font-bold text-white/25 hover:text-primary transition-colors whitespace-nowrap">
                          {allSel?'✗ Desel':`✓ ${classStudents.length}`}
                        </button>
                      </div>
                      {classStudents.map(s=>{
                        const sel=designSelectedIds.has(s.id);
                        return (
                          <div key={s.id} onClick={()=>setDesignSelectedIds(prev=>{const n=new Set(prev);n.has(s.id)?n.delete(s.id):n.add(s.id);return n;})}
                            className={`flex items-center gap-2.5 px-4 py-2 cursor-pointer transition-all ${sel?'bg-primary/10 border-l-2 border-l-primary':'hover:bg-white/[0.04] border-l-2 border-l-transparent'}`}>
                            <div className={`w-3.5 h-3.5 border flex-shrink-0 flex items-center justify-center transition-all ${sel?'bg-primary border-primary':'border-white/20'}`}>
                              {sel&&<span className="text-white text-[8px]">✓</span>}
                            </div>
                            <p className="text-[10px] font-bold text-white/80 truncate flex-1">{s.full_name}</p>
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              ):(
                <div className="divide-y divide-white/[0.04]">
                  {visibleDesignStudents.map(s=>{
                    const sel=designSelectedIds.has(s.id);
                    return (
                      <div key={s.id} onClick={()=>setDesignSelectedIds(prev=>{const n=new Set(prev);n.has(s.id)?n.delete(s.id):n.add(s.id);return n;})}
                        className={`flex items-center gap-2.5 px-4 py-2.5 cursor-pointer transition-all ${sel?'bg-primary/10 border-l-2 border-l-primary':'hover:bg-white/[0.04] border-l-2 border-l-transparent'}`}>
                        <div className={`w-4 h-4 border flex-shrink-0 flex items-center justify-center transition-all ${sel?'bg-primary border-primary':'border-white/20'}`}>
                          {sel&&<span className="text-white text-[9px]">✓</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold text-white/80 truncate">{s.full_name}</p>
                          <p className="text-[9px] text-white/30 truncate">{s.section_class||'—'}</p>
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
          <div className="flex-1 flex items-center justify-center px-6">
            <p className="text-[10px] text-white/20 text-center leading-relaxed">Load students to select and print their access cards using the current design.</p>
          </div>
        )}
      </div>
    </div>
  );

  // ── Manage Tab Render ─────────────────────────────────────────────────────
  const renderManageTab = () => (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Manage toolbar row 1: type tabs + search + actions */}
      <div className="flex-none border-b border-[#1c1c1f] bg-[#0f0f11]">
        <div className="flex items-center gap-3 px-4 py-2.5 overflow-x-auto scrollbar-none">
          <div className="flex gap-1 shrink-0">
            {CARD_TYPES.map(tab=>{
              const Icon = tab==='student'?UserGroupIcon:tab==='parent'?UserPlusIcon:AcademicCapIcon;
              return (
                <button key={tab} onClick={()=>applyCardType(tab)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${cardType===tab?'bg-[#f5a623]/15 border-[#f5a623]/30 text-[#f5a623]':'bg-transparent border-[#27272a] text-[#71717a] hover:text-white hover:border-[#3f3f46]'}`}>
                  <Icon className="w-3.5 h-3.5"/>
                  {tab.charAt(0).toUpperCase()+tab.slice(1)}s
                  {cardType===tab&&records.length>0&&<span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[#27272a] text-[#a1a1aa]">{records.length}</span>}
                </button>
              );
            })}
          </div>
          <div className="relative shrink-0 w-52">
            <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#52525b]"/>
            <input value={manageQuery} onChange={e=>setManageQuery(e.target.value)} placeholder="Search name, class, school…"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#18181b] border border-[#27272a] rounded-lg text-white placeholder-[#52525b] focus:outline-none focus:border-[#f5a623]/50"/>
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <button onClick={()=>setShowFilters(v=>!v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${showFilters?'bg-[#f5a623]/10 border-[#f5a623]/30 text-[#f5a623]':'border-[#27272a] text-[#71717a] hover:text-white'}`}>
              <FunnelIcon className="w-3.5 h-3.5"/> Filters
            </button>
            {canDesign&&(
              <button onClick={()=>switchTab('design')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-[#27272a] text-[#71717a] hover:text-white hover:border-[#f5a623]/40 transition-colors">
                <SparklesIcon className="w-3.5 h-3.5"/> Design
              </button>
            )}
            <button onClick={()=>{loadManageConfig(cardType);loadRecords(cardType);loadDbCards(cardType);}}
              className="p-1.5 rounded-lg border border-[#27272a] text-[#71717a] hover:text-white transition-colors">
              <ArrowPathIcon className="w-4 h-4"/>
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="flex items-center gap-2 px-4 pb-2 overflow-x-auto scrollbar-none">
          {([{label:'Total',value:counts.total,color:'text-white'},{label:'Issued',value:counts.issued,color:'text-emerald-400'},{label:'Unissued',value:counts.unissued,color:'text-[#71717a]'},{label:'Revoked',value:counts.revoked,color:'text-rose-400'},{label:'Expired',value:counts.expired,color:'text-amber-400'}]).map(s=>(
            <button key={s.label} onClick={()=>setStatusFilter(s.label==='Total'?'all':s.label.toLowerCase() as StatusFilter)}
              className={`shrink-0 px-3 py-1 rounded-lg text-center min-w-[52px] border transition-colors ${statusFilter===(s.label==='Total'?'all':s.label.toLowerCase())?'bg-[#27272a] border-[#3f3f46]':'bg-[#18181b] border-[#27272a] hover:border-[#3f3f46]'}`}>
              <div className={`text-sm font-black ${s.color}`}>{s.value}</div>
              <div className="text-[9px] text-[#52525b] uppercase tracking-wide">{s.label}</div>
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {filtered.length>0&&selectedIds.size===0&&(
              <button onClick={()=>setSelectedIds(new Set(filtered.map(r=>r.id)))}
                className="px-3 py-1 text-[10px] font-black uppercase tracking-wide border border-[#27272a] text-[#71717a] hover:text-white rounded-lg transition-colors">
                Select all ({filtered.length})
              </button>
            )}
            {selectedIds.size>0&&(<>
              <button onClick={()=>setSelectedIds(new Set())} className="px-3 py-1 text-[10px] font-black uppercase tracking-wide border border-[#27272a] text-[#71717a] hover:text-white rounded-lg transition-colors">Clear ({selectedIds.size})</button>
              <button onClick={()=>printManageCards(filtered.filter(r=>selectedIds.has(r.id)),`Selected ${cardType} cards`)}
                className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-black uppercase tracking-wide bg-[#f5a623] text-[#09090b] hover:bg-[#fcd34d] rounded-lg transition-colors">
                <PrinterIcon className="w-3 h-3"/> Print ({selectedIds.size})
              </button>
            </>)}
            {filtered.some(r=>!dbCardsMap.has(r.id))&&(
              <button disabled={bulkIssuing} onClick={()=>bulkIssueList(filtered)}
                className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-black uppercase tracking-wide border border-[#f5a623]/30 text-[#f5a623] hover:bg-[#f5a623]/10 rounded-lg disabled:opacity-50 transition-colors">
                {bulkIssuing?<><span className="w-2.5 h-2.5 border border-[#f5a623] border-t-transparent rounded-full animate-spin"/>{bulkProgress?`${bulkProgress.done}/${bulkProgress.total}`:'…'}</>:`Issue Missing (${filtered.filter(r=>!dbCardsMap.has(r.id)).length})`}
              </button>
            )}
            <button onClick={()=>printManageCards(filtered,`${cardType} access cards`)}
              className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-black uppercase tracking-wide border border-[#27272a] text-[#71717a] hover:text-emerald-400 hover:border-emerald-500/30 rounded-lg transition-colors">
              <PrinterIcon className="w-3 h-3"/> Print All
            </button>
          </div>
        </div>

        {/* Collapsible filters */}
        {showFilters&&(
          <div className="flex flex-wrap items-center gap-3 px-4 pb-2.5 border-t border-[#1c1c1f] pt-2.5">
            {allSchools.length>1&&!schoolLock&&(
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-[#52525b]">School</span>
                <select value={selectedSchool} onChange={e=>setSelectedSchool(e.target.value)}
                  className="text-xs bg-[#18181b] border border-[#27272a] rounded-lg px-2 py-1 text-[#a1a1aa] focus:outline-none">
                  <option value="all">All ({records.length})</option>
                  {allSchools.map(s=><option key={s} value={s}>{s} ({records.filter(r=>r.school===s).length})</option>)}
                </select>
              </div>
            )}
            {allClasses.length>0&&(
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-[#52525b]">Class</span>
                <div className="flex gap-1 flex-wrap">
                  <button onClick={()=>setSelectedClass('all')} className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${selectedClass==='all'?'bg-[#f5a623]/15 border-[#f5a623]/30 text-[#f5a623]':'border-[#27272a] text-[#71717a] hover:border-[#52525b]'}`}>All</button>
                  {allClasses.map(cls=>(
                    <button key={cls} onClick={()=>setSelectedClass(cls)} className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${selectedClass===cls?'bg-[#f5a623]/15 border-[#f5a623]/30 text-[#f5a623]':'border-[#27272a] text-[#71717a] hover:border-[#52525b]'}`}>
                      {cls} <span className="text-[#52525b]">{records.filter(r=>r.sectionClass===cls).length}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {cardType!=='parent'&&allClasses.length>0&&(
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-[9px] font-black uppercase tracking-widest text-[#52525b]">Group</span>
                <button onClick={()=>setGroupMode(g=>g==='none'?'class':'none')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-colors ${groupMode==='class'?'bg-[#f5a623]/15 border-[#f5a623]/30 text-[#f5a623]':'border-[#27272a] text-[#71717a] hover:border-[#52525b]'}`}>
                  By Class
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manage content area */}
      <div className="flex-1 overflow-y-auto p-4">
        {manageError&&<div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/25 text-rose-400 rounded-xl text-sm font-bold">{manageError}</div>}
        {manageLoading?(
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({length:8}).map((_,i)=><div key={i} className="h-52 bg-[#18181b] border border-[#27272a] rounded-xl animate-pulse"/>)}
          </div>
        ):filtered.length===0?(
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-center border border-dashed border-[#27272a] rounded-xl">
            <CreditCardIcon className="w-8 h-8 text-[#3f3f46]"/>
            <div>
              <p className="text-sm font-semibold text-[#71717a]">No card holders found</p>
              <p className="text-xs text-[#52525b] mt-1">{manageQuery?`No results for "${manageQuery}"`:`No ${cardType}s in your scope`}</p>
            </div>
            {manageQuery&&<button onClick={()=>setManageQuery('')} className="text-xs font-black uppercase tracking-wide text-[#f5a623]">Clear search</button>}
          </div>
        ):groupMode==='class'?(
          <div className="space-y-6">
            {grouped.map(([cls,list])=>(
              <section key={cls}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-5 w-0.5 bg-[#f5a623] shrink-0"/>
                  <h2 className="text-sm font-black uppercase tracking-widest text-white">{cls}</h2>
                  <span className="text-[10px] text-[#52525b]">{list.length} {cardType}{list.length!==1?'s':''}</span>
                  <div className="ml-auto flex gap-2">
                    {list.some(r=>!dbCardsMap.has(r.id))&&(
                      <button disabled={bulkIssuing} onClick={()=>bulkIssueList(list)}
                        className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wide border border-[#f5a623]/30 text-[#f5a623] hover:bg-[#f5a623]/10 rounded-lg disabled:opacity-50 transition-colors">
                        Issue Missing ({list.filter(r=>!dbCardsMap.has(r.id)).length})
                      </button>
                    )}
                    <button onClick={()=>printManageCards(list,`Access Cards — ${cls}`)}
                      className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide border border-[#27272a] text-[#71717a] hover:text-white rounded-lg transition-colors">
                      <PrinterIcon className="w-3 h-3"/> Print Class
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {list.map(r=><ManageCardPreview key={r.id} r={r} config={manageConfig} dbCardsMap={dbCardsMap} selectedIds={selectedIds} toggleSelected={toggleSelected} issueCard={issueCard} updateCardStatus={updateCardStatus} isIssuingIds={isIssuingIds} isRevokingIds={isRevokingIds} printSingle={r=>printManageCards([r],`${r.name} — Access Card`)}/>)}
                </div>
              </section>
            ))}
          </div>
        ):(
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map(r=><ManageCardPreview key={r.id} r={r} config={manageConfig} dbCardsMap={dbCardsMap} selectedIds={selectedIds} toggleSelected={toggleSelected} issueCard={issueCard} updateCardStatus={updateCardStatus} isIssuingIds={isIssuingIds} isRevokingIds={isRevokingIds} printSingle={r=>printManageCards([r],`${r.name} — Access Card`)}/>)}
          </div>
        )}
      </div>
    </div>
  );

  // ── Main shell ────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-[#09090b] text-white overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 h-12 border-b border-white/[0.07] flex items-center gap-3 px-4 bg-[#0f0f11]">
        <CreditCardIcon className="w-4 h-4 text-primary flex-shrink-0"/>
        <span className="text-[11px] font-black uppercase tracking-widest text-white hidden sm:block">Card Studio</span>

        {/* Tab switcher */}
        <div className="flex gap-px bg-white/5 border border-white/10 p-px ml-2">
          {([{id:'design' as TabId,label:'Design'},{id:'manage' as TabId,label:'Manage'}]).map(t=>(
            <button key={t.id} onClick={()=>switchTab(t.id)}
              className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-wide transition-all ${activeTab===t.id?'bg-primary text-white':'text-white/40 hover:text-white/70'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Card type selector */}
        <div className="flex gap-px bg-white/5 border border-white/10 p-px ml-1">
          {CARD_TYPES.map(t=>(
            <button key={t} onClick={()=>applyCardType(t)}
              className={`px-3 py-1 text-[10px] font-black uppercase tracking-wide transition-all ${cardType===t?'bg-white/15 text-white':'text-white/40 hover:text-white/70'}`}>
              {t}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {activeTab==='design'&&canDesign&&(<>
            <button onClick={handleReset} className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 border border-white/10 hover:border-white/20 transition-all">Reset</button>
            <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-white text-[10px] font-black uppercase tracking-widest transition-all">
              {saved?<CheckCircleIcon className="w-3.5 h-3.5"/>:<ArrowDownTrayIcon className="w-3.5 h-3.5"/>}
              {saved?'Saved!':'Save Design'}
            </button>
          </>)}
          {activeTab==='manage'&&(
            <button onClick={()=>switchTab('design')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-white/10 text-white/40 hover:text-white hover:border-primary/40 transition-colors">
              <SparklesIcon className="w-3.5 h-3.5"/> Design Mode
            </button>
          )}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {activeTab==='design'?renderDesignTab():renderManageTab()}
      </div>
    </div>
  );
}
