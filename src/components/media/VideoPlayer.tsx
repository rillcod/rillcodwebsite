'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

// ─── URL helpers ────────────────────────────────────────────────────────────

function getYouTubeId(url: string): string | null {
    const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m?.[1] ?? null;
}

function isYouTubeUrl(url: string) {
    return /youtube\.com|youtu\.be/.test(url);
}

// ─── Icons (inline — no lucide in shared components) ────────────────────────

function PlayIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
        </svg>
    );
}
function PauseIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
        </svg>
    );
}
function FullscreenIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
        </svg>
    );
}
function ExitFullscreenIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
        </svg>
    );
}
function VolumeIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
        </svg>
    );
}
function MuteIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
        </svg>
    );
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VideoPlayerProps {
    /** R2 proxy URL (/api/media/...) or YouTube URL */
    url: string;
    title?: string;
    /** Show cinema/fullscreen toggle button */
    cinemaMode?: boolean;
    /** Called when cinema mode is toggled */
    onCinemaModeChange?: (active: boolean) => void;
    className?: string;
    autoPlay?: boolean;
}

// ─── YouTube Player ──────────────────────────────────────────────────────────

function YouTubePlayer({ url, title, cinemaMode, onCinemaModeChange }: VideoPlayerProps) {
    const ytId = getYouTubeId(url);
    const [cinema, setCinema] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const embedSrc = ytId
        ? `https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1&autoplay=0&color=white`
        : url; // fallback: embed as-is

    const toggleCinema = () => {
        const next = !cinema;
        setCinema(next);
        onCinemaModeChange?.(next);
    };

    return (
        <div className="relative w-full bg-black group">
            {/* Aspect-ratio shell */}
            <div className={`relative w-full ${cinema ? 'h-screen' : 'aspect-video'} transition-all duration-500`}>
                {/* Loading skeleton */}
                {!loaded && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0a0a12]">
                        <div className="w-12 h-12 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Loading video</span>
                    </div>
                )}
                <iframe
                    src={embedSrc}
                    className="absolute inset-0 w-full h-full border-0"
                    allowFullScreen
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    onLoad={() => setLoaded(true)}
                />

                {/* YouTube badge + cinema toggle overlay */}
                <div className="absolute top-3 right-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                    <span className="px-2.5 py-1 bg-red-600/90 backdrop-blur text-[9px] font-black uppercase tracking-widest text-white">
                        YouTube
                    </span>
                </div>
                {cinemaMode !== false && (
                    <button
                        onClick={toggleCinema}
                        className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 bg-black/70 backdrop-blur-md text-white text-[9px] font-black uppercase tracking-widest hover:bg-black/90 transition-all opacity-0 group-hover:opacity-100 z-10"
                    >
                        {cinema ? <ExitFullscreenIcon className="w-3.5 h-3.5" /> : <FullscreenIcon className="w-3.5 h-3.5" />}
                        {cinema ? 'Exit Cinema' : 'Cinema Mode'}
                    </button>
                )}
            </div>

            {/* Bottom bar */}
            {title && (
                <div className="px-4 py-2 bg-[#0a0a12]/90 border-t border-white/5 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                    <span className="text-[10px] font-bold text-white/60 truncate">{title}</span>
                </div>
            )}
        </div>
    );
}

// ─── R2 / Native Video Player ────────────────────────────────────────────────

