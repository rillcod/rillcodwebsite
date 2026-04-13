'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { BanknotesIcon, ArrowPathIcon, BuildingOfficeIcon, CheckCircleIcon } from '@/lib/icons';
import { toast } from 'sonner';

type SchoolOption = { id: string; name: string };
type BillingContact = {
  school_id: string;
  representative_name: string | null;
  representative_email: string | null;
  representative_whatsapp: string | null;
  teacher_id: string | null;
  notes: string | null;
};

export default function BillingContactsPage() {
  const { profile, loading: authLoading } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const canManage = ['admin', 'school', 'teacher'].includes(profile?.role ?? '');

  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<BillingContact>({
    school_id: '',
    representative_name: '',
    representative_email: '',
    representative_whatsapp: '',
    teacher_id: null,
    notes: '',
  });

  const load = useCallback(async () => {
    if (!profile || !canManage) return;
    setLoading(true);
    try {
      if (isAdmin) {
        const schoolsRes = await fetch('/api/schools', { cache: 'no-store' });
        const schoolsJson = await schoolsRes.json();
        const schoolRows = (schoolsJson.data ?? []) as SchoolOption[];
        setSchools(schoolRows);
        if (!selectedSchoolId && schoolRows.length > 0) {
          setSelectedSchoolId(schoolRows[0].id);
        }
      }

      const scopeSchoolId = isAdmin ? selectedSchoolId : profile.school_id;
      if (!scopeSchoolId) {
        setLoading(false);
        return;
      }

      const q = isAdmin ? `?school_id=${encodeURIComponent(scopeSchoolId)}` : '';
      const res = await fetch(`/api/billing/settings${q}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load billing contact');
      const data = json?.data as BillingContact | null;
      setForm({
        school_id: scopeSchoolId,
        representative_name: data?.representative_name ?? '',
        representative_email: data?.representative_email ?? '',
        representative_whatsapp: data?.representative_whatsapp ?? '',
        teacher_id: data?.teacher_id ?? null,
        notes: data?.notes ?? '',
      });
    } catch (err: any) {
      toast.error(err?.message || 'Could not load billing settings');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.school_id, canManage, isAdmin, selectedSchoolId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!authLoading && profile) load();
  }, [authLoading, profile, load]);

  useEffect(() => {
    if (!isAdmin || !selectedSchoolId || !profile) return;
    load();
  }, [selectedSchoolId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setSaving(true);
    try {
      const payload = {
        school_id: isAdmin ? selectedSchoolId : profile?.school_id,
        representative_name: form.representative_name || null,
        representative_email: form.representative_email || null,
        representative_whatsapp: form.representative_whatsapp || null,
        teacher_id: form.teacher_id || null,
        notes: form.notes || null,
      };
      const res = await fetch('/api/billing/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to save billing contact');
      toast.success('Billing contact saved');
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Could not save billing contact');
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <ArrowPathIcon className="w-8 h-8 animate-spin text-orange-400" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-center">
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Staff access required</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="border border-border bg-card rounded-none p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-foreground flex items-center gap-2">
              <BanknotesIcon className="w-6 h-6 text-orange-400" />
              Billing Contact
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Configure email and WhatsApp contacts for termly reminders (weeks 6, 7, 8).
            </p>
          </div>
          <button
            onClick={load}
            className="px-3 py-2 border border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground rounded-none"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="border border-border bg-card rounded-none p-5 sm:p-6 space-y-4">
        {isAdmin && (
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">School</label>
            <div className="relative">
              <BuildingOfficeIcon className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <select
                value={selectedSchoolId}
                onChange={(e) => setSelectedSchoolId(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-background border border-border rounded-none text-sm"
              >
                <option value="">Select school...</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">Representative Name</label>
            <input
              value={form.representative_name ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, representative_name: e.target.value }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-none text-sm"
              placeholder="Billing contact full name"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">Billing Email</label>
            <input
              type="email"
              value={form.representative_email ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, representative_email: e.target.value }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-none text-sm"
              placeholder="billing@school.com"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">WhatsApp Number</label>
            <input
              value={form.representative_whatsapp ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, representative_whatsapp: e.target.value }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-none text-sm"
              placeholder="+234..."
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">Notes</label>
            <input
              value={form.notes ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-none text-sm"
              placeholder="Optional billing notes"
            />
          </div>
        </div>

        <div className="pt-2">
          <button
            onClick={save}
            disabled={saving || (isAdmin && !selectedSchoolId)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-black uppercase tracking-widest rounded-none disabled:opacity-50"
          >
            <CheckCircleIcon className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Billing Contact'}
          </button>
        </div>
      </div>
    </div>
  );
}

