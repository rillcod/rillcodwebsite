'use client';

import { SubmissionAttachmentCard } from '@/components/submissions/SubmissionAttachmentCard';

type RubricCriterion = { criterion: string; description?: string; maxPoints: number };

function isCodeContent(text: string): boolean {
  if (!text) return false;
  const keywords = ['def ', 'function ', 'const ', 'let ', 'var ', 'import ', 'export ', 'class ', '<html', 'public class', '#include', '<?php'];
  return keywords.some(k => text.includes(k)) || text.includes(';\n') || text.includes('{\n');
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
  const isCode = isCodeContent(submissionText || '');

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
        {/* Assignment Brief & Rubric */}
        <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">Assignment Prompt &amp; Brief</p>
          <h3 className="mt-1 text-base font-black text-foreground">{assignmentTitle}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {studentName ?? 'Student'}
            {studentEmail ? ` · ${studentEmail}` : ''}
            {submittedAt ? ` · Submitted ${new Date(submittedAt).toLocaleString()}` : ''}
          </p>

          {brief ? (
            <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-border bg-card p-4">
              <p className="whitespace-pre-wrap text-xs sm:text-sm leading-relaxed text-foreground">{brief}</p>
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-border bg-card/60 p-3 text-xs text-muted-foreground">
              No assignment brief is stored. Open the assignment record if you need the full prompt.
            </p>
          )}

          {rubric.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Grading Rubric</p>
              {rubric.map((row, i) => (
                <div key={`${row.criterion}-${i}`} className="rounded-xl border border-border bg-card px-3.5 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-bold text-foreground">{row.criterion}</p>
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

        {/* Student Submission Evidence */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Student Submitted Evidence</p>
            <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border ${hasSubmission ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
              {hasSubmission ? 'Ready to Review' : 'No Submitted Content'}
            </span>
          </div>

          {submissionText?.trim() ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {isCode ? 'Source Code Submission' : 'Written Essay / Text Response'}
                </span>
              </div>
              <div className={`max-h-[32rem] overflow-y-auto rounded-xl border border-border p-4 ${isCode ? 'bg-slate-950 font-mono text-xs text-emerald-400 leading-relaxed shadow-inner' : 'bg-background text-sm text-foreground leading-relaxed'}`}>
                <pre className="whitespace-pre-wrap font-inherit">{submissionText}</pre>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-background/60 p-4 text-sm text-muted-foreground">
              {fileUrl
                ? 'This student submitted a file attachment. Review the attachment below before marking.'
                : 'No text or file was submitted for this record.'}
            </div>
          )}

          {fileUrl && (
            <div className="mt-4 space-y-2 border-t border-border pt-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Attachment</p>
              <SubmissionAttachmentCard url={fileUrl} />
            </div>
          )}

          {aiSuggestedFeedback && (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-1">
                AI Suggested Feedback {aiSuggestedGrade != null ? `(${aiSuggestedGrade}/${maxPoints})` : ''}
              </p>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground font-medium">{aiSuggestedFeedback}</p>
            </div>
          )}

          {existingFeedback && (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">Saved Teacher Feedback</p>
              <p className="text-xs leading-relaxed text-foreground font-medium">{existingFeedback}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
