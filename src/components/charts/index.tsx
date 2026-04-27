'use client';

/**
 * Rillcod Academy — Chart Component Library
 * Built on recharts. All charts are dark-theme aware and mobile-responsive.
 * Use ResponsiveContainer to fill parent width.
 */

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, RadialBarChart, RadialBar,
  Legend, ReferenceLine,
} from 'recharts';

// ── Shared theme tokens ───────────────────────────────────────────────────────
const GRID_COLOR = 'var(--border)';
const AXIS_COLOR = 'var(--muted-foreground)';
const LABEL_STYLE = { fontSize: 10, fontWeight: 700, fill: 'var(--muted-foreground)', opacity: 0.8, fontFamily: 'inherit' };
const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--border)',
  borderRadius: '12px', fontSize: 12, fontWeight: 600,
  color: 'var(--foreground)', padding: '8px 12px',
  boxShadow: '0 10px 30px -10px rgba(0,0,0,0.15)',
};

// Brand palette — cycling colours for multi-series data
export const CHART_COLORS = {
  primary: '#1A3A8F',
  violet: '#8b5cf6',
  emerald: '#10b981',
  blue: '#3b82f6',
  amber: '#f59e0b',
  rose: '#f43f5e',
  cyan: '#06b6d4',
  pink: '#ec4899',
};

export const COLOR_SEQ = Object.values(CHART_COLORS);

