import type { Metadata } from 'next';
import { Syne, DM_Sans } from 'next/font/google';

const display = Syne({
  subsets: ['latin'],
  variable: '--font-rc-display',
  weight: ['600', '700', '800'],
});

const body = DM_Sans({
  subsets: ['latin'],
  variable: '--font-rc-body',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Result Checker',
  description: 'Verify a Rillcod access card code to view your child’s official progress report.',
};

export default function ResultCheckLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${display.variable} ${body.variable} result-check-scope min-h-screen`}>
      {children}
    </div>
  );
}
