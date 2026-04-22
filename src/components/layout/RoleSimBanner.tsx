'use client';

/**
 * RoleSimBanner — persistent top-of-page banner shown only while an admin
 * or teacher is actively previewing the app as another role. Makes the
 * mode loud and un-missable so no one accidentally emails a parent from
 * a "previewing as parent" tab.
 *
 * NOTE: server-side role checks are unaffected by this — it's a pure UI
 * lens. See auth-context.tsx for the implementation.
 */

import { useAuth } from '@/contexts/auth-context';
import { EyeIcon, XMarkIcon } from '@/lib/icons';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  teacher: 'Teacher',
  school: 'School',
  parent: 'Parent',
  student: 'Student',
};

export default function RoleSimBanner() {
  const { isSimulating, viewAsRole, actualRole, setViewAsRole } = useAuth();
  if (!isSimulating || !viewAsRole) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 w-full bg-amber-500/15 border-b-2 border-amber-500/60 backdrop-blur supports-[backdrop-filter]:bg-amber-500/20 print:hidden"
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex items-center gap-3">
        <EyeIcon className="w-4 h-4 text-amber-300 flex-shrink-0" />
        <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.22em] text-amber-200 truncate">
          Previewing as <span className="text-amber-100">{ROLE_LABEL[viewAsRole] ?? viewAsRole}</span>
          <span className="hidden sm:inline text-amber-200/70 font-semibold normal-case tracking-normal ml-2">
            · Server enforces your real role ({ROLE_LABEL[actualRole ?? ''] ?? actualRole})
          </span>
        </p>
        <button
          onClick={() => setViewAsRole(null)}
          className="ml-auto flex items-center gap-1 px-2.5 py-1 bg-amber-500/25 hover:bg-amber-500/40 border border-amber-500/40 text-amber-100 text-[10px] font-black uppercase tracking-[0.2em] transition"
        >
          <XMarkIcon className="w-3 h-3" /> Exit
        </button>
      </div>
    </div>
  );
}
