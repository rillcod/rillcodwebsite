'use client';

import { useState } from 'react';
import {
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  DocumentIcon,
  DocumentTextIcon,
  EyeIcon,
  PaperClipIcon,
  PhotoIcon,
  XMarkIcon,
} from '@/lib/icons';
import UniversalFilePreviewModal, {
  isAudioUrl,
  isCodeOrTextUrl,
  isDocUrl,
  isImageUrl,
  isPdfUrl,
  isVideoUrl,
} from './UniversalFilePreviewModal';

export type SubmissionAttachmentTone = 'default' | 'onDark';

function cleanUrl(url: string) {
  return url.split('?')[0].toLowerCase();
}

export function isSubmissionImageUrl(url: string) {
  return isImageUrl(url);
}

export function isSubmissionPdfUrl(url: string) {
  return isPdfUrl(url);
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
  if (isImageUrl(url)) return { label: 'Image', Icon: PhotoIcon };
  if (isPdfUrl(url)) return { label: 'PDF document', Icon: DocumentTextIcon };
  if (isVideoUrl(url)) return { label: 'Video file', Icon: DocumentIcon };
  if (isAudioUrl(url)) return { label: 'Audio file', Icon: DocumentIcon };
  if (isDocUrl(url)) return { label: 'Office document', Icon: DocumentTextIcon };
  if (isCodeOrTextUrl(url)) return { label: 'Text / Code file', Icon: DocumentTextIcon };
  if (/\.(zip|rar|7z)(\?|$)/i.test(path)) return { label: 'Archive', Icon: DocumentIcon };
  return { label: 'File attachment', Icon: PaperClipIcon };
}

