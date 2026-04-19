'use client';

import { BADGE_VISUAL } from '@/lib/grading';

// ── Tier configuration ────────────────────────────────────────────────────────
const TIER_META: Record<string, { label: string; glow: string; ring: string }> = {
  bronze:   { label: 'BRONZE',   glow: 'shadow-orange-500/20',  ring: 'border-orange-500/50' },
  silver:   { label: 'SILVER',   glow: 'shadow-violet-500/20',  ring: 'border-white/20'      },
  gold:     { label: 'GOLD',     glow: 'shadow-amber-500/30',   ring: 'border-amber-400/60'  },
  platinum: { label: 'PLATINUM', glow: 'shadow-cyan-400/40',    ring: 'border-cyan-400/70'   },
};

// ── Badge face — the embossed code block ─────────────────────────────────────
function BadgeFace({
  icon, color, size = 'md',
}: {
  icon: string; color: string; size?: 'sm' | 'md' | 'lg';
}) {
  const dim = size === 'sm' ? 36 : size === 'lg' ? 64 : 48;
  const fontSize = size === 'sm' ? 9 : size === 'lg' ? 14 : 11;
  return (
    <div
      className="flex items-center justify-center shrink-0 font-black tracking-widest select-none"
      style={{
        width:  dim,
        height: dim,
        fontSize,
        color,
        background: `radial-gradient(circle at 35% 35%, ${color}28, ${color}08 70%, transparent)`,
        border: `1px solid ${color}55`,
        boxShadow: `inset 0 1px 0 ${color}30, 0 0 12px ${color}18`,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        letterSpacing: '0.12em',
      }}
    >
      {icon}
    </div>
  );
}

// ── Earned badge pill (compact, for engagement card) ─────────────────────────
export function BadgePill({
  badgeKey, badgeIcon, badgeLabel,
}: {
  badgeKey: string; badgeIcon: string; badgeLabel: string;
}) {
  const visual = BADGE_VISUAL[badgeKey];
  if (!visual) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/40 border border-border text-[10px] font-bold text-foreground">
        <span>{badgeIcon}</span>
        <span className="hidden sm:inline truncate max-w-[80px]">{badgeLabel}</span>
      </div>
    );
  }
  return (
    <div
      title={badgeLabel}
      className={`flex items-center gap-2 px-2.5 py-1.5 bg-gradient-to-r ${visual.bg} border ${visual.borderColor} text-[10px] font-black`}
    >
      <span
        className="font-black tracking-widest"
        style={{ color: visual.color, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 9 }}
      >
        {badgeIcon}
      </span>
      <span className="hidden sm:inline text-foreground/80 truncate max-w-[80px]">{badgeLabel}</span>
    </div>
  );
}

// ── Full badge card (for waec/grades page — reference display) ───────────────
export function BadgeCardFull({
  badgeKey, label, icon, description, unlockCondition, earned = false,
}: {
  badgeKey: string; label: string; icon: string;
  description: string; unlockCondition?: string; earned?: boolean;
}) {
  const visual = BADGE_VISUAL[badgeKey];
  const tier = visual ? TIER_META[visual.tier] ?? TIER_META.bronze : TIER_META.bronze;
  const color = visual?.color ?? '#f97316';
  const bg    = visual?.bg ?? 'from-orange-600/20 to-orange-400/5';
  const border = visual?.borderColor ?? 'border-orange-500/40';

  return (
    <div
      className={`relative flex items-start gap-4 p-4 bg-gradient-to-br ${bg} border ${border} transition-all duration-300 ${
        earned ? 'opacity-100' : 'opacity-40 grayscale'
      }`}
      style={earned ? { boxShadow: `0 0 18px ${color}18` } : undefined}
    >
      {/* Tier stripe */}
      <div
        className="absolute top-0 right-0 px-2 py-0.5 text-[7px] font-black tracking-widest"
        style={{ color, background: `${color}18`, borderBottomLeftRadius: 2 }}
      >
        {tier.label}
      </div>

      <BadgeFace icon={icon} color={color} size="md" />

      <div className="min-w-0 flex-1">
        <p className="text-xs font-black text-foreground mb-0.5">{label}</p>
        <p className="text-[10px] text-muted-foreground leading-relaxed mb-1.5">{description}</p>
        {unlockCondition && (
          <p className="text-[9px] font-black uppercase tracking-widest" style={{ color }}>
            {unlockCondition}
          </p>
        )}
      </div>

      {earned && (
        <div
          className="absolute bottom-2 right-2 w-2 h-2 rounded-full"
          style={{ background: color, boxShadow: `0 0 6px ${color}` }}
        />
      )}
    </div>
  );
}

// ── Student earned badge — rich card (for student showcase / profile) ─────────
export function EarnedBadgeCard({
  badgeKey, badgeIcon, badgeLabel, badgeDescription, earnedAt,
}: {
  badgeKey: string; badgeIcon: string; badgeLabel: string;
  badgeDescription?: string; earnedAt?: string;
}) {
  const visual = BADGE_VISUAL[badgeKey];
  const tier = visual ? TIER_META[visual.tier] ?? TIER_META.bronze : TIER_META.bronze;
  const color = visual?.color ?? '#f97316';
  const bg    = visual?.bg ?? 'from-orange-600/20 to-orange-400/5';
  const border = visual?.borderColor ?? 'border-orange-500/40';

  const dateStr = earnedAt
    ? new Date(earnedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <div
      className={`relative flex flex-col items-center gap-3 p-5 bg-gradient-to-br ${bg} border ${border} text-center`}
      style={{ boxShadow: `0 0 24px ${color}15` }}
    >
      {/* Tier label */}
      <div
        className="absolute top-2 left-2 px-1.5 py-0.5 text-[7px] font-black tracking-widest uppercase"
        style={{ color, background: `${color}18` }}
      >
        {tier.label}
      </div>

      <BadgeFace icon={badgeIcon} color={color} size="lg" />

      <div>
        <p className="text-sm font-black text-foreground">{badgeLabel}</p>
        {badgeDescription && (
          <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed max-w-[140px] mx-auto">{badgeDescription}</p>
        )}
      </div>

      {dateStr && (
        <p className="text-[9px] font-bold" style={{ color }}>
          Earned {dateStr}
        </p>
      )}

      {/* Glow dot */}
      <div
        className="absolute bottom-2 right-2 w-2 h-2 rounded-full animate-pulse"
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
    </div>
  );
}
