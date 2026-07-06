// @refresh reset
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  CreditCardIcon, PrinterIcon, ArrowDownTrayIcon,
  UserIcon, EnvelopeIcon, BuildingOfficeIcon, AcademicCapIcon,
  CheckCircleIcon, InformationCircleIcon, ExclamationTriangleIcon,
  UserGroupIcon, ShieldCheckIcon,
} from '@/lib/icons';
import { toast } from 'sonner';
import { accessCardCodeForStudent } from '@/lib/access-card-code';
import { buildSingleCardHtml, openPrintWindow, type CardHolder as PrintCardHolder, type CardConfig as PrintCardConfig, type CardFieldConfig } from '@/lib/cards/printCard';
import { qrDataUrl } from '@/lib/cards/qr';

type CardConfig = {
  accentColor: string; orgName: string; orgWebsite: string;
  footerLeft: string; footerRight: string; cardLabel: string;
  headerStyle: 'band' | 'border' | 'minimal';
};
type DbCard = { id: string; card_number: string; verification_code: string; status: string; issued_at: string | null; expires_at: string | null; holder_id: string; };
type Child = { id: string; full_name: string; email: string | null; school_name: string | null; section_class: string | null; };

const DEFAULT_CFG: CardConfig = {
  accentColor: '#1A3A8F', orgName: 'RILLCOD TECHNOLOGIES', orgWebsite: 'www.rillcod.com',
  footerLeft: 'rillcod.com/login', footerRight: 'Student ID', cardLabel: 'ACCESS CARD', headerStyle: 'band',
};

function hex2rgb(hex: string): [number,number,number] {
  const h = hex.replace('#','');
  return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
}

// Print config for self-service reprints: honor the saved design but never
// print the password row, and label the code field per role.
function printableCfg(cfg: CardConfig, idLabel: string): PrintCardConfig {
  const saved = (cfg as any).fields as CardFieldConfig[] | undefined;
  const base: CardFieldConfig[] = saved?.length
    ? saved
    : [{key:'school',visible:true},{key:'email',visible:true},{key:'studentId',visible:true},{key:'qr',visible:true}];
  const fields = base
    .map(f => f.key === 'password' ? { ...f, visible:false } : f)
    .map(f => f.key === 'studentId' ? { ...f, label: idLabel } : f);
  return { ...(cfg as any), fields } as PrintCardConfig;
}

function CardHeader({ cfg, acc }: { cfg: CardConfig; acc: string }) {
  if (cfg.headerStyle === 'band') return (
    <div style={{background:acc,padding:'10px 14px',display:'flex',alignItems:'center',gap:8}}>
      <div style={{width:28,height:28,background:'rgba(255,255,255,0.2)',borderRadius:4,flexShrink:0}}/>
      <div style={{flex:1}}>
        <div style={{fontSize:11,fontWeight:900,color:'#fff',textTransform:'uppercase',lineHeight:1}}>{cfg.orgName}</div>
        <div style={{fontSize:8,color:'rgba(255,255,255,0.8)',fontWeight:700,marginTop:2}}>{cfg.orgWebsite}</div>
      </div>
      <div style={{background:'rgba(0,0,0,0.22)',color:'#fff',padding:'4px 10px',fontSize:8,fontWeight:900,textTransform:'uppercase',letterSpacing:1}}>{cfg.cardLabel}</div>
    </div>
  );
  if (cfg.headerStyle === 'border') return (
    <div style={{padding:'9px 14px',display:'flex',alignItems:'center',gap:8,borderBottom:'1px solid #f3f4f6'}}>
      <div style={{width:26,height:26,background:`${acc}20`,borderRadius:4,flexShrink:0}}/>
      <div style={{flex:1}}>
        <div style={{fontSize:11,fontWeight:900,color:'#111',textTransform:'uppercase'}}>{cfg.orgName}</div>
        <div style={{fontSize:8,color:acc,fontWeight:700,marginTop:2}}>{cfg.orgWebsite}</div>
      </div>
      <div style={{background:acc,color:'#fff',padding:'3px 8px',fontSize:8,fontWeight:900,textTransform:'uppercase'}}>{cfg.cardLabel}</div>
    </div>
  );
  return (
    <div style={{padding:'8px 14px',display:'flex',alignItems:'center',gap:8,borderBottom:`2px solid ${acc}`}}>
      <div style={{width:24,height:24,background:`${acc}20`,borderRadius:3,flexShrink:0}}/>
      <div style={{flex:1,fontSize:10,fontWeight:900,color:'#111',textTransform:'uppercase'}}>{cfg.orgName}</div>
      <div style={{fontSize:8,fontWeight:900,color:acc,textTransform:'uppercase'}}>{cfg.cardLabel}</div>
    </div>
  );
}