type Props = {
  url: string;
  /** Optional display name when known (e.g. local File.name before submit). */
  name?: string | null;
  /** Human-facing integrity state retained with the submission evidence. */
  integrityStatus?: 'sha256_recorded' | 'metadata_only' | 'legacy_preserved' | null;
  /** Student name for lightbox header */
  studentName?: string | null;
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
 * Retains international standards: inline preview modal lightbox, responsive thumbnails.
 */
export function SubmissionAttachmentCard({
  url,
  name,
  integrityStatus,
  studentName,
  tone = 'default',
  preview = true,
  compact = false,
  onOpenPreview,
  onRemove,
  className = '',
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  const isImage = isImageUrl(url);
  const isPdf = isPdfUrl(url);
  const isDoc = isDocUrl(url);
  const isMedia = isVideoUrl(url) || isAudioUrl(url);
  const isCode = isCodeOrTextUrl(url);
  const { label, Icon } = submissionFileKind(url);
  const displayName = name?.trim() || submissionFileName(url);
  const integrityLabel = integrityStatus === 'sha256_recorded'
    ? 'Upload verified'
    : integrityStatus === 'metadata_only'
      ? 'Upload recorded'
      : integrityStatus === 'legacy_preserved'
        ? 'Previously submitted file'
        : null;
  const dark = tone === 'onDark';

  const triggerPreview = () => {
    if (onOpenPreview) {
      onOpenPreview();
    } else {
      setModalOpen(true);
    }
  };

  const shell = dark
    ? 'border-white/10 bg-white/[0.03]'
    : 'border-border bg-card';
  const muted = dark ? 'text-muted-foreground' : 'text-muted-foreground';
  const title = dark ? 'text-white' : 'text-foreground';
  const iconWrap = dark
    ? 'bg-white/5 border-white/10 text-amber-700 dark:text-amber-300'
    : 'bg-primary/10 border-primary/15 text-primary';
  const secondaryBtn = dark
    ? 'border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10'
    : 'border-border bg-muted/40 text-foreground hover:bg-muted';
  const primaryBtn = dark
    ? 'border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-200 hover:bg-amber-500/25'
    : 'border-primary/20 bg-primary text-primary-foreground hover:bg-primary/90';

  if (compact) {
    return (
      <>
        {modalOpen && (
          <UniversalFilePreviewModal
            url={url}
            name={displayName}
            studentName={studentName}
            onClose={() => setModalOpen(false)}
          />
        )}
        <div className={`flex items-center gap-3 rounded-xl border ${shell} px-3.5 py-3 ${className}`}>
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${iconWrap}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`truncate text-sm font-semibold ${title}`}>{displayName}</p>
            <p className={`text-[11px] ${muted}`}>{label}{integrityLabel ? ` · ${integrityLabel}` : ''}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={triggerPreview}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors ${primaryBtn}`}
            >
              <EyeIcon className="h-3.5 w-3.5" />
              Preview
            </button>
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
      </>
    );
  }

  return (
    <>
      {modalOpen && (
        <UniversalFilePreviewModal
          url={url}
          name={displayName}
          studentName={studentName}
          onClose={() => setModalOpen(false)}
        />
      )}
      <div className={`overflow-hidden rounded-2xl border ${shell} ${className}`}>
        <div className="flex items-start gap-3 border-b border-inherit px-4 py-3.5">
          <div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${iconWrap}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`truncate text-sm font-semibold leading-snug ${title}`}>{displayName}</p>
            <p className={`mt-0.5 text-[11px] ${muted}`}>{label}{integrityLabel ? ` · ${integrityLabel}` : ''}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={triggerPreview}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors ${primaryBtn}`}
            >
              <EyeIcon className="h-3.5 w-3.5" />
              {isImage ? 'View Photo' : 'Inline Preview'}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              download={displayName}
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
            onClick={triggerPreview}
            className={`group relative block w-full cursor-zoom-in overflow-hidden ${dark ? 'bg-black/40' : 'bg-muted/30'}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={displayName}
              className="mx-auto max-h-[28rem] w-full object-contain transition-transform duration-300 group-hover:scale-[1.01]"
            />
            <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-white opacity-90 sm:opacity-0 transition-opacity group-hover:opacity-100 flex items-center justify-between">
              <span>Click for Fullscreen Lightbox &amp; Zoom</span>
              <EyeIcon className="h-4 w-4 text-amber-400" />
            </span>
          </button>
        )}

        {preview && isPdf && (
          <div className={`${dark ? 'bg-black/50' : 'bg-muted/20'} h-72 sm:h-96 relative group`}>
            <iframe src={url} title={displayName} className="h-full w-full border-0" />
            <div className="absolute top-3 right-3 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={triggerPreview}
                className="px-3 py-1.5 bg-slate-900/90 border border-white/10 text-white rounded-lg text-xs font-bold shadow-lg flex items-center gap-1.5"
              >
                <EyeIcon className="h-3.5 w-3.5 text-amber-400" /> Expand PDF Modal
              </button>
            </div>
          </div>
        )}

        {preview && (isDoc || isMedia || isCode) && (
          <div className={`flex items-center justify-between gap-3 px-4 py-4 ${dark ? 'bg-black/20' : 'bg-muted/20'}`}>
            <div className="min-w-0 flex-1">
              <p className={`text-xs leading-relaxed font-medium ${muted}`}>
                {isDoc ? 'Office Document ready for inline inspection.' : isMedia ? 'Media file ready for playback.' : 'Code/text content ready for syntax view.'}
              </p>
            </div>
            <button
              type="button"
              onClick={triggerPreview}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[11px] font-bold transition-colors ${primaryBtn}`}
            >
              <EyeIcon className="h-3.5 w-3.5" />
              Launch Preview Modal
            </button>
          </div>
        )}

        {preview && !isImage && !isPdf && !isDoc && !isMedia && !isCode && (
          <div className={`flex items-center justify-between gap-3 px-4 py-4 ${dark ? 'bg-black/20' : 'bg-muted/20'}`}>
            <p className={`text-xs leading-relaxed ${muted}`}>
              Attached file ({displayName}). Open modal or download to review work.
            </p>
            <button
              type="button"
              onClick={triggerPreview}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors ${primaryBtn}`}
            >
              Preview File
              <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
