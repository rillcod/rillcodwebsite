'use client';

import { useState } from 'react';
import { XMarkIcon, TrashIcon, PlusIcon } from '@/lib/icons';

type Deck = { pdf?: string; slides?: string[] };

function parseDeck(fileUrl: string): Deck {
  try {
    const p = JSON.parse(fileUrl);
    return {
      pdf: typeof p?.pdf === 'string' ? p.pdf : undefined,
      slides: Array.isArray(p?.slides) ? p.slides.filter((s: any) => typeof s === 'string') : undefined,
    };
  } catch { return {}; }
}

/** Strip the /api/media/ proxy prefix to recover the raw R2 key. */
async function uploadToKey(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/files/upload', { method: 'POST', body: fd });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error || 'Upload failed');
  const key = payload.data.storage_path || String(payload.data.public_url || '').replace(/^.*\/api\/media\//, '');
  if (!key) throw new Error('Upload succeeded but no storage key was returned.');
  return key;
}

/**
 * Staff editor for a view-only slide deck — the "Update" in CRUD.
 * Image decks: rename, reorder, remove, add slides. PDF decks: rename, replace PDF.
 * Saves via PATCH /api/lessons/[lessonId]/materials/[mid].
 */
export default function SlideDeckManager({
  lessonId,
  material,
  onClose,
  onSaved,
}: {
  lessonId: string;
  material: any;
  onClose: () => void;
  onSaved: (updated: any) => void;
}) {
  const initial = parseDeck(material.file_url);
  const isPdf = !!initial.pdf;

  const [title, setTitle] = useState<string>(material.title ?? '');
  const [slides, setSlides] = useState<string[]>(initial.slides ?? []);
  const [pdfKey, setPdfKey] = useState<string | undefined>(initial.pdf);
  const [busy, setBusy] = useState<string | null>(null); // upload progress label
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slideUrl = (key: string) => `/api/slides/${key}?lesson=${encodeURIComponent(lessonId)}`;

  const move = (i: number, dir: -1 | 1) => {
    setSlides(prev => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const remove = (i: number) => setSlides(prev => prev.filter((_, idx) => idx !== i));

  const addImages = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setError(null);
    try {
      const added: string[] = [];
      for (let n = 0; n < files.length; n++) {
        setBusy(`Uploading ${n + 1} of ${files.length}…`);
        added.push(await uploadToKey(files[n]));
      }
      setSlides(prev => [...prev, ...added]);
    } catch (e: any) {
      setError(e.message ?? 'Upload failed');
    } finally {
      setBusy(null);
    }
  };

  const replacePdf = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setBusy('Uploading PDF…');
    try {
      setPdfKey(await uploadToKey(file));
    } catch (e: any) {
      setError(e.message ?? 'Upload failed');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!title.trim()) { setError('Give the slides a title.'); return; }
    if (!isPdf && slides.length === 0) { setError('Add at least one slide.'); return; }
    setSaving(true); setError(null);
    try {
      const file_url = isPdf ? JSON.stringify({ pdf: pdfKey }) : JSON.stringify({ slides });
      const res = await fetch(`/api/lessons/${lessonId}/materials/${material.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), file_url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      onSaved(json.data);
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-foreground/35 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <p className="text-sm font-black text-foreground">Manage Slides</p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"><XMarkIcon className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary" />
          </div>

          {isPdf ? (
            <div className="space-y-2">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">PDF Deck</p>
              <p className="text-xs text-muted-foreground">{pdfKey ? 'A PDF is attached.' : 'No PDF attached.'} Replace it below.</p>
              <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-widest text-primary-foreground bg-primary hover:bg-primary rounded-xl cursor-pointer transition-all">
                Replace PDF
                <input type="file" className="hidden" accept="application/pdf" onChange={e => { replacePdf(e.target.files?.[0] ?? null); e.currentTarget.value = ''; }} />
              </label>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Slides ({slides.length})</p>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-violet-300 bg-violet-500/10 border border-violet-500/25 rounded-lg cursor-pointer hover:bg-violet-500/20 transition-all">
                  <PlusIcon className="w-3.5 h-3.5" /> Add
                  <input type="file" className="hidden" accept="image/*" multiple onChange={e => { addImages(e.target.files); e.currentTarget.value = ''; }} />
                </label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {slides.map((key, i) => (
                  <div key={`${key}-${i}`} className="relative group border border-border rounded-lg overflow-hidden bg-muted/30">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={slideUrl(key)} alt={`Slide ${i + 1}`} className="w-full h-24 object-cover" />
                    <span className="absolute top-1 left-1 text-[9px] font-black text-white bg-black/60 px-1.5 py-0.5 rounded">{i + 1}</span>
                    <div className="absolute bottom-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => move(i, -1)} disabled={i === 0} className="w-6 h-6 flex items-center justify-center bg-black/70 text-white text-xs rounded disabled:opacity-30">↑</button>
                      <button onClick={() => move(i, 1)} disabled={i === slides.length - 1} className="w-6 h-6 flex items-center justify-center bg-black/70 text-white text-xs rounded disabled:opacity-30">↓</button>
                      <button onClick={() => remove(i)} className="w-6 h-6 flex items-center justify-center bg-rose-500/80 hover:bg-rose-500 text-white rounded"><TrashIcon className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {busy && <p className="text-xs text-amber-400">{busy}</p>}
          {error && <p className="text-xs text-rose-400">{error}</p>}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-border shrink-0">
          <button onClick={onClose} disabled={saving} className="flex-1 py-2.5 bg-background hover:bg-muted border border-border text-muted-foreground text-xs font-black uppercase tracking-widest rounded-xl transition-all">Cancel</button>
          <button onClick={save} disabled={saving || !!busy} className="flex-1 py-2.5 bg-primary hover:bg-primary disabled:opacity-50 text-primary-foreground text-xs font-black uppercase tracking-widest rounded-xl transition-all">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
