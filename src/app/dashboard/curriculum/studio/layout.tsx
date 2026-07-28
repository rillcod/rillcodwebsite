import Link from 'next/link';

export default function CurriculumStudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav aria-label="Curriculum Studio" className="sticky top-0 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto">
          <Link href="/dashboard/curriculum/studio" className="shrink-0 rounded-xl px-4 py-2 text-sm font-black hover:bg-muted">Academic review</Link>
          <Link href="/dashboard/curriculum/studio/schools" className="shrink-0 rounded-xl px-4 py-2 text-sm font-black hover:bg-muted">Official direction & schools</Link>
          <Link href="/dashboard/curriculum/studio/timing" className="shrink-0 rounded-xl px-4 py-2 text-sm font-black hover:bg-muted">School timing</Link>
        </div>
      </nav>
      {children}
    </>
  );
}

