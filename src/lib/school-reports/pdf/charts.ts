import { withMinPresence } from './text';
import { INK, MUTED, PAGE_WIDTH_CONTENT, PDF_MIN_CHART } from './tokens';

/**
 * Charts are drawn directly onto the pdfmake canvas rather than embedded as
 * images, so they stay crisp at print resolution and add no render dependency.
 */

export type Band = { label: string; count: number; color: string };
export type NamedValue = { label: string; value: number; color: string };

export function pieChartBlock(
  title: string,
  bands: Band[],
  opts?: { size?: number; donut?: boolean; emptyLabel?: string },
) {
  const size = opts?.size ?? 96;
  const donut = opts?.donut !== false;
  const total = bands.reduce((sum, band) => sum + Math.max(0, Number(band.count) || 0), 0);
  if (total <= 0) {
    return {
      stack: [
        { text: title, style: 'subsection' },
        {
          text: opts?.emptyLabel || 'No data.',
          color: MUTED,
          italics: true,
          fontSize: 8,
          margin: [0, 4, 0, 0],
        },
      ],
    };
  }

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.42;
  const innerR = donut ? outerR * 0.52 : 0;
  const canvas: Array<Record<string, unknown>> = [];
  let angle = -Math.PI / 2;

  for (const band of bands) {
    const value = Math.max(0, Number(band.count) || 0);
    if (value <= 0) continue;
    const sweep = (value / total) * Math.PI * 2;
    const points: Array<{ x: number; y: number }> = [{ x: cx, y: cy }];
    // Segment the arc finely enough that large slices stay smooth.
    const steps = Math.max(6, Math.ceil((sweep / (Math.PI * 2)) * 36));
    for (let i = 0; i <= steps; i += 1) {
      const a = angle + (sweep * i) / steps;
      points.push({ x: cx + outerR * Math.cos(a), y: cy + outerR * Math.sin(a) });
    }
    canvas.push({
      type: 'polyline',
      points,
      color: band.color,
      lineColor: '#ffffff',
      lineWidth: 1,
      closePath: true,
    });
    angle += sweep;
  }

  if (donut && innerR > 0) {
    canvas.push({
      type: 'ellipse',
      x: cx,
      y: cy,
      r1: innerR,
      r2: innerR,
      color: '#ffffff',
      lineWidth: 0,
    });
  }

  const legend = bands
    .filter((band) => Math.max(0, Number(band.count) || 0) > 0)
    .map((band) => {
      const value = Math.max(0, Number(band.count) || 0);
      const pct = Math.round((value / total) * 100);
      return {
        columns: [
          {
            width: 8,
            canvas: [{ type: 'rect', x: 0, y: 1, w: 7, h: 7, color: band.color, lineWidth: 0 }],
          },
          {
            width: '*',
            text: `${band.label}  ${value} (${pct}%)`,
            fontSize: 7,
            color: INK,
            margin: [3, 0, 0, 0],
          },
        ],
        margin: [0, 1, 0, 1],
      };
    });

  return withMinPresence(
    {
      stack: [
        { text: title, style: 'subsection' },
        {
          columns: [
            { width: size, canvas },
            { width: '*', stack: legend, margin: [8, 6, 0, 0] },
          ],
          columnGap: 4,
        },
      ],
    },
    PDF_MIN_CHART,
  );
}

export function barChartBlock(title: string, rows: NamedValue[], opts?: { maxBars?: number; unit?: string }) {
  const unit = opts?.unit ?? '%';
  const items = rows.slice(0, opts?.maxBars ?? 10);
  if (!items.length) {
    return {
      stack: [
        { text: title, style: 'subsection' },
        { text: 'No comparison data.', color: MUTED, italics: true, fontSize: 8 },
      ],
    };
  }

  const valueWidth = 36;
  const gapWidth = 6;
  const labelWidth = 188;
  const chartWidth = PAGE_WIDTH_CONTENT - labelWidth - valueWidth - gapWidth;
  const barHeight = 8;
  const max = Math.max(...items.map((row) => row.value), 1);

  const bars = items.map((row) => {
    // Floor the drawn width so a small non-zero value still reads as present.
    const width = Math.max(3, Math.round((Math.max(0, row.value) / max) * chartWidth));
    return {
      columns: [
        {
          width: labelWidth,
          stack: [
            {
              text: row.label,
              fontSize: 7,
              color: INK,
              lineHeight: 1.2,
            },
          ],
          margin: [0, 1, 6, 0],
        },
        {
          width: chartWidth,
          canvas: [
            { type: 'rect', x: 0, y: 1, w: chartWidth, h: barHeight, color: '#eaecf0', lineWidth: 0 },
            { type: 'rect', x: 0, y: 1, w: width, h: barHeight, color: row.color, lineWidth: 0 },
          ],
        },
        {
          width: valueWidth,
          text: `${Number(row.value).toFixed(row.value % 1 ? 1 : 0)}${unit}`,
          alignment: 'right',
          bold: true,
          fontSize: 7,
          color: row.color,
          margin: [gapWidth, 1, 0, 0],
        },
      ],
      margin: [0, 0, 0, 4],
    };
  });

  return withMinPresence(
    {
      stack: [{ text: title, style: 'subsection', margin: [0, 0, 0, 4] }, ...bars],
    },
    PDF_MIN_CHART,
  );
}

/** Traffic-light colour for a percentage score. */
export function scoreColor(score: number) {
  if (score >= 75) return '#059669';
  if (score >= 50) return '#d97706';
  return '#e11d48';
}
