import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Result Checker',
  description: 'Verify a Rillcod access card code to view your child’s official progress report.',
};

export default function ResultCheckLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="result-check-scope min-h-screen">
      {children}
    </div>
  );
}