function VisualCard({ cfg, name, roleLabel, email, schoolName, idLabel, code, qrUrl }: {
  cfg: CardConfig; name: string; roleLabel: string; email: string; schoolName?: string|null;
  idLabel: string; code: string; qrUrl: string;
}) {
  const acc = cfg.accentColor;
  return (
    <div className="w-full max-w-md mx-auto overflow-hidden shadow-2xl" style={{border:`1px solid #d1d5db`,borderLeft:cfg.headerStyle==='border'?`4px solid ${acc}`:`1px solid #d1d5db`,background:'#fff',color:'#111'}}>
      <CardHeader cfg={cfg} acc={acc}/>
      <div style={{display:'flex',minHeight:140}}>
        <div style={{flex:1,padding:'14px 16px',display:'flex',flexDirection:'column',gap:6,borderRight:'1px solid #f3f4f6',overflow:'hidden'}}>
          <div style={{fontSize:18,fontWeight:900,color:'#111',textTransform:'uppercase',lineHeight:1.2}}>{name}</div>
          <div style={{fontSize:9,fontWeight:700,color:acc,textTransform:'uppercase',letterSpacing:1}}>{roleLabel}</div>
          <div style={{height:1,background:'#f3f4f6',margin:'2px 0'}}/>
          {schoolName&&<div style={{display:'flex',flexDirection:'column',gap:1}}><div style={{fontSize:7,fontWeight:700,color:'#9ca3af',textTransform:'uppercase',letterSpacing:1}}>School</div><div style={{fontSize:11,fontWeight:800,fontFamily:'monospace',color:acc}}>{schoolName}</div></div>}
          <div style={{display:'flex',flexDirection:'column',gap:1}}><div style={{fontSize:7,fontWeight:700,color:'#9ca3af',textTransform:'uppercase',letterSpacing:1}}>Email</div><div style={{fontSize:10,fontWeight:700,color:'#111',wordBreak:'break-all'}}>{email||'—'}</div></div>
          <div style={{display:'flex',flexDirection:'column',gap:1}}><div style={{fontSize:7,fontWeight:700,color:'#9ca3af',textTransform:'uppercase',letterSpacing:1}}>{idLabel}</div><div style={{fontSize:11,fontWeight:800,fontFamily:'monospace',color:acc}}>{code}</div></div>
        </div>
        <div style={{width:120,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6,padding:'14px 12px',background:'#fafafa',flexShrink:0}}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="QR" style={{width:90,height:90,border:'1px solid #e5e7eb'}}/>
          <div style={{fontSize:7,color:'#9ca3af',textTransform:'uppercase',letterSpacing:1,textAlign:'center',fontWeight:600}}>Scan to verify</div>
          <div style={{fontSize:8,fontWeight:900,fontFamily:'monospace',color:acc,textAlign:'center'}}>{code}</div>
        </div>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 14px',borderTop:'1px solid #f3f4f6',fontSize:7,color:'#9ca3af',fontWeight:600,background:'#fafafa'}}>
        <span>{cfg.footerLeft}</span>
        <span style={{fontFamily:'monospace',color:'#374151',fontWeight:900,fontSize:8}}>{code}</span>
      </div>
    </div>
  );
}

