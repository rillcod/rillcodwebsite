'use client';

// Class ID cards & RC roster — one screen per class.
// The teacher sees every member of THIS class, ticks who should get report access,
// issues any missing cards in one tap, then prints the RC roster / ID cards or copies
// the RC numbers to share with parents. No hunting through the global Card Studio.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ClipboardIcon as ClipboardDocumentIcon,
  CreditCardIcon as IdentificationIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  PaintBrushIcon as SwatchIcon,
  PrinterIcon,
  ShieldCheckIcon,
  SparklesIcon,
  XMarkIcon,
} from '@/lib/icons';
import { useAuth } from '@/contexts/auth-context';
import { accessCardCodeForStudent, formatAccessCardCodeDisplay } from '@/lib/access-card-code';
import { buildStudentRosterRows, downloadStudentRosterPdf } from '@/lib/cards/exportRoster';
import { buildBulkPrintHtml, fetchCardConfig, openPrintWindow, type CardHolder } from '@/lib/cards/printCard';

type Member = {
  id: string;
  full_name: string;
  email?: string | null;
  temp_password?: string | null;
  grade?: string | null;
  section_class?: string | null;
  school_name?: string | null;
  school_id?: string | null;
  has_published_report?: boolean;
  has_draft_report?: boolean;
};

type DbCard = {
  id: string;
  holder_id: string;
  status: 'active' | 'expired' | 'revoked' | string;
  card_number?: string | null;
  verification_code?: string | null;
  expires_at?: string | null;
};

type CardState = 'active' | 'missing' | 'expired';
type Filter = 'all' | 'missing' | 'active' | 'published' | 'pending';

function cardStateOf(card: DbCard | undefined): CardState {
  if (!card || card.status === 'revoked') return 'missing';
  if (card.status === 'expired') return 'expired';
  return 'active';
}

