'use client';

import { useState } from 'react';
import { PhotoIcon, EyeIcon, XMarkIcon, SparklesIcon } from '@/lib/icons';

export interface QuestionIllustrationData {
  imageUrl?: string | null;
  imageDescription?: string | null;
  figureCaption?: string | null;
  diagramSvg?: string | null;
  motionCue?: string | null;
}

/** Extract illustration / diagram / figure metadata from any CBT question shape. */
export function extractQuestionIllustration(question: any): QuestionIllustrationData | null {
  if (!question || typeof question !== 'object') return null;
  const meta =
    question.metadata && typeof question.metadata === 'object'
      ? (question.metadata as Record<string, any>)
      : {};

  let imageUrl: string | null =
    (typeof question.image_url === 'string' && question.image_url.trim()) ||
    (typeof meta.image_url === 'string' && meta.image_url.trim()) ||
    (typeof meta.illustration_url === 'string' && meta.illustration_url.trim()) ||
    null;

  let figureCaption: string | null =
    (typeof meta.figure_caption === 'string' && meta.figure_caption.trim()) ||
    (typeof meta.caption === 'string' && meta.caption.trim()) ||
    null;

  // Also detect markdown image syntax ![alt](https://...) inside question_text
  if (!imageUrl && typeof question.question_text === 'string') {
    const mdImg = question.question_text.match(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/i);
    if (mdImg) {
      imageUrl = mdImg[2];
      if (!figureCaption && mdImg[1]?.trim()) figureCaption = mdImg[1].trim();
    }
  }

  const imageDescription: string | null =
    (typeof meta.image_description === 'string' && meta.image_description.trim()) ||
    (typeof meta.alt_text === 'string' && meta.alt_text.trim()) ||
    (typeof meta.diagram_description === 'string' && meta.diagram_description.trim()) ||
    null;

  const rawSvg =
    (typeof meta.diagram_svg === 'string' && meta.diagram_svg.trim()) ||
    (typeof meta.illustration_svg === 'string' && meta.illustration_svg.trim()) ||
    null;

  // Strict sanitization: only allow clean <svg> without <script> or inline event handlers
  const diagramSvg =
    rawSvg &&
    /^<svg[\s>]/i.test(rawSvg) &&
    /<\/svg>$/i.test(rawSvg) &&
    !/<script|on\w+\s*=|javascript:|foreignObject/i.test(rawSvg)
      ? rawSvg
      : null;

  const motionCue =
    (typeof meta.motion_cue === 'string' && meta.motion_cue.trim()) || null;

  if (!imageUrl && !diagramSvg && !imageDescription) return null;
  return { imageUrl, imageDescription, figureCaption, diagramSvg, motionCue };
}

export default function ExamIllustrationCard({
  question,
  compact = false,
}: {
  question: any;
  compact?: boolean;
}) {
  const data = extractQuestionIllustration(question);
  const [showDesc, setShowDesc] = useState(true);
  const [zoomed, setZoomed] = useState(false);

  if (!data) return null;

  return (
    <figure className={`rounded-2xl border border-border bg-muted/25 overflow-hidden ${compact ? 'p-3' : 'p-3.5 sm:p-4'} space-y-2.5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary">
          <PhotoIcon className="w-3.5 h-3.5" />
          {data.figureCaption || (data.diagramSvg ? 'Exam Diagram / Illustration' : 'Exam Figure')}
          {data.motionCue && (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-black text-emerald-700 dark:text-emerald-300">
              <SparklesIcon className="w-2.5 h-2.5 animate-pulse" />
              {data.motionCue}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          {data.imageDescription && (
            <button
              type="button"
              onClick={() => setShowDesc((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-[10px] font-bold text-foreground hover:bg-muted transition-colors"
            >
              <EyeIcon className="w-3 h-3 text-primary" />
              {showDesc ? 'Hide Description' : 'Image Description'}
            </button>
          )}
          {data.imageUrl && (
            <button
              type="button"
              onClick={() => setZoomed(true)}
              className="rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-black text-primary hover:bg-primary/20 transition-colors"
            >
              Zoom
            </button>
          )}
        </div>
      </div>

      {data.imageUrl && (
        <div className="relative overflow-hidden rounded-xl border border-border bg-background flex items-center justify-center">
          <img
            src={data.imageUrl}
            alt={data.imageDescription || data.figureCaption || 'Examination illustration'}
            draggable={false}
            onClick={() => setZoomed(true)}
            className={`w-full object-contain cursor-zoom-in select-none ${compact ? 'max-h-48' : 'max-h-72 sm:max-h-80'}`}
          />
        </div>
      )}

      {data.diagramSvg && (
        <div
          className="w-full overflow-x-auto rounded-xl border border-border bg-background p-3 flex items-center justify-center [&_svg]:max-w-full [&_svg]:h-auto [&_.exam-pulse]:animate-pulse [&_.exam-spin]:animate-spin [&_.exam-bounce]:animate-bounce"
          role="img"
          aria-label={data.imageDescription || data.figureCaption || 'Examination diagram'}
          dangerouslySetInnerHTML={{ __html: data.diagramSvg }}
        />
      )}

      {data.imageDescription && showDesc && (
        <figcaption className="rounded-xl border border-border/80 bg-card px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <span className="font-black text-foreground uppercase text-[10px] tracking-wider mr-1.5">
            Figure Description:
          </span>
          {data.imageDescription}
        </figcaption>
      )}

      {zoomed && data.imageUrl && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setZoomed(false)}
        >
          <div className="relative max-w-4xl w-full max-h-[90dvh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setZoomed(false)}
              aria-label="Close figure preview"
              className="self-end inline-flex items-center gap-1 rounded-xl bg-card border border-border px-3 py-1.5 text-xs font-black text-foreground"
            >
              <XMarkIcon className="w-4 h-4" /> Close
            </button>
            <img
              src={data.imageUrl}
              alt={data.imageDescription || data.figureCaption || 'Zoomed examination figure'}
              draggable={false}
              className="max-h-[75dvh] w-auto max-w-full rounded-2xl border border-border bg-background object-contain"
            />
            {data.imageDescription && (
              <p className="rounded-xl border border-border bg-card px-4 py-2 text-xs text-foreground max-w-2xl text-center">
                {data.imageDescription}
              </p>
            )}
          </div>
        </div>
      )}
    </figure>
  );
}
