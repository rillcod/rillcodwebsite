'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  ArrowLeftIcon, PencilIcon, TrashIcon, PlayIcon,
  SparklesIcon, Squares2X2Icon, PresentationChartBarIcon,
  CheckCircleIcon, ArrowPathIcon, XMarkIcon,
  ChevronLeftIcon, ChevronRightIcon, PlusIcon, ArrowDownTrayIcon,
} from '@/lib/icons';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import EnhancedFlashcardBuilder from '@/components/flashcards/EnhancedFlashcardBuilder';
import { getTemplateStyle } from '@/components/flashcards/templates';
import FlashcardMarkdown from '@/components/flashcards/FlashcardMarkdown';
import { toPng } from 'html-to-image';
import { createClient } from '@/lib/supabase/client';

interface Card {
  id: string; front: string; back: string;
  position: number; template?: string; created_at: string;
}
interface Deck {
  id: string; title: string;
  lesson_id: string | null; course_id: string | null; created_at: string;
  portal_users?: { full_name: string };
  lessons?: { title: string }; courses?: { name: string };
}

type ViewMode = 'grid' | 'presentation';

export default function FlashcardDeckPage() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useAuth();

  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showBuilder, setShowBuilder] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Grid state
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set());
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editForm, setEditForm] = useState({ front: '', back: '' });
  const [saving, setSaving] = useState(false);

  // Presentation state
  const [presIndex, setPresIndex] = useState(0);
  const [presFlipped, setPresFlipped] = useState(false);
  const [presEditing, setPresEditing] = useState(false);
  const [presEditForm, setPresEditForm] = useState({ front: '', back: '' });
  const [presSaving, setPresSaving] = useState(false);
  const [archiveSavingId, setArchiveSavingId] = useState<string | null>(null);
  const cardCaptureRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const deckId = params.deckId as string;
  const isTeacher = ['teacher', 'admin', 'school'].includes(profile?.role ?? '');

  useEffect(() => { loadDeck(); loadCards(); }, [deckId]);

  // Presentation keyboard nav
  useEffect(() => {
    if (viewMode !== 'presentation' || presEditing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); presNext(); }
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); presPrev(); }
      if (e.code === 'Space') { e.preventDefault(); setPresFlipped(v => !v); }
      if (e.key === 'Escape') setViewMode('grid');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [viewMode, presIndex, presEditing, cards.length]);

  async function loadDeck() {
    try {
      const res = await fetch(`/api/flashcards/decks/${deckId}`);
      const json = await res.json();
      if (res.ok) {
        setDeck(json.data);
        setLoadError(null);
      } else {
        setLoadError(json?.error || 'Failed to load this deck.');
      }
    } catch {
      setLoadError('Network error while loading this deck.');
    }
  }

  async function loadCards() {
    try {
      const res = await fetch(`/api/flashcards/decks/${deckId}/cards`);
      const json = await res.json();
      if (res.ok) setCards(json.data ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  // ── Grid CRUD ──
  async function deleteCard(cardId: string) {
    if (!confirm('Delete this card?')) return;
    try {
      const res = await fetch(`/api/flashcards/cards/${cardId}`, { method: 'DELETE' });
      if (res.ok) { setCards(p => p.filter(c => c.id !== cardId)); toast.success('Card deleted'); }
      else { const j = await res.json(); toast.error(j.error || 'Failed to delete'); }
    } catch { toast.error('Failed to delete'); }
  }

  async function saveEdit() {
    if (!editingCard || !editForm.front.trim() || !editForm.back.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/flashcards/cards/${editingCard.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ front: editForm.front.trim(), back: editForm.back.trim() }),
      });
      if (res.ok) {
        const j = await res.json();
        setCards(p => p.map(c => c.id === editingCard.id ? j.data : c));
        setEditingCard(null); toast.success('Card updated');
      } else { const j = await res.json(); toast.error(j.error || 'Failed to update'); }
    } catch { toast.error('Failed to update'); }
    finally { setSaving(false); }
  }

  // ── Presentation CRUD ──
  const presCard = cards[presIndex];
  const presNext = useCallback(() => { if (presIndex < cards.length - 1) { setPresIndex(i => i + 1); setPresFlipped(false); } }, [presIndex, cards.length]);
  const presPrev = useCallback(() => { if (presIndex > 0) { setPresIndex(i => i - 1); setPresFlipped(false); } }, [presIndex]);

  function startPresEdit() {
    if (!presCard) return;
    setPresEditForm({ front: presCard.front, back: presCard.back });
    setPresEditing(true);
  }

  async function savePresEdit() {
    if (!presCard || !presEditForm.front.trim() || !presEditForm.back.trim()) return;
    setPresSaving(true);
    try {
      const res = await fetch(`/api/flashcards/cards/${presCard.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ front: presEditForm.front.trim(), back: presEditForm.back.trim() }),
      });
      if (res.ok) {
        const j = await res.json();
        setCards(p => p.map(c => c.id === presCard.id ? j.data : c));
        setPresEditing(false); toast.success('Card updated');
      } else { const j = await res.json(); toast.error(j.error || 'Failed to update'); }
    } catch { toast.error('Failed to update'); }
    finally { setPresSaving(false); }
  }

  async function deletePresCard() {
    if (!presCard || !confirm('Delete this card?')) return;
    try {
      const res = await fetch(`/api/flashcards/cards/${presCard.id}`, { method: 'DELETE' });
      if (res.ok) {
        const newCards = cards.filter(c => c.id !== presCard.id);
        setCards(newCards);
        setPresIndex(i => Math.min(i, newCards.length - 1));
        setPresFlipped(false);
        toast.success('Card deleted');
        if (newCards.length === 0) setViewMode('grid');
      } else { const j = await res.json(); toast.error(j.error || 'Failed to delete'); }
    } catch { toast.error('Failed to delete'); }
  }

  async function saveCardImageToArchive(card: Card, cardNumber: number) {
    if (profile?.role !== 'student') {
      toast.error('Archive save is available for student accounts.');
      return;
    }
    const node = cardCaptureRefs.current[card.id];
    if (!node) {
      toast.error('Card capture failed. Please try again.');
      return;
    }

    setArchiveSavingId(card.id);
    try {
      const dataUrl = await toPng(node, {
        cacheBust: true,
        backgroundColor: '#0b1220',
        pixelRatio: 2,
      });

      const blob = await (await fetch(dataUrl)).blob();
      const ext = 'png';
      const db = createClient();
      const path = `${profile.id}/flashcards/${deckId}-${card.id}-${Date.now()}.${ext}`;
      const { error: uploadError } = await db.storage
        .from('portfolio-images')
        .upload(path, blob, { contentType: 'image/png' });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = db.storage.from('portfolio-images').getPublicUrl(path);
      const archiveRes = await fetch('/api/portfolio-projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${deck?.title || 'Flashcard Deck'} - Card ${cardNumber}`,
          description: `Flashcard snapshot saved from "${deck?.title || 'deck'}".`,
          category: 'Learning',
          tags: ['flashcard', 'study', 'learning-archive'],
          image_url: publicUrlData.publicUrl,
          source_type: 'lesson',
          source_id: card.id,
        }),
      });

      if (!archiveRes.ok) {
        const j = await archiveRes.json().catch(() => ({}));
        throw new Error(j.error || 'Archive save failed');
      }

      toast.success('Saved to your learning archive.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to save image to archive.');
    } finally {
      setArchiveSavingId(null);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!deck) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-black">Unable to open flashcard deck</h2>
          <p className="text-sm text-muted-foreground">
            {loadError ?? 'This deck may have been removed or you may not have access to it.'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                loadDeck().finally(() => setLoading(false));
              }}
              className="flex-1 px-4 py-2 bg-primary hover:bg-primary text-white text-sm font-bold rounded-xl transition-colors"
            >
              Retry
            </button>
            <Link
              href="/dashboard/flashcards"
              className="flex-1 px-4 py-2 bg-muted hover:bg-muted/80 text-center text-sm font-bold rounded-xl transition-colors"
            >
              Back
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const tpl = getTemplateStyle(presCard?.template);

  // ══════════════════════════════════════════════════════
  // PRESENTATION MODE — fullscreen slideshow
  // ══════════════════════════════════════════════════════
  if (viewMode === 'presentation') {
    const progress = cards.length > 0 ? ((presIndex + 1) / cards.length) * 100 : 0;

    return (
      <div className="fixed inset-0 z-50 bg-[#0a0a0a] flex flex-col select-none">

        {/* Top bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setViewMode('grid')}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/60 hover:text-white">
              <XMarkIcon className="w-5 h-5" />
            </button>
            <div>
              <p className="text-xs font-black text-white/80 truncate max-w-[160px] sm:max-w-xs">{deck.title}</p>
              <p className="text-[10px] text-white/30">{presIndex + 1} / {cards.length}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isTeacher && !presEditing && presCard && (
              <>
                <button onClick={startPresEdit}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors">
                  <PencilIcon className="w-3.5 h-3.5" /> Edit
                </button>
                <button onClick={deletePresCard}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors">
                  <TrashIcon className="w-3.5 h-3.5" /> Delete
                </button>
              </>
            )}
            {profile?.role === 'student' && cards.length > 0 && (
              <Link href={`/dashboard/flashcards/${deckId}/review`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors">
                <PlayIcon className="w-3.5 h-3.5" /> Study
              </Link>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-white/5 shrink-0">
          <motion.div className="h-full bg-gradient-to-r from-primary to-amber-400"
            animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }} />
        </div>

        {/* Main card area */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 gap-6 overflow-hidden">

          {cards.length === 0 ? (
            <div className="text-center space-y-4">
              <div className="text-6xl">🃏</div>
              <p className="text-white/50 font-bold">No cards in this deck</p>
              {isTeacher && (
                <button onClick={() => { setViewMode('grid'); setShowBuilder(true); }}
                  className="px-6 py-3 bg-primary hover:bg-primary text-white font-black rounded-xl transition-colors">
                  Add Cards
                </button>
              )}
            </div>
          ) : presEditing ? (
            /* ── Inline edit in presentation ── */
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-3xl p-6 sm:p-8 space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-white uppercase tracking-widest">Edit Card {presIndex + 1}</p>
                <button onClick={() => setPresEditing(false)} className="p-1.5 hover:bg-white/10 rounded-lg text-white/50 transition-colors">
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
              <div>
                <label className="block text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Question (Front)</label>
                <textarea value={presEditForm.front} onChange={e => setPresEditForm(p => ({ ...p, front: e.target.value }))}
                  rows={4} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm resize-none focus:outline-none focus:border-primary transition-colors placeholder:text-white/20"
                  placeholder="Enter the question…" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">Answer (Back)</label>
                <textarea value={presEditForm.back} onChange={e => setPresEditForm(p => ({ ...p, back: e.target.value }))}
                  rows={4} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm resize-none focus:outline-none focus:border-primary transition-colors placeholder:text-white/20"
                  placeholder="Enter the answer…" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setPresEditing(false)}
                  className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white font-black rounded-xl transition-colors text-sm">
                  Cancel
                </button>
                <button onClick={savePresEdit} disabled={presSaving || !presEditForm.front.trim() || !presEditForm.back.trim()}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black rounded-xl transition-colors text-sm flex items-center justify-center gap-2">
                  {presSaving ? <><ArrowPathIcon className="w-4 h-4 animate-spin" />Saving…</> : <><CheckCircleIcon className="w-4 h-4" />Save Card</>}
                </button>
              </div>
            </motion.div>
          ) : (
            /* ── The presentation card ── */
            <>
              {/* Card */}
              <div className="w-full max-w-2xl" style={{ perspective: '1400px' }}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${presIndex}-${presFlipped}`}
                    initial={{ rotateY: presFlipped ? -90 : 90, opacity: 0, scale: 0.9 }}
                    animate={{ rotateY: 0, opacity: 1, scale: 1 }}
                    exit={{ rotateY: presFlipped ? 90 : -90, opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    onClick={() => setPresFlipped(v => !v)}
                    className={`w-full min-h-[240px] sm:min-h-[320px] rounded-3xl p-8 sm:p-12 flex flex-col items-center justify-center text-center cursor-pointer shadow-2xl relative
                      ${presFlipped ? tpl.back : tpl.front} ${tpl.text}`}
                  >
                    {/* Side label */}
                    <span className="absolute top-4 left-5 text-[9px] font-black uppercase tracking-widest opacity-40">
                      {presFlipped ? 'Answer' : 'Question'}
                    </span>

                    {/* Card number */}
                    <span className="absolute top-4 right-5 text-[9px] font-black uppercase tracking-widest opacity-30">
                      {presIndex + 1}/{cards.length}
                    </span>

                    <motion.div
                      key={presFlipped ? 'back' : 'front'}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="text-xl sm:text-3xl font-bold leading-relaxed text-left w-full"
                    >
                      <FlashcardMarkdown content={presFlipped ? presCard.back : presCard.front} />
                    </motion.div>

                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 0.4 }} transition={{ delay: 0.4 }}
                      className="text-xs sm:text-sm mt-6 font-medium">
                      {presFlipped ? 'Tap to see question' : 'Tap to reveal answer'}
                    </motion.p>

                    {!presFlipped && <div className="absolute bottom-4 right-5 text-xl opacity-20">🔄</div>}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Dot indicators */}
              <div className="flex gap-1.5 flex-wrap justify-center max-w-xs">
                {cards.map((_, i) => (
                  <button key={i} onClick={() => { setPresIndex(i); setPresFlipped(false); }}
                    className={`h-1.5 rounded-full transition-all ${i === presIndex ? 'bg-primary w-6' : 'bg-white/20 w-1.5 hover:bg-white/40'}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Bottom nav */}
        {!presEditing && cards.length > 0 && (
          <div className="flex items-center justify-between px-4 sm:px-8 py-4 border-t border-white/10 shrink-0">
            <button onClick={presPrev} disabled={presIndex === 0}
              className="flex items-center gap-2 px-4 sm:px-6 py-3 bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white font-black rounded-2xl transition-colors text-sm">
              <ChevronLeftIcon className="w-5 h-5" />
              <span className="hidden sm:inline">Previous</span>
            </button>

            <button onClick={() => setPresFlipped(v => !v)}
              className="px-6 sm:px-10 py-3 bg-primary hover:bg-primary text-white font-black rounded-2xl transition-colors text-sm shadow-lg shadow-orange-900/30">
              {presFlipped ? 'Show Question' : 'Reveal Answer'}
            </button>

            <button onClick={presNext} disabled={presIndex === cards.length - 1}
              className="flex items-center gap-2 px-4 sm:px-6 py-3 bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white font-black rounded-2xl transition-colors text-sm">
              <span className="hidden sm:inline">Next</span>
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Keyboard hint */}
        <div className="text-center pb-3 shrink-0">
          <p className="text-[9px] text-white/20 font-medium hidden sm:block">
            ← → navigate &nbsp;·&nbsp; Space flip &nbsp;·&nbsp; Esc exit
          </p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // GRID MODE — card list with inline edit
  // ══════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Link href="/dashboard/flashcards" className="p-2 hover:bg-muted rounded-xl transition-colors shrink-0">
              <ArrowLeftIcon className="w-5 h-5" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-black text-foreground truncate">{deck.title}</h1>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                <span>{cards.length} card{cards.length !== 1 ? 's' : ''}</span>
                {deck.lessons?.title && <span>📖 {deck.lessons.title}</span>}
                {deck.courses?.name  && <span>🎓 {deck.courses.name}</span>}
              </div>
            </div>
          </div>

          {/* View mode toggle + actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* View toggle */}
            <div className="flex items-center bg-muted rounded-xl p-1 gap-0.5">
              <button onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'grid' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                <Squares2X2Icon className="w-3.5 h-3.5" /> Grid
              </button>
              <button onClick={() => { setPresIndex(0); setPresFlipped(false); setViewMode('presentation'); }}
                disabled={cards.length === 0}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40 text-muted-foreground hover:text-foreground`}>
                <PresentationChartBarIcon className="w-3.5 h-3.5" /> Present
              </button>
            </div>

            {/* Student: study button */}
            {profile?.role === 'student' && cards.length > 0 && (
              <Link href={`/dashboard/flashcards/${deckId}/review`}
                className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-white text-xs font-black rounded-xl transition-colors shadow-lg shadow-orange-900/20">
                <PlayIcon className="w-4 h-4" /> Start Review
              </Link>
            )}

            {/* Teacher: add cards + edit deck */}
            {isTeacher && (
              <>
                <button onClick={() => setShowBuilder(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-black rounded-xl transition-colors">
                  <SparklesIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Add Cards</span>
                  <span className="sm:hidden">Add</span>
                </button>
                <Link href={`/dashboard/flashcards/${deckId}/edit`}
                  className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-black rounded-xl transition-colors border border-border">
                  <PencilIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Edit Deck</span>
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Empty state */}
        {cards.length === 0 ? (
          <div className="text-center py-20 bg-card border border-border rounded-2xl">
            <div className="text-6xl mb-4">🃏</div>
            <h3 className="text-lg font-black text-foreground mb-2">No Cards Yet</h3>
            <p className="text-muted-foreground text-sm mb-6">
              {isTeacher ? 'Add flashcards using the builder or AI generation.' : 'Ask your teacher to add some cards!'}
            </p>
            {isTeacher && (
              <button onClick={() => setShowBuilder(true)}
                className="px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-black rounded-xl transition-colors">
                Add First Card
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((card, index) => {
              const t = getTemplateStyle(card.template);
              return (
                <motion.div key={card.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  className="bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/30 hover:shadow-md transition-all"
                >
                  {editingCard?.id === card.id ? (
                    /* Inline edit */
                    <div className="p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Editing #{index + 1}</p>
                        <button onClick={() => setEditingCard(null)} className="p-1 hover:bg-muted rounded-lg text-muted-foreground transition-colors">
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </div>
                      <div>
                        <label className="block text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">Question</label>
                        <textarea value={editForm.front} onChange={e => setEditForm(p => ({ ...p, front: e.target.value }))}
                          rows={3} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary transition-colors" />
                      </div>
                      <div>
                        <label className="block text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Answer</label>
                        <textarea value={editForm.back} onChange={e => setEditForm(p => ({ ...p, back: e.target.value }))}
                          rows={3} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary transition-colors" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setEditingCard(null)} className="flex-1 py-2 bg-muted text-muted-foreground text-xs font-black rounded-xl hover:bg-muted/80 transition-colors">Cancel</button>
                        <button onClick={saveEdit} disabled={saving || !editForm.front.trim() || !editForm.back.trim()}
                          className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black rounded-xl transition-colors">
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Flip preview */}
                      <div
                        ref={(node) => {
                          cardCaptureRefs.current[card.id] = node;
                        }}
                        className={`p-5 min-h-[130px] flex flex-col justify-between ${flippedCards.has(card.id) ? t.back : t.front} ${t.text} cursor-pointer select-none`}
                        onClick={() => {
                          setFlippedCards(prev => {
                            const next = new Set(prev);
                            if (next.has(card.id)) next.delete(card.id);
                            else next.add(card.id);
                            return next;
                          });
                        }}
                      >
                        <AnimatePresence mode="wait">
                          {!flippedCards.has(card.id) ? (
                            <motion.div key="f" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                              <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-2">Question</p>
                              <div className="text-sm font-medium text-foreground leading-relaxed line-clamp-4">
                                <FlashcardMarkdown content={card.front} />
                              </div>
                            </motion.div>
                          ) : (
                            <motion.div key="b" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                              <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-2">Answer</p>
                              <div className="text-sm text-foreground leading-relaxed line-clamp-4">
                                <FlashcardMarkdown content={card.back} />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <p className="text-[9px] text-muted-foreground/40 mt-2">
                          {flippedCards.has(card.id) ? '🔄 Tap for question' : '👆 Tap to reveal answer'}
                        </p>
                      </div>

                      {/* Footer */}
                      <div className="px-5 pb-4 flex items-center justify-between border-t border-border pt-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-muted-foreground/40 font-black">#{index + 1}</span>
                          {card.template && card.template !== 'classic' && (
                            <span className="text-[8px] px-2 py-0.5 bg-muted rounded-full text-muted-foreground font-bold capitalize">{card.template}</span>
                          )}
                        </div>
                        <div className="flex gap-1.5">
                          {profile?.role === 'student' && (
                            <button
                              onClick={() => saveCardImageToArchive(card, index + 1)}
                              disabled={archiveSavingId === card.id}
                              className="p-1.5 hover:bg-emerald-500/10 rounded-lg text-muted-foreground hover:text-emerald-400 transition-colors disabled:opacity-50"
                              title="Save card image to archive"
                            >
                              {archiveSavingId === card.id ? (
                                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        {isTeacher && (
                          <>
                            <button onClick={() => { setEditingCard(card); setEditForm({ front: card.front, back: card.back }); }}
                              className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors" title="Edit">
                              <PencilIcon className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteCard(card.id)}
                              className="p-1.5 hover:bg-rose-500/10 rounded-lg text-muted-foreground hover:text-rose-400 transition-colors" title="Delete">
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        </div>
                      </div>
                    </>
                  )}
                </motion.div>
              );
            })}

            {/* Add card tile (teacher) */}
            {isTeacher && (
              <motion.button
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: cards.length * 0.04 }}
                onClick={() => setShowBuilder(true)}
                className="border-2 border-dashed border-border hover:border-violet-500/50 rounded-2xl p-5 flex flex-col items-center justify-center gap-3 text-muted-foreground hover:text-violet-400 transition-all min-h-[130px] group"
              >
                <PlusIcon className="w-8 h-8 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-black uppercase tracking-widest">Add Card</span>
              </motion.button>
            )}
          </div>
        )}
      </div>

      {/* Builder modal */}
      <AnimatePresence>
        {showBuilder && (
          <EnhancedFlashcardBuilder
            deckId={deckId}
            onClose={() => setShowBuilder(false)}
            onCardCreated={loadCards}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
