'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * ScaledIframePreview
 * Renders arbitrary HTML inside an iframe that is auto-scaled to fit the
 * container width. Used by the builders to show a pixel-accurate live preview
 * of the printable document while the user edits the form.
 *
 * - Mobile-friendly: scales to any container width.
 * - Auto-heights the iframe based on the document's actual body height.
 * - Document background stays white so the preview looks like real paper even
 *   on a dark theme.
 */
export function ScaledIframePreview({
  html,
  label,
  baseWidth = 900,
  minHeight = 1100,
}: {
  html: string;
  label: string;
  baseWidth?: number;
  minHeight?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.48);
  const [height, setHeight] = useState(minHeight);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / baseWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [baseWidth]);

  return (
    <div className="space-y-2">
      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">
        {label}
      </p>
      <div
        ref={containerRef}
        className="w-full overflow-hidden rounded-sm bg-white shadow-inner ring-1 ring-black/5"
        style={{ height: height * scale }}
      >
        <div
          style={{
            width: baseWidth,
            transformOrigin: 'top left',
            transform: `scale(${scale})`,
          }}
        >
          <iframe
            srcDoc={html}
            title={label}
            style={{ width: baseWidth, height, border: 'none', display: 'block' }}
            onLoad={(e) => {
              try {
                const h = (e.target as HTMLIFrameElement).contentDocument?.body?.scrollHeight;
                if (h && h > 100) setHeight(h + 32);
              } catch {
                /* cross-origin — keep current height */
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default ScaledIframePreview;
