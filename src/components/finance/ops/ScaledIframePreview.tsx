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
    const update = () => {
      if (el.clientWidth > 0) {
        setScale(Math.min(1, el.clientWidth / baseWidth));
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [baseWidth]);

  const openFullPreview = () => {
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">
          {label}
        </p>
        <button
          type="button"
          onClick={openFullPreview}
          className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline"
        >
          Full preview ↗
        </button>
      </div>
      <div
        ref={containerRef}
        className="w-full overflow-hidden rounded-lg bg-white shadow-inner ring-1 ring-black/10"
        style={{ height: Math.max(220, height * scale) }}
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
            style={{ width: baseWidth, height, border: 'none', display: 'block', background: '#ffffff' }}
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
