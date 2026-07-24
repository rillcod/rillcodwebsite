import {
  HD_QR_A5_PX,
  HD_QR_PRINT_4K_PX,
  HD_QR_OPTIONS,
} from '../src/lib/qr/hd-qr';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';

const URL = 'https://www.rillcod.com/special/ai-summer-school-2026';
const outDir = path.join(process.cwd(), 'public', 'qr', 'special');
const base = 'ai-summer-school-2026';

const common = HD_QR_OPTIONS;

/** A5 short edge at 300 DPI — square QR fills page width when printed portrait. */
const A5_WIDTH_PX = HD_QR_A5_PX;
/** 4K master — posters, banners, large flyers. */
const PRINT_4K_PX = HD_QR_PRINT_4K_PX;

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  await QRCode.toFile(path.join(outDir, `${base}-qr-a5-300dpi.png`), URL, {
    ...common,
    type: 'png',
    width: A5_WIDTH_PX,
  });

  await QRCode.toFile(path.join(outDir, `${base}-qr-4k-4096.png`), URL, {
    ...common,
    type: 'png',
    width: PRINT_4K_PX,
  });

  // Legacy filename alias — same 4K asset
  await QRCode.toFile(path.join(outDir, `${base}-qr-hd-4096.png`), URL, {
    ...common,
    type: 'png',
    width: PRINT_4K_PX,
  });

  await QRCode.toFile(path.join(outDir, `${base}-qr.svg`), URL, {
    ...common,
    type: 'svg',
    width: A5_WIDTH_PX,
  });

  const qrSvg = await QRCode.toString(URL, { ...common, type: 'svg', width: 130 });
  const qrInner = qrSvg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const a5Svg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="148mm" height="210mm" viewBox="0 0 148 210">',
    '  <rect width="148" height="210" fill="#ffffff"/>',
    '  <g transform="translate(9, 28)">',
    `    <svg width="130" height="130" viewBox="0 0 130 130">${qrInner}</svg>`,
    '  </g>',
    '  <text x="74" y="175" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="4.2" font-weight="700" fill="#111111">Rillcod AI Summer School 2026</text>',
    '  <text x="74" y="182" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="3" fill="#444444">Scan to register</text>',
    '  <text x="74" y="189" text-anchor="middle" font-family="monospace" font-size="2.6" fill="#666666">rillcod.com/special/ai-summer-school-2026</text>',
    '</svg>',
  ].join('\n');
  fs.writeFileSync(path.join(outDir, `${base}-a5-print.svg`), a5Svg, 'utf8');

  console.log(`Generated in ${path.resolve(outDir)}`);
  for (const file of fs.readdirSync(outDir)) {
    const stat = fs.statSync(path.join(outDir, file));
    console.log(`  ${file} — ${Math.round(stat.size / 1024)} KB`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
