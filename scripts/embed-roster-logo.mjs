import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'public/images/logoA.png');
const out = path.join(root, 'src/lib/cards/rosterBrandLogo.ts');

const png = await sharp(src).resize(240, null, { fit: 'inside' }).png({ compressionLevel: 9 }).toBuffer();
const meta = await sharp(png).metadata();
const b64 = png.toString('base64');
const aspect = (meta.width || 420) / (meta.height || 664);

const content = `/** Embedded monochrome logo (logoA) for crisp roster PDF/HTML letterheads. */
export const ROSTER_LOGO_ASPECT = ${aspect};
export const ROSTER_EMBEDDED_LOGO_DATA_URL =
  'data:image/png;base64,${b64}';
`;

fs.writeFileSync(out, content);
console.log(`Wrote ${out} (${meta.width}x${meta.height}, ${png.length} bytes)`);
