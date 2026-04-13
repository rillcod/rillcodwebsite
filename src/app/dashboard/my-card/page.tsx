// @refresh reset
'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  CreditCardIcon, PrinterIcon, ArrowDownTrayIcon,
  UserIcon, EnvelopeIcon, BuildingOfficeIcon,
  AcademicCapIcon, CheckCircleIcon, InformationCircleIcon,
} from '@/lib/icons';

type CardConfig = {
  accentColor: string;
  orgName: string;
  orgWebsite: string;
  footerLeft: string;
  footerRight: string;
  cardLabel: string;
  headerStyle: 'band' | 'border' | 'minimal';
};

const DEFAULT_CFG: CardConfig = {
  accentColor: '#ea580c',
  orgName: 'RILLCOD TECHNOLOGIES',
  orgWebsite: 'www.rillcod.com',
  footerLeft: 'rillcod.com/login',
  footerRight: 'Student ID',
  cardLabel: 'ACCESS CARD',
  headerStyle: 'band',
};

function hex2rgb(hex: string) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] as [number, number, number];
}

export default function MyCardPage() {
  const { profile, loading: authLoading } = useAuth();
  const [cfg, setCfg] = useState<CardConfig>(DEFAULT_CFG);
  const [loading, setLoading] = useState(true);
  const [printed, setPrinted] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(j => {
        if (j.config) setCfg({ ...DEFAULT_CFG, ...j.config });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) return null;

  // Students and staff can view their card
  const canView = ['student', 'teacher', 'admin', 'school', 'parent'].includes(profile.role);
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <CreditCardIcon className="w-16 h-16 text-card-foreground/10" />
        <p className="text-card-foreground/40 font-semibold">Not available</p>
      </div>
    );
  }

  const acc = cfg.accentColor;
  const [r, g, b] = hex2rgb(acc);
  const code = `RC-${profile.id.slice(0, 8).toUpperCase()}`;
  const roleLabel = profile.role === 'student' ? 'Student'
    : profile.role === 'teacher' ? 'Teacher'
    : profile.role === 'admin' ? 'Administrator'
    : profile.role === 'school' ? 'School Partner'
    : 'Parent';
  const verifyUrl = `${typeof window !== 'undefined' ? window.location.origin : 'https://rillcod.com'}/verify/${profile.id}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(verifyUrl)}`;

  const buildPrintHtml = () => {
    const logo = `${window.location.origin}/images/logo.png`;
    const hdrBand = `<div class="chdr"><img src="${logo}" class="logo" /><div><div class="org">${cfg.orgName}</div><div class="web">${cfg.orgWebsite}</div></div><div class="cbadge">${cfg.cardLabel}</div></div>`;
    const hdrBorder = `<div class="bhdr"><img src="${logo}" class="logo" /><div><div class="org-b">${cfg.orgName}</div><div class="web-b">${cfg.orgWebsite}</div></div><div class="bbadge">${cfg.cardLabel}</div></div>`;
    const hdrMin = `<div class="mhdr"><img src="${logo}" class="logo" /><div class="org-m">${cfg.orgName}</div><div class="mbadge">${cfg.cardLabel}</div></div>`;
    const hdr = cfg.headerStyle === 'band' ? hdrBand : cfg.headerStyle === 'border' ? hdrBorder : hdrMin;

    return `<!doctype html><html><head><title>My Access Card — ${profile.full_name}</title>
    <style>
      @page { size: A4 portrait; margin: 20mm; }
      * { box-sizing:border-box; margin:0; padding:0; }
      body { font-family:'Inter','Segoe UI',system-ui,sans-serif; background:#fff; display:flex; flex-direction:column; align-items:center; gap:12mm; }
      .card { border:1px solid #d1d5db; ${cfg.headerStyle === 'border' ? `border-left:4px solid ${acc};` : ''} width:100%; max-width:480px; display:flex; flex-direction:column; overflow:hidden; }
      .chdr { background:${acc}; padding:12px 18px; display:flex; align-items:center; gap:10px; }
      .cbadge { margin-left:auto; background:rgba(0,0,0,0.22); color:#fff; padding:5px 12px; font-size:9px; font-weight:900; text-transform:uppercase; letter-spacing:1px; flex-shrink:0; }
      .org { font-size:14px; font-weight:900; color:#fff; text-transform:uppercase; line-height:1; }
      .web { font-size:9px; color:rgba(255,255,255,0.8); font-weight:700; margin-top:3px; }
      .bhdr { display:flex; align-items:center; gap:10px; padding:10px 16px; border-bottom:1px solid #f3f4f6; }
      .org-b { font-size:13px; font-weight:900; color:#111; text-transform:uppercase; line-height:1; }
      .web-b { font-size:8px; color:${acc}; font-weight:700; margin-top:2px; }
      .bbadge { margin-left:auto; background:${acc}; color:#fff; padding:4px 10px; font-size:9px; font-weight:900; text-transform:uppercase; flex-shrink:0; }
      .mhdr { display:flex; align-items:center; gap:10px; padding:9px 16px; border-bottom:2px solid ${acc}; }
      .org-m { font-size:11px; font-weight:900; color:#111; text-transform:uppercase; flex:1; }
      .mbadge { font-size:9px; font-weight:900; color:${acc}; text-transform:uppercase; }
      .logo { width:32px; height:32px; object-fit:contain; flex-shrink:0; }
      .cbody { display:flex; min-height:160px; }
      .info { flex:1; padding:18px 20px; display:flex; flex-direction:column; gap:8px; border-right:1px solid #f3f4f6; overflow:hidden; }
      .sname { font-size:22px; font-weight:900; color:#111; text-transform:uppercase; line-height:1.15; }
      .srole { font-size:11px; font-weight:700; color:${acc}; text-transform:uppercase; letter-spacing:1px; margin-top:2px; }
      .sep { height:1px; background:#f3f4f6; margin:4px 0; }
      .field { display:flex; flex-direction:column; gap:2px; }
      .lbl { font-size:7.5px; font-weight:700; color:#9ca3af; text-transform:uppercase; letter-spacing:1px; }
      .val { font-size:12px; font-weight:700; color:#111; word-break:break-all; }
      .val-a { font-size:12px; font-weight:800; font-family:monospace; color:${acc}; }
      .qrp { width:160px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; padding:18px 16px; background:#fafafa; flex-shrink:0; }
      .qr { width:120px; height:120px; border:1px solid #e5e7eb; display:block; }
      .qrl { font-size:7px; color:#9ca3af; text-transform:uppercase; letter-spacing:1px; text-align:center; font-weight:600; }
      .qrc { font-size:9px; font-weight:900; font-family:monospace; color:${acc}; text-align:center; }
      .cftr { display:flex; justify-content:space-between; align-items:center; padding:8px 18px; border-top:1px solid #f3f4f6; font-size:7.5px; color:#9ca3af; font-weight:600; background:#fafafa; }
      .cftr-id { font-family:monospace; color:#374151; font-weight:900; font-size:8px; }
      .note { font-size:9px; color:#6b7280; text-align:center; border-top:1px dashed #e5e7eb; padding-top:8mm; }
      @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
    </style></head><body>
    <div class="card">
      ${hdr}
      <div class="cbody">
        <div class="info">
          <div class="sname">${profile.full_name}</div>
          <div class="srole">${roleLabel}</div>
          <div class="sep"></div>
          ${profile.school_name ? `<div class="field"><div class="lbl">School</div><div class="val-a">${profile.school_name}</div></div>` : ''}
          <div class="field"><div class="lbl">Email</div><div class="val">${profile.email || '—'}</div></div>
          <div class="field"><div class="lbl">Student ID</div><div class="val-a">${code}</div></div>
        </div>
        <div class="qrp">
          <img src="${qrUrl}" class="qr" crossorigin="anonymous" />
          <div class="qrl">Scan to verify</div>
          <div class="qrc">${code}</div>
        </div>
      </div>
      <div class="cftr">
        <span>${cfg.footerLeft}</span>
        <span class="cftr-id">${code}</span>
      </div>
    </div>
    <div class="note">This card is valid as issued. Present to school staff for identity verification.</div>
    <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); }</script>
    </body></html>`;
  };

  const handlePrint = () => {
    const win = window.open('', '_blank');
    if (!win) { alert('Pop-up blocked. Please allow pop-ups to print.'); return; }
    win.document.write(buildPrintHtml());
    win.document.close();
    setPrinted(true);
    setTimeout(() => setPrinted(false), 3000);
  };

  const handleDownloadPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const cardW = 140, cardX = (210 - cardW) / 2, cardY = 30;

    doc.setDrawColor(209, 213, 219); doc.setLineWidth(0.3);
    doc.rect(cardX, cardY, cardW, 80);

    if (cfg.headerStyle === 'band') {
      doc.setFillColor(r, g, b);
      doc.rect(cardX, cardY, cardW, 12, 'F');
      doc.setFontSize(9); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
      doc.text(cfg.orgName, cardX + 5, cardY + 5.5);
      doc.setFontSize(6); doc.setFont('helvetica', 'normal');
      doc.text(cfg.orgWebsite, cardX + 5, cardY + 9);
      doc.setFillColor(0, 0, 0);
      const bw = cfg.cardLabel.length * 2.2 + 6;
      doc.rect(cardX + cardW - bw - 2, cardY + 3, bw, 6, 'F');
      doc.setFontSize(5.5); doc.setTextColor(255, 255, 255);
      doc.text(cfg.cardLabel, cardX + cardW - bw / 2 - 2, cardY + 7.2, { align: 'center' });
    } else {
      doc.setFillColor(r, g, b);
      doc.rect(cardX, cardY, 2, 80, 'F');
      doc.setFontSize(9); doc.setTextColor(17, 24, 39); doc.setFont('helvetica', 'bold');
      doc.text(cfg.orgName, cardX + 5, cardY + 7);
      doc.setFontSize(6); doc.setTextColor(r, g, b); doc.setFont('helvetica', 'normal');
      doc.text(cfg.orgWebsite, cardX + 5, cardY + 11);
    }

    const bodyY = cardY + (cfg.headerStyle === 'band' ? 16 : 15);

    doc.setFontSize(12); doc.setTextColor(17, 24, 39); doc.setFont('helvetica', 'bold');
    doc.text(profile.full_name.toUpperCase(), cardX + 4, bodyY + 6);
    doc.setFontSize(6); doc.setTextColor(r, g, b);
    doc.text(roleLabel.toUpperCase(), cardX + 4, bodyY + 10);

    doc.setDrawColor(243, 244, 246); doc.setLineWidth(0.2);
    doc.line(cardX + 4, bodyY + 13, cardX + cardW - 35, bodyY + 13);

    let fy = bodyY + 18;
    const fields = [
      { label: 'SCHOOL', value: profile.school_name || 'Rillcod Academy', accent: true },
      { label: 'EMAIL', value: profile.email || '—', accent: false },
      { label: 'STUDENT ID', value: code, accent: true },
    ];
    fields.forEach(f => {
      doc.setFontSize(5.5); doc.setTextColor(156, 163, 175); doc.setFont('helvetica', 'normal');
      doc.text(f.label, cardX + 4, fy);
      doc.setFontSize(7.5); doc.setFont('courier', 'bold');
      if (f.accent) doc.setTextColor(r, g, b);
      else doc.setTextColor(17, 24, 39);
      doc.text(doc.splitTextToSize(f.value, cardW - 40)[0], cardX + 4, fy + 4.5);
      fy += 11;
    });

    const ftrY = cardY + 75;
    doc.setDrawColor(243, 244, 246); doc.setLineWidth(0.2);
    doc.line(cardX + 2, ftrY, cardX + cardW - 2, ftrY);
    doc.setFontSize(6); doc.setTextColor(156, 163, 175); doc.setFont('helvetica', 'normal');
    doc.text(cfg.footerLeft, cardX + 4, ftrY + 4);
    doc.setTextColor(55, 65, 81); doc.setFont('courier', 'bold');
    doc.text(code, cardX + cardW - 4, ftrY + 4, { align: 'right' });

    doc.save(`${profile.full_name.replace(/\s+/g, '_')}_access_card.pdf`);
  };

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-orange-500/10 border border-orange-500/25 flex items-center justify-center flex-shrink-0">
          <CreditCardIcon className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-card-foreground">My Access Card</h1>
          <p className="text-card-foreground/50 text-sm mt-0.5">Your official Rillcod Academy identity card</p>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-orange-500/[0.07] border border-orange-500/20 rounded-xl p-4 text-sm">
        <InformationCircleIcon className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
        <p className="text-orange-300/80">
          Present this card to school staff for identity verification. The QR code links to your profile verification page.
        </p>
      </div>

      {/* Card Preview */}
      <div className="bg-card border border-white/[0.08] rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <span className="text-xs font-black uppercase tracking-widest text-card-foreground/40">Card Preview</span>
        </div>

        {/* Visual card */}
        <div
          ref={cardRef}
          className="w-full max-w-md mx-auto overflow-hidden shadow-2xl"
          style={{ border: `1px solid #d1d5db`, borderLeft: cfg.headerStyle === 'border' ? `4px solid ${acc}` : `1px solid #d1d5db`, background: '#fff', color: '#111' }}
        >
          {/* Header */}
          {cfg.headerStyle === 'band' && (
            <div style={{ background: acc, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, background: 'rgba(255,255,255,0.2)', borderRadius: 4, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: '#fff', textTransform: 'uppercase', lineHeight: 1 }}>{cfg.orgName}</div>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.8)', fontWeight: 700, marginTop: 2 }}>{cfg.orgWebsite}</div>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.22)', color: '#fff', padding: '4px 10px', fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>{cfg.cardLabel}</div>
            </div>
          )}
          {cfg.headerStyle === 'border' && (
            <div style={{ padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ width: 26, height: 26, background: `${acc}20`, borderRadius: 4, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: '#111', textTransform: 'uppercase' }}>{cfg.orgName}</div>
                <div style={{ fontSize: 8, color: acc, fontWeight: 700, marginTop: 2 }}>{cfg.orgWebsite}</div>
              </div>
              <div style={{ background: acc, color: '#fff', padding: '3px 8px', fontSize: 8, fontWeight: 900, textTransform: 'uppercase' }}>{cfg.cardLabel}</div>
            </div>
          )}
          {cfg.headerStyle === 'minimal' && (
            <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `2px solid ${acc}` }}>
              <div style={{ width: 24, height: 24, background: `${acc}20`, borderRadius: 3, flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 10, fontWeight: 900, color: '#111', textTransform: 'uppercase' }}>{cfg.orgName}</div>
              <div style={{ fontSize: 8, fontWeight: 900, color: acc, textTransform: 'uppercase' }}>{cfg.cardLabel}</div>
            </div>
          )}

          {/* Body */}
          <div style={{ display: 'flex', minHeight: 140 }}>
            <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, borderRight: '1px solid #f3f4f6', overflow: 'hidden' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#111', textTransform: 'uppercase', lineHeight: 1.2 }}>{profile.full_name}</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: acc, textTransform: 'uppercase', letterSpacing: 1 }}>{roleLabel}</div>
              <div style={{ height: 1, background: '#f3f4f6', margin: '2px 0' }} />
              {profile.school_name && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <div style={{ fontSize: 7, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>School</div>
                  <div style={{ fontSize: 11, fontWeight: 800, fontFamily: 'monospace', color: acc }}>{profile.school_name}</div>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <div style={{ fontSize: 7, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>Email</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#111', wordBreak: 'break-all' }}>{profile.email || '—'}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <div style={{ fontSize: 7, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>Student ID</div>
                <div style={{ fontSize: 11, fontWeight: 800, fontFamily: 'monospace', color: acc }}>{code}</div>
              </div>
            </div>
            <div style={{ width: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '14px 12px', background: '#fafafa', flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl} alt="QR Code" style={{ width: 90, height: 90, border: '1px solid #e5e7eb', display: 'block' }} />
              <div style={{ fontSize: 7, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', fontWeight: 600 }}>Scan to verify</div>
              <div style={{ fontSize: 8, fontWeight: 900, fontFamily: 'monospace', color: acc, textAlign: 'center' }}>{code}</div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 14px', borderTop: '1px solid #f3f4f6', fontSize: 7, color: '#9ca3af', fontWeight: 600, background: '#fafafa' }}>
            <span>{cfg.footerLeft}</span>
            <span style={{ fontFamily: 'monospace', color: '#374151', fontWeight: 900, fontSize: 8 }}>{code}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button onClick={handlePrint}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${printed ? 'bg-emerald-500 text-white' : 'bg-orange-500 hover:bg-orange-400 text-white'}`}>
            {printed ? <CheckCircleIcon className="w-4 h-4" /> : <PrinterIcon className="w-4 h-4" />}
            {printed ? 'Print dialog opened!' : 'Print Card'}
          </button>
          <button onClick={handleDownloadPDF}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold text-sm text-card-foreground/70 transition-all">
            <ArrowDownTrayIcon className="w-4 h-4" />
            Download PDF
          </button>
        </div>
      </div>

      {/* Card details */}
      <div className="bg-card border border-white/[0.08] rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-black text-card-foreground/60 uppercase tracking-wider">Card Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { icon: UserIcon, label: 'Full Name', value: profile.full_name },
            { icon: EnvelopeIcon, label: 'Email', value: profile.email || '—' },
            { icon: BuildingOfficeIcon, label: 'School', value: profile.school_name || 'Rillcod Academy' },
            { icon: AcademicCapIcon, label: 'Role', value: roleLabel },
            { icon: CreditCardIcon, label: 'Card ID', value: code },
            { icon: CreditCardIcon, label: 'Card Status', value: 'Valid & Active' },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-start gap-3 bg-white/[0.02] border border-white/[0.06] rounded-xl p-3">
              <Icon className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-bold text-card-foreground/40 uppercase tracking-wider">{label}</p>
                <p className="text-sm font-bold text-card-foreground mt-0.5">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-card-foreground/30">
        Card design is managed by your school administrator. Contact support if your details are incorrect.
      </p>
    </div>
  );
}
