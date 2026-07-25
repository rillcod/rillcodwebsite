'use client';

import {
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  DocumentIcon,
  DocumentTextIcon,
  PaperClipIcon,
  PhotoIcon,
  XMarkIcon,
} from '@/lib/icons';

export type SubmissionAttachmentTone = 'default' | 'onDark';

function cleanUrl(url: string) {
  return url.split('?')[0].toLowerCase();
}

export function isSubmissionImageUrl(url: string) {
  return /\.(png|jpe?g|gif|webp|svg|bmp|heic)(\?|$)/i.test(cleanUrl(url));
}

export function isSubmissionPdfUrl(url: string) {
  return /\.pdf(\?|$)/i.test(cleanUrl(url));
}

export function submissionFileName(url: string, fallback = 'Attached file') {
  try {
    const raw = decodeURIComponent(url.split('/').pop()?.split('?')[0] || '');
    return raw || fallback;
  } catch {
    return url.split('/').pop()?.split('?')[0] || fallback;
  }
}

export function submissionFileKind(url: string): { label: string; Icon: typeof DocumentIcon } {
  const path = cleanUrl(url);
  if (isSubmissionImageUrl(url)) return { label: 'Image', Icon: PhotoIcon };
  if (isSubmissionPdfUrl(url)) return { label: 'PDF document', Icon: DocumentTextIcon };
  if (/\.(doc|docx)(\?|$)/i.test(path)) return { label: 'Word document', Icon: DocumentTextIcon };
  if (/\.(txt|md|rtf)(\?|$)/i.test(path)) return { label: 'Text file', Icon: DocumentTextIcon };
  if (/\.(zip|rar|7z)(\?|$)/i.test(path)) return { label: 'Archive', Icon: DocumentIcon };
  return { label: 'File attachment', Icon: PaperClipIcon };
}

type Props = {
  url: string;
  /** Optional display name when known (e.g. local File.name before submit). */
  name?: string | null;
  /** default = dashboard tokens; onDark = GradeCanvas dark shell */
  tone?: SubmissionAttachmentTone;
  /** Show inline image / PDF preview */
  preview?: boolean;
  /** Compact row without large preview (grades modal) */
  compact?: boolean;
  onOpenPreview?: () => void;
  onRemove?: () => void;
  className?: string;
};

/**
 * Shared submission attachment presentation for student + staff surfaces.
 * Prefer this over one-off paperclip rows so review UIs stay consistent.
 */
export function SubmissionAttachmentCard({
  url,
  name,
  tone = 'default',
  preview = true,
  compact = false,
  onOpenPreview,
  onRemove,
  className = '',
}: Props) {
  const isImage = isSubmissionImageUrl(url);
  const isPdf = isSubmissionPdfUrl(url);
  const { label, Icon } = submissionFileKind(url);
  const displayName = name?.trim() || submissionFileName(url);
  const dark = tone === 'onDark';

  const shell = dark
    ? 'border-white/10 bg-white/[0.03]'
    : 'border-border bg-card';
  const muted = dark ? 'text-white/40' : 'text-muted-foreground';
  const title = dark ? 'text-white' : 'text-foreground';
  const iconWrap = dark
    ? 'bg-white/5 border-white/10 text-amber-300'
    : 'bg-primary/10 border-primary/15 text-primary';
  const secondaryBtn = dark
    ? 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
    : 'border-border bg-muted/40 text-foreground hover:bg-muted';
  const primaryBtn = dark
    ? 'border-amber-500/30 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
    : 'border-primary/20 bg-primary text-primary-foreground hover:bg-primary/90';

  if (compact) {
    return (
      <div className={`flex items-center gap-3 rounded-xl border ${shell} px-3.5 py-3 ${className}`}>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${iconWrap}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold ${title}`}>{displayName}</p>
          <p className={`text-[11px] ${muted}`}>{label}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors ${primaryBtn}`}
          >
            Open
            <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
          </a>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className={`rounded-lg border p-1.5 transition-colors ${secondaryBtn}`}
              aria-label="Remove attachment"
            >
              <XMarkIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-2xl border ${shell} ${className}`}>
      <div className="flex items-start gap-3 border-b border-inherit px-4 py-3.5">
        <div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${iconWrap}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold leading-snug ${title}`}>{displayName}</p>
          <p className={`mt-0.5 text-[11px] ${muted}`}>{label}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {(isImage || isPdf || onOpenPreview) && (
            <button
              type="button"
              onClick={() => {
                if (onOpenPreview) onOpenPreview();
                else if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors ${primaryBtn}`}
            >
              {isImage ? 'Enlarge' : 'Preview'}
            </button>
          )}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            download
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors ${secondaryBtn}`}
          >
            <ArrowDownTrayIcon className="h-3.5 w-3.5" />
            Download
          </a>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold text-rose-400 transition-colors ${
                dark ? 'border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20' : 'border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10'
              }`}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {preview && isImage && (
        <button
          type="button"
          onClick={() => {
            if (onOpenPreview) onOpenPreview();
            else if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
          }}
          className={`group relative block w-full cursor-zoom-in ${dark ? 'bg-black/40' : 'bg-muted/30'}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={displayName}
            className="mx-auto max-h-[28rem] w-full object-contain"
          />
          <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white opacity-0 transition-opacity group-hover:opacity-100">
            Click to enlarge
          </span>
        </button>
      )}

      {preview && isPdf && (
        <div className={`${dark ? 'bg-black/50' : 'bg-muted/20'} h-72 sm:h-96`}>
          <iframe src={url} title={displayName} className="h-full w-full border-0" />
        </div>
      )}

      {preview && !isImage && !isPdf && (
        <div className={`flex items-center justify-between gap-3 px-4 py-4 ${dark ? 'bg-black/20' : 'bg-muted/20'}`}>
          <p className={`text-xs leading-relaxed ${muted}`}>
            Preview isn’t available for this file type. Open or download to review the student’s work.
          </p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors ${primaryBtn}`}
          >
            Open
            <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}