// ── Self card (student / teacher / admin) ─────────────────────────────────────

function SelfCardView({ profile, cfg, myCard }: { profile: any; cfg: CardConfig; myCard: DbCard|null }) {
  const [printed, setPrinted] = useState(false);
  const acc = cfg.accentColor;
  const [r,g,b] = hex2rgb(acc);
  // RC-XXXXXXXX only — students use the deterministic student code (resolves to results),
  // others use their card's RC verification_code. card_number (CARD-…) is never shown.
  const code = profile.role === 'student'
    ? accessCardCodeForStudent(profile.id)
    : (myCard?.verification_code ?? accessCardCodeForStudent(profile.id));
  const roleLabel = {student:'Student',teacher:'Teacher',admin:'Administrator',school:'School Partner',parent:'Parent'}[profile.role as string] ?? profile.role;
  const idLabel = {student:'Student ID',teacher:'Staff ID',parent:'Parent Card ID',school:'Partner ID'}[profile.role as string] ?? 'Card ID';
  const verifyUrl = `${window.location.origin}/result-check/${code}`;
  const [qrUrl, setQrUrl] = useState('');
  useEffect(() => { qrDataUrl(verifyUrl, 200).then(setQrUrl); }, [verifyUrl]);

  // Consolidated: self-service reprints use the same shared card template as
  // Card Studio and staff prints (QR generated locally).
  const handlePrint = async () => {
    const holder: PrintCardHolder = {
      id: profile.id,
      full_name: profile.full_name,
      email: profile.email ?? null,
      school_name: profile.school_name ?? null,
      card_number: myCard?.card_number ?? null,
      verification_code: myCard?.verification_code ?? null,
      card_code: code,
      expires_at: myCard?.expires_at ?? null,
      role_label: roleLabel,
      avatar_url: profile.avatar_url ?? null,
    };
    openPrintWindow(await buildSingleCardHtml(holder, printableCfg(cfg, idLabel), window.location.origin));
    setPrinted(true); setTimeout(()=>setPrinted(false),3000);
  };

  const handleDownloadPDF = async () => {
    const {default:jsPDF} = await import('jspdf');
    const doc = new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    const cardW=140,cardX=(210-cardW)/2,cardY=30;
    doc.setDrawColor(209,213,219); doc.setLineWidth(0.3); doc.rect(cardX,cardY,cardW,80);
    if(cfg.headerStyle==='band'){
      doc.setFillColor(r,g,b); doc.rect(cardX,cardY,cardW,12,'F');
      doc.setFontSize(9);doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');
      doc.text(cfg.orgName,cardX+5,cardY+5.5);
      doc.setFontSize(6);doc.setFont('helvetica','normal');doc.text(cfg.orgWebsite,cardX+5,cardY+9);
    } else {
      doc.setFillColor(r,g,b); doc.rect(cardX,cardY,2,80,'F');
      doc.setFontSize(9);doc.setTextColor(17,24,39);doc.setFont('helvetica','bold');
      doc.text(cfg.orgName,cardX+5,cardY+7);
    }
    const bodyY=cardY+(cfg.headerStyle==='band'?16:15);
    doc.setFontSize(12);doc.setTextColor(17,24,39);doc.setFont('helvetica','bold');
    doc.text(profile.full_name.toUpperCase(),cardX+4,bodyY+6);
    doc.setFontSize(6);doc.setTextColor(r,g,b);doc.text(roleLabel.toUpperCase(),cardX+4,bodyY+10);
    let fy=bodyY+18;
    [{label:'SCHOOL',value:profile.school_name||'Rillcod Academy',accent:true},{label:'EMAIL',value:profile.email||'—',accent:false},{label:idLabel.toUpperCase(),value:code,accent:true}].forEach(f=>{
      doc.setFontSize(5.5);doc.setTextColor(156,163,175);doc.setFont('helvetica','normal');doc.text(f.label,cardX+4,fy);
      doc.setFontSize(7.5);doc.setFont('courier','bold');
      if(f.accent)doc.setTextColor(r,g,b);else doc.setTextColor(17,24,39);
      doc.text(doc.splitTextToSize(f.value,cardW-40)[0],cardX+4,fy+4.5);
      fy+=11;
    });
    const qrPng = await qrDataUrl(verifyUrl, 300);
    if(qrPng.startsWith('data:')){
      const qrX=cardX+cardW-28,qrY=bodyY+6;
      doc.setDrawColor(229,231,235);doc.setLineWidth(0.2);doc.rect(qrX-1,qrY-1,24,24);
      doc.addImage(qrPng,'PNG',qrX,qrY,22,22);
      doc.setFontSize(5);doc.setTextColor(156,163,175);doc.setFont('helvetica','normal');doc.text('SCAN TO VERIFY',qrX+11,qrY+25,{align:'center'});
      doc.setFontSize(6);doc.setTextColor(r,g,b);doc.setFont('courier','bold');doc.text(code,qrX+11,qrY+28,{align:'center'});
    }
    const ftrY=cardY+75;
    doc.setDrawColor(243,244,246);doc.setLineWidth(0.2);doc.line(cardX+2,ftrY,cardX+cardW-2,ftrY);
    doc.setFontSize(6);doc.setTextColor(156,163,175);doc.setFont('helvetica','normal');doc.text(cfg.footerLeft,cardX+4,ftrY+4);
    doc.setTextColor(55,65,81);doc.setFont('courier','bold');doc.text(code,cardX+cardW-4,ftrY+4,{align:'right'});
    doc.save(`${profile.full_name.replace(/\s+/g,'_')}_access_card.pdf`);
  };

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-primary/10 border border-primary/25 flex items-center justify-center flex-shrink-0"><CreditCardIcon className="w-5 h-5 text-primary"/></div>
        <div><h1 className="text-2xl font-black text-card-foreground">My Access Card</h1><p className="text-card-foreground/50 text-sm mt-0.5">Your official Rillcod identity card</p></div>
      </div>
      <div className="flex items-start gap-3 bg-primary/[0.07] border border-primary/20 rounded-xl p-4 text-sm">
        <InformationCircleIcon className="w-4 h-4 text-primary flex-shrink-0 mt-0.5"/>
        <p className="text-primary/60">Present this card to school staff for identity verification. The QR code links to your profile verification page.</p>
      </div>
      {!myCard&&<div className="flex items-start gap-3 bg-amber-500/[0.07] border border-amber-500/20 rounded-xl p-4 text-sm">
        <ExclamationTriangleIcon className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5"/>
        <p className="text-amber-400/70">No card has been issued for your account yet. Contact your school administrator to get a card issued.</p>
      </div>}
      <div className="bg-card border border-white/[0.08] rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-5"><span className="text-xs font-black uppercase tracking-widest text-card-foreground/40">Card Preview</span></div>
        <VisualCard cfg={cfg} name={profile.full_name} roleLabel={roleLabel} email={profile.email} schoolName={profile.school_name} idLabel={idLabel} code={code} qrUrl={qrUrl}/>
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button onClick={handlePrint} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${printed?'bg-emerald-500 text-white':'bg-primary hover:bg-primary/90 text-white'}`}>
            {printed?<CheckCircleIcon className="w-4 h-4"/>:<PrinterIcon className="w-4 h-4"/>}
            {printed?'Print dialog opened!':'Print Card'}
          </button>
          <button onClick={handleDownloadPDF} className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold text-sm text-card-foreground/70 transition-all">
            <ArrowDownTrayIcon className="w-4 h-4"/> Download PDF
          </button>
        </div>
      </div>
      <div className="bg-card border border-white/[0.08] rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-black text-card-foreground/60 uppercase tracking-wider">Card Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[{icon:UserIcon,label:'Full Name',value:profile.full_name},{icon:EnvelopeIcon,label:'Email',value:profile.email||'—'},{icon:BuildingOfficeIcon,label:'School',value:profile.school_name||'Rillcod Academy'},{icon:AcademicCapIcon,label:'Role',value:roleLabel},{icon:CreditCardIcon,label:idLabel,value:code},{icon:ShieldCheckIcon,label:'Card Status',value:myCard?({active:'Active',issued:'Issued',revoked:'Revoked',expired:'Expired'}[myCard.status]??myCard.status):'Not Issued'}].map(({icon:Icon,label,value})=>(
            <div key={label} className="flex items-start gap-3 bg-white/[0.02] border border-white/[0.06] rounded-xl p-3">
              <Icon className="w-4 h-4 text-primary flex-shrink-0 mt-0.5"/>
              <div><p className="text-[10px] font-bold text-card-foreground/40 uppercase tracking-wider">{label}</p><p className="text-sm font-bold text-card-foreground mt-0.5">{value}</p></div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-center text-xs text-card-foreground/30">Card design is managed by your school administrator.</p>
    </div>
  );
}

// ── Parent children cards view ────────────────────────────────────────────────

function ParentCardsView({ profile, cfg }: { profile: any; cfg: CardConfig }) {
  const [children, setChildren] = useState<Child[]>([]);
  const [childCardsMap, setChildCardsMap] = useState<Map<string,DbCard>>(new Map());
  const [childQrMap, setChildQrMap] = useState<Map<string,string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [printingId, setPrintingId] = useState<string|null>(null);
  const acc = cfg.accentColor;

  // On-screen QRs are generated locally (offline-safe, no external service)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = new Map<string,string>();
      for (const child of children) {
        // Deterministic RC-XXXXXXXX (the student's canonical code) — always resolves.
        map.set(child.id, await qrDataUrl(`${window.location.origin}/result-check/${accessCardCodeForStudent(child.id)}`, 220));
      }
      if (!cancelled) setChildQrMap(map);
    })();
    return () => { cancelled = true; };
  }, [children, childCardsMap]);

  useEffect(() => {
    Promise.all([
      fetch('/api/parents/portal?section=children').then(r=>r.json()),
      fetch('/api/cards/children').then(r=>r.json()),
    ]).then(([childrenJson, cardsJson]) => {
      const kids: Child[] = (childrenJson.children??[]).map((c:any) => ({
        id:c.id, full_name:c.full_name||'Unknown', email:c.email??null,
        school_name:c.school_name??null,
        section_class:c.section_class??c.current_class??c.section??null,
      }));
      setChildren(kids);
      const map = new Map<string,DbCard>();
      for(const card of cardsJson.data??[]) if(card.holder_id) map.set(card.holder_id,card);
      setChildCardsMap(map);
    }).catch(()=>toast.error('Failed to load card data'))
      .finally(()=>setLoading(false));
  }, [profile.id]);

  // Consolidated: parent prints of children's cards use the shared template.
  const printChildCard = async (child: Child) => {
    const dbCard = childCardsMap.get(child.id);
    const holder: PrintCardHolder = {
      id: child.id,
      full_name: child.full_name,
      email: child.email,
      school_name: child.school_name,
      section_class: child.section_class,
      card_number: dbCard?.card_number ?? null,
      verification_code: dbCard?.verification_code ?? null,
      card_code: accessCardCodeForStudent(child.id),
      expires_at: dbCard?.expires_at ?? null,
      role_label: 'Student',
    };
    openPrintWindow(await buildSingleCardHtml(holder, printableCfg(cfg, 'Card ID'), window.location.origin));
    setPrintingId(child.id); setTimeout(()=>setPrintingId(null),3000);
  };

  if(loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"/></div>;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 border border-primary/25 flex items-center justify-center flex-shrink-0"><UserGroupIcon className="w-5 h-5 text-primary"/></div>
          <div>
            <h1 className="text-2xl font-black text-card-foreground">Children's Access Cards</h1>
            <p className="text-card-foreground/50 text-sm mt-0.5">{children.length} {children.length===1?'child':'children'} linked to your account</p>
          </div>
        </div>
      </div>
      <div className="flex items-start gap-3 bg-primary/[0.07] border border-primary/20 rounded-xl p-4 text-sm">
        <InformationCircleIcon className="w-4 h-4 text-primary flex-shrink-0 mt-0.5"/>
        <p className="text-primary/60">These access cards are for your children's use at school. Print and laminate each card for identity verification.</p>
      </div>
      {children.length===0?(
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <UserGroupIcon className="w-16 h-16 text-card-foreground/10"/>
          <p className="text-card-foreground/40 font-semibold">No children linked to your account</p>
          <p className="text-card-foreground/30 text-sm text-center max-w-sm">Contact your school administrator to link your children's accounts.</p>
        </div>
      ):(
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {children.map(child => {
            const dbCard = childCardsMap.get(child.id);
            const code = accessCardCodeForStudent(child.id);
            const statusLabel = dbCard?({active:'Active',issued:'Issued',revoked:'Revoked',expired:'Expired'}[dbCard.status]??dbCard.status):'Not Issued';
            const statusColor = dbCard?({active:'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',issued:'bg-primary/15 text-primary border-primary/30',revoked:'bg-rose-500/20 text-rose-400 border-rose-500/30',expired:'bg-amber-500/20 text-amber-400 border-amber-500/30'}[dbCard.status]??'bg-muted/50 text-muted-foreground border-border'):'bg-muted/50 text-muted-foreground border-border';
            const qrUrl = childQrMap.get(child.id) ?? null;
            return (
              <div key={child.id} className="bg-card border border-white/[0.08] rounded-2xl p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-card-foreground text-base">{child.full_name}</p>
                    <p className="text-card-foreground/40 text-xs mt-0.5">{child.school_name||'Rillcod Academy'}</p>
                  </div>
                  <span className={`border text-xs font-bold px-2 py-0.5 rounded-full ${statusColor}`}>{statusLabel}</span>
                </div>
                {/* Mini card visual */}
                <div className="w-full overflow-hidden shadow-md" style={{border:`1px solid #d1d5db`,borderLeft:cfg.headerStyle==='border'?`4px solid ${acc}`:`1px solid #d1d5db`,background:'#fff',color:'#111'}}>
                  <CardHeader cfg={cfg} acc={acc}/>
                  <div style={{display:'flex',minHeight:110}}>
                    <div style={{flex:1,padding:'10px 12px',display:'flex',flexDirection:'column',gap:4,borderRight:'1px solid #f3f4f6'}}>
                      <div style={{fontSize:14,fontWeight:900,color:'#111',textTransform:'uppercase',lineHeight:1.2}}>{child.full_name}</div>
                      <div style={{fontSize:8,fontWeight:700,color:acc,textTransform:'uppercase',letterSpacing:1}}>Student</div>
                      <div style={{height:1,background:'#f3f4f6',margin:'2px 0'}}/>
                      {child.school_name&&<div><div style={{fontSize:6,fontWeight:700,color:'#9ca3af',textTransform:'uppercase'}}>School</div><div style={{fontSize:9,fontWeight:800,fontFamily:'monospace',color:acc}}>{child.school_name}</div></div>}
                      <div><div style={{fontSize:6,fontWeight:700,color:'#9ca3af',textTransform:'uppercase'}}>Card ID</div><div style={{fontSize:9,fontWeight:800,fontFamily:'monospace',color:dbCard?acc:'#9ca3af'}}>{code}</div></div>
                    </div>
                    <div style={{width:90,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4,padding:'10px 8px',background:'#fafafa',flexShrink:0}}>
                      {qrUrl?(
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={qrUrl} alt="QR" style={{width:70,height:70,border:'1px solid #e5e7eb'}}/>
                      ):(
                        <div style={{width:70,height:70,border:'1px dashed #e5e7eb',display:'flex',alignItems:'center',justifyContent:'center',background:'#f9fafb'}}><span style={{fontSize:7,color:'#9ca3af',textAlign:'center',fontWeight:600}}>No Card</span></div>
                      )}
                      <div style={{fontSize:7,fontWeight:900,fontFamily:'monospace',color:acc,textAlign:'center'}}>{code}</div>
                    </div>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',padding:'5px 12px',borderTop:'1px solid #f3f4f6',fontSize:6,color:'#9ca3af',fontWeight:600,background:'#fafafa'}}>
                    <span>{cfg.footerLeft}</span><span style={{fontFamily:'monospace',color:'#374151',fontWeight:900}}>{code}</span>
                  </div>
                </div>
                {!dbCard&&<div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2"><ExclamationTriangleIcon className="w-3.5 h-3.5 flex-shrink-0"/>No card issued yet. Ask your school admin to issue an access card.</div>}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[{label:'Card ID',value:code},{label:'Class',value:child.section_class||'—'},{label:'Email',value:child.email||'—'},{label:'Status',value:statusLabel}].map(d=>(
                    <div key={d.label} className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-2">
                      <p className="text-card-foreground/40 text-[10px] uppercase tracking-wider font-bold">{d.label}</p>
                      <p className="text-card-foreground font-bold mt-0.5 truncate">{d.value}</p>
                    </div>
                  ))}
                </div>
                <button onClick={()=>printChildCard(child)} disabled={!dbCard} title={!dbCard?'Card not issued yet':undefined}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all ${!dbCard?'bg-muted text-muted-foreground cursor-not-allowed':printingId===child.id?'bg-emerald-500 text-white':'bg-primary hover:bg-primary/90 text-white'}`}>
                  {printingId===child.id?<CheckCircleIcon className="w-4 h-4"/>:<PrinterIcon className="w-4 h-4"/>}
                  {printingId===child.id?'Opened!':dbCard?'Print Card':'Not Issued'}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-center text-xs text-card-foreground/30">Card designs are managed by school administrators.</p>
    </div>
  );
}

// ── Main exported page ─────────────────────────────────────────────────────────

export default function MyCardPage() {
  const { profile, loading: authLoading } = useAuth();
  const [cfg, setCfg] = useState<CardConfig>(DEFAULT_CFG);
  const [loading, setLoading] = useState(true);
  const [myCard, setMyCard] = useState<DbCard|null>(null);

  useEffect(() => {
    if (!profile) return;
    const fetchAll = async () => {
      try {
        const roleType = ['student','teacher','admin'].includes(profile.role) ? profile.role : 'student';
        const [settingsRes, cardRes] = await Promise.all([
          fetch(`/api/admin/settings?type=${roleType}`),
          profile.role === 'parent' ? Promise.resolve(null) : fetch('/api/cards/mine'),
        ]);
        const settingsJson = await settingsRes.json();
        if (settingsJson.config) setCfg({ ...DEFAULT_CFG, ...settingsJson.config });
        if (cardRes) {
          const cardJson = await cardRes.json();
          const cards = cardJson.data ?? [];
          setMyCard(cards.find((c: DbCard) => c.status === 'active') ?? cards[0] ?? null);
        }
      } catch {} finally { setLoading(false); }
    };
    fetchAll();
  }, [profile?.id]); // eslint-disable-line

  if (authLoading || loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"/>
    </div>
  );

  if (!profile) return null;

  const canView = ['student','teacher','admin','school','parent'].includes(profile.role);
  if (!canView) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <CreditCardIcon className="w-16 h-16 text-card-foreground/10"/>
      <p className="text-card-foreground/40 font-semibold">Not available</p>
    </div>
  );

  if (profile.role === 'parent') return <ParentCardsView profile={profile} cfg={cfg}/>;
  return <SelfCardView profile={profile} cfg={cfg} myCard={myCard}/>;
}
