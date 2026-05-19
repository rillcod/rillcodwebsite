// Generates a premium school-branded QR card PNG and triggers download.
// Uses Canvas 2D API directly — no html-to-image, no off-screen element quirks.

function fillRR(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function downloadQrCard(
  svgElement: SVGSVGElement,
  schoolName: string,
  formTitle: string,
  filename: string,
): Promise<void> {
  // 1. SVG → blob URL → Image (scales to any size on canvas)
  const serialized = new XMLSerializer().serializeToString(svgElement);
  const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  const qrImg = await loadImg(blobUrl);
  URL.revokeObjectURL(blobUrl);

  // 2. Canvas (3× DPI for crisp print / social media)
  const S = 3, W = 480, H = 624;
  const canvas = document.createElement('canvas');
  canvas.width  = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(S, S);

  // ── Background ───────────────────────────────────────────────────
  ctx.fillStyle = '#09090b';
  fillRR(ctx, 0, 0, W, H, 24);
  ctx.fill();

  // ── Dot grid overlay ─────────────────────────────────────────────
  ctx.fillStyle = 'rgba(245,166,35,0.07)';
  for (let gx = 14; gx < W; gx += 28)
    for (let gy = 14; gy < H; gy += 28) {
      ctx.beginPath();
      ctx.arc(gx, gy, 1, 0, Math.PI * 2);
      ctx.fill();
    }

  // ── Top accent bar ───────────────────────────────────────────────
  const g1 = ctx.createLinearGradient(0, 0, W, 0);
  g1.addColorStop(0,   '#f5a623');
  g1.addColorStop(0.6, '#fcd34d');
  g1.addColorStop(1,   'rgba(252,211,77,0)');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, W, 5);

  // ── School badge pill ────────────────────────────────────────────
  const badgeLabel = schoolName.toUpperCase();
  ctx.font = 'bold 11px Arial';
  const labelW = ctx.measureText(badgeLabel).width;
  const bx = 36, by = 24, bh = 26, bw = labelW + 42;
  ctx.fillStyle = 'rgba(245,166,35,0.12)';
  fillRR(ctx, bx, by, bw, bh, 13);
  ctx.fill();
  ctx.strokeStyle = 'rgba(245,166,35,0.28)';
  ctx.lineWidth = 1;
  fillRR(ctx, bx, by, bw, bh, 13);
  ctx.stroke();
  // dot
  ctx.fillStyle = '#f5a623';
  ctx.beginPath();
  ctx.arc(bx + 14, by + 13, 3, 0, Math.PI * 2);
  ctx.fill();
  // text
  ctx.fillStyle = '#f5a623';
  ctx.font = 'bold 11px Arial';
  ctx.fillText(badgeLabel, bx + 26, by + 17.5);

  // ── Hero text ────────────────────────────────────────────────────
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 38px Arial';
  ctx.fillText('SCAN TO', 36, 95);
  ctx.fillStyle = '#f5a623';
  ctx.fillText('REGISTER.', 36, 138);

  // ── QR white card ────────────────────────────────────────────────
  const qrSize = 300, qrPad = 22;
  const qrX = 36, qrY = 162;
  const qrBW = qrSize + qrPad * 2, qrBH = qrSize + qrPad * 2;

  ctx.shadowColor = 'rgba(245,166,35,0.22)';
  ctx.shadowBlur  = 28;
  ctx.fillStyle = '#ffffff';
  fillRR(ctx, qrX, qrY, qrBW, qrBH, 18);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.drawImage(qrImg, qrX + qrPad, qrY + qrPad, qrSize, qrSize);

  // ── Form title ───────────────────────────────────────────────────
  const tyBase = qrY + qrBH + 26;
  ctx.fillStyle = '#e4e4e7';
  ctx.font = '800 16px Arial';
  const maxTW = W - 72;
  let t = formTitle;
  while (ctx.measureText(t).width > maxTW && t.length > 1) t = t.slice(0, -1);
  if (t !== formTitle) t += '…';
  ctx.fillText(t, 36, tyBase);

  ctx.fillStyle = '#4b5563';
  ctx.font = '500 12px Arial';
  ctx.fillText('Open your camera app · point and scan', 36, tyBase + 20);

  // ── Divider ──────────────────────────────────────────────────────
  const divY = tyBase + 40;
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(36, divY);
  ctx.lineTo(W - 36, divY);
  ctx.stroke();

  // ── Footer ───────────────────────────────────────────────────────
  const fy = divY + 26;
  ctx.fillStyle = '#3f3f46';
  ctx.font = 'bold 10px Arial';
  ctx.fillText('POWERED BY', 36, fy);
  ctx.fillStyle = '#a1a1aa';
  ctx.font = '900 13px Arial';
  ctx.fillText('Rillcod Technologies', 36, fy + 18);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#52525b';
  ctx.font = '500 11px Arial';
  ctx.fillText('rillcod.com', W - 36, fy);
  ctx.fillStyle = '#3f3f46';
  ctx.font = '500 10px Arial';
  ctx.fillText('+234 811 660 0091', W - 36, fy + 18);
  ctx.textAlign = 'left';

  // ── Bottom accent bar ────────────────────────────────────────────
  const g2 = ctx.createLinearGradient(0, 0, W, 0);
  g2.addColorStop(0,   'transparent');
  g2.addColorStop(0.5, '#f5a623');
  g2.addColorStop(1,   'transparent');
  ctx.fillStyle = g2;
  ctx.fillRect(0, H - 4, W, 4);

  // ── Export ───────────────────────────────────────────────────────
  const dataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.download = filename;
  a.href = dataUrl;
  a.click();
}
