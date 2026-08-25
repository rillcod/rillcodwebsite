'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Read-aloud button for lesson content.
 *
 * Built for the learners this platform actually serves: primary and secondary
 * pupils, many reading in a second language, plenty on shared or low-end phones.
 * For them a listen button is not a novelty — it is how the lesson becomes
 * reachable at all.
 *
 * ── Why the audio is not fetched until asked ─────────────────────────────────
 *
 * Nothing is requested on mount. Read-aloud costs a generation the first time
 * any passage is spoken, and pre-fetching every paragraph on a lesson page
 * would spend the daily free allocation on audio nobody plays. The first click
 * pays; every later click, by anyone, is served from storage.
 *
 * ── Accessibility ────────────────────────────────────────────────────────────
 *
 * The control is a real <button>, so it is reachable by keyboard and announced
 * by screen readers without extra work. Beyond that:
 *
 *  - aria-pressed communicates playing/stopped, since the label alone would
 *    leave a screen-reader user guessing what the button did.
 *  - Status changes go through a polite live region rather than only a spinner,
 *    so "preparing audio" is heard, not just seen.
 *  - The icon is aria-hidden and the accessible name lives in text, because an
 *    SVG announced as "image" tells nobody anything.
 *  - Errors are spoken by the live region too, so a failure is not silent for
 *    someone who cannot see the button turn red.
 *  - Nothing conveys state by colour alone; the label and icon both change.
 */

type ReadAloudProps = {
  /** Raw lesson content. Markdown is fine — the server normalises it. */
  text: string;
  /** Purpose, not a voice name: 'lesson' | 'story' | 'instruction'. */
  voice?: 'lesson' | 'story' | 'instruction';
  /** Shown next to the icon. Kept short; the full context is in aria-label. */
  label?: string;
  /** Describes what will be read, for screen readers. */
  describes?: string;
  className?: string;
};

type Status = 'idle' | 'loading' | 'playing' | 'error';

function SpeakerIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z"
      />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z"
      />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className ?? ''} animate-spin`}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" fill="none" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export default function ReadAloud({
  text,
  voice = 'lesson',
  label = 'Listen',
  describes,
  className = '',
}: ReadAloudProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Audio for this passage is fetched once per mount; replaying is instant and
  // costs nothing, which is the whole point of the storage cache behind it.
  const urlRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setStatus('idle');
    setMessage('');
  }, []);

  // Never leave audio playing after the lesson section unmounts.
  useEffect(() => () => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  // A new passage invalidates the fetched audio.
  useEffect(() => {
    urlRef.current = null;
  }, [text, voice]);

  const play = useCallback(async () => {
    if (!text.trim()) return;

    try {
      if (!urlRef.current) {
        setStatus('loading');
        setMessage('Preparing audio…');

        const response = await fetch('/api/ai/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice }),
        });

        if (!response.ok) throw new Error(String(response.status));

        const type = response.headers.get('content-type') ?? '';
        if (type.includes('application/json')) {
          const data = await response.json();
          if (!data?.url) throw new Error('no audio');
          urlRef.current = data.url;
        } else {
          // Storage was unavailable and the route sent the bytes instead.
          urlRef.current = URL.createObjectURL(await response.blob());
        }
      }

      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = urlRef.current!;
      audio.onended = () => {
        setStatus('idle');
        setMessage('Finished reading.');
      };
      audio.onerror = () => {
        setStatus('error');
        setMessage('Could not play the audio.');
      };

      await audio.play();
      setStatus('playing');
      setMessage('Reading aloud.');
    } catch {
      setStatus('error');
      setMessage('Read-aloud is unavailable right now. Please try again.');
    }
  }, [text, voice]);

  const isPlaying = status === 'playing';
  const isLoading = status === 'loading';

  const accessibleName = describes
    ? `${isPlaying ? 'Stop reading' : 'Listen to'} ${describes}`
    : isPlaying
      ? 'Stop reading aloud'
      : 'Listen to this passage';

  return (
    <>
      <button
        type="button"
        onClick={isPlaying ? stop : play}
        disabled={isLoading || !text.trim()}
        aria-label={accessibleName}
        aria-pressed={isPlaying}
        className={
          className ||
          'inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 disabled:opacity-50'
        }
      >
        {isLoading ? (
          <SpinnerIcon className="h-4 w-4" />
        ) : isPlaying ? (
          <StopIcon className="h-4 w-4" />
        ) : (
          <SpeakerIcon className="h-4 w-4" />
        )}
        <span>{isLoading ? 'Preparing…' : isPlaying ? 'Stop' : label}</span>
      </button>

      {/*
        Polite, so it waits for a gap rather than interrupting whatever the
        screen reader is reading. Visually hidden but not display:none, which
        would remove it from the accessibility tree entirely.
      */}
      <span
        role="status"
        aria-live="polite"
        className="sr-only"
      >
        {message}
      </span>
    </>
  );
}
