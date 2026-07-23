'use client';

import { PaperClipIcon } from '@/lib/icons';

type RubricCriterion = { criterion: string; description?: string; maxPoints: number };

function isImageUrl(url: string) {
  return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url);
}

function isPdfUrl(url: string) {
  return /\.pdf(\?|$)/i.test(url);
}

function GradingModeBadge({ mode }: { mode?: string | null }) {
  const key = String(mode || 'manual').toLowerCase();
  const label =
    key === 'ai_suggested' ? 'AI suggested'
      : key === 'rubric' ? 'Rubric'
        : key === 'auto' ? 'Auto'
          : 'Manual';
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
      {label}
    </span>
  );
}

function SubmissionFilePreview({ url }: { url: string }) {
  if (isImageUrl(url)) {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-background">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Student submission attachment" className="max-h-[28rem] w-full object-contain bg-black/5" />
      </div>
    );
  }
  if (isPdfUrl(url)) {
    return (
      <iframe
        src={url}
        title="Student submission PDF"
        className="h-[28rem] w-full rounded-xl border border-border bg-background"
      />
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-bold text-primary hover:bg-primary/10"
    >
      <PaperClipIcon className="h-4 w-4" />
      Open attachment in new tab
    </a>
  );
}

export type GradingAssessmentProps = {
  assignmentTitle: string;
  description?: string | null;
  instructions?: string | null;
  rubric?: RubricCriterion[];
  gradingMode?: string | null;
  maxPoints: number;
  className?: string | null;
  termLabel?: string | null;
  status?: string | null;
  studentName?: string;
  studentEmail?: string;
  submittedAt?: string;
  submissionText?: string | null;
  fileUrl?: string | null;
  aiSuggestedGrade?: number | null;
  aiSuggestedFeedback?: string | null;
  existingFeedback?: string | null;
};

/** Evidence-first panel: what to assess, then what the student submitted. */
export function GradingAssessmentView({
  assignmentTitle,
  description,
  instructions,
  rubric = [],
  gradingMode,
  maxPoints,
  className,
  termLabel,
  status,
  studentName,
  studentEmail,
  submittedAt,
  submissionText,
  fileUrl,
  aiSuggestedGrade,
  aiSuggestedFeedback,
  existingFeedback,
}: GradingAssessmentProps) {
  const brief = instructions?.trim() || description?.trim() || null;
  const hasSubmission = Boolean(submissionText?.trim() || fileUrl);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <GradingModeBadge mode={gradingMode} />
        {status && (
          <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-400">
            {status.replace(/_/g, ' ')}
          </span>
        )}
        {className && (
          <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-black text-primary">
            {className}
          </span>
        )}
        {termLabel && (
          <span className="rounded-full border border-border bg-muted/30 px-2.5 py-1 text-[10px] font-black text-muted-foreground">
            {termLabel}
          </span>
        )}
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          Max {maxPoints} pts
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">What to assess</p>
          <h3 className="mt-1 text-base font-black text-foreground">{assignmentTitle}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {studentName ?? 'Student'}
            {studentEmail ? ` · ${studentEmail}` : ''}
            {submittedAt ? ` · Submitted ${new Date(submittedAt).toLocaleString()}` : ''}
          </p>

          {brief ? (
            <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-border bg-card p-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{brief}</p>
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-border bg-card/60 p-3 text-xs text-muted-foreground">
              No assignment brief is stored. Open the assignment record if you need the full prompt.
            </p>
          )}

          {description?.trim() && instructions?.trim() && description.trim() !== instructions.trim() && (
            <div className="mt-3 max-h-36 overflow-y-auto rounded-xl border border-border bg-card p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Description</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{description}</p>
            </div>
          )}

          {rubric.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Rubric</p>
              {rubric.map((row, i) => (
                <div key={`${row.criterion}-${i}`} className="rounded-xl border border-border bg-card px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-bold text-foreground">{row.criterion}</p>
                    <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-amber-400">
                      {row.maxPoints} pts
                    </span>
                  </div>
                  {row.description && (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{row.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Student work</p>
            <span className={`text-[10px] font-black uppercase tracking-widest ${hasSubmission ? 'text-emerald-400' : 'text-amber-400'}`}>
              {hasSubmission ? 'Ready to review' : 'Missing content'}
            </span>
          </div>

          {submissionText?.trim() ? (
            <div className="max-h-56 overflow-y-auto rounded-xl border border-border bg-background p-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{submissionText}</p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-background/60 p-4 text-sm text-muted-foreground">
              {fileUrl
                ? 'This student submitted a file attachment. Review the preview below before grading.'
                : 'No text or file was submitted. Confirm whether this was verbal or in-person work before grading.'}
            </div>
          )}

          {fileUrl && (
            <div className="mt-3 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Attachment</p>
              <SubmissionFilePreview url={fileUrl} />
            </div>
          )}

          {aiSuggestedFeedback && (
            <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                AI suggested feedback
                {aiSuggestedGrade != null ? ` · ${aiSuggestedGrade}/${maxPoints}` : ''}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{aiSuggestedFeedback}</p>
            </div>
          )}

          {existingFeedback && (
            <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Existing feedback</p>
              <p className="mt-1 text-sm text-foreground">{existingFeedback}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
