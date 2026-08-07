'use client';

import { useState, useEffect } from 'react';
import {
  XMarkIcon, PaperAirplaneIcon, SparklesIcon,
  UserGroupIcon,
} from '@/lib/icons';
import {
  PARENT_TEMPLATE_ARCHIVE,
  ParentTemplateCategory,
  CATEGORY_METADATA,
} from '@/lib/communication/parent-template-archive';

export interface ReachOutPersonTarget {
  id?: string;
  full_name: string | null;
  email: string | null;
  class_from_roster: string | null;
  school_name: string | null;
  has_parent_email?: boolean;
}

interface ParentReachOutModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPerson?: ReachOutPersonTarget | null;
  recipients?: ReachOutPersonTarget[];
  onSuccess?: () => void;
}

export default function ParentReachOutModal({
  isOpen, onClose, initialPerson, recipients, onSuccess,
}: ParentReachOutModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<ParentTemplateCategory>('academic_results');
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>(PARENT_TEMPLATE_ARCHIVE[0].key);

  const [parentName, setParentName] = useState('Parent / Guardian');
  const [parentEmail, setParentEmail] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [studentName, setStudentName] = useState(initialPerson?.full_name || 'Student');
  const [className, setClassName] = useState(initialPerson?.class_from_roster || 'Class');
  const [resolvingContact, setResolvingContact] = useState(false);

  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Sync student fields + resolve real parent contact (never use student email as parent)
  useEffect(() => {
    if (!isOpen) return;

    setFeedback(null);
    setStudentName(initialPerson?.full_name || 'Student');
    setClassName(initialPerson?.class_from_roster || 'Class');
    setParentName('Parent / Guardian');
    setParentEmail('');
    setParentPhone('');

    const portalId = initialPerson?.id;
    if (!portalId) return;

    let cancelled = false;
    setResolvingContact(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/parent-reach-out?studentPortalId=${encodeURIComponent(portalId)}`,
        );
        const json = await res.json();
        if (cancelled || !res.ok) return;
        setParentEmail(json.parentEmail || '');
        setParentName(json.parentName || 'Parent / Guardian');
        setParentPhone(json.parentPhone || '');
      } catch {
        // leave blank — user can type email manually
      } finally {
        if (!cancelled) setResolvingContact(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, initialPerson]);

  if (!isOpen) return null;

  const isBatchMode = Array.isArray(recipients) && recipients.length > 1;

  const templatesInCategory = PARENT_TEMPLATE_ARCHIVE.filter(
    (t) => t.category === selectedCategory,
  );
  const activeTemplate = PARENT_TEMPLATE_ARCHIVE.find((t) => t.key === selectedTemplateKey) || templatesInCategory[0] || PARENT_TEMPLATE_ARCHIVE[0];

  const siteUrl = 'https://rillcodacademy.org';
  const previewSubject = activeTemplate.subject
    .replace(/\{\{\s*parent_name\s*\}\}/g, isBatchMode ? '[Parent Name]' : parentName || 'Parent')
    .replace(/\{\{\s*student_name\s*\}\}/g, isBatchMode ? '[Student Name]' : studentName || 'Student')
    .replace(/\{\{\s*class_name\s*\}\}/g, isBatchMode ? '[Class Name]' : className || 'Class')
    .replace(/\{\{\s*school_name\s*\}\}/g, initialPerson?.school_name || 'Rillcod Academy');

  const previewBody = activeTemplate.body
    .replace(/\{\{\s*parent_name\s*\}\}/g, isBatchMode ? '[Parent Name]' : parentName || 'Parent')
    .replace(/\{\{\s*student_name\s*\}\}/g, isBatchMode ? '[Student Name]' : studentName || 'Student')
    .replace(/\{\{\s*class_name\s*\}\}/g, isBatchMode ? '[Class Name]' : className || 'Class')
    .replace(/\{\{\s*school_name\s*\}\}/g, initialPerson?.school_name || 'Rillcod Academy')
    .replace(/\{\{\s*access_link\s*\}\}/g, `${siteUrl}/dashboard/results`)
    .replace(/\{\{\s*claim_link\s*\}\}/g, `${siteUrl}/claim`)
    .replace(/\{\{\s*meeting_link\s*\}\}/g, `${siteUrl}/dashboard/meetings`)
    .replace(/\{\{\s*payment_link\s*\}\}/g, `${siteUrl}/dashboard/billing`)
    .replace(/\{\{\s*receipt_link\s*\}\}/g, `${siteUrl}/dashboard/receipts`)
    .replace(/\{\{\s*absence_link\s*\}\}/g, `${siteUrl}/dashboard/attendance`)
    .replace(/\{\{\s*rsvp_link\s*\}\}/g, `${siteUrl}/events`)
    .replace(/\{\{\s*portal_url\s*\}\}/g, `${siteUrl}/login`)
    .replace(/\{\{\s*parent_email\s*\}\}/g, isBatchMode ? '[parent@email.com]' : parentEmail || 'parent@example.com')
    .replace(/\{\{\s*temporary_password\s*\}\}/g, '[set via secure credentials flow]')
    .replace(/\{\{\s*direct_login_link\s*\}\}/g, `${siteUrl}/login`)
    .replace(/\{\{\s*amount_due\s*\}\}/g, '₦45,000.00')
    .replace(/\{\{\s*amount_paid\s*\}\}/g, '₦45,000.00')
    .replace(/\{\{\s*receipt_ref\s*\}\}/g, 'REC-884912')
    .replace(/\{\{\s*payment_date\s*\}\}/g, new Date().toLocaleDateString('en-GB'))
    .replace(/\{\{\s*remaining_balance\s*\}\}/g, '₦0.00')
    .replace(/\{\{\s*due_date\s*\}\}/g, new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-GB'))
    .replace(/\{\{\s*event_date\s*\}\}/g, new Date(Date.now() + 3 * 86400000).toLocaleDateString('en-GB'))
    .replace(/\{\{\s*event_time\s*\}\}/g, '10:00 AM')
    .replace(/\{\{\s*event_location\s*\}\}/g, 'Main School Auditorium');

  const handleSend = async () => {
    if (activeTemplate.key === 'credentials_resend_reassurance') {
      setFeedback('Error: Credentials templates cannot be sent from here — use the secure credentials resend flow so a real temporary password is generated.');
      return;
    }
    if (!isBatchMode && !parentEmail && !initialPerson?.id) {
      setFeedback('Error: Please enter a parent email, or open Reach Out from a student row so we can resolve their parent contact.');
      return;
    }
    setSending(true);
    setFeedback(null);
    try {
      const payload = isBatchMode
        ? {
            templateKey: activeTemplate.key,
            recipients: recipients.map((r) => ({
              studentPortalId: r.id,
              // Do NOT send student email as parentEmail — server resolves parent contact
              studentName: r.full_name || 'Student',
              className: r.class_from_roster || 'Class',
            })),
            schoolName: initialPerson?.school_name || recipients[0]?.school_name,
          }
        : {
            templateKey: activeTemplate.key,
            parentEmail: parentEmail || undefined,
            parentPhone: parentPhone || undefined,
            parentName,
            studentName,
            className,
            studentPortalId: initialPerson?.id,
            schoolName: initialPerson?.school_name,
          };

      const res = await fetch('/api/admin/parent-reach-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        const detail = Array.isArray(json.errors) && json.errors.length
          ? ` — ${json.errors[0]}`
          : '';
        throw new Error((json.error || json.message || 'Send failed') + detail);
      }
      setFeedback(`✅ ${json.message}`);
      if (onSuccess) onSuccess();
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (e) {
      setFeedback(`Error: ${e instanceof Error ? e.message : 'Send failed'}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Parent Communication Dispatch Modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <PaperAirplaneIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-foreground">Parent Communication & Emotional Intelligence Machine</h2>
                {isBatchMode && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                    <UserGroupIcon className="w-3 h-3" /> Batch Mode ({recipients.length} Parents)
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Culturally resonant, warm, humanised parent dispatches in 1 click.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left Column: Category & Template Selector (5 cols) */}
          <div className="lg:col-span-5 space-y-5">
            {/* Category Selector */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Scenario Category</label>
              <select
                value={selectedCategory}
                onChange={(e) => {
                  const cat = e.target.value as ParentTemplateCategory;
                  setSelectedCategory(cat);
                  const first = PARENT_TEMPLATE_ARCHIVE.find((t) => t.category === cat);
                  if (first) setSelectedTemplateKey(first.key);
                }}
                className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs font-bold text-foreground outline-none focus:border-indigo-500"
              >
                {Object.entries(CATEGORY_METADATA).map(([cat, meta]) => (
                  <option key={cat} value={cat}>{meta.label}</option>
                ))}
              </select>
            </div>

            {/* Template Picker */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Select Humanised Template</label>
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {templatesInCategory.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setSelectedTemplateKey(t.key)}
                    className={`w-full text-left p-3 rounded-xl border text-xs transition-all ${selectedTemplateKey === t.key ? 'border-indigo-500 bg-indigo-500/10 font-bold text-foreground' : 'border-border hover:border-indigo-500/40 text-muted-foreground'}`}
                  >
                    <div className="font-bold text-foreground flex items-center gap-1.5">
                      <span>{t.categoryIcon}</span> {t.title}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{t.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Target Recipient Fields (Hidden in Batch Mode) */}
            {!isBatchMode ? (
              <div className="space-y-3 pt-3 border-t border-border">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  Parent Recipient Details
                  {resolvingContact ? ' · resolving…' : ''}
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Uses the parent email on the student record (not the student login email). You can override below.
                </p>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Parent Full Name"
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                    className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs text-foreground outline-none focus:border-indigo-500"
                  />
                  <input
                    type="email"
                    placeholder="Parent Email Address *"
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs text-foreground outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    placeholder="Parent Phone (on file — SMS not sent yet)"
                    value={parentPhone}
                    onChange={(e) => setParentPhone(e.target.value)}
                    className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs text-foreground outline-none focus:border-indigo-500"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Student Name"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs text-foreground outline-none focus:border-indigo-500"
                    />
                    <input
                      type="text"
                      placeholder="Class Name"
                      value={className}
                      onChange={(e) => setClassName(e.target.value)}
                      className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs text-foreground outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/20 space-y-1">
                <div className="text-xs font-bold text-foreground">Multi-Target Batch Reach-Out</div>
                <p className="text-[11px] text-muted-foreground">
                  Will resolve each student&apos;s parent email from the student record / linked parents, then dispatch to{' '}
                  <strong>{recipients.length} selected students&apos; parents</strong>.
                </p>
              </div>
            )}
          </div>

          {/* Right Column: Warm Live Email Preview (7 cols) */}
          <div className="lg:col-span-7 space-y-3 flex flex-col justify-between">
            <div className="space-y-1.5 flex-1 flex flex-col">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <SparklesIcon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" /> Warm Live Email Preview (Emotional Intelligence Tone)
                </label>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Resend / SendPulse Engine</span>
              </div>

              <div className="flex-1 bg-card border border-border rounded-2xl p-5 space-y-4 font-sans text-xs overflow-y-auto max-h-[380px]">
                <div className="pb-3 border-b border-border space-y-1">
                  <div className="text-muted-foreground"><strong className="text-foreground">To:</strong> {isBatchMode ? `${recipients.length} resolved parent emails` : parentEmail || '(Enter parent email)'}</div>
                  <div className="text-muted-foreground"><strong className="text-foreground">Subject:</strong> {previewSubject}</div>
                </div>

                <div className="whitespace-pre-line leading-relaxed text-foreground/90 font-serif text-[13px]">
                  {previewBody}
                </div>
              </div>
            </div>

            {feedback && (
              <p className={`p-3 rounded-xl text-xs font-bold ${feedback.startsWith('Error') ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'}`}>
                {feedback}
              </p>
            )}

            {/* Action Bar */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSend}
                disabled={sending || resolvingContact}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white px-5 py-2.5 text-xs font-black uppercase tracking-wider hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md shadow-indigo-600/20"
              >
                <PaperAirplaneIcon className={`w-4 h-4 ${sending ? 'animate-spin' : ''}`} />
                {sending ? 'Dispatching Email…' : isBatchMode ? `Dispatch to ${recipients.length} Parents` : 'Dispatch Email Now'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
