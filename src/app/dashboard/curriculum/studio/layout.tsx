'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CheckCircleIcon } from '@/lib/icons';

const STAGES = [
  { number: 1, label: 'Set direction', short: 'Direction', href: '/dashboard/curriculum/studio', matches: ['/dashboard/curriculum/studio'] },
  { number: 2, label: 'Confirm timing', short: 'Timing', href: '/dashboard/curriculum/studio/timing', matches: ['/dashboard/curriculum/studio/schools', '/dashboard/curriculum/studio/timing'] },
  { number: 3, label: 'Monitor teaching', short: 'Monitor', href: '/dashboard/curriculum/studio/monitor', matches: ['/dashboard/curriculum/studio/monitor'] },
];
function stageIndex(pathname: string) {
  const match = STAGES.findIndex((stage) => stage.matches.some((route) => pathname === route || pathname.startsWith(`${route}/`)));
  return match >= 0 ? match : 0;
}
export default function CurriculumStudioLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = stageIndex(pathname);

  return (
    <>
      <div className="sticky top-0 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-black text-foreground">Academic Office</p>
            <p className="text-xs text-muted-foreground">Stage {current + 1} of {STAGES.length}</p>
          </div>
          <nav aria-label="Academic Office stages" className="overflow-x-auto">
            <ol className="flex min-w-max items-center gap-2" role="list">
              {STAGES.map((stage, index) => {
                const active = index === current;
                const earlier = index < current;
                return (
                  <li key={stage.href}>
                    <Link href={stage.href} aria-current={active ? 'step' : undefined} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${active ? 'bg-primary-foreground/20' : earlier ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
                        {earlier ? <CheckCircleIcon className="h-4 w-4" /> : stage.number}
                      </span>
                      <span className="hidden sm:inline">{stage.label}</span>
                      <span className="sm:hidden">{stage.short}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>
      </div>
      {children}
    </>
  );
}