// ── Custom tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, valueFormatter }: {
  active?: boolean; payload?: any[]; label?: string;
  valueFormatter?: (v: number, name: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={TOOLTIP_STYLE} className="backdrop-blur-md">
      {label && <p style={{ color: 'var(--muted-foreground)', fontSize: 10, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: i < payload.length - 1 ? 4 : 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color ?? p.fill, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ color: 'var(--muted-foreground)' }}>{p.name}: </span>
          <span style={{ color: 'var(--foreground)', fontWeight: 800 }}>
            {valueFormatter ? valueFormatter(p.value, p.name) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── 1. Horizontal Bar Chart ───────────────────────────────────────────────────
interface HBarItem { label: string; value: number; color?: string }
export function HorizontalBarChart({
  data, height = 220, valueLabel = 'Value', formatValue,
}: {
  data: HBarItem[]; height?: number; valueLabel?: string; formatValue?: (v: number) => string;
}) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="space-y-2.5">
      {data.map((item, i) => {
        const pct = Math.round((item.value / max) * 100);
        const color = item.color ?? COLOR_SEQ[i % COLOR_SEQ.length];
        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-foreground/80 truncate max-w-[60%]">{item.label}</span>
              <span style={{ color }} className="tabular-nums">{formatValue ? formatValue(item.value) : item.value}</span>
            </div>
            <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.max(pct, 2)}%`, background: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 2. Recharts Vertical Bar Chart ───────────────────────────────────────────
export function VerticalBarChart({
  data, xKey, bars, height = 260, formatValue, showGrid = true,
}: {
  data: Record<string, any>[];
  xKey: string;
  bars: { key: string; label: string; color: string }[];
  height?: number;
  formatValue?: (v: number) => string;
  showGrid?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barGap={3}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />}
        <XAxis dataKey={xKey} tick={LABEL_STYLE} axisLine={false} tickLine={false} />
        <YAxis tick={LABEL_STYLE} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip valueFormatter={formatValue ? (v, n) => formatValue(v) : undefined} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        {bars.length > 1 && <Legend wrapperStyle={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', paddingTop: 8 }} />}
        {bars.map(b => (
          <Bar key={b.key} dataKey={b.key} name={b.label} fill={b.color} radius={[6, 6, 0, 0]} maxBarSize={48} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── 3. Area / Line Chart ──────────────────────────────────────────────────────
export function AreaLineChart({
  data, xKey, series, height = 220, formatValue, showGrid = true, type = 'area',
}: {
  data: Record<string, any>[];
  xKey: string;
  series: { key: string; label: string; color: string }[];
  height?: number;
  formatValue?: (v: number) => string;
  showGrid?: boolean;
  type?: 'area' | 'line';
}) {
  const Chart = type === 'area' ? AreaChart : LineChart;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />}
        <XAxis dataKey={xKey} tick={LABEL_STYLE} axisLine={false} tickLine={false} />
        <YAxis tick={LABEL_STYLE} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip valueFormatter={formatValue ? (v, n) => formatValue(v) : undefined} />} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }} />}
        {series.map(s =>
          type === 'area' ? (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.label}
              stroke={s.color} strokeWidth={2}
              fill={s.color} fillOpacity={0.12}
              dot={false} activeDot={{ r: 4, fill: s.color }} />
          ) : (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label}
              stroke={s.color} strokeWidth={2.5}
              dot={false} activeDot={{ r: 4, fill: s.color }} />
          )
        )}
      </Chart>
    </ResponsiveContainer>
  );
}

// ── 4. Donut / Pie Chart ──────────────────────────────────────────────────────
interface PieSlice { label: string; value: number; color: string }
export function DonutChart({
  data, height = 220, innerRadius = 55, outerRadius = 90, centerLabel, centerValue,
}: {
  data: PieSlice[]; height?: number; innerRadius?: number; outerRadius?: number;
  centerLabel?: string; centerValue?: string | number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data} cx="50%" cy="50%"
            innerRadius={innerRadius} outerRadius={outerRadius}
            dataKey="value" nameKey="label"
            paddingAngle={2} startAngle={90} endAngle={-270}
            strokeWidth={0}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0];
              const pct = total > 0 ? Math.round(((p.value as number) / total) * 100) : 0;
              return (
                <div style={TOOLTIP_STYLE}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: p.payload.color, display: 'inline-block' }} />
                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>{p.name}</span>
                  </div>
                  <div style={{ color: '#fff', fontWeight: 800, marginTop: 2 }}>{p.value} ({pct}%)</div>
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Center label */}
      {(centerLabel || centerValue !== undefined) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {centerValue !== undefined && (
            <p className="text-2xl font-black text-foreground leading-none">{centerValue}</p>
          )}
          {centerLabel && (
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mt-1">{centerLabel}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── 5. Stacked Bar Chart ─────────────────────────────────────────────────────
export function StackedBarChart({
  data, xKey, bars, height = 240, formatValue,
}: {
  data: Record<string, any>[];
  xKey: string;
  bars: { key: string; label: string; color: string }[];
  height?: number;
  formatValue?: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barGap={0}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey={xKey} tick={LABEL_STYLE} axisLine={false} tickLine={false} />
        <YAxis tick={LABEL_STYLE} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip valueFormatter={formatValue ? (v, n) => formatValue(v) : undefined} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Legend wrapperStyle={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', paddingTop: 8 }} />
        {bars.map((b, i) => (
          <Bar key={b.key} dataKey={b.key} name={b.label} fill={b.color} stackId="a"
            radius={i === bars.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]} maxBarSize={48} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── 6. Radial Progress Rings (no recharts — pure CSS SVG) ────────────────────
export function RadialRing({
  value, max = 100, size = 80, strokeWidth = 8, color = CHART_COLORS.primary,
  label, subLabel,
}: {
  value: number; max?: number; size?: number; strokeWidth?: number;
  color?: string; label?: string; subLabel?: string;
}) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(1, value / max);
  const dash = circ * pct;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
          <circle cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.7s ease' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-black text-foreground leading-none">{Math.round(pct * 100)}%</span>
        </div>
      </div>
      {label && <p className="text-xs font-black text-foreground">{label}</p>}
      {subLabel && <p className="text-[10px] text-muted-foreground">{subLabel}</p>}
    </div>
  );
}

// ── 7. Mini Sparkline ─────────────────────────────────────────────────────────
export function Sparkline({
  values, color = CHART_COLORS.primary, height = 32, width = 80,
}: {
  values: number[]; color?: string; height?: number; width?: number;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  });
  const last = pts[pts.length - 1].split(',');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline
        points={pts.join(' ')}
        fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r={3} fill={color} />
    </svg>
  );
}

// ── 8. Gauge Bar (horizontal fill with label) ────────────────────────────────
export function GaugeBar({
  value, max = 100, label, color, showValue = true, height = 6,
}: {
  value: number; max?: number; label?: string; color: string;
  showValue?: boolean; height?: number;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="space-y-1">
      {(label || showValue) && (
        <div className="flex items-center justify-between text-xs font-bold">
          {label && <span className="text-foreground/70 truncate">{label}</span>}
          {showValue && <span style={{ color }} className="tabular-nums">{pct}%</span>}
        </div>
      )}
      <div className="rounded-full overflow-hidden" style={{ height, background: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.max(pct, 2)}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ── 9. Stat Card with Sparkline ───────────────────────────────────────────────
export function SparkCard({
  label, value, subValue, sparkData, color = CHART_COLORS.primary, icon: Icon,
}: {
  label: string; value: string | number; subValue?: string;
  sparkData?: number[]; color?: string; icon?: React.ElementType;
}) {
  return (
    <div className="bg-card border border-border p-4 space-y-3 rounded-xl shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4" style={{ color }} />}
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</span>
        </div>
        {sparkData && <Sparkline values={sparkData} color={color} />}
      </div>
      <div>
        <p className="text-2xl font-black text-foreground leading-none" style={{ color }}>{value}</p>
        {subValue && <p className="text-[10px] text-muted-foreground mt-1">{subValue}</p>}
      </div>
    </div>
  );
}