function R2Player({ url, title, autoPlay }: VideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);

    const [playing, setPlaying] = useState(false);
    const [muted, setMuted] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [fullscreen, setFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [buffered, setBuffered] = useState(0);
    const [loading, setLoading] = useState(true);
    const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    const revealControls = useCallback(() => {
        setShowControls(true);
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => {
            if (playing) setShowControls(false);
        }, 3000);
    }, [playing]);

    useEffect(() => () => clearTimeout(hideTimer.current), []);

    const togglePlay = () => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) { v.play(); setPlaying(true); }
        else { v.pause(); setPlaying(false); }
        revealControls();
    };

    const toggleMute = () => {
        const v = videoRef.current;
        if (!v) return;
        v.muted = !v.muted;
        setMuted(v.muted);
    };

    const toggleFullscreen = () => {
        const el = containerRef.current;
        if (!el) return;
        if (!document.fullscreenElement) {
            el.requestFullscreen().then(() => setFullscreen(true)).catch(() => {});
        } else {
            document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {});
        }
    };

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const v = videoRef.current;
        const bar = progressRef.current;
        if (!v || !bar) return;
        const rect = bar.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        v.currentTime = pct * v.duration;
    };

    return (
        <div
            ref={containerRef}
            className="relative w-full bg-black group select-none"
            onMouseMove={revealControls}
            onMouseLeave={() => playing && setShowControls(false)}
            onClick={togglePlay}
        >
            {/* Loading */}
            {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0a0a12] z-20 pointer-events-none">
                    <div className="w-12 h-12 border-4 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Loading video</span>
                </div>
            )}

            {/* Video element */}
            <div className="aspect-video w-full">
                <video
                    ref={videoRef}
                    src={url}
                    className="w-full h-full object-contain"
                    autoPlay={autoPlay}
                    playsInline
                    onPlay={() => { setPlaying(true); revealControls(); }}
                    onPause={() => { setPlaying(false); setShowControls(true); }}
                    onLoadedMetadata={e => { setDuration((e.target as HTMLVideoElement).duration); setLoading(false); }}
                    onTimeUpdate={e => {
                        const v = e.target as HTMLVideoElement;
                        setCurrentTime(v.currentTime);
                        setProgress((v.currentTime / v.duration) * 100 || 0);
                        if (v.buffered.length > 0) {
                            setBuffered((v.buffered.end(v.buffered.length - 1) / v.duration) * 100);
                        }
                    }}
                    onWaiting={() => setLoading(true)}
                    onCanPlay={() => setLoading(false)}
                />
            </div>

            {/* Big play button when paused */}
            {!playing && !loading && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    <div className="w-16 h-16 rounded-full bg-orange-600/90 backdrop-blur flex items-center justify-center shadow-2xl shadow-orange-900/50">
                        <PlayIcon className="w-7 h-7 text-white ml-1" />
                    </div>
                </div>
            )}

            {/* Controls overlay */}
            <div
                className={`absolute inset-x-0 bottom-0 z-20 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Gradient scrim */}
                <div className="h-24 bg-gradient-to-t from-black/90 to-transparent pointer-events-none" />

                <div className="relative -mt-24 px-4 pb-3 space-y-2">
                    {/* Title */}
                    {title && (
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/60 truncate px-1">{title}</p>
                    )}

                    {/* Progress bar */}
                    <div
                        ref={progressRef}
                        className="relative h-1 bg-white/20 cursor-pointer group/bar"
                        onClick={handleProgressClick}
                    >
                        {/* Buffered */}
                        <div className="absolute inset-y-0 left-0 bg-white/20 transition-all" style={{ width: `${buffered}%` }} />
                        {/* Played */}
                        <div className="absolute inset-y-0 left-0 bg-orange-500 transition-all" style={{ width: `${progress}%` }} />
                        {/* Thumb */}
                        <div
                            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-orange-400 shadow-lg opacity-0 group-hover/bar:opacity-100 transition-opacity"
                            style={{ left: `calc(${progress}% - 6px)` }}
                        />
                    </div>

                    {/* Buttons row */}
                    <div className="flex items-center gap-3">
                        <button onClick={togglePlay} className="text-white hover:text-orange-400 transition-colors">
                            {playing
                                ? <PauseIcon className="w-5 h-5" />
                                : <PlayIcon className="w-5 h-5" />}
                        </button>

                        <button onClick={toggleMute} className="text-white hover:text-orange-400 transition-colors">
                            {muted ? <MuteIcon className="w-4 h-4" /> : <VolumeIcon className="w-4 h-4" />}
                        </button>

                        <span className="text-[10px] font-mono text-white/50 tabular-nums">
                            {formatTime(currentTime)} / {formatTime(duration)}
                        </span>

                        <div className="flex-1" />

                        {/* R2 badge */}
                        <span className="px-2 py-0.5 bg-orange-600/80 text-[8px] font-black uppercase tracking-widest text-white">
                            Rillcod
                        </span>

                        <button onClick={toggleFullscreen} className="text-white hover:text-orange-400 transition-colors">
                            {fullscreen
                                ? <ExitFullscreenIcon className="w-4 h-4" />
                                : <FullscreenIcon className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Smart VideoPlayer (auto-detects source) ─────────────────────────────────

export default function VideoPlayer(props: VideoPlayerProps) {
    const { url, className } = props;
    if (!url) return null;

    const isYT = isYouTubeUrl(url);

    return (
        <div className={`overflow-hidden border border-white/10 shadow-2xl shadow-black/60 ${className ?? ''}`}>
            {isYT
                ? <YouTubePlayer {...props} />
                : <R2Player {...props} />}
        </div>
    );
}
