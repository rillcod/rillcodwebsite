'use client';

import { useEffect, useState } from 'react';
import { qrDataUrl } from '@/lib/cards/qr';

/** Locally generated QR image (offline-safe; falls back to the external service). */
export function LocalQr({ data, size = 160, style, className, alt = '' }: {
  data: string; size?: number; style?: React.CSSProperties; className?: string; alt?: string;
}) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let cancelled = false;
    qrDataUrl(data, size).then(url => { if (!cancelled) setSrc(url); });
    return () => { cancelled = true; };
  }, [data, size]);
  if (!src) return <div style={{ ...style, background: '#f3f4f6' }} className={className} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} style={style} className={className} />;
}
