// Shared card print utilities — single source of truth for card config + HTML generation.
// Used by: students/page, students/bulk-register, students/card-builder, identity-cards.

import { accessCardCodeForStudent } from '@/lib/access-card-code';
import { qrDataUrl, qrDataUrls } from '@/lib/cards/qr';

export interface CardFieldConfig {
  key: string;
  visible: boolean;
  label?: string;
}

export interface CardTypoStyle {
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  fontFamily?: string;
}

export interface CardConfig {
  accentColor: string;
  headerStyle: 'band' | 'border' | 'minimal';
  orgName: string;
  orgWebsite: string;
  cardLabel: string;
  footerLeft: string;
  footerRight: string;
  bgColor?: string;
  showLogo?: boolean;
  showPhotoSlot?: boolean;
  cornerRadius?: 'sharp' | 'rounded' | 'pill';
  /** CR80 dimensions from Card Studio (e.g. '54mm' × '85.6mm'). */
  width?: string;
  height?: string;
  /** Typography from the Card Studio design tab — colors are applied to prints. */
  typo?: Record<string, CardTypoStyle>;
  fields: CardFieldConfig[];
}

/** Color chosen in the Card Studio typography panel, with a safe fallback. */
export function typoColor(cfg: CardConfig, key: string, fallback: string): string {
  return cfg.typo?.[key]?.color || fallback;
}

export function cardRadiusPx(cfg: CardConfig): number {
  return cfg.cornerRadius === 'pill' ? 24 : cfg.cornerRadius === 'rounded' ? 12 : 0;
}

export interface CardHolder {
  id: string;
  full_name: string;
  email?: string | null;
  school_name?: string | null;
  section_class?: string | null;
  card_number?: string | null;
  expires_at?: string | null;
  verification_code?: string | null;
  avatar_url?: string | null;
  /** Actual temp password to print (login slips); omitted → "Set on first login". */
  temp_password?: string | null;
  /** e.g. Student / Teacher / Parent — shown under the name when provided. */
  role_label?: string | null;
  /** Small accent badge (e.g. "3 children", class name) for manage prints. */
  badge?: string | null;
}

const FALLBACK_CONFIG: CardConfig = {
  accentColor: '#1A3A8F',
  headerStyle: 'band',
  orgName: 'RILLCOD TECHNOLOGIES',
  orgWebsite: 'www.rillcod.com',
  cardLabel: 'Student Access Card',
  footerLeft: 'rillcod.com/login',
  footerRight: 'Student ID',
  bgColor: '#ffffff',
  showLogo: true,
  fields: [],
};

export async function fetchCardConfig(type = 'student'): Promise<CardConfig> {
  try {
    const res = await fetch(`/api/admin/settings?type=${type}`, { cache: 'no-store' });
    if (!res.ok) return FALLBACK_CONFIG;
    const data = await res.json();
    return data.config ? { ...FALLBACK_CONFIG, ...data.config } : FALLBACK_CONFIG;
  } catch {
    return FALLBACK_CONFIG;
  }
}

export function fieldVisible(cfg: CardConfig, key: string): boolean {
  if (!cfg.fields || cfg.fields.length === 0) return true;
  return cfg.fields.find(f => f.key === key)?.visible ?? false;
}

export function fieldLabel(cfg: CardConfig, key: string, fallback: string): string {
  return cfg.fields.find(f => f.key === key)?.label || fallback;
}

export function holderCode(id: string): string {
  return accessCardCodeForStudent(id);
}

