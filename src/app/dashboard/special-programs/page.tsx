'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import {
  specialProgramPublicPath,
  type SpecialProgramPage,
} from '@/lib/special-programs/types';
import { brandContact } from '@/config/brand';
import SpecialProgramVisualBuilder, {
  toSpecialForm,
} from '@/components/special-programs/SpecialProgramVisualBuilder';

export default function SpecialProgramsAdminPage() {
  const { profile, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<SpecialProgramPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SpecialProgramPage | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [builderKey, setBuilderKey] = useState(0);

  const isAdmin = profile?.role === 'admin';
  const siteOrigin = typeof window !== 'undefined' ? window.location.origin : brandContact.siteUrl;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/special-programs', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed to load');
      setRows(j.data || []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load special programmes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    load();
  }, [authLoading, isAdmin, load]);

  const openCreate = () => {
    setEditing(null);
    setBuilderKey((k) => k + 1);
    setShowBuilder(true);
  };

  const openEdit = (p: SpecialProgramPage) => {
    setEditing(p);
    setBuilderKey((k) => k + 1);
    setShowBuilder(true);
  };

  const copyUrl = (slug: string) => {
    const url = `${siteOrigin}${specialProgramPublicPath(slug)}`;
    navigator.clipboard?.writeText(url);
    toast.success('Public URL copied');
  };

  const setFeatured = async (id: string) => {
    try {
      const res = await fetch(`/api/special-programs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ set_featured: true }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      toast.success('Homepage button now points to this programme');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to set featured');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this special programme page?')) return;
    try {
      const res = await fetch(`/api/special-programs/${id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      toast.success('Deleted');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    }
  };

  if (authLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!isAdmin) {
    return <div className="p-8 text-sm text-rose-500">Admin access required.</div>;
  }

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Academics</p>
          <h1 className="text-2xl font-black text-foreground">Special Programmes</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Full visual page builder — click sections on the live preview to edit. AI can draft, then you customize. Set one as featured for the homepage button.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-black uppercase tracking-widest"
        >
          New special programme
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No special programmes yet. Create one to generate a public URL.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((p) => (
            <div key={p.id} className="border border-border rounded-xl bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-black text-foreground truncate">{p.title}</h2>
                  {p.is_featured && (
                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30">
                      Featured
                    </span>
                  )}
                  <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${p.is_published ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-muted text-muted-foreground border-border'}`}>
                    {p.is_published ? 'Published' : 'Draft'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
                  {siteOrigin}{specialProgramPublicPath(p.slug)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Button: {p.button_label} · {(p.content?.tracks || []).length} modules · {(p.content?.weeks || []).length} weeks
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button type="button" onClick={() => copyUrl(p.slug)} className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border border-border rounded-md hover:bg-muted">
                  Copy URL
                </button>
                <Link href={specialProgramPublicPath(p.slug)} target="_blank" className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border border-border rounded-md hover:bg-muted">
                  Open
                </Link>
                {!p.is_featured && (
                  <button type="button" onClick={() => setFeatured(p.id)} className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border border-amber-500/40 text-amber-500 rounded-md hover:bg-amber-500/10">
                    Set featured
                  </button>
                )}
                <button type="button" onClick={() => openEdit(p)} className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border border-border rounded-md hover:bg-muted">
                  Edit page
                </button>
                <button type="button" onClick={() => remove(p.id)} className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border border-rose-500/30 text-rose-500 rounded-md hover:bg-rose-500/10">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showBuilder && (
        <SpecialProgramVisualBuilder
          key={builderKey}
          editing={editing}
          initialForm={toSpecialForm(editing)}
          onClose={() => setShowBuilder(false)}
          onSaved={() => {
            setShowBuilder(false);
            load();
          }}
        />
      )}
    </div>
  );
}
