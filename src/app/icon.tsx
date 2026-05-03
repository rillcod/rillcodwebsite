import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  const buf = readFileSync(join(process.cwd(), 'public/favicon.png'));
  const src = `data:image/png;base64,${buf.toString('base64')}`;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: 'white' }}>
        <img src={src} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
    ),
    { ...size },
  );
}
