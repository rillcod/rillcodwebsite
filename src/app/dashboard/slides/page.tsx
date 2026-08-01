'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import SlideViewer from '@/components/learning/SlideViewer';
import { PaperClipIcon, AcademicCapIcon, ArrowRightIcon } from '@/lib/icons';

type Deck = { id: string; title: string; file_url: string; lesson_id: string; lesson_title: string | null };
type Course = { course_id: string | null; course_title: string; decks: Deck[] };
type Program = { program_id: string | null; program_name: string; courses: Course[] };

function parseDeck(fileUrl: string): { pdf?: string; slides?: string[] } {
  try {
    const p = JSON.parse(fileUrl);
    return {
      pdf: typeof p?.pdf === 'string' ? p.pdf : undefined,
      slides: Array.isArray(p?.slides) ? p.slides.filter((s: any) => typeof s === 'string') : undefined,
    };
  } catch { return {}; }
}

export default function SlidesCatalogPage() {
  const { loading: authLoading, profile } = useAuth();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [viewer, setViewer] = useState<{ slides?: string[]; pdf?: string; title: string; lessonId: string } | null>(null);

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    fetch('/api/slide-decks')
      .then((r) => (r.ok ? r.json() : { programs: [] }))
      .then((j) => { if (active) { setPrograms(j.programs ?? []); setLoading(false); } })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authLoading]);

  const totalDecks = programs.reduce((n, p) => n + p.courses.reduce((m, c) => m + c.decks.length, 0), 0);

  // Search across deck title / lesson / course / programme.
  const q = query.trim().toLowerCase();
  const filteredPrograms = !q ? programs : programs
    .map((p) => ({
      ...p,
      courses: p.courses
        .map((c) => ({
          ...c,
          decks: c.decks.filter((d) =>
            d.title.toLowerCase().includes(q) ||
            (d.lesson_title ?? '').toLowerCase().includes(q) ||
            c.course_title.toLowerCase().includes(q) ||
            p.program_name.toLowerCase().includes(q),
          ),
        }))
        .filter((c) => c.decks.length > 0),
    }))
    .filter((p) => p.courses.length > 0);
  const shownDecks = filteredPrograms.reduce((n, p) => n + p.courses.reduce((m, c) => m + c.decks.length, 0), 0);

  if (loading) return (
    <div className="min-h-[60vh] flex items-center justify-center mobile-page-root">
      <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-8 mobile-page-root">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1">
          <div className="p-3 rounded-2xl bg-violet-500/10 text-violet-700 dark:text-violet-300"><PaperClipIcon className="w-6 h-6" /></div>
          <div>
            <h1 className="text-xl font-black text-foreground">Learning Slides</h1>
            <p className="text-xs text-muted-foreground">View-only slide decks, organised by programme &amp; course · {totalDecks} deck{totalDecks === 1 ? '' : 's'}</p>
          </div>
        </div>
        {totalDecks > 0 && (
          <input aria-label="Search slides"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search slides, course, programme…"
            className="w-full sm:w-64 px-4 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-violet-500/50"
          />
        )}
      </div>

      {totalDecks === 0 ? (
        <div className="py-20 text-center bg-card border border-dashed border-border rounded-2xl">
          <PaperClipIcon className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm font-bold text-foreground">No learning slides yet</p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-muted-foreground mobile-page-root">
            {['teacher', 'admin', 'school'].includes(profile?.role ?? '')
              ? 'Open a class, choose its teaching plan and add slides to a lesson. They will appear here automatically.'
              : 'Slides shared through your lessons will appear here automatically.'}
          </p>
          {['teacher', 'admin', 'school'].includes(profile?.role ?? '') && (
            <Link href="/dashboard/classes" className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground">
              Open classes
            </Link>
          )}
        </div>
      ) : shownDecks === 0 ? (
        <div className="py-16 text-center bg-card border border-dashed border-border rounded-2xl">
          <p className="text-sm font-bold text-muted-foreground">No slides match “{query}”.</p>
        </div>
      ) : (
        filteredPrograms.map((prog) => (
          <section key={prog.program_id ?? prog.program_name} className="space-y-4">
            <div className="flex items-center gap-2">
              <AcademicCapIcon className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              <h2 className="text-base font-black text-foreground">{prog.program_name}</h2>
            </div>
            {prog.courses.map((course) => (
              <div key={course.course_id ?? course.course_title} className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/70 pl-1">{course.course_title}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {course.decks.map((deck) => {
                    const d = parseDeck(deck.file_url);
                    const count = d.pdf ? 'PDF' : `${d.slides?.length ?? 0} slides`;
                    const hasContent = !!d.pdf || (d.slides?.length ?? 0) > 0;
                    return (
                      <div key={deck.id} className="bg-card border border-violet-500/20 rounded-2xl p-4 flex flex-col gap-3 hover:border-violet-500/40 transition-all">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-violet-700/60 dark:text-violet-300/60">{count} · view-only</p>
                          <p className="text-sm font-black text-foreground leading-snug line-clamp-2">{deck.title}</p>
                          {deck.lesson_title && (
                            <Link href={`/dashboard/lessons/${deck.lesson_id}`} className="text-[11px] text-muted-foreground hover:text-violet-700 dark:hover:text-violet-300 inline-flex items-center gap-1 mt-1">
                              in {deck.lesson_title} <ArrowRightIcon className="w-3 h-3" />
                            </Link>
                          )}
                        </div>
                        <button onClick={() => hasContent && setViewer({ slides: d.slides, pdf: d.pdf, title: deck.title, lessonId: deck.lesson_id })}
                          disabled={!hasContent}
                          className="mt-auto px-4 py-2 text-xs font-black uppercase tracking-widest text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-xl transition-all">
                          View Slides
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        ))
      )}

      {viewer && (
        <SlideViewer slides={viewer.slides} pdfKey={viewer.pdf} title={viewer.title} lessonId={viewer.lessonId} onClose={() => setViewer(null)} />
      )}
    </div>
  );
}
