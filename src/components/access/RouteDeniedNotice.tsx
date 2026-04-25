'use client';

import Link from 'next/link';
import { ShieldExclamationIcon } from '@/lib/icons';

type Props = {
  title?: string;
  body?: string;
  homeHref?: string;
};

/**
 * Inline “access denied” surface for dashboard routes the signed-in role
 * must not use (partner school, student, parent, etc.).
 */
export default function RouteDeniedNotice({
  title = 'This area is not available for your account',
  body = 'You were redirected because this page is reserved for platform staff or a different role. Use the menu or go back to your dashboard.',
  homeHref = '/dashboard',
}: Props) {
  return (
    <div className="min-h-[40vh] flex flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-none border border-primary/30 bg-primary/10 text-primary">
        <ShieldExclamationIcon className="h-7 w-7" aria-hidden />
      </div>
      <div className="max-w-md space-y-2">
        <h1 className="text-base font-black uppercase tracking-widest text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
      </div>
      <Link
        href={homeHref}
        className="text-xs font-black uppercase tracking-widest text-primary hover:text-primary underline underline-offset-4"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
