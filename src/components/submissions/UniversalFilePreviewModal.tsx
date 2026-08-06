'use client';

import { useEffect, useState } from 'react';
import {
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  DocumentIcon,
  DocumentTextIcon,
  PaperClipIcon,
  PhotoIcon,
  XMarkIcon,
} from '@/lib/icons';

function cleanUrl(url: string) {
  return url.split('?')[0].toLowerCase();
}

export function isImageUrl(url: string) {
  return /\.(png|jpe?g|gif|webp|svg|bmp|heic)(\?|$)/i.test(cleanUrl(url));
}

export function isPdfUrl(url: string) {
  return /\.pdf(\?|$)/i.test(cleanUrl(url));
}

export function isVideoUrl(url: string) {
  return /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(cleanUrl(url));
}

export function isAudioUrl(url: string) {
  return /\.(mp3|wav|ogg|m4a|aac)(\?|$)/i.test(cleanUrl(url));
}

export function isDocUrl(url: string) {
  return /\.(doc|docx|ppt|pptx|xls|xlsx)(\?|$)/i.test(cleanUrl(url));
}

export function isCodeOrTextUrl(url: string) {
  return /\.(txt|py|js|ts|json|html|css|md|c|cpp|sql|sh)(\?|$)/i.test(cleanUrl(url));
}

export function getFileKindInfo(url: string): { label: string; Icon: typeof DocumentIcon; category: 'image' | 'pdf' | 'video' | 'audio' | 'doc' | 'code' | 'other' } {
  if (isImageUrl(url)) return { label: 'Image Submission', Icon: PhotoIcon, category: 'image' };
  if (isPdfUrl(url)) return { label: 'PDF Document', Icon: DocumentTextIcon, category: 'pdf' };
  if (isVideoUrl(url)) return { label: 'Video Recording', Icon: DocumentIcon, category: 'video' };
  if (isAudioUrl(url)) return { label: 'Audio Submission', Icon: DocumentIcon, category: 'audio' };
  if (isDocUrl(url)) return { label: 'Office Document', Icon: DocumentTextIcon, category: 'doc' };
  if (isCodeOrTextUrl(url)) return { label: 'Source Code / Text', Icon: DocumentTextIcon, category: 'code' };
  return { label: 'File Attachment', Icon: PaperClipIcon, category: 'other' };
}

export function extractFileName(url: string, fallback = 'Submitted File') {
  try {
    const raw = decodeURIComponent(url.split('/').pop()?.split('?')[0] || '');
    return raw || fallback;
  } catch {
    return url.split('/').pop()?.split('?')[0] || fallback;
  }
}

type Props = {
  url: string;
  name?: string | null;
  studentName?: string | null;
  onClose: () => void;
};

/**
 * Universal Lightbox & Inline File Preview Modal.
 * 100% Theme-Aware: adapts to Light Mode and Dark Mode automatically.
 */