// Builds print HTML for a single card (opens in a new window and prints).
// Async: QR codes are generated locally as data URLs (offline-safe).
export async function buildSingleCardHtml(
  holder: CardHolder,
  cfg: CardConfig,
  originUrl: string,
): Promise<string> {
  const acc = cfg.accentColor;
  const hs = cfg.headerStyle;
  const fv = (k: string) => fieldVisible(cfg, k);
  const fl = (k: string, fb: string) => fieldLabel(cfg, k, fb);
  const tc = (k: string, fb: string) => typoColor(cfg, k, fb);

  const code = holder.card_number || holderCode(holder.id);
  // ID cards resolve on the single result surface (/result-check), which accepts the
  // card verification_code as well as the RC- access code.
  const verifyCode = holder.verification_code || holderCode(holder.id);
  const qrData = `${originUrl}/result-check/${verifyCode}`;
  const qrSrc = fv('qr') ? await qrDataUrl(qrData, 260) : '';
  const expiryVal = holder.expires_at
    ? new Date(holder.expires_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const logoUrl = `${originUrl}/logo.png`;

  const hdrBand = `
    <div class="chdr">
      <img src="${logoUrl}" class="logo" />
      <div><div class="org-name">${cfg.orgName}</div><div class="org-web">${cfg.orgWebsite}</div></div>
      ${fv('className') ? `<div class="cbadge">${holder.section_class || 'STUDENT'}</div>` : ''}
    </div>`;
  const hdrBorder = `
    <div class="bhdr">
      <img src="${logoUrl}" class="logo" />
      <div><div class="org-name-b">${cfg.orgName}</div><div class="org-web-b">${cfg.orgWebsite}</div></div>
      ${fv('className') ? `<div class="bbadge">${holder.section_class || 'STUDENT'}</div>` : ''}
    </div>`;
  const hdrMin = `
    <div class="mhdr">
      <img src="${logoUrl}" class="logo-m" />
      <div class="org-name-m">${cfg.orgName}</div>
      ${fv('className') ? `<div class="mbadge">${holder.section_class || 'STUDENT'}</div>` : ''}
    </div>`;

  const hdr = hs === 'band' ? hdrBand : hs === 'border' ? hdrBorder : hdrMin;

  const infoRows = [
    fv('school') && holder.school_name ? `<div class="field"><div class="lbl">${fl('school','School')}</div><div class="val-a" style="color:${acc}">${holder.school_name}</div></div>` : '',
    fv('email') && holder.email ? `<div class="field"><div class="lbl">${fl('email','Login Email')}</div><div class="val">${holder.email}</div></div>` : '',
    fv('password') ? `<div class="field"><div class="lbl">${fl('password','Temp Password')}</div><div class="val-a">${holder.temp_password || 'Set on first login'}</div></div>` : '',
    fv('studentId') ? `<div class="field"><div class="lbl">${fl('studentId','Card No.')}</div><div class="val-a">${code}</div></div>` : '',
    fv('expiry') ? `<div class="field"><div class="lbl">${fl('expiry','Expiry Date')}</div><div class="val-a">${expiryVal}</div></div>` : '',
  ].filter(Boolean).join('');

  const photoHtml = cfg.showPhotoSlot
    ? holder.avatar_url
      ? `<img src="${holder.avatar_url}" class="photo" crossorigin="anonymous" />`
      : `<div class="photo photo-empty">PHOTO</div>`
    : '';

  return `<!DOCTYPE html><html><head><title>Access Card — ${holder.full_name}</title>
  <style>
    @page { size: A4 portrait; margin: 20mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family:'Inter','Segoe UI',system-ui,sans-serif; color:#111827; background:#fff; display:flex; align-items:flex-start; justify-content:center; }
    .card { border:1px solid #d1d5db; ${hs === 'border' ? `border-left:4px solid ${acc};` : ''} border-radius:${cardRadiusPx(cfg)}px; width:100%; max-width:480px; display:flex; flex-direction:column; overflow:hidden; background:${cfg.bgColor || '#fff'}; }
    .chdr { background:${acc}; padding:12px 18px; display:flex; align-items:center; gap:10px; }
    .bhdr { display:flex; align-items:center; gap:10px; padding:10px 16px; border-bottom:1px solid #f3f4f6; }
    .mhdr { display:flex; align-items:center; gap:10px; padding:10px 16px; border-bottom:2px solid ${acc}; }
    .logo { width:32px; height:32px; object-fit:contain; flex-shrink:0; }
    .logo-m { width:28px; height:28px; object-fit:contain; flex-shrink:0; }
    .org-name { font-size:14px; font-weight:900; color:#fff; text-transform:uppercase; line-height:1; }
    .org-web  { font-size:9px; color:rgba(255,255,255,.8); font-weight:700; margin-top:3px; }
    .org-name-b { font-size:13px; font-weight:900; color:#111; text-transform:uppercase; line-height:1; }
    .org-web-b  { font-size:8px; color:${acc}; font-weight:700; margin-top:2px; }
    .org-name-m { font-size:13px; font-weight:900; color:#111; text-transform:uppercase; }
    .cbadge { margin-left:auto; background:rgba(0,0,0,.22); color:#fff; padding:5px 12px; font-size:9px; font-weight:900; text-transform:uppercase; flex-shrink:0; }
    .bbadge { margin-left:auto; background:${acc}; color:#fff; padding:4px 10px; font-size:9px; font-weight:900; text-transform:uppercase; flex-shrink:0; }
    .mbadge { margin-left:auto; font-size:9px; font-weight:900; color:${acc}; text-transform:uppercase; flex-shrink:0; }
    .cbody { display:flex; min-height:160px; }
    .info { flex:1; padding:18px 20px; display:flex; flex-direction:column; gap:10px; border-right:1px solid #f3f4f6; overflow:hidden; }
    .sname { font-size:22px; font-weight:900; color:#111; text-transform:uppercase; line-height:1.15; }
    .sep { height:1px; background:#f3f4f6; }
    .field { display:flex; flex-direction:column; gap:3px; }
    .srole { font-size:10px; font-weight:700; color:${acc}; text-transform:uppercase; letter-spacing:1px; margin-top:2px; }
    .lbl { font-size:7.5px; font-weight:700; color:${tc('fieldLabel','#9ca3af')}; text-transform:uppercase; letter-spacing:1px; }
    .val { font-size:13px; font-weight:700; font-family:monospace; color:${tc('fieldValue','#111')}; word-break:break-all; }
    .val-a { font-size:13px; font-weight:800; font-family:monospace; color:${tc('accentValue', acc)}; word-break:break-all; }
    .qrp { width:160px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; padding:18px 16px; background:#fafafa; flex-shrink:0; }
    .qr  { width:130px; height:130px; border:1px solid #e5e7eb; display:block; }
    .qrl { font-size:7px; color:#9ca3af; text-transform:uppercase; letter-spacing:1px; text-align:center; font-weight:600; }
    .qrc { font-size:9px; font-weight:900; font-family:monospace; color:${acc}; text-align:center; word-break:break-all; }
    .photo { width:64px; height:80px; object-fit:cover; border:1px solid #e5e7eb; border-radius:4px; flex-shrink:0; }
    .photo-empty { display:flex; align-items:center; justify-content:center; background:#f3f4f6; color:#9ca3af; font-size:8px; font-weight:900; letter-spacing:1px; }
    .name-row { display:flex; align-items:flex-start; gap:12px; }
    .cftr { display:flex; justify-content:space-between; align-items:center; padding:8px 18px; border-top:1px solid #f3f4f6; font-size:7.5px; color:#9ca3af; font-weight:600; background:#fafafa; }
    .cftr-id { font-family:monospace; color:#374151; font-weight:900; font-size:8px; }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  </style>
  </head><body>
  <div class="card">
    ${hdr}
    <div class="cbody">
      <div class="info">
        <div class="name-row">
          ${photoHtml}
          <div>
            <div class="sname">${holder.full_name}</div>
            ${holder.role_label ? `<div class="srole">${holder.role_label}</div>` : ''}
          </div>
        </div>
        <div class="sep"></div>
        ${infoRows}
      </div>
      ${fv('qr') ? `
      <div class="qrp">
        <img src="${qrSrc}" class="qr" />
        <div class="qrl">Scan or type this code at rillcod.com/result-check</div>
        <div class="qrc">${verifyCode}</div>
      </div>` : ''}
    </div>
    <div class="cftr">
      <span>${cfg.footerLeft} · Keep this card safe</span>
      <span class="cftr-id">Issued: ${dateStr}</span>
    </div>
  </div>
  <script>window.onload = () => { const imgs=[...document.images]; Promise.all(imgs.map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r;}))).then(()=>{ setTimeout(()=>{ window.print(); setTimeout(()=>window.close(),500); },150); }); }</script>
  </body></html>`;
}

export interface BulkPrintOptions {
  /** Use the exact card dimensions from the config (Card Studio manage prints). */
  fixedSize?: boolean;
  /** Small hint line under the QR (e.g. "Scan to check result"). */
  qrHint?: string;
}

// Builds print HTML for a batch of cards (2-up grid, A4).
// Async: QR codes are generated locally as data URLs (offline-safe).
export async function buildBulkPrintHtml(
  holders: CardHolder[],
  cfg: CardConfig,
  originUrl: string,
  opts: BulkPrintOptions = {},
): Promise<string> {
  const acc = cfg.accentColor;
  const hs = cfg.headerStyle;
  const fv = (k: string) => fieldVisible(cfg, k);
  const fl = (k: string, fb: string) => fieldLabel(cfg, k, fb);
  const tc = (k: string, fb: string) => typoColor(cfg, k, fb);
  const logoUrl = `${originUrl}/logo.png`;

  const qrPayload = (h: CardHolder) => `${originUrl}/result-check/${h.verification_code || holderCode(h.id)}`;
  const qrMap = fv('qr') ? await qrDataUrls(holders.map(qrPayload), 200) : new Map<string, string>();

  const cardHtml = (h: CardHolder) => {
    const code = h.card_number || holderCode(h.id);
    const verifyCode = h.verification_code || holderCode(h.id);
    const qrSrc = qrMap.get(qrPayload(h)) || '';
    const hdrClass = hs === 'band' ? 'hdr-band' : hs === 'border' ? 'hdr-border' : 'hdr-min';
    const rows = [
      fv('school') && h.school_name ? `<div class="row"><div class="lbl">${fl('school','School')}</div><div class="val-a">${h.school_name}</div></div>` : '',
      fv('className') && h.section_class ? `<div class="row"><div class="lbl">${fl('className','Class')}</div><div class="val">${h.section_class}</div></div>` : '',
      fv('email') && h.email ? `<div class="row"><div class="lbl">${fl('email','Email')}</div><div class="val">${h.email}</div></div>` : '',
      fv('password') && h.temp_password ? `<div class="row"><div class="lbl">${fl('password','Password')}</div><div class="val-a">${h.temp_password}</div></div>` : '',
      fv('studentId') ? `<div class="row"><div class="lbl">${fl('studentId','Card No.')}</div><div class="val-a">${code}</div></div>` : '',
      fv('expiry') && h.expires_at ? `<div class="row"><div class="lbl">${fl('expiry','Expiry')}</div><div class="val-a">${new Date(h.expires_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div></div>` : '',
    ].filter(Boolean).join('');

    return `<div class="card">
      <div class="${hdrClass}">
        ${cfg.showLogo !== false ? `<img class="logo" src="${logoUrl}" />` : ''}
        <div><div class="org">${cfg.orgName}</div><div class="web">${cfg.orgWebsite}</div></div>
        <div class="cbadge">${cfg.cardLabel}</div>
      </div>
      <div class="body">
        <div class="left">
          <div class="name">${h.full_name}</div>
          ${h.role_label ? `<div class="role">${h.role_label}</div>` : ''}
          <div class="sep"></div>
          ${rows}
          ${h.badge ? `<div class="hbadge">${h.badge}</div>` : ''}
        </div>
        ${fv('qr') ? `<div class="right"><img class="qr" src="${qrSrc}" />${opts.qrHint ? `<div class="qrhint">${opts.qrHint}</div>` : ''}<div class="code">${verifyCode}</div></div>` : ''}
      </div>
      <div class="ftr"><span>${cfg.footerLeft}</span><span>${code}</span></div>
    </div>`;
  };

  const fixed = opts.fixedSize && cfg.width && cfg.height;
  const gridCss = fixed
    ? `display:grid; grid-template-columns:repeat(auto-fill,${cfg.width}); gap:6mm; justify-content:start;`
    : `display:grid; grid-template-columns:repeat(2,1fr); gap:8mm;`;
  const cardSizeCss = fixed ? `width:${cfg.width}; height:${cfg.height};` : '';

  return `<!DOCTYPE html><html><head><title>Access Cards</title>
  <style>
    @page { size: A4 portrait; margin: 8mm; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Inter,system-ui,sans-serif; color:#111827; background:#fff; }
    .grid { ${gridCss} }
    .card { ${cardSizeCss} border:1px solid #e5e7eb; ${hs === 'border' ? `border-left:3mm solid ${acc};` : ''} border-radius:${cardRadiusPx(cfg)}px; display:flex; flex-direction:column; overflow:hidden; background:${cfg.bgColor || '#fff'}; page-break-inside:avoid; margin-bottom:8mm; }
    .hdr-band   { background:${acc}; color:#fff; padding:2.2mm 3mm; display:flex; align-items:center; gap:2mm; }
    .hdr-border { padding:2.2mm 3mm; display:flex; align-items:center; gap:2mm; border-bottom:1px solid #f3f4f6; }
    .hdr-min    { border-bottom:2px solid ${acc}; padding:2.2mm 3mm; display:flex; align-items:center; gap:2mm; }
    .logo { width:5mm; height:5mm; object-fit:contain; }
    .org  { font-weight:900; font-size:2.5mm; text-transform:uppercase; line-height:1; }
    .web  { font-size:1.8mm; opacity:.8; margin-top:.5mm; }
    .cbadge { margin-left:auto; background:rgba(0,0,0,.22); color:#fff; padding:.5mm 1.5mm; font-size:1.6mm; font-weight:900; text-transform:uppercase; }
    .body { display:flex; flex:1; overflow:hidden; }
    .left { flex:1; padding:2.5mm 3mm; border-right:1px solid #f3f4f6; overflow:hidden; }
    .name { font-size:3.5mm; font-weight:900; text-transform:uppercase; line-height:1.2; margin-bottom:.5mm; }
    .role { font-size:1.8mm; font-weight:800; color:${acc}; text-transform:uppercase; letter-spacing:.2mm; margin-bottom:1mm; }
    .sep  { height:.3mm; background:#f3f4f6; margin-bottom:1.5mm; }
    .row  { margin:.6mm 0; }
    .lbl  { color:${tc('fieldLabel','#9ca3af')}; font-size:1.5mm; text-transform:uppercase; }
    .val  { font-size:2mm; font-weight:700; color:${tc('fieldValue','#111827')}; word-break:break-word; }
    .val-a { font-size:2mm; font-weight:800; font-family:monospace; color:${tc('accentValue', acc)}; word-break:break-word; }
    .hbadge { display:inline-block; background:${acc}15; border:1px solid ${acc}40; color:${acc}; font-size:1.7mm; font-weight:800; padding:.6mm 1.4mm; margin-top:1mm; }
    .right { width:22mm; background:#fafafa; padding:2mm; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:1mm; }
    .qr   { width:15mm; height:15mm; border:1px solid #e5e7eb; }
    .qrhint { font-size:1.4mm; color:#6b7280; text-transform:uppercase; font-weight:900; text-align:center; line-height:1.2; }
    .code { color:${acc}; font-size:1.5mm; font-family:monospace; font-weight:900; text-align:center; word-break:break-all; }
    .ftr  { border-top:1px solid #f3f4f6; background:#fafafa; color:#6b7280; display:flex; justify-content:space-between; padding:1.2mm 3mm; font-size:1.5mm; }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  </style></head><body>
  <div class="grid">${holders.map(h => cardHtml(h)).join('')}</div>
  <script>window.onload=()=>{const imgs=[...document.images];Promise.all(imgs.map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r;}))).then(()=>{setTimeout(()=>{window.print();setTimeout(()=>window.close(),500);},150);});};</script>
  </body></html>`;
}

export function openPrintWindow(html: string): void {
  const win = window.open('', '_blank');
  if (!win) { alert('Pop-up blocked. Please allow pop-ups for this site.'); return; }
  win.document.write(html);
  win.document.close();
}
