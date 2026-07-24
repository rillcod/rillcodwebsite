'use client';

import QRCode from 'react-qr-code';
import { HD_QR_DISPLAY_PX } from '@/lib/qr/hd-qr';

type HdQrCodeProps = {
  value: string;
  size?: number;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Pure black on white — best for camera scanners. */
  fgColor?: string;
  bgColor?: string;
};

/** High-contrast, high error-correction QR for reliable scanning. */
export function HdQrCode({
  value,
  size = HD_QR_DISPLAY_PX,
  id,
  className,
  style,
  fgColor = '#000000',
  bgColor = '#FFFFFF',
}: HdQrCodeProps) {
  return (
    <QRCode
      id={id}
      value={value}
      size={size}
      level="H"
      fgColor={fgColor}
      bgColor={bgColor}
      className={className}
      style={{
        height: 'auto',
        maxWidth: '100%',
        width: '100%',
        display: 'block',
        ...style,
      }}
    />
  );
}
