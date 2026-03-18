import DashboardNavigation from '@/components/layout/DashboardNavigation';
import DashboardShell from '@/components/layout/DashboardShell';
import CommandPalette from '@/components/layout/CommandPalette';
import PasswordChangeGuard from '@/components/layout/PasswordChangeGuard';
import { Suspense } from 'react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row min-h-screen md:h-screen md:overflow-hidden bg-[#0a0a0a] text-gray-100 font-sans print:h-auto print:min-h-0 print:bg-white print:text-black">
      {/* Force-password-change guard — renders a blocking modal for bulk-registered students */}
      <PasswordChangeGuard />

      <div className="print:hidden h-full flex flex-col">
        <Suspense fallback={<div className="w-64 h-full bg-[#0B132B]" />}>
          <DashboardNavigation />
        </Suspense>
      </div>

      {/* Main Content Area */}
      <DashboardShell>
        {children}
      </DashboardShell>
    </div>
  );
}