export default function UniversalFilePreviewModal({
  url,
  name,
  studentName,
  onClose,
}: Props) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [copied, setCopied] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);

  const fileName = name?.trim() || extractFileName(url);
  const { label, Icon, category } = getFileKindInfo(url);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(z + 0.25, 3));
      if (e.key === '-') setZoom((z) => Math.max(z - 0.25, 0.5));
      if (e.key === '0') {
        setZoom(1);
        setRotation(0);
      }
      if (e.key === 'r' || e.key === 'R') setRotation((r) => (r + 90) % 360);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Fetch text/code content if file is text/code
  useEffect(() => {
    if (category === 'code') {
      setTextLoading(true);
      fetch(url)
        .then((res) => res.text())
        .then((txt) => {
          setTextContent(txt);
          setTextLoading(false);
        })
        .catch(() => {
          setTextContent('Could not load text file contents.');
          setTextLoading(false);
        });
    }
  }, [url, category]);

  const copyUrl = () => {
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const googleDocsViewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${label}: ${fileName}`}
      className="fixed inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur-xl text-foreground animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* ── Top Header Toolbar (Theme Aware) ── */}
      <div
        className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card/90 backdrop-blur-md px-4 py-3 sm:px-6 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
                {label}
              </span>
              {studentName && (
                <span className="text-[10px] font-bold text-muted-foreground border-l border-border pl-2">
                  Student: <strong className="text-foreground">{studentName}</strong>
                </span>
              )}
            </div>
            <p className="truncate text-xs font-bold text-foreground sm:text-sm">
              {fileName}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {category === 'image' && (
            <div className="hidden sm:flex items-center gap-1 bg-muted/60 border border-border rounded-xl p-1">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
                className="w-7 h-7 flex items-center justify-center hover:bg-muted text-foreground rounded-lg transition-colors font-black text-sm"
                title="Zoom out (-)"
              >
                −
              </button>
              <span className="w-12 text-center text-xs font-black text-foreground">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}
                className="w-7 h-7 flex items-center justify-center hover:bg-muted text-foreground rounded-lg transition-colors font-black text-sm"
                title="Zoom in (+)"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="px-2 py-1 text-[10px] font-black uppercase tracking-wider bg-card hover:bg-muted text-foreground border border-border rounded-lg transition-colors"
                title="Rotate 90deg (R)"
              >
                Rotate
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setRotation(0);
                }}
                className="px-2 py-1 text-[10px] font-black uppercase tracking-wider bg-card hover:bg-muted text-foreground border border-border rounded-lg transition-colors"
              >
                Reset
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={copyUrl}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted transition-colors shadow-sm"
          >
            {copied ? <CheckIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : <PaperClipIcon className="h-3.5 w-3.5 text-muted-foreground" />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Link'}</span>
          </button>

          <a
            href={url}
            download={fileName}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-200 hover:bg-amber-500/25 transition-colors shadow-sm"
          >
            <ArrowDownTrayIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Download</span>
          </a>

          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted transition-colors shadow-sm"
            title="Open raw file in new tab"
          >
            <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
          </a>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-foreground hover:bg-muted transition-colors shadow-sm"
            aria-label="Close modal"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── Main Interactive Viewer Canvas (Theme Aware) ── */}
      <div
        className="flex-1 overflow-auto p-4 sm:p-6 flex items-center justify-center relative bg-muted/20"
        onClick={onClose}
      >
        {category === 'image' && (
          <div
            className="relative flex items-center justify-center transition-transform duration-200 ease-out max-w-full max-h-full"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={fileName}
              className="max-h-[80vh] max-w-[90vw] rounded-2xl border border-border object-contain shadow-2xl select-none cursor-grab active:cursor-grabbing bg-card"
              draggable={false}
            />
          </div>
        )}

        {category === 'pdf' && (
          <div
            className="h-full w-full max-w-5xl rounded-2xl border border-border bg-card overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              src={url}
              title={fileName}
              className="h-full w-full border-0"
              allow="fullscreen"
            />
          </div>
        )}

        {category === 'video' && (
          <div
            className="max-w-4xl w-full rounded-2xl border border-border bg-card overflow-hidden shadow-2xl p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <video
              src={url}
              controls
              autoPlay
              className="w-full max-h-[80vh] rounded-xl bg-black"
            />
          </div>
        )}

        {category === 'audio' && (
          <div
            className="max-w-md w-full rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto text-2xl">
              🎵
            </div>
            <div>
              <p className="text-sm font-bold text-foreground truncate">{fileName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Audio Recording</p>
            </div>
            <audio src={url} controls className="w-full" autoPlay />
          </div>
        )}

        {category === 'doc' && (
          <div
            className="h-full w-full max-w-5xl rounded-2xl border border-border bg-card overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              src={googleDocsViewerUrl}
              title={fileName}
              className="h-full w-full border-0"
            />
          </div>
        )}

        {category === 'code' && (
          <div
            className="h-full w-full max-w-4xl rounded-2xl border border-border bg-slate-950 overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-white/10 text-xs text-slate-300 font-mono">
              <span>{fileName}</span>
              <span>{textLoading ? 'Loading...' : `${(textContent || '').split('\n').length} lines`}</span>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-xs font-mono leading-relaxed text-emerald-400 bg-slate-950">
              <code>{textLoading ? 'Loading code file...' : textContent}</code>
            </pre>
          </div>
        )}

        {category === 'other' && (
          <div
            className="max-w-md w-full rounded-2xl border border-border bg-card p-6 shadow-2xl text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 rounded-2xl bg-muted border border-border text-foreground flex items-center justify-center mx-auto text-2xl">
              📄
            </div>
            <div>
              <p className="text-sm font-bold text-foreground truncate">{fileName}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Direct inline preview is not supported for this format. You can download or open the file in a new browser tab.
              </p>
            </div>
            <div className="flex gap-2 justify-center">
              <a
                href={url}
                download={fileName}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-amber-500 text-slate-950 text-xs font-bold rounded-xl hover:bg-amber-400 transition-colors shadow-sm"
              >
                Download File
              </a>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-card border border-border text-foreground text-xs font-bold rounded-xl hover:bg-muted transition-colors shadow-sm"
              >
                Open in Tab ↗
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Footer shortcut hints */}
      <div className="shrink-0 py-2.5 text-center text-[10px] text-muted-foreground border-t border-border bg-card">
        Esc: Close · + / - : Zoom image · R: Rotate image · Click backdrop to dismiss
      </div>
    </div>
  );
}
