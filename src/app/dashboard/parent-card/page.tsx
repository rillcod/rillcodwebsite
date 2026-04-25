// @refresh reset
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  CreditCardIcon, PrinterIcon, ArrowDownTrayIcon, UserGroupIcon,
  UserIcon, EnvelopeIcon, BuildingOfficeIcon, CheckCircleIcon,
  ShieldCheckIcon, InformationCircleIcon,
} from '@/lib/icons';
import { toast } from 'sonner';

type CardConfig = {
  accentColor: string;
  orgName: string;
  orgWebsite: string;
  footerLeft: string;
  cardLabel: string;
  headerStyle: 'band' | 'border' | 'minimal';
};

interface Child {
  id: string;
  full_name: string;
  email: string | null;
  school_name: string | null;
  section_class: string | null;
  role: string;
}

const DEFAULT_CFG: CardConfig = {
  accentColor: '#ea580c',
  orgName: 'RILLCOD TECHNOLOGIES',
  orgWebsite: 'www.rillcod.com',
  footerLeft: 'rillcod.com/login',
  cardLabel: 'ACCESS CARD',
  headerStyle: 'band',
};

function hex2rgb(hex: string) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] as [number, number, number];
}

function MiniCard({ child, cfg }: { child: Child; cfg: CardConfig }) {
  const acc = cfg.accentColor;
  const code = `RC-${child.id.slice(0, 8).toUpperCase()}`;

  return (
    <div className="w-full overflow-hidden shadow-lg" style={{ border: `1px solid #d1d5db`, borderLeft: cfg.headerStyle === 'border' ? `4px solid ${acc}` : `1px solid #d1d5db`, background: '#fff', color: '#111' }}>
      {/* Header */}
      {cfg.headerStyle === 'band' && (
        <div style={{ background: acc, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 22, height: 22, background: 'rgba(255,255,255,0.2)', borderRadius: 3, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 900, color: '#fff', textTransform: 'uppercase' }}>{cfg.orgName}</div>
            <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>{cfg.orgWebsite}</div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.22)', color: '#fff', padding: '3px 8px', fontSize: 7, fontWeight: 900, textTransform: 'uppercase' }}>{cfg.cardLabel}</div>
        </div>
      )}
      {cfg.headerStyle === 'border' && (
        <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ width: 20, height: 20, background: `${acc}20`, borderRadius: 3, flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 9, fontWeight: 900, color: '#111', textTransform: 'uppercase' }}>{cfg.orgName}</div>
          <div style={{ background: acc, color: '#fff', padding: '2px 6px', fontSize: 7, fontWeight: 900, textTransform: 'uppercase' }}>{cfg.cardLabel}</div>
        </div>
      )}
      {cfg.headerStyle === 'minimal' && (
        <div style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: `2px solid ${acc}` }}>
          <div style={{ flex: 1, fontSize: 8, fontWeight: 900, color: '#111', textTransform: 'uppercase' }}>{cfg.orgName}</div>
          <div style={{ fontSize: 7, fontWeight: 900, color: acc, textTransform: 'uppercase' }}>{cfg.cardLabel}</div>
        </div>
      )}

      {/* Body */}
      <div style={{ display: 'flex', minHeight: 110 }}>
        <div style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, borderRight: '1px solid #f3f4f6' }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#111', textTransform: 'uppercase', lineHeight: 1.2 }}>{child.full_name}</div>
          <div style={{ fontSize: 8, fontWeight: 700, color: acc, textTransform: 'uppercase', letterSpacing: 1 }}>Student</div>
          <div style={{ height: 1, background: '#f3f4f6', margin: '2px 0' }} />
          {child.school_name && (
            <div>
              <div style={{ fontSize: 6, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>School</div>
              <div style={{ fontSize: 9, fontWeight: 800, fontFamily: 'monospace', color: acc }}>{child.school_name}</div>
            </div>
          )}
          {child.section_class && (
            <div>
              <div style={{ fontSize: 6, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>Class</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#111' }}>{child.section_class}</div>
            </div>
          )}
          <div>
            <div style={{ fontSize: 6, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>Card ID</div>
            <div style={{ fontSize: 9, fontWeight: 800, fontFamily: 'monospace', color: acc }}>{code}</div>
          </div>
        </div>
        <div style={{ width: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '10px 8px', background: '#fafafa', flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(`https://rillcod.com/verify/${child.id}`)}`}
            alt="QR Code"
            style={{ width: 70, height: 70, border: '1px solid #e5e7eb' }}
          />
          <div style={{ fontSize: 6, color: '#9ca3af', textTransform: 'uppercase', textAlign: 'center', fontWeight: 600 }}>Scan to verify</div>
          <div style={{ fontSize: 7, fontWeight: 900, fontFamily: 'monospace', color: acc, textAlign: 'center' }}>{code}</div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 12px', borderTop: '1px solid #f3f4f6', fontSize: 6, color: '#9ca3af', fontWeight: 600, background: '#fafafa' }}>
        <span>{cfg.footerLeft}</span>
        <span style={{ fontFamily: 'monospace', color: '#374151', fontWeight: 900 }}>{code}</span>
      </div>
    </div>
  );
}

export default function ParentCardPage() {
  const { profile, loading: authLoading } = useAuth();
  const [cfg, setCfg] = useState<CardConfig>(DEFAULT_CFG);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [printingId, setPrintingId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile || profile.role !== 'parent') return;

    Promise.all([
      fetch('/api/admin/settings').then(r => r.json()),
      fetch('/api/parents/portal?section=children').then(r => r.json()),
    ]).then(([cfgJson, childrenJson]) => {
      if (cfgJson.config) setCfg({ ...DEFAULT_CFG, ...cfgJson.config });
      // portal returns children from students table linked by parent_email
      const kids: Child[] = (childrenJson.children ?? []).map((c: any) => ({
        id: c.id,
        full_name: c.full_name || 'Unknown',
        email: c.email ?? null,
        school_name: c.school_name ?? null,
        section_class: c.section_class ?? c.current_class ?? c.section ?? null,
        role: 'student',
      }));
      setChildren(kids);
    }).catch(() => {
      toast.error('Failed to load card data');
    }).finally(() => setLoading(false));
  }, [profile]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile || profile.role !== 'parent') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldCheckIcon className="w-16 h-16 text-rose-500/40" />
        <p className="text-card-foreground/50 text-lg font-semibold">Parent access required</p>
      </div>
    );
  }

  const printCard = (child: Child) => {
    const acc = cfg.accentColor;
    const code = `RC-${child.id.slice(0, 8).toUpperCase()}`;
    const logo = `${window.location.origin}/images/logo.png`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${window.location.origin}/verify/${child.id}`)}`;
    const hdrBand = `<div class="chdr"><img src="${logo}" class="logo" /><div><div class="org">${cfg.orgName}</div><div class="web">${cfg.orgWebsite}</div></div><div class="cbadge">${cfg.cardLabel}</div></div>`;
    const hdrBorder = `<div class="bhdr"><img src="${logo}" class="logo" /><div><div class="org-b">${cfg.orgName}</div><div class="web-b">${cfg.orgWebsite}</div></div><div class="bbadge">${cfg.cardLabel}</div></div>`;
    const hdrMin = `<div class="mhdr"><img src="${logo}" class="logo" /><div class="org-m">${cfg.orgName}</div><div class="mbadge">${cfg.cardLabel}</div></div>`;
    const hdr = cfg.headerStyle === 'band' ? hdrBand : cfg.headerStyle === 'border' ? hdrBorder : hdrMin;

    const html = `<!doctype html><html><head><title>${child.full_name} — Access Card</title>
    <style>
      @page { size: A4 portrait; margin: 20mm; }
      * { box-sizing:border-box; margin:0; padding:0; }
      body { font-family:'Inter','Segoe UI',system-ui,sans-serif; background:#fff; display:flex; flex-direction:column; align-items:center; gap:10mm; }
      .card { border:1px solid #d1d5db; ${cfg.headerStyle === 'border' ? `border-left:4px solid ${acc};` : ''} width:100%; max-width:480px; display:flex; flex-direction:column; }
      .chdr { background:${acc}; padding:12px 18px; display:flex; align-items:center; gap:10px; }
      .cbadge { margin-left:auto; background:rgba(0,0,0,0.22); color:#fff; padding:5px 12px; font-size:9px; font-weight:900; text-transform:uppercase; }
      .org { font-size:13px; font-weight:900; color:#fff; text-transform:uppercase; }
      .web { font-size:9px; color:rgba(255,255,255,0.8); font-weight:700; margin-top:2px; }
      .bhdr { display:flex; align-items:center; gap:10px; padding:10px 16px; border-bottom:1px solid #f3f4f6; }
      .org-b { font-size:12px; font-weight:900; color:#111; text-transform:uppercase; }
      .web-b { font-size:8px; color:${acc}; font-weight:700; margin-top:2px; }
      .bbadge { margin-left:auto; background:${acc}; color:#fff; padding:4px 10px; font-size:9px; font-weight:900; text-transform:uppercase; }
      .mhdr { display:flex; align-items:center; gap:10px; padding:9px 16px; border-bottom:2px solid ${acc}; }
      .org-m { flex:1; font-size:11px; font-weight:900; color:#111; text-transform:uppercase; }
      .mbadge { font-size:9px; font-weight:900; color:${acc}; text-transform:uppercase; }
      .logo { width:30px; height:30px; object-fit:contain; flex-shrink:0; }
      .cbody { display:flex; min-height:160px; }
      .info { flex:1; padding:16px 18px; display:flex; flex-direction:column; gap:7px; border-right:1px solid #f3f4f6; }
      .sname { font-size:20px; font-weight:900; color:#111; text-transform:uppercase; line-height:1.2; }
      .srole { font-size:10px; font-weight:700; color:${acc}; text-transform:uppercase; letter-spacing:1px; }
      .sep { height:1px; background:#f3f4f6; margin:3px 0; }
      .field { display:flex; flex-direction:column; gap:2px; }
      .lbl { font-size:7px; font-weight:700; color:#9ca3af; text-transform:uppercase; letter-spacing:1px; }
      .val { font-size:11px; font-weight:700; color:#111; }
      .val-a { font-size:11px; font-weight:800; font-family:monospace; color:${acc}; }
      .qrp { width:150px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; padding:16px 14px; background:#fafafa; flex-shrink:0; }
      .qr { width:110px; height:110px; border:1px solid #e5e7eb; }
      .qrl { font-size:7px; color:#9ca3af; text-transform:uppercase; text-align:center; font-weight:600; }
      .qrc { font-size:8px; font-weight:900; font-family:monospace; color:${acc}; text-align:center; }
      .cftr { display:flex; justify-content:space-between; padding:7px 16px; border-top:1px solid #f3f4f6; font-size:7px; color:#9ca3af; font-weight:600; background:#fafafa; }
      .cftr-id { font-family:monospace; color:#374151; font-weight:900; }
      .note { font-size:9px; color:#6b7280; text-align:center; }
      @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
    </style></head><body>
    <div class="card">
      ${hdr}
      <div class="cbody">
        <div class="info">
          <div class="sname">${child.full_name}</div>
          <div class="srole">Student</div>
          <div class="sep"></div>
          ${child.school_name ? `<div class="field"><div class="lbl">School</div><div class="val-a">${child.school_name}</div></div>` : ''}
          ${child.section_class ? `<div class="field"><div class="lbl">Class</div><div class="val">${child.section_class}</div></div>` : ''}
          ${child.email ? `<div class="field"><div class="lbl">Email</div><div class="val">${child.email}</div></div>` : ''}
          <div class="field"><div class="lbl">Student ID</div><div class="val-a">${code}</div></div>
        </div>
        <div class="qrp">
          <img src="${qrUrl}" class="qr" crossorigin="anonymous" />
          <div class="qrl">Scan to verify</div>
          <div class="qrc">${code}</div>
        </div>
      </div>
      <div class="cftr"><span>${cfg.footerLeft}</span><span class="cftr-id">${code}</span></div>
    </div>
    <div class="note">This card was printed for parent/guardian use. Please keep this card safe.</div>
    <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); }</script>
    </body></html>`;

    const win = window.open('', '_blank');
    if (!win) { toast.error('Pop-up blocked. Please allow pop-ups.'); return; }
    win.document.write(html);
    win.document.close();
    setPrintingId(child.id);
    setTimeout(() => setPrintingId(null), 3000);
  };

  const printAllCards = () => {
    if (!children.length) { toast.error('No children linked to your account'); return; }
    const acc = cfg.accentColor;
    const logo = `${window.location.origin}/images/logo.png`;

    const cardHtml = (child: Child) => {
      const code = `RC-${child.id.slice(0, 8).toUpperCase()}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(`${window.location.origin}/verify/${child.id}`)}`;
      const hdrClass = cfg.headerStyle === 'border' ? 'hdr-border' : cfg.headerStyle === 'minimal' ? 'hdr-min' : 'hdr-band';
      return `<div class="card">
        <div class="${hdrClass}">
          <img class="logo" src="${logo}" />
          <div><div class="org">${cfg.orgName}</div><div class="web">${cfg.orgWebsite}</div></div>
          ${cfg.headerStyle === 'band' ? `<div class="cbadge">${cfg.cardLabel}</div>` : `<div class="bbadge">${cfg.cardLabel}</div>`}
        </div>
        <div class="body">
          <div class="left">
            ${child.school_name ? `<div class="school">${child.school_name}</div>` : ''}
            <div class="name">${child.full_name}</div>
            <div class="row"><div class="lbl">Role</div><div class="val">Student</div></div>
            ${child.email ? `<div class="row"><div class="lbl">Email</div><div class="val">${child.email}</div></div>` : ''}
            ${child.section_class ? `<div class="row"><div class="lbl">Class</div><div class="val">${child.section_class}</div></div>` : ''}
            <div class="badge">${code}</div>
          </div>
          <div class="right">
            <img class="qr" src="${qrUrl}" />
            <div class="code">${code}</div>
          </div>
        </div>
        <div class="ftr"><span>${cfg.footerLeft}</span><span>${cfg.cardLabel}</span></div>
      </div>`;
    };

    const html = `<!doctype html><html><head><title>Children Access Cards</title>
    <style>
      @page { size: A4 portrait; margin: 8mm; }
      * { box-sizing:border-box; }
      body { margin:0; font-family:Inter,system-ui,sans-serif; color:#111827; background:#fff; }
      .grid { display:grid; grid-template-columns:repeat(2, 1fr); gap:8mm; }
      .card { width:100%; min-height:62mm; border:1px solid #e5e7eb; display:flex; flex-direction:column; overflow:hidden; }
      .hdr-band { background:${acc}; color:#fff; padding:2.2mm 3mm; display:flex; align-items:center; gap:2mm; }
      .hdr-border { border-left:2.5mm solid ${acc}; padding:2.2mm 3mm; display:flex; align-items:center; gap:2mm; }
      .hdr-min { border-bottom:1px solid #e5e7eb; padding:2.2mm 3mm; display:flex; align-items:center; gap:2mm; }
      .logo { width:5mm; height:5mm; object-fit:contain; }
      .org { font-weight:900; font-size:2.5mm; text-transform:uppercase; line-height:1; }
      .web { font-size:1.8mm; opacity:.8; margin-top:.5mm; }
      .cbadge,.bbadge { margin-left:auto; background:rgba(0,0,0,0.22); color:#fff; padding:.5mm 1.5mm; font-size:1.6mm; font-weight:900; text-transform:uppercase; }
      .body { display:flex; flex:1; }
      .left { flex:1; padding:2.5mm 3mm; border-right:1px solid #f3f4f6; }
      .school { color:${acc}; font-size:1.8mm; font-weight:900; text-transform:uppercase; }
      .name { font-size:4mm; font-weight:900; margin:.8mm 0 1.2mm; text-transform:uppercase; line-height:1.2; }
      .row { margin:.8mm 0; }
      .lbl { color:#9ca3af; font-size:1.6mm; text-transform:uppercase; letter-spacing:.15mm; }
      .val { font-size:2.2mm; font-weight:700; }
      .badge { display:inline-block; background:${acc}15; border:1px solid ${acc}40; color:${acc}; font-size:1.7mm; font-weight:800; padding:.6mm 1.4mm; margin-top:1mm; font-family:monospace; }
      .right { width:23mm; background:#fafafa; padding:2mm; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:1mm; }
      .qr { width:16mm; height:16mm; border:1px solid #e5e7eb; }
      .code { color:${acc}; font-size:1.6mm; font-family:monospace; font-weight:900; text-align:center; }
      .ftr { border-top:1px solid #f3f4f6; background:#fafafa; color:#6b7280; display:flex; justify-content:space-between; padding:1.3mm 3mm; font-size:1.6mm; }
      @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
    </style></head><body>
    <div class="grid">${children.map(c => cardHtml(c)).join('')}</div>
    <script>window.onload=()=>{window.print(); setTimeout(()=>window.close(), 500);};</script>
    </body></html>`;

    const win = window.open('', '_blank');
    if (!win) { toast.error('Pop-up blocked. Please allow pop-ups.'); return; }
    win.document.write(html);
    win.document.close();
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 border border-primary/25 flex items-center justify-center flex-shrink-0">
            <CreditCardIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-card-foreground">Children's Access Cards</h1>
            <p className="text-card-foreground/50 text-sm mt-0.5">
              {children.length} {children.length === 1 ? 'child' : 'children'} linked to your account
            </p>
          </div>
        </div>
        {children.length > 1 && (
          <button onClick={printAllCards}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white font-bold text-sm rounded-xl transition-all">
            <PrinterIcon className="w-4 h-4" /> Print All Cards
          </button>
        )}
      </div>

      {/* Info */}
      <div className="flex items-start gap-3 bg-primary/[0.07] border border-primary/20 rounded-xl p-4 text-sm">
        <InformationCircleIcon className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <p className="text-primary/60">
          These access cards are for your children's use at school. Print and laminate each card so they can present it to school staff for identity verification.
        </p>
      </div>

      {/* Children cards */}
      {children.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <UserGroupIcon className="w-16 h-16 text-card-foreground/10" />
          <p className="text-card-foreground/40 font-semibold">No children linked to your account</p>
          <p className="text-card-foreground/30 text-sm text-center max-w-sm">
            Contact your school administrator to link your children's accounts to your parent profile.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {children.map(child => {
            const code = `RC-${child.id.slice(0, 8).toUpperCase()}`;
            return (
              <div key={child.id} className="bg-card border border-white/[0.08] rounded-2xl p-5 space-y-4">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-card-foreground text-base">{child.full_name}</p>
                    <p className="text-card-foreground/40 text-xs mt-0.5">{child.school_name || 'Rillcod Academy'}</p>
                  </div>
                  <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold px-2 py-0.5 rounded-full">
                    Student
                  </span>
                </div>

                {/* Card preview */}
                <MiniCard child={child} cfg={cfg} />

                {/* Details */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { label: 'Card ID', value: code },
                    { label: 'Class', value: child.section_class || '—' },
                    { label: 'Email', value: child.email || '—' },
                    { label: 'Status', value: 'Valid' },
                  ].map(d => (
                    <div key={d.label} className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-2">
                      <p className="text-card-foreground/40 text-[10px] uppercase tracking-wider font-bold">{d.label}</p>
                      <p className="text-card-foreground font-bold mt-0.5 truncate">{d.value}</p>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => printCard(child)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all ${printingId === child.id ? 'bg-emerald-500 text-white' : 'bg-primary hover:bg-primary/90 text-white'}`}>
                    {printingId === child.id ? <CheckCircleIcon className="w-4 h-4" /> : <PrinterIcon className="w-4 h-4" />}
                    {printingId === child.id ? 'Opened!' : 'Print Card'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-card-foreground/30">
        Card designs are managed by school administrators. Contact your school if details are incorrect.
      </p>
    </div>
  );
}