export default function ClassCardsPage() {
  const params = useParams();
  const id = params?.id as string;
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const isStaff = ['admin', 'teacher', 'school'].includes(profile?.role ?? '');

  const [cls, setCls] = useState<any>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [cards, setCards] = useState<Map<string, DbCard>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cardsError, setCardsError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<'' | 'issue' | 'roster' | 'cards' | 'fix' | 'sheet'>('');

  const loadCards = useCallback(async (schoolId: string | null) => {
    setCardsError('');
    try {
      const qs = new URLSearchParams({ holder_type: 'student', slim: 'true' });
      if (schoolId) qs.set('school_id', schoolId);
      const res = await fetch(`/api/cards?${qs.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load issued cards');
      const json = await res.json();
      const map = new Map<string, DbCard>();
      // Newest first from the API — keep the first live card per student.
      for (const c of (json.data ?? []) as DbCard[]) {
        const prev = map.get(c.holder_id);
        if (!prev || (prev.status === 'revoked' && c.status !== 'revoked')) map.set(c.holder_id, c);
      }
      setCards(map);
    } catch (e: any) {
      setCardsError(e?.message || 'Could not load issued cards');
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [clsRes, stuRes] = await Promise.all([
        fetch(`/api/classes/${id}`, { cache: 'no-store' }),
        fetch(`/api/classes/${id}/students?with_reports=1&with_credentials=1`, { cache: 'no-store' }),
      ]);
      const clsJson = await clsRes.json().catch(() => ({}));
      const stuJson = await stuRes.json().catch(() => ({}));
      if (!clsRes.ok) throw new Error(clsJson?.error || 'Class not found');
      if (!stuRes.ok) throw new Error(stuJson?.error || 'Could not load class members');
      const klass = clsJson.data;
      setCls(klass);
      const list: Member[] = (stuJson.students ?? [])
        .filter((s: any) => s.is_current_term_active !== false)
        .sort((a: Member, b: Member) => (a.full_name || '').localeCompare(b.full_name || ''));
      setMembers(list);
      await loadCards(klass?.school_id ?? list[0]?.school_id ?? null);
    } catch (e: any) {
      setError(e?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [id, loadCards]);

  useEffect(() => { if (isStaff) void load(); }, [isStaff, load]);

  // Deep link from a roster row (?student=<id>) → that learner is pre-ticked.
  const focusStudent = searchParams.get('student');
  useEffect(() => {
    if (focusStudent && members.some((m) => m.id === focusStudent)) {
      setSelected(new Set([focusStudent]));
      document.getElementById(`member-${focusStudent}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusStudent, members]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const rows = useMemo(() => members.map((m) => {
    const card = cards.get(m.id);
    const rc = accessCardCodeForStudent(m.id);
    return { ...m, card, cardState: cardStateOf(card), rc, rcDisplay: formatAccessCardCodeDisplay(rc) };
  }), [members, cards]);

  const counts = useMemo(() => ({
    all: rows.length,
    missing: rows.filter((r) => r.cardState !== 'active').length,
    active: rows.filter((r) => r.cardState === 'active').length,
    published: rows.filter((r) => r.has_published_report).length,
    pending: rows.filter((r) => !r.has_published_report).length,
  }), [rows]);

  const ready = rows.filter((r) => r.cardState === 'active' && r.has_published_report).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'missing' && r.cardState === 'active') return false;
      if (filter === 'active' && r.cardState !== 'active') return false;
      if (filter === 'published' && !r.has_published_report) return false;
      if (filter === 'pending' && r.has_published_report) return false;
      if (!q) return true;
      return (r.full_name || '').toLowerCase().includes(q)
        || (r.email || '').toLowerCase().includes(q)
        || r.rcDisplay.toLowerCase().includes(q)
        || r.rc.toLowerCase().includes(q);
    });
  }, [rows, filter, query]);

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const selectedNeedingCard = selectedRows.filter((r) => r.cardState === 'missing');
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));

  const toggle = (sid: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(sid)) next.delete(sid); else next.add(sid);
    return next;
  });
  const toggleAllVisible = () => setSelected((prev) => {
    const next = new Set(prev);
    if (allVisibleSelected) visible.forEach((r) => next.delete(r.id));
    else visible.forEach((r) => next.add(r.id));
    return next;
  });
  const selectSmart = (kind: 'missing' | 'published' | 'all') => {
    const pick = rows.filter((r) => kind === 'all' ? true : kind === 'missing' ? r.cardState === 'missing' : r.has_published_report);
    setSelected(new Set(pick.map((r) => r.id)));
    if (pick.length === 0) toast.message('Nobody matches that yet');
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  const issueAccess = async (targets = selectedRows) => {
    const ids = targets.filter((r) => r.cardState === 'missing').map((r) => r.id);
    if (cardsError) { toast.error('Card list did not load — tap Refresh first.'); return; }
    if (ids.length === 0) { toast.message('Everyone ticked already has a card.'); return; }
    setBusy('issue');
    try {
      const res = await fetch('/api/cards/issue-missing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holder_type: 'student', holder_ids: ids }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Could not issue cards');
      const parts = [`${json.issued ?? 0} card${json.issued === 1 ? '' : 's'} issued`];
      if (json.skipped) parts.push(`${json.skipped} already had one`);
      if (json.failed) parts.push(`${json.failed} failed`);
      if (json.failed) toast.warning(parts.join(' · ')); else toast.success(parts.join(' · '));
      await loadCards(cls?.school_id ?? members[0]?.school_id ?? null);
    } catch (e: any) {
      toast.error(e?.message || 'Could not issue cards');
    } finally {
      setBusy('');
    }
  };

  const printRoster = async (mode: 'print' | 'save' = 'print') => {
    const list = selectedRows.length ? selectedRows : rows;
    const eligible = list.filter((r) => r.has_published_report);
    if (!eligible.length) { toast.error('None of these students has a published result yet.'); return; }
    if (eligible.length < list.length) toast.message(`${eligible.length} with results · ${list.length - eligible.length} skipped (no published result yet)`);
    const rosterRows = buildStudentRosterRows(
      eligible.map((r) => ({ id: r.id, name: r.full_name, gradeLevel: r.grade || cls?.name || '', sectionClass: r.section_class || cls?.name || '' })),
      window.location.origin,
    );
    setBusy('roster');
    try {
      const cfg = await fetchCardConfig('student');
      const ok = await downloadStudentRosterPdf(rosterRows, {
        title: `RC Roster — ${cls?.name ?? 'Class'}`,
        orgName: cfg.orgName,
        orgWebsite: cfg.orgWebsite,
        accentColor: cfg.accentColor,
        origin: window.location.origin,
        mode,
        filename: `rc-roster-${(cls?.name ?? 'class').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`,
      });
      if (!ok && mode === 'print') toast.error('Pop-up blocked — allow pop-ups to print the roster.');
      else if (mode === 'save') toast.success(`RC roster PDF downloaded — ${rosterRows.length} student${rosterRows.length === 1 ? '' : 's'}`);
    } catch {
      toast.error('Could not prepare the roster. Please try again.');
    } finally {
      setBusy('');
    }
  };

  const printCards = async () => {
    const list = (selectedRows.length ? selectedRows : rows).filter((r) => r.cardState === 'active');
    if (!list.length) { toast.error('Issue cards first — nobody in this selection has an active card.'); return; }
    // Reserve the window inside the click so phones do not block the pop-up.
    const win = window.open('', '_blank');
    if (!win) { toast.error('Pop-up blocked — allow pop-ups to print cards.'); return; }
    win.document.body.textContent = 'Preparing ID cards…';
    setBusy('cards');
    try {
      const cfg = await fetchCardConfig('student');
      const holders: CardHolder[] = list.map((r) => ({
        id: r.id,
        full_name: r.full_name,
        email: r.email ?? null,
        temp_password: r.temp_password ?? null,
        school_name: r.school_name ?? cls?.schools?.name ?? null,
        grade: r.grade ?? null,
        section_class: r.section_class ?? cls?.name ?? null,
        card_number: r.card?.card_number ?? null,
        verification_code: r.card?.verification_code ?? null,
        expires_at: r.card?.expires_at ?? null,
      }));
      const html = await buildBulkPrintHtml(holders, cfg, window.location.origin, {
        fixedSize: true,
        title: `ID Cards — ${cls?.name ?? 'Class'}`,
        qrHint: 'Scan to check result',
      });
      openPrintWindow(html, win);
      toast.message('In the print window, choose "Save as PDF" to keep a PDF copy.');
    } catch {
      win.close();
      toast.error('Could not prepare the cards. Please try again.');
    } finally {
      setBusy('');
    }
  };

  const legacyEmailRows = useMemo(
    () => rows.filter((r) => String(r.email || '').toLowerCase().endsWith('@student.rillcod.com')),
    [rows],
  );

  const fixLegacyCredentials = async (includeMissingPasswords = false) => {
    setBusy('fix');
    try {
      const targetIds = selectedRows.length > 0 ? selectedRows.map((r) => r.id) : undefined;
      const res = await fetch(`/api/classes/${id}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'normalize_credentials',
          studentIds: targetIds,
          includeMissingPasswords,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Could not update credentials');
      if (json.fixed_count > 0) {
        toast.success(`Updated ${json.fixed_count} student account${json.fixed_count === 1 ? '' : 's'} to name123@rillcod.com + rillcod@XXXX`);
      } else {
        toast.message('All selected accounts already use the clean pattern.');
      }
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Could not update credentials');
    } finally {
      setBusy('');
    }
  };

  const printCredentialsSheet = () => {
    const list = selectedRows.length ? selectedRows : rows;
    if (!list.length) { toast.error('No students to print.'); return; }
    const win = window.open('', '_blank');
    if (!win) { toast.error('Pop-up blocked — allow pop-ups to print the sheet.'); return; }
    const esc = (v: string) => String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const originHost = window.location.origin.replace(/^https?:\/\//, '');
    const className = cls?.name ?? 'Class';
    const schoolName = cls?.schools?.name ?? '';
    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const rowsHtml = list.map((r, idx) => `
      <tr>
        <td class="num">${idx + 1}</td>
        <td>
          <div class="name">${esc(r.full_name)}</div>
          <div class="meta">${esc(r.grade || '—')}</div>
        </td>
        <td class="mono">${esc(r.email || '—')}</td>
        <td class="mono pw">${esc(r.temp_password || 'Use reset / existing')}</td>
        <td class="mono rc">${esc(r.rcDisplay)}</td>
      </tr>
    `).join('');

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Student Login & RC Sheet — ${esc(className)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: 'Segoe UI', Inter, system-ui, sans-serif; color: #111827; margin: 0; font-size: 11px; }
    .hdr { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1A3A8F; padding-bottom: 8px; margin-bottom: 10px; }
    .hdr h1 { margin: 0; font-size: 16px; color: #1A3A8F; letter-spacing: -0.01em; }
    .hdr p { margin: 2px 0 0; color: #4b5563; font-size: 10px; }
    .guide { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; font-size: 10px; }
    .guide strong { color: #1A3A8F; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #1A3A8F; color: #fff; text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
    td { border-bottom: 1px solid #e5e7eb; padding: 6px 8px; vertical-align: middle; }
    tr:nth-child(even) td { background: #f9fafb; }
    .num { width: 26px; text-align: center; color: #6b7280; font-weight: 700; }
    .name { font-weight: 700; color: #111827; font-size: 11.5px; }
    .meta { font-size: 9.5px; color: #6b7280; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10.5px; }
    .pw { font-weight: 700; color: #047857; }
    .rc { font-weight: 800; color: #1A3A8F; }
    .foot { margin-top: 10px; font-size: 9.5px; color: #6b7280; display: flex; justify-content: space-between; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="hdr">
    <div>
      <h1>Student Login, Password &amp; Result RC Sheet</h1>
      <p><strong>${esc(className)}</strong>${schoolName ? ` · ${esc(schoolName)}` : ''} · ${list.length} student${list.length === 1 ? '' : 's'}</p>
    </div>
    <p>Printed ${esc(today)}</p>
  </div>
  <div class="guide">
    <div><strong>Student Portal Login:</strong> Visit <strong>${esc(originHost)}/login</strong> and sign in with the Email &amp; Password below.</div>
    <div><strong>Parent Result Check:</strong> Visit <strong>${esc(originHost)}/result-check</strong> and enter the student&apos;s RC Number below.</div>
  </div>
  <table>
    <thead>
      <tr>
        <th class="num">#</th>
        <th>Student &amp; Grade</th>
        <th>Portal Email</th>
        <th>Password</th>
        <th>Result RC Number</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="foot">
    <span>Keep passwords private. Students can change their password after logging in.</span>
    <span>${esc(originHost)}</span>
  </div>
  <script>window.onload = () => { setTimeout(() => window.print(), 250); };</script>
</body>
</html>`;
    openPrintWindow(html, win);
  };

  const copyCodes = async () => {
    const list = selectedRows.length ? selectedRows : rows;
    const host = window.location.origin.replace(/^https?:\/\//, '');
    const text = [
      `${cls?.name ?? 'Class'} — Student Login & Result RC Details`,
      `Portal Login: ${host}/login`,
      `Result Check: ${host}/result-check`,
      '',
      ...list.map((r, i) => {
        const parts = [`${i + 1}. ${r.full_name}${r.grade ? ` (${r.grade})` : ''}`];
        if (r.email) parts.push(`Email: ${r.email}`);
        if (r.temp_password) parts.push(`Pass: ${r.temp_password}`);
        parts.push(`RC: ${r.rcDisplay}`);
        return parts.join(' | ');
      }),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${list.length} student detail${list.length === 1 ? '' : 's'} (Email, Password & RC)`);
    } catch {
      toast.error('Could not copy — your browser blocked clipboard access.');
    }
  };

  const copyOne = async (code: string) => {
    try { await navigator.clipboard.writeText(code); toast.success(`Copied ${code}`); }
    catch { toast.error('Could not copy'); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!isStaff) {
    return <div className="p-6 text-sm text-muted-foreground">Only staff can manage class ID cards.</div>;
  }

  const filterChips: Array<{ key: Filter; label: string; count: number }> = [
    { key: 'all', label: 'All members', count: counts.all },
    { key: 'missing', label: 'Need a card', count: counts.missing },
    { key: 'active', label: 'Card active', count: counts.active },
    { key: 'published', label: 'Result published', count: counts.published },
    { key: 'pending', label: 'No result yet', count: counts.pending },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-3 py-4 pb-40 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Link href={`/dashboard/classes/${id}?operation=roster`} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="h-3.5 w-3.5" /> Back to class
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-black tracking-tight text-foreground sm:text-2xl">
            <IdentificationIcon className="h-6 w-6 text-primary" />
            ID Cards &amp; RC Roster
          </h1>
          <p className="text-sm text-muted-foreground">
            {cls?.name ?? 'Class'}{cls?.schools?.name ? ` · ${cls.schools.name}` : ''}
            {cls?.academic_terms?.term_label ? ` · ${cls.academic_terms.term_label}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void load()} disabled={loading}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-50">
            <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <Link href={`/dashboard/reports/builder?class_id=${id}${cls?.school_id ? `&school_id=${cls.school_id}` : ''}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground hover:bg-muted">
            <DocumentTextIcon className="h-4 w-4 text-primary" /> Result Builder
          </Link>
          <Link href={`/dashboard/card-studio?tab=design&type=student&class_id=${id}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground hover:bg-muted"
            title="Change how the card looks (colours, logo, fields)">
            <SwatchIcon className="h-4 w-4 text-primary" /> Card design
          </Link>
        </div>
      </div>

      {/* How it works */}
      <ol className="grid gap-2 sm:grid-cols-3">
        {[
          { n: 1, title: 'Tick students', body: 'Use the quick picks or tick names below.' },
          { n: 2, title: 'Give report access', body: 'Issues a card + RC number to anyone missing one.' },
          { n: 3, title: 'Share or print', body: 'Print the RC roster or cards, or copy numbers for WhatsApp.' },
        ].map((s) => (
          <li key={s.n} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-black text-primary-foreground">{s.n}</span>
            <div>
              <p className="text-sm font-bold text-foreground">{s.title}</p>
              <p className="text-xs text-muted-foreground">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* Summary */}
      {!loading && !error && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Members" value={counts.all} />
          <Stat label="Cards active" value={counts.active} tone="emerald" />
          <Stat label="Need a card" value={counts.missing} tone={counts.missing ? 'amber' : 'emerald'} />
          <Stat label="Ready to share" value={ready} tone="primary" hint="Card active + result published" />
        </div>
      )}

      {cardsError && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <span>{cardsError}. Card status may be out of date.</span>
          <button type="button" onClick={() => void loadCards(cls?.school_id ?? null)} className="font-bold underline">Retry</button>
        </div>
      )}

      {legacyEmailRows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-xs">
          <div className="space-y-0.5">
            <p className="font-black text-foreground">
              {legacyEmailRows.length} student{legacyEmailRows.length === 1 ? '' : 's'} still use the old <code className="font-mono">@student.rillcod.com</code> email pattern
            </p>
            <p className="text-muted-foreground">
              Convert them to the clean <code className="font-mono">firstname123@rillcod.com</code> + <code className="font-mono">rillcod@XXXX</code> pattern so their login details print cleanly.
            </p>
          </div>
          <button
            type="button"
            disabled={busy !== ''}
            onClick={() => void fixLegacyCredentials(false)}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-black text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy === 'fix' ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <SparklesIcon className="h-4 w-4" />}
            Fix {legacyEmailRows.length} Email{legacyEmailRows.length === 1 ? '' : 's'} &amp; Passwords
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email or RC number"
              className="min-h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="self-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Quick pick:</span>
            <button type="button" onClick={() => selectSmart('missing')} className="rounded-lg border border-amber-500/40 px-2.5 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-500/10 dark:text-amber-300">Need a card</button>
            <button type="button" onClick={() => selectSmart('published')} className="rounded-lg border border-emerald-500/40 px-2.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-500/10 dark:text-emerald-300">Has result</button>
            <button type="button" onClick={() => selectSmart('all')} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-foreground hover:bg-muted">Everyone</button>
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {filterChips.map((c) => (
            <button key={c.key} type="button" onClick={() => setFilter(c.key)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                filter === c.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground'
              }`}>
              {c.label} <span className="opacity-80">({c.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-2xl border border-border bg-muted/40" />)}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-800 dark:text-rose-300">
          {error} <button type="button" onClick={() => void load()} className="ml-2 font-bold underline">Try again</button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm font-bold text-foreground">No students in this class yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Add or promote students into the class first, then come back to issue cards.</p>
          <Link href={`/dashboard/classes/${id}?operation=roster`} className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground">Open class roster</Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <label className="flex cursor-pointer items-center gap-3 border-b border-border bg-muted/40 px-3 py-2.5 text-xs font-bold text-foreground">
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} className="h-4 w-4 rounded border-border accent-primary" />
            {allVisibleSelected ? 'Untick' : 'Tick'} all shown ({visible.length})
            {selected.size > 0 && <span className="ml-auto font-semibold text-muted-foreground">{selected.size} ticked</span>}
          </label>
          {visible.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nobody matches this filter.</p>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((r) => {
                const checked = selected.has(r.id);
                return (
                  <li key={r.id} id={`member-${r.id}`} className={`flex flex-wrap items-center gap-3 px-3 py-3 transition-colors sm:flex-nowrap ${checked ? 'bg-primary/5' : 'hover:bg-muted/30'}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(r.id)} aria-label={`Tick ${r.full_name}`}
                      className="h-5 w-5 shrink-0 rounded border-border accent-primary" />
                    <button type="button" onClick={() => toggle(r.id)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-bold text-foreground">{r.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[r.grade, r.section_class].filter(Boolean).join(' · ') || '—'}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                        {r.email && (
                          <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-foreground">
                            {r.email}
                          </span>
                        )}
                        {r.temp_password ? (
                          <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono font-bold text-emerald-800 dark:text-emerald-300">
                            {r.temp_password}
                          </span>
                        ) : null}
                      </div>
                    </button>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <CardBadge state={r.cardState} />
                      {r.has_published_report ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                          <CheckCircleIcon className="h-3.5 w-3.5" /> Result out
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{r.has_draft_report ? 'Draft report' : 'No result yet'}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => void copyOne(r.rcDisplay)} title="Copy RC number"
                        className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-xs font-bold text-foreground hover:border-primary/40">
                        {r.rcDisplay} <ClipboardDocumentIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      {r.cardState === 'missing' && (
                        <button type="button" disabled={busy === 'issue'} onClick={() => void issueAccess([r])}
                          className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                          Issue
                        </button>
                      )}
                      <Link href={`/dashboard/reports/builder?student=${r.id}&class_id=${id}`} title="Open this student's report"
                        className="rounded-lg border border-border px-2 py-1.5 text-muted-foreground hover:text-foreground">
                        <DocumentTextIcon className="h-4 w-4" />
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Sticky action bar */}
      {!loading && rows.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-3 py-3 shadow-lg backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
            <p className="mr-auto text-xs font-semibold text-muted-foreground">
              {selected.size > 0
                ? <><span className="font-black text-foreground">{selected.size}</span> ticked{selectedNeedingCard.length ? ` · ${selectedNeedingCard.length} need a card` : ''}</>
                : <>Nothing ticked — print &amp; copy use the whole class</>}
            </p>
            {selected.size > 0 && (
              <button type="button" onClick={() => setSelected(new Set())} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-xs font-bold text-muted-foreground hover:text-foreground">
                <XMarkIcon className="h-4 w-4" /> Clear
              </button>
            )}
            <button type="button" disabled={busy !== '' || selectedNeedingCard.length === 0} onClick={() => void issueAccess()}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-black text-primary-foreground hover:opacity-90 disabled:opacity-40">
              {busy === 'issue' ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ShieldCheckIcon className="h-4 w-4" />}
              Give access{selectedNeedingCard.length ? ` (${selectedNeedingCard.length})` : ''}
            </button>
            <button type="button" disabled={busy !== ''} onClick={printCredentialsSheet}
              title="Print one clean A4 sheet with Email, Password, and Result RC Code for every student"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-black text-primary-foreground hover:opacity-90 disabled:opacity-40">
              <PrinterIcon className="h-4 w-4" /> Print Login + RC Sheet
            </button>
            <button type="button" disabled={busy !== ''} onClick={() => void printRoster('print')}
              title="Opens the RC roster as a PDF ready to print"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white hover:bg-emerald-800 disabled:opacity-40">
              {busy === 'roster' ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <PrinterIcon className="h-4 w-4" />} Print RC roster (PDF)
            </button>
            <button type="button" disabled={busy !== ''} onClick={() => void printRoster('save')}
              title="Download the RC roster PDF to share or print later"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-emerald-600/50 bg-background px-4 text-xs font-black text-emerald-800 hover:bg-emerald-500/10 disabled:opacity-40 dark:text-emerald-300">
              <DocumentTextIcon className="h-4 w-4" /> Download PDF
            </button>
            <button type="button" disabled={busy !== ''} onClick={() => void printCards()}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-background px-4 text-xs font-black text-foreground hover:bg-muted disabled:opacity-40">
              {busy === 'cards' ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <IdentificationIcon className="h-4 w-4" />} Print ID cards (PDF)
            </button>
            <button type="button" onClick={() => void copyCodes()}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-background px-4 text-xs font-black text-foreground hover:bg-muted">
              <SparklesIcon className="h-4 w-4 text-primary" /> Copy for WhatsApp
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: number; tone?: 'emerald' | 'amber' | 'primary'; hint?: string }) {
  const color = tone === 'emerald' ? 'text-emerald-700 dark:text-emerald-300'
    : tone === 'amber' ? 'text-amber-700 dark:text-amber-300'
    : tone === 'primary' ? 'text-primary'
    : 'text-foreground';
  return (
    <div className="rounded-2xl border border-border bg-card p-3" title={hint}>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function CardBadge({ state }: { state: CardState }) {
  if (state === 'active') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary"><IdentificationIcon className="h-3.5 w-3.5" /> Card active</span>;
  }
  if (state === 'expired') {
    return <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">Card expired</span>;
  }
  return <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold text-rose-800 dark:text-rose-300">No card</span>;
}
