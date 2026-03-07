import DashboardNavigation from '@/components/layout/DashboardNavigation';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#050a17] text-gray-100 font-sans">
      <DashboardNavigation />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-y-auto w-full relative">
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8 mobile-landscape-padding">
          {children}
        </main>
      </div>
    </div>
  );
}