import DashboardNavigation from '@/components/layout/DashboardNavigation';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row min-h-screen md:h-screen md:overflow-hidden bg-[#050a17] text-gray-100 font-sans print:h-auto print:min-h-0 print:bg-white print:text-black">
      <div className="print:hidden h-full flex flex-col">
        <DashboardNavigation />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col w-full relative pt-[53px] pb-[80px] md:pt-0 md:pb-0 md:overflow-y-auto print:overflow-visible print:pt-0 print:pb-0 print:block">
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 mobile-landscape-padding print:p-0 print:max-w-none print:m-0">
          {children}
        </main>
      </div>
    </div>
  );
}