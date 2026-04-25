'use client';

/**
 * ViewAsSwitcher — a compact dropdown for admin / teacher to preview the
 * platform as a lower-privilege role (school / parent / student). The
 * simulation is UI-only: API calls still run against the actual JWT role,
 * so there is zero privilege-escalation surface. It simply swaps the role
 * on the effective profile, which drives every client-side role gate.
 */

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { EyeIcon, ChevronDownIcon, ArrowPathIcon } from '@/lib/icons';
import type { UserRole } from '@/types';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  teacher: 'Teacher',
  school: 'School',
  parent: 'Parent',
  student: 'Student',
};

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Full platform control',
  teacher: 'Your normal workspace',
  school: 'Partner-school lens',
  parent: 'Guardian portal',
  student: 'Learner experience',
};

export default function ViewAsSwitcher({ compact = false }: { compact?: boolean }) {
  const { actualRole, viewAsRole, setViewAsRole, isSimulating } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  // Only admins + teachers may simulate. Teachers cannot simulate admin.
  if (actualRole !== 'admin' && actualRole !== 'teacher') return null;

  const options: UserRole[] = actualRole === 'admin'
    ? ['admin', 'teacher', 'school', 'parent', 'student']
    : ['teacher', 'school', 'parent', 'student'];

  const current = viewAsRole ?? actualRole;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={isSimulating ? `Previewing as ${current}` : 'View as another role'}
        className={`flex items-center gap-1.5 border transition-all ${
          compact
            ? 'px-2 py-1 text-[9px] font-black uppercase tracking-[0.2em]'
            : 'px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.22em]'
        } ${
          isSimulating
            ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
            : 'bg-sidebar-foreground/5 border-sidebar-foreground/15 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:border-primary/30'
        }`}
      >
        <EyeIcon className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        <span className="truncate">{isSimulating ? `As ${current}` : 'View as'}</span>
        <ChevronDownIcon className={`${compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full mt-1.5 z-50 min-w-[220px] bg-card border border-border shadow-2xl"
        >
          <div className="px-3 py-2 border-b border-border">
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground">Preview platform as</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-snug">
              UI-only — server RBAC still enforces your real role ({actualRole}).
            </p>
          </div>
          <ul className="py-1">
            {options.map(r => {
              const active = r === current;
              const isSelf = r === actualRole;
              return (
                <li key={r}>
                  <button
                    type="button"
                    onClick={() => { setViewAsRole(isSelf ? null : r); setOpen(false); }}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition ${
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-[0.18em]">
                        {ROLE_LABELS[r]} {isSelf && <span className="text-muted-foreground/60 normal-case font-semibold ml-1">· you</span>}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-tight truncate">{ROLE_DESCRIPTIONS[r]}</p>
                    </div>
                    {active && !isSelf && (
                      <span className="text-[9px] font-black uppercase tracking-widest text-amber-400">live</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {isSimulating && (
            <button
              type="button"
              onClick={() => { setViewAsRole(null); setOpen(false); }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border-t border-border text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground hover:bg-muted transition"
            >
              <ArrowPathIcon className="w-3 h-3" /> Exit preview
            </button>
          )}
        </div>
      )}
    </div>
  );
}
