// @refresh reset
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import {
  ClockIcon, CheckCircleIcon, XCircleIcon, ChevronLeftIcon, ChevronRightIcon,
  PhotoIcon, CameraIcon, DocumentTextIcon, XMarkIcon,
  ExclamationTriangleIcon, CloudArrowUpIcon,
} from '@/lib/icons';
import CbtMarkdown from '@/components/cbt/CbtMarkdown';
import { isObjectiveQuestion, normalizeCbtOptions } from '@/lib/cbt/print-utils';
import {
  countEssayWords,
  hasEssayResponse,
  isImageAttachment,
  parseEssayAnswer,
  serializeEssayAnswer,
  type EssayAttachment,
} from '@/lib/cbt/essay-attachments';

function CodingBlocksChallenge({
  question,
  value,
  onChange
}: {
  question: any,
  value: string,
  onChange: (val: string) => void
}) {
  const sentence = question.metadata?.logic_sentence || "Logic: [BLANK]";
  const parts = sentence.split('[BLANK]');
  const blocks = question.metadata?.logic_blocks || [];

  const currentAnswers = value ? value.split(',').map(s => s.trim()) : [];

  const updateAt = (idx: number, newVal: string) => {
    const newAns = [...currentAnswers];
    for (let i = 0; i < parts.length - 1; i++) {
      if (newAns[i] === undefined) newAns[i] = '';
    }
    newAns[idx] = newVal;
    onChange(newAns.slice(0, parts.length - 1).join(', '));
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="p-4 sm:p-6 bg-muted/30 border border-border rounded-2xl sm:rounded-[2rem] flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-3 sm:gap-y-4 leading-9 sm:leading-[3rem]">
        {parts.map((p: string, pi: number) => (
          <div key={pi} className="contents">
            <span className="text-sm sm:text-lg font-medium text-muted-foreground break-words">{p}</span>
            {pi < parts.length - 1 && (
              <div className="inline-flex min-w-[72px] sm:min-w-[100px] min-h-9 sm:h-10 bg-emerald-500/10 border-2 border-emerald-500/30 rounded-xl px-3 sm:px-4 text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400 items-center justify-center italic shadow-[0_0_20px_rgba(16,185,129,0.1)] break-words">
                {currentAnswers[pi] || "???"}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        {blocks.map((block: string, bi: number) => (
          <button
            key={bi}
            type="button"
            onClick={() => {
              const firstEmpty = currentAnswers.findIndex((a, i) => i < parts.length - 1 && !a);
              const targetIdx = firstEmpty === -1 ? 0 : firstEmpty;
              if (targetIdx < parts.length - 1) updateAt(targetIdx, block);
            }}
          className="px-4 sm:px-5 py-2.5 sm:py-3 bg-card shadow-sm hover:bg-emerald-500/20 border border-border hover:border-emerald-500/30 rounded-xl text-xs sm:text-sm font-bold text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 transition-all active:scale-95 break-words"
          >
            {block}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange('')}
          className="px-4 py-2.5 sm:py-3 bg-card shadow-sm hover:bg-rose-500/20 border border-border hover:border-rose-500/30 rounded-xl text-[10px] uppercase font-black text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 sm:ml-auto transition-all"
        >
          Clear Blocks
        </button>
      </div>
    </div>
  );
}

async function compressImageForCbt(file: File): Promise<File> {
  if (
    typeof window === 'undefined' ||
    !file.type.startsWith('image/') ||
    file.type === 'image/gif' ||
    file.type === 'image/svg+xml'
  ) {
    return file;
  }

  const MAX_DIM = 1600;
  const SIZE_THRESHOLD = 1.2 * 1024 * 1024;
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = objectUrl;
    });

    const { naturalWidth: w, naturalHeight: h } = img;
    if (file.size <= SIZE_THRESHOLD && w <= MAX_DIM && h <= MAX_DIM) {
      return file;
    }

    const scale = Math.min(1, MAX_DIM / Math.max(w, h));
    const targetW = Math.max(1, Math.round(w * scale));
    const targetH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.82)
    );
    if (!blob || blob.size >= file.size) return file;

    const baseName = (file.name || 'photo').replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function TakeExamPage() {
  const params = useParams() as { id?: string };
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const [exam, setExam] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{ score: number; passed: boolean; correct: number; status: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [examError, setExamError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [uploadingForQ, setUploadingForQ] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showMobileGrid, setShowMobileGrid] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const canvasScrollRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const startTimeRef = useRef<Date>(new Date());
  const deadlineMsRef = useRef<number | null>(null);
  const clockOffsetMsRef = useRef<number>(0);
  const answersRef = useRef<Record<string, string>>({});
  const sessionIdRef = useRef<string | null>(null);
  const submittedRef = useRef<boolean>(false);
  const draftKeyRef = useRef<string | null>(null);
  const hasMountedAnswersRef = useRef<boolean>(false);
  const submitRef = useRef<any>(null);

  useEffect(() => {
    if (authLoading || !profile) return;
    if (profile.role !== 'student') { router.push('/dashboard/cbt'); return; }
    const id = params?.id as string;
    if (!id) return;
    const finalStatuses = new Set(['completed', 'passed', 'failed', 'pending_grading']);
    fetch(`/api/cbt/sessions?exam_id=${id}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(({ data: existing, server_now: getServerNow }) => {
        if (existing && finalStatuses.has(existing.status)) { router.push(`/dashboard/cbt/${id}`); return; }
        return fetch(`/api/cbt/exams/${id}`, { cache: 'no-store' })
          .then(async r => {
            const payload = await r.json();
            if (!r.ok) throw new Error(payload.error || 'This exam is not available.');
            return payload;
          })
          .then(async ({ data: examData }) => {
            if (!examData) { throw new Error('This exam is not available.'); }
            let serverNowStr: string | undefined = typeof getServerNow === 'string' ? getServerNow : undefined;
            const session = existing ?? await fetch('/api/cbt/sessions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'start', exam_id: id }),
            }).then(async r => {
              const payload = await r.json();
              if (!r.ok) throw new Error(payload.error || 'Unable to start this exam.');
              if (typeof payload.server_now === 'string') serverNowStr = payload.server_now;
              return payload.data;
            });

            if (serverNowStr) {
              const parsedServerNow = new Date(serverNowStr).getTime();
              if (Number.isFinite(parsedServerNow)) {
                clockOffsetMsRef.current = parsedServerNow - Date.now();
              }
            }

            const startedAt = session?.start_time ? new Date(session.start_time) : new Date(Date.now() + clockOffsetMsRef.current);
            startTimeRef.current = startedAt;
            const sid = session?.id ?? null;
            setSessionId(sid);
            sessionIdRef.current = sid;

            const draftKey = `cbt_draft_${id}_${profile.id}`;
            draftKeyRef.current = draftKey;
            const serverAnswers: Record<string, string> =
              session?.answers && typeof session.answers === 'object' && !Array.isArray(session.answers)
                ? { ...session.answers }
                : {};
            let localDraft: Record<string, string> = {};
            try {
              const rawDraft = window.localStorage.getItem(draftKey);
              if (rawDraft) {
                const parsed = JSON.parse(rawDraft);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                  localDraft = parsed;
                }
              }
            } catch {
              // Ignore storage access errors in private/restricted browsers
            }

            const mergedAnswers: Record<string, string> = { ...serverAnswers };
            for (const [k, v] of Object.entries(localDraft)) {
              if (typeof v === 'string' && v.trim().length > 0 && !(mergedAnswers[k] && String(mergedAnswers[k]).trim().length > 0)) {
                mergedAnswers[k] = v;
              }
            }
            answersRef.current = mergedAnswers;
            setAnswers(mergedAnswers);

            setExam(examData);
            setQuestions([...(examData.cbt_questions ?? [])].sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0)));
            const durationDeadline = startedAt.getTime() + (examData.duration_minutes ?? 60) * 60_000;
            const windowDeadline = examData.end_date ? new Date(examData.end_date).getTime() : Number.POSITIVE_INFINITY;
            const deadline = Math.min(durationDeadline, windowDeadline);
            deadlineMsRef.current = deadline;
            const syncedNow = Date.now() + clockOffsetMsRef.current;
            setTimeLeft(Math.max(0, Math.floor((deadline - syncedNow) / 1000)));
            setLoading(false);
          });
      })
      .catch((e) => {
        setExamError(e?.message || 'Unable to open this exam.');
        setLoading(false);
      });
  }, [profile?.id, authLoading]); // eslint-disable-line

  const handleSubmit = useCallback(async (auto = false) => {
    if (submitting || submitted || submittedRef.current) return;
    if (!auto && uploadingForQ !== null) {
      setExamError('Please wait for your attachment to finish uploading before submitting.');
      return;
    }
    setSubmitting(true);
    setShowSubmitModal(false);
    setExamError(null);
    try {
      const payloadBody = JSON.stringify({
        exam_id: exam.id,
        action: 'submit',
        answers: answersRef.current,
        auto_submitted: auto,
      });

      let savedSession: any = null;
      let lastError: Error | null = null;
      const maxAttempts = 3;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25_000);
        try {
          const sessionRes = await fetch('/api/cbt/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payloadBody,
            signal: controller.signal,
          });
          if (!sessionRes.ok) {
            const j = await sessionRes.json().catch(() => ({}));
            const err = new Error(j.error || 'Failed to submit exam');
            if (sessionRes.status >= 400 && sessionRes.status < 500) {
              throw err;
            }
            lastError = err;
          } else {
            const j = await sessionRes.json();
            savedSession = j?.data ?? null;
            lastError = null;
            break;
          }
        } catch (err: any) {
          const isAbort = err?.name === 'AbortError';
          lastError = isAbort
            ? new Error('Submission timed out — retrying…')
            : (err instanceof Error ? err : new Error('Network error while submitting exam'));
          if (!isAbort && err?.message && !/network|fetch|timeout|failed to fetch|500|502|503|504|Failed to submit exam/i.test(err.message)) {
            throw err;
          }
        } finally {
          clearTimeout(timeoutId);
        }
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, attempt * 1000));
        }
      }

      if (lastError) {
        throw lastError;
      }

      submittedRef.current = true;
      if (draftKeyRef.current) {
        try {
          window.localStorage.removeItem(draftKeyRef.current);
        } catch {
          // Ignore storage cleanup errors
        }
      }

      const finalScore = Number(savedSession?.score ?? 0);
      const passingScore = Number(exam?.passing_score ?? 70);
      setResult({
        score: finalScore,
        passed: typeof savedSession?.passed === 'boolean' ? savedSession.passed : finalScore >= passingScore,
        correct: savedSession?.correct ?? 0,
        status: savedSession?.status ?? 'completed',
      });
      setSubmitted(true);

      // Certificate is auto-issued by the database trigger on cbt_sessions INSERT.
      // No client-side call needed — and students are blocked from POST /api/certificates anyway.
    } catch (e: any) {
      setExamError(e?.message || 'Failed to submit exam. Your answers are saved locally — please retry.');
    } finally {
      setSubmitting(false);
    }
  }, [submitting, submitted, uploadingForQ, exam]);

  const persistAnswersNow = useCallback(async (nextAnswers: Record<string, string>) => {
    const sid = sessionIdRef.current ?? sessionId;
    if (!sid || submitted || submittedRef.current || loading) return;
    setSaveState('saving');
    try {
      const res = await fetch(`/api/cbt/sessions/${sid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: nextAnswers }),
      });
      setSaveState(res.ok ? 'saved' : 'error');
    } catch {
      setSaveState('error');
    }
  }, [loading, sessionId, submitted]);

  const uploadEssayFiles = useCallback(async (questionId: string, fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(Boolean);
    if (files.length === 0) return;

    const currentParsed = parseEssayAnswer(answersRef.current[questionId]);
    const remainingSlots = Math.max(0, 5 - currentParsed.attachments.length);
    if (remainingSlots === 0) {
      setUploadError('Maximum 5 attachments per question. Remove one to add another.');
      return;
    }

    setUploadingForQ(questionId);
    setUploadError(null);
    const added: EssayAttachment[] = [];

    try {
      for (const rawFile of files.slice(0, remainingSlots)) {
        const file = await compressImageForCbt(rawFile);
        if (file.size > 10 * 1024 * 1024) {
          throw new Error(`"${rawFile.name}" is larger than 10 MB.`);
        }
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/files/upload', {
          method: 'POST',
          body: formData,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error || `Could not upload "${rawFile.name}".`);
        }
        const uploadedUrl = json?.data?.public_url || json?.data?.url || json?.data?.receipt?.url;
        if (!uploadedUrl) {
          throw new Error(`Upload succeeded but no file link was returned for "${rawFile.name}".`);
        }
        added.push({
          name: rawFile.name || file.name || 'Attachment',
          url: uploadedUrl,
          isImage: file.type ? file.type.startsWith('image/') : isImageAttachment(file.name || uploadedUrl),
        });
      }

      if (added.length > 0) {
        const latestParsed = parseEssayAnswer(answersRef.current[questionId]);
        const nextValue = serializeEssayAnswer(latestParsed.text, [...latestParsed.attachments, ...added]);
        const nextAnswers = { ...answersRef.current, [questionId]: nextValue };
        answersRef.current = nextAnswers;
        setAnswers(nextAnswers);
        void persistAnswersNow(nextAnswers);
      }
    } catch (err: any) {
      setUploadError(err?.message || 'Could not attach image. Please retry.');
    } finally {
      setUploadingForQ(null);
    }
  }, [persistAnswersNow]);

  const removeEssayAttachment = useCallback((questionId: string, urlToRemove: string) => {
    const parsed = parseEssayAnswer(answersRef.current[questionId]);
    const nextAttachments = parsed.attachments.filter((a) => a.url !== urlToRemove);
    const nextValue = serializeEssayAnswer(parsed.text, nextAttachments);
    const nextAnswers = { ...answersRef.current, [questionId]: nextValue };
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    void persistAnswersNow(nextAnswers);
  }, [persistAnswersNow]);

  const toggleFlag = (questionId: string) => {
    setFlaggedIds((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  useEffect(() => {
    submitRef.current = handleSubmit;
  }, [handleSubmit]);

  // Layer 1 & 2: Instant localStorage mirror + 2-second debounced server autosave
  useEffect(() => {
    answersRef.current = answers;
    if (loading || submitted) return;
    if (draftKeyRef.current) {
      try {
        window.localStorage.setItem(draftKeyRef.current, JSON.stringify(answers));
      } catch {
        // Ignore storage quota/private mode errors
      }
    }
    if (!hasMountedAnswersRef.current) {
      hasMountedAnswersRef.current = true;
      return;
    }
    if (!sessionId) return;
    const debounce = setTimeout(() => {
      void persistAnswersNow(answersRef.current);
    }, 2_000);
    return () => clearTimeout(debounce);
  }, [answers, loading, persistAnswersNow, sessionId, submitted]);

  // Layer 3: 15-second heartbeat + visibilitychange/pagehide keepalive flush
  useEffect(() => {
    if (!sessionId || submitted || loading) return;
    const heartbeat = setInterval(() => {
      void persistAnswersNow(answersRef.current);
    }, 15_000);

    const flushKeepalive = () => {
      if (submittedRef.current || !sessionIdRef.current) return;
      try {
        void fetch(`/api/cbt/sessions/${sessionIdRef.current}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: answersRef.current }),
          keepalive: true,
        });
      } catch {
        // Best-effort flush on tab switch or unload
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushKeepalive();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flushKeepalive);
    return () => {
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flushKeepalive);
    };
  }, [loading, persistAnswersNow, sessionId, submitted]);

  // Server-synced wall-clock countdown timer (immune to background tab throttling)
  useEffect(() => {
    if (loading || submitted || questions.length === 0) return;

    const syncTimeLeft = () => {
      const deadline = deadlineMsRef.current;
      if (deadline === null) return false;
      const syncedNow = Date.now() + clockOffsetMsRef.current;
      const remaining = Math.max(0, Math.floor((deadline - syncedNow) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        submitRef.current?.(true);
        return true;
      }
      return false;
    };

    if (syncTimeLeft()) return;
    const t = setInterval(() => {
      if (syncTimeLeft()) clearInterval(t);
    }, 1000);
    const onWake = () => {
      if (document.visibilityState === 'visible') {
        if (syncTimeLeft()) clearInterval(t);
      }
    };
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [loading, submitted, questions.length]);

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // Keyboard navigation for students (← / → to move, A–D for MCQ when not typing in an input)
  useEffect(() => {
    if (loading || submitted || questions.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrent((c) => Math.min(questions.length - 1, c + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrent((c) => Math.max(0, c - 1));
      } else if (/^[a-dA-D]$/.test(e.key)) {
        const curQ = questions[current];
        if (!curQ || !isObjectiveQuestion(curQ) || curQ.question_type === 'true_false') return;
        const opts = Array.isArray(curQ.options) ? curQ.options.filter((o: any) => String(o ?? '').trim().length > 0) : [];
        const idx = e.key.toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < opts.length) {
          setAnswers((a) => ({ ...a, [curQ.id]: opts[idx] }));
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loading, submitted, questions, current]);

  // Always scroll the question canvas back to the top when moving between questions
  useEffect(() => {
    canvasScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [current]);

  const confirmAndSubmit = () => {
    setShowSubmitModal(true);
  };

  if (authLoading || loading) return (
    <div className="flex-1 min-h-0 h-full w-full bg-background flex items-center justify-center mobile-page-root">
      <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (examError && !exam) return (
    <div className="flex-1 min-h-0 h-full w-full overflow-y-auto bg-background flex items-center justify-center text-foreground mobile-page-root">
      <div className="text-center max-w-md px-6 py-12">
        <XCircleIcon className="w-16 h-16 mx-auto text-amber-600 dark:text-amber-400 mb-4" />
        <h1 className="text-2xl font-bold">Exam Not Available</h1>
        <p className="text-muted-foreground mt-2">{examError}</p>
        <button onClick={() => router.push('/dashboard/cbt')} className="mt-6 px-6 py-2.5 bg-muted hover:bg-muted text-sm font-bold rounded-xl transition-colors">Return to CBT Centre</button>
      </div>
    </div>
  );

  if (!loading && questions.length === 0) return (
    <div className="flex-1 min-h-0 h-full w-full overflow-y-auto bg-background flex items-center justify-center text-foreground mobile-page-root">
      <div className="text-center px-6 py-12">
        <XCircleIcon className="w-16 h-16 mx-auto text-amber-600 dark:text-amber-400 mb-4" />
        <h1 className="text-2xl font-bold">No Questions Yet</h1>
        <p className="text-muted-foreground mt-2">This exam hasn't been configured with any questions.</p>
        <button onClick={() => router.push('/dashboard/cbt')} className="mt-6 px-6 py-2.5 bg-muted hover:bg-muted text-sm font-bold rounded-xl transition-colors">Return to CBT Centre</button>
      </div>
    </div>
  );

  if (submitted && result) {
    const isPending = result.status === 'pending_grading';

    return (
      <div className="flex-1 min-h-0 h-full w-full overflow-y-auto bg-background flex items-start sm:items-center justify-center text-foreground p-4 sm:p-6 pb-8 relative mobile-page-root">
        {/* Animated Background Accents */}
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full animate-pulse pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full animate-pulse delay-700 pointer-events-none" />

        <div className="max-w-xl w-full relative z-10 my-auto">
          <div className="bg-card/90 backdrop-blur-2xl border border-border rounded-3xl sm:rounded-[2.5rem] p-6 sm:p-10 shadow-2xl space-y-6 sm:space-y-8 text-center">
            <div className={`w-20 h-20 sm:w-28 sm:h-28 mx-auto rounded-2xl sm:rounded-[2rem] flex items-center justify-center border-2 rotate-3 transition-transform hover:rotate-0 duration-500 ${isPending ? 'border-amber-500/50 bg-amber-500/10' : (result.passed ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-rose-500/50 bg-rose-500/10')}`}>
              {isPending ? <ClockIcon className="w-10 h-10 sm:w-14 sm:h-14 text-amber-600 dark:text-amber-400" /> : (result.passed ? <CheckCircleIcon className="w-10 h-10 sm:w-14 sm:h-14 text-emerald-600 dark:text-emerald-400" /> : <XCircleIcon className="w-10 h-10 sm:w-14 sm:h-14 text-rose-600 dark:text-rose-400" />)}
            </div>

            <div className="space-y-1.5">
              <h1 className={`text-3xl sm:text-5xl font-black italic tracking-tighter ${isPending ? 'text-amber-600 dark:text-amber-400' : (result.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}`}>
                {isPending ? 'SUBMITTED' : (result.passed ? 'EXCELLENT' : 'COMPLETE')}
              </h1>
              <p className="text-muted-foreground font-semibold tracking-wider uppercase text-xs">
                {exam?.title}
              </p>
            </div>

            {isPending ? (
              <div className="bg-card shadow-sm border border-border rounded-xl p-8 space-y-4">
                <p className="text-lg text-muted-foreground font-medium leading-relaxed">
                  Your objective answers have been recorded. Subjective answers are awaiting instructor review.
                </p>
                <div className="flex justify-between items-end">
                  <span className="text-muted-foreground text-xs font-black uppercase tracking-widest">
                    Current Auto Score
                  </span>
                  <span className="text-4xl font-black text-amber-600 dark:text-amber-400">{result.score}%</span>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="px-4 py-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest border border-amber-500/20 w-fit mx-auto">
                    Awaiting Manual Evaluation
                  </span>
                  <p className="text-sm text-muted-foreground italic">
                    Essays & Subjective answers are being reviewed by your instructor.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-card shadow-sm border border-border rounded-xl p-8 space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <span className="text-muted-foreground text-xs font-black uppercase tracking-widest">
                      Final Grade
                    </span>
                    <span className={`text-4xl font-black ${result.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{result.score}%</span>
                  </div>
                  <div className="w-full h-4 bg-card shadow-sm rounded-full overflow-hidden border border-border p-0.5">
                    <div className={`h-full rounded-full transition-all duration-1000 ease-out ${result.passed ? 'bg-gradient-to-r from-primary to-primary from-primary to-primary' : 'bg-gradient-to-r from-rose-600 to-rose-400'}`}
                      style={{ width: `${Math.min(result.score, 100)}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-card shadow-sm rounded-xl p-4 border border-border">
                    <p className="text-[10px] text-muted-foreground font-black uppercase mb-1">Status</p>
                    <p className="text-sm font-bold">{result.passed ? 'PASSED' : 'FAILED'}</p>
                  </div>
                  <div className="bg-card shadow-sm rounded-xl p-4 border border-border">
                    <p className="text-[10px] text-muted-foreground font-black uppercase mb-1">Requirement</p>
                    <p className="text-xl font-bold text-muted-foreground">{exam?.passing_score ?? 70}%</p>
                  </div>
                </div>
              </div>
            )}

            <button onClick={() => router.push('/dashboard/cbt')}
              className="group relative w-full py-4 bg-gradient-to-r from-border to-border hover:from-border hover:to-border border border-border text-foreground font-black uppercase tracking-widest text-xs rounded-xl transition-all overflow-hidden">
              <span className="relative z-10">Return to CBT Center</span>
              <div className="absolute inset-0 bg-card shadow-sm translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const q = questions[current];
  const progress = ((current + 1) / questions.length) * 100;
  const isQuestionAnswered = (question: any) => hasEssayResponse(answers[question?.id]);
  const answered = questions.filter(isQuestionAnswered).length;
  const totalAttachments = questions.reduce(
    (sum, question) => sum + parseEssayAnswer(answers[question.id]).attachments.length,
    0,
  );
  const unansweredIndices = questions
    .map((question, idx) => (!isQuestionAnswered(question) ? idx : -1))
    .filter((idx) => idx >= 0);
  const flaggedIndices = questions
    .map((question, idx) => (flaggedIds.has(question.id) ? idx : -1))
    .filter((idx) => idx >= 0);
  const mcqOptions = q ? normalizeCbtOptions(q.options, q.question_type) : [];
  const showMcq = q && isObjectiveQuestion(q) && mcqOptions.length > 0 && q.question_type !== 'true_false';
  const currentEssayParsed = q ? parseEssayAnswer(answers[q.id]) : { text: '', attachments: [] };
  const isCurrentFlagged = Boolean(q && flaggedIds.has(q.id));

  return (
    <div className="flex-1 min-h-0 h-full w-full bg-background text-foreground flex flex-col overflow-hidden font-sans selection:bg-emerald-500/30 mobile-page-root">
      {/* Compact Pinned Exam Header */}
      <div className="shrink-0 z-30 bg-background/95 backdrop-blur-xl border-b border-border">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2 sm:py-3 flex items-center justify-between gap-2 sm:gap-6">
          <div className="flex-1 min-w-0 flex items-center gap-3 sm:gap-5">
            <div className="min-w-0 flex-1 sm:flex-shrink-0">
              <div className="hidden sm:block text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.2em] mb-0.5">Live Examination</div>
              <h2 className="text-xs sm:text-sm font-extrabold text-foreground truncate">{exam?.title}</h2>
              <p className="sm:hidden text-[10px] font-bold text-muted-foreground">
                {answered}/{questions.length} answered{saveState === 'saving' ? ' · Saving…' : saveState === 'saved' ? ' · Saved' : ''}
              </p>
            </div>
            <div className="hidden md:flex flex-1 items-center gap-3">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[140px]">
                <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-[10px] font-black text-muted-foreground tracking-tighter uppercase">{current + 1} of {questions.length}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {saveState !== 'idle' && (
              <span
                className={`hidden lg:inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                  saveState === 'error'
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    : saveState === 'saving'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                <CloudArrowUpIcon className="h-3.5 w-3.5" />
                {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Retry pending' : 'Saved'}
              </span>
            )}
            <div className={`flex items-center gap-1 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl border transition-all duration-500 flex-shrink-0 ${timeLeft < 120 ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400 animate-pulse' : 'bg-muted/40 border-border text-foreground'}`}>
              <ClockIcon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${timeLeft < 120 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
              <span className="text-xs sm:text-base font-black tracking-wider leading-none tabular-nums">{formatTime(timeLeft)}</span>
            </div>
            <button
              type="button"
              onClick={confirmAndSubmit}
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-700 hover:bg-emerald-800 px-3 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-xs font-black uppercase tracking-wider text-white shadow-sm transition-colors disabled:opacity-50"
            >
              {submitting ? '…' : 'Submit'}
            </button>
          </div>
        </div>
        {/* Thin mobile progress bar */}
        <div className="md:hidden h-0.5 w-full bg-muted overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        {examError && (
          <div className="max-w-5xl mx-auto px-3 sm:px-6 pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-700 dark:text-rose-300">
              <span>{examError}</span>
              <button
                type="button"
                onClick={() => void handleSubmit(false)}
                disabled={submitting}
                className="rounded-lg bg-rose-600 hover:bg-rose-700 px-2.5 py-1 text-[11px] font-black text-white disabled:opacity-50"
              >
                {submitting ? 'Retrying…' : 'Retry Submit'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Scrollable Examination Canvas — maximized vertical space on mobile with swipe navigation */}
      <div
        ref={canvasScrollRef}
        onTouchStart={(e) => {
          const target = e.target as HTMLElement | null;
          if (target?.closest('textarea, input, .cbt-code-block')) {
            touchStartRef.current = null;
            return;
          }
          const t = e.touches[0];
          if (t) touchStartRef.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          const start = touchStartRef.current;
          touchStartRef.current = null;
          if (!start) return;
          const t = e.changedTouches[0];
          if (!t) return;
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.6) {
            if (dx < 0 && current < questions.length - 1) setCurrent((c) => c + 1);
            else if (dx > 0 && current > 0) setCurrent((c) => c - 1);
          }
        }}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-6 pt-3 sm:pt-6 pb-24 md:pb-12 relative"
      >
        <div className="max-w-4xl mx-auto w-full space-y-3.5 sm:space-y-6 relative z-10">
          <div className="space-y-3.5 sm:space-y-6">
            <div className="rounded-2xl border border-border bg-card p-3.5 sm:p-6 shadow-sm space-y-2.5 sm:space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-wrap">
                  <span className="px-2.5 py-0.5 sm:py-1 rounded-lg sm:rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black text-emerald-700 dark:text-emerald-400 tracking-wider uppercase">
                    Q{current + 1}/{questions.length}
                  </span>
                  <span className="px-2 py-0.5 sm:py-1 rounded-lg sm:rounded-xl bg-primary/10 border border-primary/20 text-[10px] font-black text-primary tracking-wider uppercase">
                    {isObjectiveQuestion(q) ? 'Objective' : 'Theory'}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                    {q?.points ?? 1} pt{Number(q?.points ?? 1) === 1 ? '' : 's'}
                  </span>
                </div>
                {q && (
                  <button
                    type="button"
                    onClick={() => toggleFlag(q.id)}
                    className={`shrink-0 inline-flex items-center gap-1 rounded-lg sm:rounded-xl border px-2 sm:px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition-colors ${
                      isCurrentFlagged
                        ? 'border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-300'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                    <span>{isCurrentFlagged ? 'Flagged' : 'Flag'}</span>
                  </button>
                )}
              </div>
              <div className="text-[15px] sm:text-2xl font-bold text-foreground leading-relaxed sm:leading-snug break-words">
                {q?.question_text && String(q.question_text).trim().length > 0 ? (
                  <CbtMarkdown text={String(q.question_text)} className="text-foreground" />
                ) : (
                  <p className="text-sm font-medium italic text-muted-foreground">
                    Question prompt is empty — please notify your instructor.
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:gap-4">
              {showMcq && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4">
                  {mcqOptions.map((opt: string, oi: number) => {
                    const isSelected = answers[q.id] === opt;
                    return (
                      <button
                        key={oi}
                        type="button"
                        onClick={() => setAnswers(a => ({ ...a, [q.id]: opt }))}
                        className={`group relative flex items-center sm:items-start gap-3 sm:gap-4 p-3 sm:p-5 rounded-xl sm:rounded-2xl border-2 transition-all duration-150 active:scale-[0.99] text-left ${
                          isSelected
                            ? 'bg-emerald-500/12 border-emerald-600 dark:border-emerald-500 shadow-sm'
                            : 'bg-card border-border hover:bg-muted/40 hover:border-primary/40'
                        }`}
                      >
                        <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl border-2 flex items-center justify-center text-xs font-black transition-all flex-shrink-0 ${
                          isSelected
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-muted/50 border-border text-foreground'
                        }`}>
                          {isSelected ? <CheckCircleIcon className="w-4 h-4" /> : String.fromCharCode(65 + oi)}
                        </div>
                        <div className="text-sm sm:text-base font-semibold text-foreground leading-snug flex-1 min-w-0 break-words">
                          <CbtMarkdown text={opt} className="text-sm sm:text-base text-foreground" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {q?.question_type === 'true_false' && (
                <div className="grid grid-cols-2 gap-3 sm:gap-6">
                  {['True', 'False'].map(val => (
                    <button key={val} type="button"
                      onClick={() => setAnswers(a => ({ ...a, [q.id]: val }))}
                      className={`h-24 sm:h-32 rounded-2xl sm:rounded-[2rem] border-2 flex flex-col items-center justify-center gap-2 sm:gap-3 transition-all duration-300 ${answers[q.id] === val
                        ? 'bg-emerald-500/10 border-emerald-500/50 sm:scale-[1.05]'
                        : 'bg-muted/20 border-border hover:bg-muted'
                        }`}>
                      <div className={`w-3 h-3 rounded-full transition-all ${answers[q.id] === val ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'bg-muted'}`} />
                      <span className={`text-base sm:text-xl font-black italic tracking-tighter uppercase transition-all ${answers[q.id] === val ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                        {val}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {(q?.question_type === 'fill_blank' || q?.question_type === 'essay') && (
                <div className="space-y-3">
                  <div className="relative group">
                    <div className="absolute inset-0 bg-emerald-500/5 blur-2xl rounded-[2rem] opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
                    <textarea
                      aria-label={q.question_type === 'essay' ? 'Essay answer' : 'Written answer'}
                      rows={q.question_type === 'essay' ? 7 : 3}
                      value={currentEssayParsed.text}
                      onChange={(e) => {
                        const serialized = serializeEssayAnswer(e.target.value, currentEssayParsed.attachments);
                        setAnswers((a) => ({ ...a, [q.id]: serialized }));
                      }}
                      onPaste={(e) => {
                        const items = Array.from(e.clipboardData?.items ?? []);
                        const pastedImages = items
                          .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
                          .map((item) => item.getAsFile())
                          .filter((f): f is File => Boolean(f));
                        if (pastedImages.length > 0) {
                          e.preventDefault();
                          void uploadEssayFiles(q.id, pastedImages);
                        }
                      }}
                      placeholder={
                        q.question_type === 'essay'
                          ? 'Type your answer here… (Tip: you can also paste a screenshot with Ctrl+V or attach photos of your written work below)'
                          : 'Provide the specific answer…'
                      }
                      className="relative w-full px-4 sm:px-6 py-4 sm:py-5 bg-muted/20 border-2 border-border rounded-2xl sm:rounded-[1.75rem] text-base sm:text-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500/50 focus:bg-muted/30 transition-all resize-y shadow-sm"
                    />
                  </div>

                  {/* Smart Essay Attachment & Word Count Bar */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer?.files?.length) {
                        void uploadEssayFiles(q.id, e.dataTransfer.files);
                      }
                    }}
                    className="rounded-2xl border border-dashed border-border bg-card/80 p-3.5 sm:p-4 space-y-3"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      multiple
                      className="hidden"
                      aria-label="Upload image or PDF for answer"
                      onChange={(e) => {
                        if (e.target.files?.length) void uploadEssayFiles(q.id, e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      aria-label="Take photo of written work"
                      onChange={(e) => {
                        if (e.target.files?.length) void uploadEssayFiles(q.id, e.target.files);
                        e.target.value = '';
                      }}
                    />

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={uploadingForQ === q.id || currentEssayParsed.attachments.length >= 5}
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-primary/35 bg-primary/10 px-3 py-1.5 text-xs font-black text-primary hover:bg-primary/20 disabled:opacity-40 transition-colors"
                        >
                          <PhotoIcon className="h-4 w-4" />
                          {uploadingForQ === q.id ? 'Uploading…' : 'Attach Image / PDF'}
                        </button>
                        <button
                          type="button"
                          disabled={uploadingForQ === q.id || currentEssayParsed.attachments.length >= 5}
                          onClick={() => cameraInputRef.current?.click()}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-black text-foreground hover:border-primary/40 disabled:opacity-40 transition-colors sm:hidden"
                        >
                          <CameraIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          Take Photo
                        </button>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] font-bold text-muted-foreground">
                        <span>{countEssayWords(currentEssayParsed.text)} word{countEssayWords(currentEssayParsed.text) === 1 ? '' : 's'}</span>
                        <span>·</span>
                        <span>{currentEssayParsed.attachments.length}/5 attached</span>
                      </div>
                    </div>

                    {uploadError && (
                      <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300">
                        {uploadError}
                      </p>
                    )}

                    {currentEssayParsed.attachments.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {currentEssayParsed.attachments.map((att) => (
                          <div
                            key={att.url}
                            className="group relative overflow-hidden rounded-xl border border-border bg-background"
                          >
                            {att.isImage ? (
                              <button
                                type="button"
                                onClick={() => setPreviewImageUrl(att.url)}
                                className="block w-full aspect-[4/3] overflow-hidden bg-muted"
                                title={`Preview ${att.name}`}
                              >
                                <img
                                  src={att.url}
                                  alt={att.name}
                                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                />
                              </button>
                            ) : (
                              <a
                                href={att.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 bg-muted/40 p-3 text-center hover:bg-muted/70"
                              >
                                <DocumentTextIcon className="h-8 w-8 text-primary" />
                                <span className="line-clamp-2 text-[11px] font-bold text-foreground">{att.name}</span>
                              </a>
                            )}
                            <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-[10px]">
                              <span className="truncate font-semibold text-muted-foreground">{att.name}</span>
                              <button
                                type="button"
                                onClick={() => removeEssayAttachment(q.id, att.url)}
                                aria-label={`Remove ${att.name}`}
                                className="shrink-0 rounded-md p-1 text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
                              >
                                <XMarkIcon className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Attach diagrams, code screenshots, or photos of handwritten working (JPEG, PNG, WebP, or PDF up to 10 MB — or paste with Ctrl+V).
                      </p>
                    )}
                  </div>
                </div>
              )}

              {q?.question_type === 'coding_blocks' && (
                <CodingBlocksChallenge
                  question={q}
                  value={answers[q.id] ?? ''}
                  onChange={(val) => setAnswers(a => ({ ...a, [q.id]: val }))}
                />
              )}
            </div>
          </div>

          {/* Desktop Question Jump Strip */}
          {questions.length > 1 && (
            <div className="hidden sm:flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-border/60">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-2">Questions:</span>
                {questions.map((item, idx) => {
                  const isDone = isQuestionAnswered(item);
                  const isFlagged = flaggedIds.has(item.id);
                  const isActive = idx === current;
                  return (
                    <button
                      key={item.id ?? idx}
                      type="button"
                      onClick={() => setCurrent(idx)}
                      className={`relative w-8 h-8 rounded-lg text-xs font-black border transition-all ${
                        isActive
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : isFlagged
                            ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/50'
                            : isDone
                              ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/30'
                              : 'bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
                      }`}
                      aria-label={`Jump to question ${idx + 1}${isFlagged ? ' (flagged)' : ''}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
              {answered > 0 && current < questions.length - 1 && (
                <button
                  type="button"
                  onClick={confirmAndSubmit}
                  disabled={submitting}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-black uppercase tracking-wider disabled:opacity-50"
                >
                  {submitting ? 'Finalizing…' : `Finish & Submit (${answered}/${questions.length})`}
                </button>
              )}
            </div>
          )}

          {/* Navigation Controls — desktop inline; mobile uses fixed bar below */}
          <div className="hidden sm:flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 pt-6 border-t border-border">
            <button onClick={() => setCurrent(c => Math.max(0, c - 1))} disabled={current === 0}
              className="group flex items-center justify-center sm:justify-start gap-3 px-4 sm:px-6 py-3 text-xs sm:text-sm font-bold text-muted-foreground hover:text-foreground transition-all disabled:opacity-40 disabled:pointer-events-none order-2 sm:order-1">
              <ChevronLeftIcon className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
              <span className="uppercase tracking-widest italic">Previous</span>
            </button>

            <div className="flex-1 flex justify-center order-1 sm:order-2">
              <div className="w-full sm:w-auto bg-card shadow-sm border border-border rounded-2xl sm:rounded-full px-3 sm:px-4 py-2 flex items-center justify-center gap-3 sm:gap-4">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{answered} Submitted</span>
                <div className="w-1 h-1 bg-muted rounded-full" />
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{questions.length - answered} Remaining</span>
              </div>
            </div>

            {current < questions.length - 1 ? (
              <button onClick={() => setCurrent(c => Math.min(questions.length - 1, c + 1))}
                className="group flex items-center justify-center sm:justify-end gap-3 px-4 sm:px-6 py-3 text-xs sm:text-sm font-bold text-muted-foreground hover:text-foreground transition-all order-3">
                <span className="uppercase tracking-widest italic">Proceed</span>
                <ChevronRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            ) : (
              <button onClick={confirmAndSubmit} disabled={submitting}
                className="relative group overflow-hidden px-6 sm:px-10 py-4 bg-emerald-700 hover:bg-emerald-800 text-white font-black uppercase tracking-[0.16em] sm:tracking-[0.2em] italic text-xs rounded-xl transition-all shadow-xl shadow-emerald-900/20 disabled:opacity-50 order-3">
                <span className="relative z-10">{submitting ? 'Finalizing…' : 'Complete Exam'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Compact Single-Row Mobile Controls + Expandable Question Navigator Drawer (flush to bottom in distraction-free mode) */}
      <div
        className="md:hidden fixed inset-x-0 bottom-0 z-[55] border-t border-border bg-background/95 backdrop-blur-md shadow-[0_-6px_20px_rgba(0,0,0,0.08)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {showMobileGrid && (
          <div className="border-b border-border bg-card px-3 py-3 space-y-2.5 max-h-[42dvh] overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-black uppercase tracking-wider text-foreground">
                All Questions ({answered}/{questions.length} answered)
              </p>
              <button
                type="button"
                onClick={() => setShowMobileGrid(false)}
                className="rounded-lg px-2 py-1 text-[11px] font-bold text-muted-foreground hover:text-foreground"
              >
                Close ✕
              </button>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {questions.map((item, i) => {
                const isFlagged = flaggedIds.has(item?.id);
                const isDone = isQuestionAnswered(item);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setCurrent(i);
                      setShowMobileGrid(false);
                    }}
                    className={`h-9 rounded-lg text-xs font-black transition-all ${
                      i === current
                        ? 'bg-emerald-700 text-white shadow-sm'
                        : isFlagged
                          ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/50'
                          : isDone
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/35'
                            : 'bg-muted/40 text-muted-foreground border border-border'
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => setCurrent(c => Math.max(0, c - 1))}
            disabled={current === 0}
            className="inline-flex h-10 px-3 items-center justify-center gap-1 rounded-xl border border-border bg-card text-xs font-bold text-foreground disabled:opacity-35"
            aria-label="Previous question"
          >
            <ChevronLeftIcon className="w-4 h-4" />
            <span>Prev</span>
          </button>
          <button
            type="button"
            onClick={() => setShowMobileGrid((v) => !v)}
            className="min-w-0 flex-1 h-10 rounded-xl border border-border bg-muted/40 px-2 flex flex-col items-center justify-center"
            aria-expanded={showMobileGrid}
          >
            <span className="text-[11px] font-black text-foreground leading-tight">
              Q {current + 1} / {questions.length} {showMobileGrid ? '▴' : '▾'}
            </span>
            <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 leading-tight">
              {answered} answered · tap grid
            </span>
          </button>
          {current < questions.length - 1 ? (
            <button
              type="button"
              onClick={() => setCurrent(c => Math.min(questions.length - 1, c + 1))}
              className="inline-flex h-10 px-3.5 items-center justify-center gap-1 rounded-xl bg-primary text-primary-foreground text-xs font-black shadow-sm"
              aria-label="Next question"
            >
              <span>Next</span>
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={confirmAndSubmit}
              disabled={submitting}
              className="inline-flex h-10 px-4 items-center justify-center rounded-xl bg-emerald-700 text-xs font-black uppercase tracking-wider text-white shadow-sm disabled:opacity-50"
            >
              {submitting ? '…' : 'Finish'}
            </button>
          )}
        </div>
      </div>

      {/* Smart Pre-Submit Review Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-3 pb-4 sm:p-6">
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => !submitting && setShowSubmitModal(false)} />
          <div className="relative z-10 w-full max-w-md max-h-[82dvh] overflow-y-auto rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-foreground">Review &amp; Submit Exam</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Check your progress before final submission. You cannot edit answers once submitted.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                aria-label="Close review modal"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="text-xl font-black text-emerald-700 dark:text-emerald-300">{answered}/{questions.length}</p>
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Answered</p>
              </div>
              <div className={`rounded-2xl border p-3 ${unansweredIndices.length > 0 ? 'border-amber-500/35 bg-amber-500/10' : 'border-border bg-muted/30'}`}>
                <p className={`text-xl font-black ${unansweredIndices.length > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-foreground'}`}>{unansweredIndices.length}</p>
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Unanswered</p>
              </div>
              <div className="rounded-2xl border border-primary/25 bg-primary/10 p-3">
                <p className="text-xl font-black text-primary">{totalAttachments}</p>
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Attached</p>
              </div>
            </div>

            {unansweredIndices.length > 0 && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                <p className="text-[11px] font-black text-amber-800 dark:text-amber-200">
                  Skipped questions — tap to jump back:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {unansweredIndices.map((idx) => (
                    <button
                      key={`unans-${idx}`}
                      type="button"
                      onClick={() => { setCurrent(idx); setShowSubmitModal(false); }}
                      className="rounded-lg border border-amber-500/40 bg-card px-2.5 py-1 text-xs font-black text-amber-800 dark:text-amber-200 hover:bg-amber-500/20"
                    >
                      Q{idx + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {flaggedIndices.length > 0 && (
              <div className="rounded-2xl border border-primary/25 bg-primary/5 p-3 space-y-2">
                <p className="text-[11px] font-black text-primary">
                  Flagged for review — tap to check:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {flaggedIndices.map((idx) => (
                    <button
                      key={`flag-${idx}`}
                      type="button"
                      onClick={() => { setCurrent(idx); setShowSubmitModal(false); }}
                      className="rounded-lg border border-primary/35 bg-card px-2.5 py-1 text-xs font-black text-primary hover:bg-primary/10"
                    >
                      Q{idx + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {uploadingForQ !== null && (
              <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5 text-xs font-bold text-amber-800 dark:text-amber-200">
                Please wait a moment — your image attachment is still uploading…
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowSubmitModal(false)}
                className="min-h-11 flex-1 rounded-xl border border-border bg-background px-4 text-xs font-black text-foreground hover:bg-muted"
              >
                Keep Reviewing
              </button>
              <button
                type="button"
                disabled={submitting || uploadingForQ !== null}
                onClick={() => void handleSubmit(false)}
                className="min-h-11 flex-1 rounded-xl bg-emerald-700 px-4 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : uploadingForQ !== null ? 'Uploading…' : 'Submit Exam Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-Size Image Preview Lightbox */}
      {previewImageUrl && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setPreviewImageUrl(null)}>
          <div className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewImageUrl(null)}
              aria-label="Close image preview"
              className="absolute right-3 top-3 rounded-full bg-black/70 p-2 text-white hover:bg-black"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
            <img src={previewImageUrl} alt="Attached work preview" className="max-h-[85vh] w-auto object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
