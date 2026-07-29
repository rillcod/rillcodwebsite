'use client';

import { roleMeta } from '@/lib/accountability/types';

export function RoleBadge({
  role,
  size = 'md',
  showDescription = false,
}: {
  role: string | null | undefined;
  size?: 'sm' | 'md';
  showDescription?: boolean;
}) {
  const meta = roleMeta(role);
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]';
  return (
    <div className="inline-flex flex-col gap-0.5 min-w-0">
      <span
        className={`inline-flex w-fit items-center rounded-md border font-black uppercase tracking-wide ${pad} ${meta.bg} ${meta.tone} ${meta.border}`}
        title={meta.description}
      >
        {meta.short}
      </span>
      {showDescription && (
        <span className="text-[10px] text-muted-foreground leading-snug max-w-[14rem]">
          {meta.description}
        </span>
      )}
    </div>
  );
}

export function RoleLegend() {
  const keys = ['student', 'teacher', 'parent', 'admin', 'school'] as const;
  return (
    <div className="flex flex-wrap gap-2">
      {keys.map((key) => {
        const meta = roleMeta(key);
        return (
          <div
            key={key}
            className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${meta.bg} ${meta.border} max-w-xs`}
          >
            <span className={`mt-0.5 text-[10px] font-black uppercase tracking-wide ${meta.tone}`}>
              {meta.short}
            </span>
            <p className="text-[11px] text-muted-foreground leading-snug">{meta.description}</p>
          </div>
        );
      })}
    </div>
  );
}
