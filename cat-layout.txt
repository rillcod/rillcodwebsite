import DashboardNavigation from '@/components/layout/DashboardNavigation';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // On mobile: column layout (nav is fixed, content fills remaining space)
    // On md+: row layout (sidebar + scrollable content)
    <div className="flex flex-col md:flex-row md:h-screen bg-[#050a17] text-gray-100 font-sans">
      <DashboardNavigation />

      {/* Main Content Area */}
      {/* pt-[53px]: offset for the fixed mobile top header
          pb-20: offset for the fixed mobile bottom nav (5rem ≈ 80px)
          md: resets both offsets since the sidebar is in the flow */}
      <div className="flex-1 flex flex-col overflow-y-auto w-full relative pt-[53px] pb-20 md:pt-0 md:pb-0">
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 mobile-landscape-padding">
          {children}
        </main>
      </div>
    </div>
  );
}