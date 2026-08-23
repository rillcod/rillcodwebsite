// @refresh reset
"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  Fragment,
} from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { fileKind } from "@/lib/files/file-kind";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeftIcon,
  PlayIcon,
  DocumentTextIcon,
  AcademicCapIcon,
  ClockIcon,
  BookOpenIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  PaperClipIcon,
  ArrowDownTrayIcon,
  VideoCameraIcon,
  DocumentIcon,
  PresentationChartBarIcon,
  PhotoIcon,
  BoltIcon,
  CheckBadgeIcon,
  LockClosedIcon,
  InformationCircleIcon,
  ExclamationTriangleIcon,
  RocketLaunchIcon,
  QuestionMarkCircleIcon,
  ChevronRightIcon,
  XMarkIcon,
  RectangleGroupIcon,
  ClipboardIcon,
  TrophyIcon,
  StarIcon,
  PlusIcon,
  TrashIcon,
  ArrowsPointingOutIcon,
  SpeakerWaveIcon,
  SparklesIcon,
  ArrowPathIcon,
  PencilSquareIcon,
} from "@/lib/icons";
import Script from "next/script";
import { motion, AnimatePresence } from "framer-motion";
import Markdown from "react-markdown";
import AIMarkdown from "@/components/ai/AIMarkdown";
import remarkGfm from "remark-gfm";
import IntegratedCodeRunner from "@/components/studio/IntegratedCodeRunner";
import MobileScrollStrip from "@/components/mobile/MobileScrollStrip";
import { MOBILE_TOUCH_BTN } from "@/components/mobile/mobile-styles";
import VideoPlayer from "@/components/media/VideoPlayer";
import SlideViewer from "@/components/learning/SlideViewer";
import LessonSlideStrip from "@/components/learning/LessonSlideStrip";
import { PresentationChartLineIcon } from "@/lib/icons";
import SlideDeckManager from "@/components/learning/SlideDeckManager";
import Editor from "@monaco-editor/react";
import * as d3 from "d3";
import dynamic from "next/dynamic";
import {
  buildAssignmentNewHref,
  buildClassTeachingHref,
  buildProjectNewHref,
} from "@/lib/curriculum/href";
import NeuralVoiceReader from "@/components/ai/NeuralVoiceReader";
import StudyAssistant from "@/components/ai/StudyAssistant";

type ResourceItem = {
  id: string;
  title: string;
  file_url: string;
  file_type?: string;
  content_type?: string;
  subject?: string;
};

function InAppViewer({
  item,
  onClose,
}: {
  item: ResourceItem;
  onClose: () => void;
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);

  const fileUrl = item.file_url;
  const fileType = item.file_type || item.content_type;

  // One shared answer — see src/lib/files/file-kind.ts. This was a second copy
  // of the library viewer's checks, wrong in the same two ways: MIME prefixes
  // against a stored extension, and substring matching on the URL.
  const kind = fileKind({ url: fileUrl, fileType, contentType: item.content_type });
  const isVideo = kind === "video";
  const isImage = kind === "image";
  const isPDF = kind === "pdf";
  const isPresentation = kind === "presentation";
  const isDocument = kind === "doc" || isPDF;

  const toggleFullscreen = () => setIsFullscreen(!isFullscreen);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isFullscreen) setIsFullscreen(false);
        else onClose();
      }
    },
    [isFullscreen, onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1200);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timer);
    };
  }, [handleKeyDown]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`fixed inset-0 z-[110] flex items-center justify-center ${
        isFullscreen ? "p-0" : "p-4 md:p-12"
      }`}
    >
      <div
        className="absolute inset-0 bg-slate-950/90 backdrop-blur-3xl"
        onClick={onClose}
      />

      <div
        className={`relative w-full h-full bg-slate-900 border border-white/10 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col ${
          isFullscreen ? "rounded-0" : "rounded-[40px]"
        }`}
      >
        <div className="shrink-0 h-20 bg-slate-900/50 backdrop-blur-xl border-b border-white/10 px-8 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors text-white"
            >
              <ChevronRightIcon className="w-6 h-6 rotate-180" />
            </button>
            <div>
              <h3 className="font-black text-foreground tracking-tight text-lg">
                {item.title}
              </h3>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">
                  {item.content_type || "Resource"} •{" "}
                  {item.subject || "Academic Asset"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-white/5 border border-white/10 rounded-2xl p-1">
              <button
                onClick={toggleFullscreen}
                className="p-2.5 text-white hover:bg-white/10 rounded-xl transition-all"
                title="Toggle Fullscreen"
              >
                <ArrowsPointingOutIcon className="w-5 h-5" />
              </button>
              {fileUrl && (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 text-white hover:bg-white/10 rounded-xl transition-all"
                  title="Download"
                >
                  <ArrowDownTrayIcon className="w-5 h-5" />
                </a>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-foreground ml-2 transition-all"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 relative bg-slate-950 overflow-hidden">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-20">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(234,88,12,0.5)]" />
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">
                  Loading Neural Stream...
                </p>
              </div>
            </div>
          )}

          <div className="w-full h-full overflow-auto flex items-center justify-center p-8 custom-scrollbar">
            {isVideo && fileUrl ? (
              <div className="w-full max-w-6xl aspect-video rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-black">
                <VideoPlayer url={fileUrl} title={item.title} cinemaMode />
              </div>
            ) : isPresentation && fileUrl ? (
              <div className="text-center space-y-6 max-w-md mx-auto bg-slate-900/50 p-10 border border-white/5 rounded-[32px] backdrop-blur-xl shadow-2xl">
                <div className="w-24 h-24 rounded-[32px] bg-primary/10 border border-primary/25 flex items-center justify-center mx-auto shadow-inner">
                  <PresentationChartBarIcon className="w-10 h-10 text-primary" />
                </div>
                <div>
                  <h4 className="text-2xl font-black text-foreground tracking-tight">
                    PowerPoint Presentation
                  </h4>
                  <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                    PowerPoint files (
                    <code className="text-primary font-bold">.pptx</code> /{" "}
                    <code className="text-primary font-bold">.ppt</code>) cannot
                    be previewed directly in the browser.
                  </p>
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                    You can download this presentation to view it locally, or
                    convert it to PDF and upload it as a view-only slide deck.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <a
                    href={fileUrl}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-3 px-10 py-4 bg-primary text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-3xl shadow-[0_20px_40px_rgba(234,88,12,0.3)] hover:-translate-y-1 transition-all"
                  >
                    <ArrowDownTrayIcon className="w-4 h-4" /> Download
                    Presentation
                  </a>
                </div>
              </div>
            ) : isImage && fileUrl ? (
              <motion.img
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                src={fileUrl}
                alt={item.title}
                className="max-w-full max-h-full object-contain shadow-2xl rounded-2xl"
                onLoad={() => setLoading(false)}
              />
            ) : isPDF && fileUrl ? (
              <div className="w-full h-full max-w-6xl bg-white rounded-2xl shadow-2xl overflow-hidden">
                <iframe
                  src={`${fileUrl}#toolbar=0&navpanes=0`}
                  className="w-full h-full border-0"
                  onLoad={() => setLoading(false)}
                  title={item.title}
                />
              </div>
            ) : isDocument && fileUrl ? (
              <div className="w-full h-full max-w-6xl bg-white rounded-2xl shadow-2xl overflow-hidden">
                <iframe
                  src={fileUrl}
                  className="w-full h-full border-0"
                  onLoad={() => setLoading(false)}
                  title={item.title}
                />
              </div>
            ) : (
              <div className="text-center space-y-6">
                <div className="w-24 h-24 rounded-[32px] bg-white/5 flex items-center justify-center mx-auto border border-white/10">
                  <DocumentIcon className="w-10 h-10 text-muted-foreground" />
                </div>
                <div>
                  <h4 className="text-2xl font-black text-foreground tracking-tight">
                    Format Unsupported
                  </h4>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                    This asset requires external processing or download for full
                    resolution.
                  </p>
                </div>
                {fileUrl && (
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-4 px-10 py-4 bg-primary text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-3xl shadow-[0_20px_40px_rgba(234,88,12,0.3)] hover:-translate-y-1 transition-all"
                  >
                    <ArrowDownTrayIcon className="w-4 h-4" /> Download
                    Intelligence
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

const CodeVisualizer = dynamic(
  () => import("@/components/visualizer/CodeVisualizer"),
  { ssr: false }
) as any;
const BlocklyEditor = dynamic(
  () => import("@/components/studio/BlocklyEditor"),
  { ssr: false }
) as any;
const Lottie = dynamic(() => import("lottie-react"), { ssr: false }) as any;

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

function VisualizerBlock({ block }: { block: any }) {
  const [step, setStep] = useState(0);
  const codeData = {
    step,
    totalSteps: block.visualData?.totalSteps ?? 10,
    variables: block.visualData?.variables ?? {},
    visualizationState: block.visualData?.visualizationState ?? {},
    currentLine: block.visualData?.currentLine,
  };
  return (
    <div className="my-10 space-y-3">
      {(block.title || block.concept) && (
        <div className="flex items-center gap-3 px-1">
          <div className="w-1 h-4 bg-cyan-500 rounded-full" />
          <p className="text-[10px] font-black text-cyan-600/70 dark:text-cyan-400/70 uppercase tracking-widest">
            {block.title || block.concept}
          </p>
        </div>
      )}
      <div className="bg-card border border-border overflow-hidden">
        <CodeVisualizer
          visualizationType={block.visualType || "sorting"}
          codeData={codeData}
          onStepChange={setStep}
        />
      </div>
    </div>
  );
}
const ReactPlayer = dynamic(() => import("react-player"), {
  ssr: false,
}) as any;

// ── Scratch-style visual block renderer ─────────────────────────────────────
type ScratchBlockCategory =
  | "event"
  | "motion"
  | "looks"
  | "sound"
  | "control"
  | "sensing"
  | "operator"
  | "variable"
  | "custom";

function categorizeScratchBlock(text: string): ScratchBlockCategory {
  const t = text.toLowerCase();
  if (/when|broadcast|receive|clicked|pressed|start|flag/.test(t))
    return "event";
  if (
    /move|turn|go to|glide|point|set x|set y|bounce|position|direction/.test(t)
  )
    return "motion";
  if (
    /say|think|show|hide|switch costume|next costume|size|effect|looks|graphic/.test(
      t
    )
  )
    return "looks";
  if (/play sound|stop sound|volume|note|instrument|rest/.test(t))
    return "sound";
  if (/forever|repeat|if|else|wait|stop|create clone|run without/.test(t))
    return "control";
  if (
    /touching|key|mouse|ask|answer|distance|timer|current|loud|video|webcam/.test(
      t
    )
  )
    return "sensing";
  if (
    /\+|\-|\*|\/|=|>|<|and|or|not|random|round|abs|floor|ceiling|sqrt|mod|join|letter|length|contains/.test(
      t
    )
  )
    return "operator";
  if (
    /set|change|show variable|hide variable|add to list|delete|insert|replace|item/.test(
      t
    )
  )
    return "variable";
  return "custom";
}

const SCRATCH_COLORS: Record<
  ScratchBlockCategory,
  { bg: string; border: string; text: string }
> = {
  event: { bg: "#FFD500", border: "#CC9900", text: "#1a1a00" },
  motion: { bg: "#4C97FF", border: "#2E6CC4", text: "#fff" },
  looks: { bg: "#9966FF", border: "#6633CC", text: "#fff" },
  sound: { bg: "#CF63CF", border: "#8E3A8E", text: "#fff" },
  control: { bg: "#FFAB19", border: "#CC7A00", text: "#fff" },
  sensing: { bg: "#5CB1D6", border: "#2E7EA6", text: "#fff" },
  operator: { bg: "#59C059", border: "#2E8E2E", text: "#fff" },
  variable: { bg: "#FF8C1A", border: "#CC5500", text: "#fff" },
  custom: { bg: "#FF6680", border: "#CC2244", text: "#fff" },
};

const SCRATCH_ICONS: Record<ScratchBlockCategory, string> = {
  event: "🚩",
  motion: "🔵",
  looks: "💬",
  sound: "🔊",
  control: "🔄",
  sensing: "❓",
  operator: "➕",
  variable: "📦",
  custom: "⚙️",
};

function isHatBlock(text: string): boolean {
  const t = text.toLowerCase();
  return /^when|^on (flag|key|click|start)|^broadcast received/.test(t);
}

function isCBlock(text: string): boolean {
  const t = text.toLowerCase();
  return /^(forever|repeat|if\b|else\b)/.test(t);
}

function isBooleanBlock(text: string): boolean {
  const t = text.toLowerCase().trim();
  return t.endsWith("?") || /\b(and|or|not)\b/.test(t) || /[=><]/.test(t);
}

function isReporterBlock(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (
    /^(x position|y position|direction|costume (number|name)|backdrop (number|name)|size|volume|username|answer|mouse (x|y)|timer|loudness|current (year|month|date|day of week|hour|minute|second)|days since 2000)$/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /^[a-zA-Z0-9_-]+$/i.test(t) &&
    !/^(move|say|think|show|hide|wait|forever|repeat|stop|end)$/i.test(t)
  ) {
    return true;
  }
  return false;
}

function isCapBlock(text: string): boolean {
  const t = text.toLowerCase().trim();
  return /^(stop all|stop this script|stop other scripts in sprite|delete this clone)/i.test(
    t
  );
}

interface ScratchBlockNode {
  text: string;
  category: ScratchBlockCategory;
  children: ScratchBlockNode[];
}

function parseScratchBlocks(flatBlocks: string[]): ScratchBlockNode[] {
  const root: ScratchBlockNode[] = [];
  const stack: { node: ScratchBlockNode; indent: number }[] = [];

  flatBlocks.forEach((line) => {
    const indent = line.match(/^\s*/)?.[0].length || 0;
    const cleanText = line.trim();
    if (!cleanText) return;

    if (cleanText.toLowerCase() === "end") return;

    const cat = categorizeScratchBlock(cleanText);
    const node: ScratchBlockNode = {
      text: cleanText,
      category: cat,
      children: [],
    };

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    if (stack.length > 0) {
      stack[stack.length - 1].node.children.push(node);
    } else {
      root.push(node);
    }

    if (isCBlock(cleanText)) {
      stack.push({ node, indent: indent + 1 });
    }
  });

  return root;
}

function ScratchBlockPiece({
  node,
  index,
  total,
  isFirst = false,
  isLast = false,
}: {
  node: ScratchBlockNode;
  index: number;
  total: number;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const colors = SCRATCH_COLORS[node.category];
  const hat = isHatBlock(node.text);
  const isLoop = node.children.length > 0;
  const isCap = isCapBlock(node.text);
  const isBool = isBooleanBlock(node.text);
  const isReporter = isReporterBlock(node.text);

  const hasTopSlot = !hat && !isBool && !isReporter && !isFirst;
  const hasBottomTab = !isLoop && !isLast && !isCap && !isBool && !isReporter;

  return (
    <div
      className="flex flex-col items-start select-none"
      style={{
        position: "relative",
        width: "100%",
        marginBottom: isLast ? 0 : -1,
      }}
    >
      {/* Top notch connector indent cutout (Puzzle slot) — skip on event hats, booleans, reporters */}
      {hasTopSlot && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 16,
            width: 14,
            height: 4,
            backgroundColor: "#0d0d1a",
            borderRadius: "0 0 3px 3px",
            zIndex: 20,
          }}
        />
      )}

      {/* Main Block Bar */}
      <div
        style={{
          backgroundColor: colors.bg,
          border: `1.5px solid ${colors.border}`,
          borderRadius: isReporter
            ? "9999px"
            : hat
            ? "20px 20px 4px 4px"
            : isLoop
            ? "4px 4px 0px 4px"
            : "4px",
          clipPath: isBool
            ? "polygon(8px 0%, calc(100% - 8px) 0%, 100% 50%, calc(100% - 8px) 100%, 8px 100%, 0% 50%)"
            : "none",
          paddingTop: hat ? "9px" : "5px",
          paddingBottom: hat ? "9px" : "7px",
          paddingLeft: isBool ? "16px" : isReporter ? "14px" : "12px",
          paddingRight: isBool ? "16px" : isReporter ? "14px" : "16px",
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          minWidth: "150px",
          boxShadow: `inset 0 1.5px 0 rgba(255,255,255,0.35), 0 2px 0 ${colors.border}`,
          position: "relative",
          zIndex: 10 + index,
        }}
      >
        <span style={{ fontSize: "11px", flexShrink: 0 }}>
          {SCRATCH_ICONS[node.category]}
        </span>
        <span
          style={{
            color: colors.text,
            fontSize: "11px",
            fontWeight: 900,
            fontFamily: "monospace",
            letterSpacing: "0.01em",
            textShadow:
              node.category === "event" ? "none" : "0 1px 1px rgba(0,0,0,0.15)",
          }}
        >
          {node.text}
        </span>

        {/* Tab at bottom of the main block (puzzle connector) — skip on C-mouth, caps, booleans, reporters */}
        {hasBottomTab && (
          <div
            style={{
              position: "absolute",
              bottom: -4,
              left: 16,
              width: 14,
              height: 4,
              backgroundColor: colors.bg,
              border: `1.5px solid ${colors.border}`,
              borderTop: "none",
              borderRadius: "0 0 3px 3px",
              zIndex: 30,
            }}
          />
        )}
      </div>

      {/* If this is a loop, render its indented mouth and nested blocks recursively */}
      {isLoop && (
        <div className="flex flex-col items-start w-full">
          {/* C-Mouth nested container wrapper */}
          <div className="flex w-full" style={{ position: "relative" }}>
            {/* The vertical connector spine on the left */}
            <div
              style={{
                width: "14px",
                backgroundColor: colors.bg,
                borderLeft: `1.5px solid ${colors.border}`,
                borderRight: `1.5px solid ${colors.border}`,
                flexShrink: 0,
                boxShadow: `inset 1px 0 0 rgba(255,255,255,0.2)`,
                zIndex: 5,
              }}
            />

            {/* Indented mouth children */}
            <div className="flex-1 py-1 pl-3 flex flex-col gap-0 items-start overflow-hidden">
              {node.children.map((child, idx) => (
                <ScratchBlockPiece
                  key={idx}
                  node={child}
                  index={idx}
                  total={node.children.length}
                  isFirst={idx === 0}
                  isLast={idx === node.children.length - 1}
                />
              ))}
            </div>
          </div>

          {/* Loop C-Bottom closing cap */}
          <div
            style={{
              height: "14px",
              width: "120px",
              backgroundColor: colors.bg,
              border: `1.5px solid ${colors.border}`,
              borderRadius: "0px 4px 4px 4px",
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.3), 0 2px 0 ${colors.border}`,
              position: "relative",
              zIndex: 10 + index + 1,
              marginTop: -1,
            }}
          >
            {/* Bottom notch cutout in loop cap */}
            {!isLast && (
              <div
                style={{
                  position: "absolute",
                  bottom: -4,
                  left: 16,
                  width: 14,
                  height: 4,
                  backgroundColor: colors.bg,
                  border: `1.5px solid ${colors.border}`,
                  borderTop: "none",
                  borderRadius: "0 0 3px 3px",
                  zIndex: 30,
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ScratchBlockRenderer({
  blocks,
  instructions,
}: {
  blocks: string[];
  instructions?: string;
}) {
  const [copied, setCopied] = useState(false);

  const blockList = blocks?.length
    ? blocks
    : [
        "when flag clicked",
        'say "Hello! Ready to code?" for 2 seconds',
        "move 10 steps",
        "wait 1 seconds",
        'say "Great job!" for 2 seconds',
      ];

  const parsedTree = useMemo(() => parseScratchBlocks(blockList), [blockList]);

  const copyAll = () => {
    navigator.clipboard.writeText(blockList.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Scratch workspace */}
      <div
        style={{
          background:
            "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)",
          border: "2px solid rgba(255,213,0,0.2)",
          borderRadius: 8,
          padding: "24px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Scratch logo watermark */}
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 12,
            opacity: 0.12,
            fontSize: 11,
            fontWeight: 900,
            color: "#FFD500",
            letterSpacing: "0.1em",
          }}
        >
          SCRATCH BLOCKS
        </div>

        {/* Grid dots background */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            gap: 0,
            alignItems: "start",
          }}
        >
          {parsedTree.map((node, i) => (
            <ScratchBlockPiece
              key={i}
              node={node}
              index={i}
              total={parsedTree.length}
              isFirst={i === 0}
              isLast={i === parsedTree.length - 1}
            />
          ))}
        </div>
      </div>

      {/* Legend + copy */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-wrap gap-2">
          {(
            Object.entries(SCRATCH_COLORS) as [
              ScratchBlockCategory,
              (typeof SCRATCH_COLORS)[ScratchBlockCategory]
            ][]
          )
            .filter(([cat]) =>
              blockList.some((b) => categorizeScratchBlock(b) === cat)
            )
            .map(([cat, col]) => (
              <span
                key={cat}
                style={{
                  backgroundColor: col.bg,
                  color: col.text,
                  border: `1px solid ${col.border}`,
                }}
                className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded"
              >
                {SCRATCH_ICONS[cat]} {cat}
              </span>
            ))}
        </div>
        <button
          onClick={copyAll}
          className="text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          {copied ? "✓ Copied!" : "⧉ Copy blocks"}
        </button>
      </div>

      {/* Instructions */}
      {instructions && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-4">
          <p className="text-[10px] font-black text-yellow-600 dark:text-yellow-400 uppercase tracking-widest mb-2 flex items-center gap-2">
            🚩 Step-by-Step Guide
          </p>
          <p className="text-sm text-foreground/70 leading-relaxed whitespace-pre-line">
            {instructions}
          </p>
        </div>
      )}
    </div>
  );
}

const TYPE_COLOR: Record<string, string> = {
  video: "bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30",
  "hands-on": "bg-primary/20 text-primary border-primary/30",
  hands_on: "bg-primary/20 text-primary border-primary/30",
  interactive:
    "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30",
  workshop: "bg-primary/20 text-primary border-primary/30",
  coding:
    "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  reading:
    "bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
  quiz: "bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30",
  article: "bg-slate-500/20 text-muted-foreground/70 border-slate-500/30",
  project:
    "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  live: "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30",
};

// --- Sub-components ---

function MermaidRenderer({ code }: { code: string }) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const chartId = useMemo(
    () => `mermaid-${Math.random().toString(36).slice(2, 9)}`,
    []
  );

  // Parse lines to build a robust structured card sequence in case Mermaid fails to load/render
  const fallbackData = useMemo(() => {
    if (!error) return null;
    const nodesMap: Record<string, string> = {};
    const connections: { from: string; to: string; label?: string }[] = [];
    const lines = code.split("\n");

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (
        !trimmed ||
        trimmed.startsWith("flowchart") ||
        trimmed.startsWith("graph") ||
        trimmed.startsWith("mindmap")
      )
        return;

      // Capture node definitions: e.g. A["Label"] or A[Label]
      const nodeMatch = trimmed.match(
        /^([a-zA-Z0-9_-]+)\s*(?:\["([^"]+)"\]|\[([^\]]+)\]|\("([^"]+)"\)|\(([^)]+)\)|\(\("([^"]+)"\)\)|\(\(([^)]+)\)\)|\{\{"([^"]+)"\}\}|\{\{([^}]+)\}\}|\{"([^"]+)"\}|\{([^}]+)\})/
      );
      if (nodeMatch) {
        const id = nodeMatch[1];
        const label =
          nodeMatch[2] ||
          nodeMatch[3] ||
          nodeMatch[4] ||
          nodeMatch[5] ||
          nodeMatch[6] ||
          nodeMatch[7] ||
          nodeMatch[8] ||
          nodeMatch[9] ||
          nodeMatch[10] ||
          nodeMatch[11];
        if (id && label) {
          nodesMap[id] = label.replace(/<[^>]*>/g, "").trim();
        }
      }

      // Capture connection structures: A --> B or A -->|label| B
      const connMatch = trimmed.match(
        /([a-zA-Z0-9_-]+)\s*(-->|---)(?:\s*\|([^|]+)\|)?\s*([a-zA-Z0-9_-]+)/
      );
      if (connMatch) {
        const fromId = connMatch[1];
        const linkLabel = connMatch[3];
        const toId = connMatch[4];
        connections.push({ from: fromId, to: toId, label: linkLabel });

        // Grab inline node labels if defined, e.g. A["Start"] --> B["End"]
        const inlineMatches = trimmed.matchAll(
          /([a-zA-Z0-9_-]+)\s*(?:\["([^"]+)"\]|\[([^\]]+)\]|\("([^"]+)"\)|\(([^)]+)\))/g
        );
        for (const match of inlineMatches) {
          const id = match[1];
          const label = match[2] || match[3] || match[4] || match[5];
          if (id && label) {
            nodesMap[id] = label.replace(/<[^>]*>/g, "").trim();
          }
        }
      }
    });

    connections.forEach((conn) => {
      if (!nodesMap[conn.from]) nodesMap[conn.from] = conn.from;
      if (!nodesMap[conn.to]) nodesMap[conn.to] = conn.to;
    });

    return { nodes: nodesMap, connections };
  }, [code, error]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const renderDiagram = async () => {
      const mermaid = (window as any).mermaid;
      if (!mermaid) return;

      // Guarantee initialization before rendering
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        themeVariables: {
          background: "#0d0d1a",
          mainBkg: "#1a1a2e",
          nodeBorder: "#4f46e5",
          clusterBkg: "#16213e",
          titleColor: "#e2e8f0",
          edgeLabelBackground: "#1a1a2e",
          primaryColor: "#312e81",
          primaryTextColor: "#e2e8f0",
          primaryBorderColor: "#4f46e5",
          lineColor: "#6366f1",
          secondaryColor: "#164e63",
          tertiaryColor: "#1e293b",
          fontFamily: "Inter, sans-serif",
          fontSize: "13px",
        },
        securityLevel: "loose",
        flowchart: { htmlLabels: true, useMaxWidth: true, curve: "basis" },
      });

      try {
        let processedCode = code.trim();

        // Strip markdown fences
        const fenceMatch = processedCode.match(/```(?:mermaid)?([\s\S]*?)```/);
        if (fenceMatch) processedCode = fenceMatch[1].trim();
        processedCode = processedCode
          .replace(/^```mermaid\s*\n?/i, "")
          .replace(/^```\s*\n?/i, "")
          .replace(/\n?```$/i, "")
          .trim();

        // Decode HTML entities
        processedCode = processedCode
          .replace(/&quot;/g, '"')
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&")
          .replace(/&#39;/g, "'");

        // Normalise graph → flowchart
        if (/^graph\s+/i.test(processedCode))
          processedCode = processedCode.replace(/^graph\s+/i, "flowchart ");

        const isFlowchart = /^flowchart/i.test(processedCode);

        if (isFlowchart) {
          // Auto-repair unquoted shape labels that contain parenthesis or colons that break Mermaid
          processedCode = processedCode.replace(
            /([a-zA-Z0-9_-]+)\s*\[([^"\]\n]+)\]/g,
            (m, id, text) => {
              if (text.startsWith('"') && text.endsWith('"')) return m;
              return `${id}["${text
                .replace(/"/g, "'")
                .replace(/<(?!br\s*\/?>)[^>]*>/gi, "")}"]`;
            }
          );
          processedCode = processedCode.replace(
            /([a-zA-Z0-9_-]+)\s*\(([^"\)\n]+)\)/g,
            (m, id, text) => {
              if (text.startsWith('"') && text.endsWith('"')) return m;
              return `${id}("${text
                .replace(/"/g, "'")
                .replace(/<(?!br\s*\/?>)[^>]*>/gi, "")}")`;
            }
          );
          processedCode = processedCode.replace(
            /([a-zA-Z0-9_-]+)\s*\{\{([^"\}\n]+)\}\}/g,
            (m, id, text) => {
              if (text.startsWith('"') && text.endsWith('"')) return m;
              return `${id}{{"${text
                .replace(/"/g, "'")
                .replace(/<(?!br\s*\/?>)[^>]*>/gi, "")}"}}`;
            }
          );
          processedCode = processedCode.replace(
            /([a-zA-Z0-9_-]+)\s*\{([^"\}\n]+)\}/g,
            (m, id, text) => {
              if (text.startsWith('"') && text.endsWith('"')) return m;
              return `${id}{"${text
                .replace(/"/g, "'")
                .replace(/<(?!br\s*\/?>)[^>]*>/gi, "")}"}`;
            }
          );
        }

        // Strip HTML tags like <style> which break Mermaid v10 parsing (keep <br> tags)
        processedCode = processedCode.replace(/<(?!br\s*\/?>)[^>]*>/gi, "");

        // Strip unsupported node shapes AI likes to invent
        processedCode = processedCode.replace(/\{\{\{([^}]+)\}\}\}/g, "[$1]");
        processedCode = processedCode.replace(/\{\{([^}]+)\}\}/g, "([$1])");

        // Remove comments
        processedCode = processedCode
          .split("\n")
          .map((line) => {
            return line.replace(/\/\/.*$/, "").replace(/#.*$/, (m, offset) => {
              const before = line.slice(0, offset);
              const quoteCount = (before.match(/"/g) || []).length;
              return quoteCount % 2 === 0 ? "" : m;
            });
          })
          .join("\n")
          .trim();

        // Validate diagram type
        const VALID_START =
          /^(flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|journey|quadrantChart|mindmap|timeline|xychart|block)/i;
        if (!VALID_START.test(processedCode)) {
          if (/-->|---/.test(processedCode)) {
            processedCode = `flowchart TD\n${processedCode}`;
          } else {
            throw new Error("Unrecognised diagram type");
          }
        }

        const { svg } = await mermaid.render(chartId, processedCode);
        setSvg(svg);
        setError(null);
      } catch (e: any) {
        console.error("Mermaid Render Error:", e);
        const msg =
          typeof e === "string"
            ? e
            : e.message || e.str || "Diagram syntax error";
        setError(msg);
      }
    };

    // Poll until mermaid is available (script may still be loading)
    let attempts = 0;
    const tryRender = () => {
      if ((window as any).mermaid) {
        renderDiagram();
      } else if (attempts < 20) {
        attempts++;
        setTimeout(tryRender, 300);
      }
    };
    const timer = setTimeout(tryRender, 100);
    return () => clearTimeout(timer);
  }, [code, chartId]);

  if (error) {
    if (fallbackData && Object.keys(fallbackData.nodes).length > 0) {
      return (
        <div className="my-12 space-y-4">
          <div className="flex items-center gap-3 px-6 justify-between">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
              <p className="text-[10px] font-black text-cyan-600/60 dark:text-cyan-400/60 uppercase tracking-[0.3em]">
                Learning Path Flowchart (Concept View)
              </p>
            </div>
            <span className="text-[8px] font-black bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 px-2 py-0.5 rounded-full uppercase tracking-wider">
              Engine Fallback Mode
            </span>
          </div>
          <div className="bg-card p-6 sm:p-8 rounded-xl border border-border relative overflow-x-auto shadow-2xl flex flex-wrap items-center justify-center gap-3 py-6 min-h-[100px]">
            {fallbackData.connections.length > 0
              ? fallbackData.connections.map((conn, idx) => (
                  <Fragment key={idx}>
                    {idx > 0 && (
                      <div className="flex flex-col items-center justify-center text-cyan-600/40 dark:text-cyan-400/40 font-bold px-1 select-none animate-pulse shrink-0">
                        <span>→</span>
                      </div>
                    )}
                    <div className="px-5 py-3.5 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col items-center justify-center shadow-lg hover:border-cyan-500/40 hover:shadow-[0_0_15px_rgba(6,182,212,0.15)] transition-all duration-500 shrink-0 min-w-[120px]">
                      <span className="text-[8px] font-black text-cyan-600/60 dark:text-cyan-400/60 uppercase tracking-widest mb-1.5">
                        Step {conn.from}
                      </span>
                      <span className="text-xs font-black text-foreground text-center leading-tight">
                        {fallbackData.nodes[conn.from]}
                      </span>
                      {conn.label && (
                        <span className="text-[8px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded mt-2 uppercase tracking-wider">
                          {conn.label}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col items-center justify-center text-cyan-600/60 dark:text-cyan-400/60 font-black px-1 select-none animate-pulse shrink-0">
                      <span>→</span>
                    </div>
                    <div className="px-5 py-3.5 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col items-center justify-center shadow-lg hover:border-cyan-500/40 hover:shadow-[0_0_15px_rgba(6,182,212,0.15)] transition-all duration-500 shrink-0 min-w-[120px]">
                      <span className="text-[8px] font-black text-cyan-600/60 dark:text-cyan-400/60 uppercase tracking-widest mb-1.5">
                        Step {conn.to}
                      </span>
                      <span className="text-xs font-black text-foreground text-center leading-tight">
                        {fallbackData.nodes[conn.to]}
                      </span>
                    </div>
                  </Fragment>
                ))
              : Object.entries(fallbackData.nodes).map(([id, label]) => (
                  <div
                    key={id}
                    className="px-5 py-3.5 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col items-center justify-center shadow-lg hover:border-cyan-500/40 hover:shadow-[0_0_15px_rgba(6,182,212,0.15)] transition-all duration-500 shrink-0 min-w-[120px]"
                  >
                    <span className="text-[8px] font-black text-cyan-600/60 dark:text-cyan-400/60 uppercase tracking-widest mb-1.5">
                      {id}
                    </span>
                    <span className="text-xs font-black text-foreground text-center leading-tight">
                      {label}
                    </span>
                  </div>
                ))}
          </div>
        </div>
      );
    }

    return (
      <div className="my-12 p-8 sm:p-12 bg-rose-500/5 border-2 border-rose-500/10 rounded-xl sm:rounded-xl text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400">
            <ExclamationTriangleIcon className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black text-rose-600/60 dark:text-rose-400/60 uppercase tracking-widest">
              Oops! A Tiny Snag
            </p>
            <p className="text-sm font-bold text-muted-foreground">
              The visual map is taking a quick nap. Refresh to wake it up!
            </p>
          </div>
          <pre className="mt-4 w-full p-6 bg-card/80 rounded-xl text-[10px] font-mono text-muted-foreground text-left overflow-x-auto border border-border italic text-rose-700/80 dark:text-rose-300/80">
            {code}
          </pre>
          <p className="text-[10px] text-rose-600/40 dark:text-rose-400/40 font-black uppercase tracking-widest">
            Double check the blocks or hit refresh to see the path!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="my-12 space-y-4">
      <div className="flex items-center gap-3 px-6">
        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
        <p className="text-[10px] font-black text-indigo-600/60 dark:text-indigo-400/60 uppercase tracking-[0.3em]">
          Our Learning Adventure Map
        </p>
      </div>
      <div
        className="bg-card p-8 sm:p-12 rounded-xl flex justify-center overflow-x-auto shadow-2xl border-4 border-border relative group min-h-[100px] [&_svg]:max-w-full [&_.label]:!text-foreground/80 [&_text]:!fill-current"
        style={{ colorScheme: "dark" }}
      >
        <div className="absolute inset-0 bg-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        {svg ? (
          <div
            className="w-full h-full flex justify-center"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
              Synthesizing Diagram...
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function MathRenderer({ formula }: { formula: string }) {
  const [html, setHtml] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).katex) {
      try {
        const rendered = (window as any).katex.renderToString(formula, {
          throwOnError: false,
          displayMode: true,
        });
        setHtml(rendered);
      } catch (e) {
        setHtml(
          `<span class="text-rose-600 dark:text-rose-400">Error: ${formula}</span>`
        );
      }
    } else {
      setHtml(
        `<span class="font-serif italic text-muted-foreground">${formula}</span>`
      );
    }
  }, [formula]);

  return (
    <div className="my-12 p-10 sm:p-20 bg-indigo-500/5 border-2 border-indigo-500/10 rounded-xl sm:rounded-xl relative overflow-hidden group shadow-3xl text-center">
      <div className="absolute -left-10 -top-10 w-48 h-48 bg-indigo-500/10 blur-3xl rounded-full group-hover:scale-125 transition-transform" />
      <p className="text-[10px] font-black text-indigo-600/60 dark:text-indigo-400/60 uppercase tracking-[0.4em] mb-10 relative z-10">
        Mathematical Synthesis
      </p>
      <div
        className="math-container text-2xl sm:text-5xl text-foreground relative z-10 overflow-x-auto py-4"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function MonacoEditorBlock({
  code,
  language,
}: {
  code: string;
  language?: string;
}) {
  return (
    <IntegratedCodeRunner
      initialCode={code}
      language={(language?.toLowerCase() as any) || "javascript"}
      title={`${language || "Code"} Workspace`}
      height={320}
    />
  );
}

function D3ChartRenderer({
  type,
  dataset,
  labels,
}: {
  type: string;
  dataset: any[];
  labels?: string[];
}) {
  const CHART_COLORS = [
    "#06b6d4",
    "#8b5cf6",
    "#f97316",
    "#10b981",
    "#ef4444",
    "#f59e0b",
    "#3b82f6",
    "#ec4899",
  ];

  const containerRef = (node: SVGSVGElement) => {
    if (!node || !dataset.length) return;
    d3.select(node).selectAll("*").remove();

    const margin = {
      top: 20,
      right: 20,
      bottom: labels?.length ? 50 : 30,
      left: 40,
    };
    const totalW = 620;
    const totalH = 320;
    const width = totalW - margin.left - margin.right;
    const height = totalH - margin.top - margin.bottom;

    const svg = d3
      .select(node)
      .attr("viewBox", `0 0 ${totalW} ${totalH}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    // Defs for gradient
    const defs = svg.append("defs");
    dataset.forEach((_, i) => {
      const grad = defs
        .append("linearGradient")
        .attr("id", `bar-grad-${i}`)
        .attr("x1", "0")
        .attr("y1", "0")
        .attr("x2", "0")
        .attr("y2", "1");
      const c = CHART_COLORS[i % CHART_COLORS.length];
      grad
        .append("stop")
        .attr("offset", "0%")
        .attr("stop-color", c)
        .attr("stop-opacity", 0.9);
      grad
        .append("stop")
        .attr("offset", "100%")
        .attr("stop-color", c)
        .attr("stop-opacity", 0.3);
    });

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Grid lines
    const maxVal = (d3.max(dataset as number[]) || 100) * 1.1;

    if (type === "bar") {
      const domainLabels =
        labels && labels.length === dataset.length
          ? labels
          : dataset.map((_, i) => `${i + 1}`);
      const x = d3
        .scaleBand()
        .domain(domainLabels)
        .range([0, width])
        .padding(0.25);
      const y = d3.scaleLinear().domain([0, maxVal]).range([height, 0]);

      // Horizontal grid
      g.append("g")
        .attr("class", "grid")
        .selectAll("line")
        .data(y.ticks(5))
        .enter()
        .append("line")
        .attr("x1", 0)
        .attr("x2", width)
        .attr("y1", (d) => y(d))
        .attr("y2", (d) => y(d))
        .attr("stroke", "rgba(255,255,255,0.05)")
        .attr("stroke-width", 1);

      // Bars
      g.selectAll("rect")
        .data(dataset)
        .enter()
        .append("rect")
        .attr("x", (_: any, i: number) => x(domainLabels[i])!)
        .attr("y", height)
        .attr("width", x.bandwidth())
        .attr("height", 0)
        .attr("fill", (_: any, i: number) => `url(#bar-grad-${i})`)
        .attr("rx", 2)
        .transition()
        .duration(700)
        .delay((_: any, i: number) => i * 60)
        .attr("y", (d: any) => y(d))
        .attr("height", (d: any) => height - y(d));

      // X axis labels
      g.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).tickSize(0))
        .select(".domain")
        .remove();
      g.selectAll(".tick text")
        .attr("fill", "rgba(255,255,255,0.35)")
        .attr("font-size", "9px")
        .attr("font-weight", "700")
        .attr("dy", "1.2em")
        .attr("text-anchor", "middle")
        .each(function (this: any) {
          const el = d3.select(this);
          const txt = el.text();
          if (txt.length > 10) {
            el.text(txt.slice(0, 9) + "…");
          }
        });
    } else if (type === "line" || type === "area") {
      const x = d3
        .scaleLinear()
        .domain([0, dataset.length - 1])
        .range([0, width]);
      const y = d3.scaleLinear().domain([0, maxVal]).range([height, 0]);
      const lineGen = d3
        .line<any>()
        .x((_: any, i: number) => x(i))
        .y((d: any) => y(d))
        .curve(d3.curveCatmullRom);

      if (type === "area") {
        const areaGen = d3
          .area<any>()
          .x((_: any, i: number) => x(i))
          .y0(height)
          .y1((d: any) => y(d))
          .curve(d3.curveCatmullRom);
        g.append("path")
          .datum(dataset)
          .attr("fill", "rgba(6,182,212,0.12)")
          .attr("d", areaGen);
      }
      const stroke = type === "area" ? "#06b6d4" : "#f97316";
      const path = g
        .append("path")
        .datum(dataset)
        .attr("fill", "none")
        .attr("stroke", stroke)
        .attr("stroke-width", 2.5)
        .attr("d", lineGen);
      const totalLen =
        (path.node() as SVGPathElement)?.getTotalLength?.() || 600;
      path
        .attr("stroke-dasharray", totalLen)
        .attr("stroke-dashoffset", totalLen)
        .transition()
        .duration(1000)
        .attr("stroke-dashoffset", 0);

      // Dots
      g.selectAll("circle")
        .data(dataset)
        .enter()
        .append("circle")
        .attr("cx", (_: any, i: number) => x(i))
        .attr("cy", (d: any) => y(d))
        .attr("r", 4)
        .attr("fill", stroke)
        .attr("opacity", 0)
        .transition()
        .duration(600)
        .delay((_: any, i: number) => i * 80)
        .attr("opacity", 1);

      // X axis labels
      if (labels?.length) {
        const xBand = d3.scaleBand().domain(labels).range([0, width]);
        g.append("g")
          .attr("transform", `translate(0,${height})`)
          .call(d3.axisBottom(xBand).tickSize(0))
          .select(".domain")
          .remove();
        g.selectAll(".tick text")
          .attr("fill", "rgba(255,255,255,0.35)")
          .attr("font-size", "9px")
          .attr("font-weight", "700")
          .attr("dy", "1.2em");
      }
    } else if (type === "pie") {
      const radius = Math.min(width, height) / 2;
      const pg = g
        .append("g")
        .attr("transform", `translate(${width / 2},${height / 2})`);
      const pie = d3
        .pie<any>()
        .value((d) => d)
        .sort(null);
      const arc = d3
        .arc<any>()
        .outerRadius(radius - 10)
        .innerRadius(radius * 0.4);
      const arcs = pg.selectAll(".arc").data(pie(dataset)).enter().append("g");
      arcs
        .append("path")
        .attr(
          "fill",
          (_: any, i: number) => CHART_COLORS[i % CHART_COLORS.length]
        )
        .attr("stroke", "rgba(0,0,0,0.3)")
        .attr("stroke-width", 1)
        .transition()
        .duration(800)
        .attrTween("d", function (this: any, d: any) {
          const i = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
          return (t: number) => arc(i(t)) ?? "";
        });
    }
  };

  return (
    <div className="p-5 bg-card border border-border rounded-xl overflow-hidden">
      <svg
        ref={containerRef}
        className="w-full h-auto"
        style={{ maxHeight: 340 }}
      />
    </div>
  );
}

const MOTION_COLORS = [
  {
    bg: "bg-cyan-500/20",
    border: "border-cyan-500/40",
    text: "text-cyan-600 dark:text-cyan-400",
    glow: "rgba(6,182,212,0.5)",
  },
  {
    bg: "bg-primary/20",
    border: "border-primary/40",
    text: "text-primary",
    glow: "rgba(139,92,246,0.5)",
  },
  {
    bg: "bg-emerald-500/20",
    border: "border-emerald-500/40",
    text: "text-emerald-600 dark:text-emerald-400",
    glow: "rgba(16,185,129,0.5)",
  },
  {
    bg: "bg-primary/20",
    border: "border-primary/40",
    text: "text-primary",
    glow: "rgba(249,115,22,0.5)",
  },
  {
    bg: "bg-rose-500/20",
    border: "border-rose-500/40",
    text: "text-rose-600 dark:text-rose-400",
    glow: "rgba(244,63,94,0.5)",
  },
  {
    bg: "bg-amber-500/20",
    border: "border-amber-500/40",
    text: "text-amber-600 dark:text-amber-400",
    glow: "rgba(245,158,11,0.5)",
  },
];

function MotionGraphicRenderer({
  type,
  config,
  title,
}: {
  type: string;
  config: any;
  title?: string;
}) {
  const labels: string[] = config?.labels || [];
  const nodeCount: number =
    config?.nodes || (labels.length > 0 ? labels.length : 5);
  const effectiveLabels =
    labels.length > 0
      ? labels
      : Array.from(
          { length: Math.min(nodeCount, 7) },
          (_, i) => `Step ${i + 1}`
        );

  return (
    <div
      className="my-10 relative rounded-xl border border-border bg-card overflow-hidden"
      style={{ minHeight: "340px" }}
    >
      {/* Layered gradient backdrops */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/50 via-transparent to-cyan-950/30 pointer-events-none" />
      <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-600/5 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-40 h-40 bg-cyan-600/5 blur-3xl rounded-full pointer-events-none" />

      {/* Scan line */}
      <motion.div
        animate={{ y: [0, 340, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
        className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-500/25 to-transparent pointer-events-none z-10"
      />

      {/* Header */}
      <div className="absolute top-4 left-5 z-10 flex flex-col gap-0.5">
        <p className="text-[8px] font-black text-indigo-600/50 dark:text-indigo-400/50 uppercase tracking-[0.5em]">
          Motion Illustration
        </p>
        {title && (
          <p className="text-[11px] font-black text-foreground/60 uppercase tracking-tight max-w-[260px] truncate">
            {title}
          </p>
        )}
      </div>
      <div className="absolute top-4 right-5 z-10">
        <span className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-[8px] font-black text-indigo-600/60 dark:text-indigo-400/60 uppercase tracking-widest">
          {type}
        </span>
      </div>

      <div className="flex items-center justify-center h-[340px] px-6 pt-10">
        {/* ── FLOW — horizontal pipeline with animated data dots ── */}
        {type === "flow" && (
          <div className="flex items-center w-full max-w-2xl overflow-x-auto pb-2 gap-0">
            {effectiveLabels.slice(0, 6).map((label, i) => {
              const col = MOTION_COLORS[i % MOTION_COLORS.length];
              const isLast = i === effectiveLabels.slice(0, 6).length - 1;
              return (
                <div
                  key={i}
                  className="flex items-center flex-shrink-0"
                  style={{ flex: isLast ? "0 0 auto" : "1 1 0" }}
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                      delay: i * 0.22,
                      type: "spring",
                      stiffness: 180,
                    }}
                    className="flex flex-col items-center gap-2 flex-shrink-0"
                  >
                    <motion.div
                      animate={{
                        boxShadow: [
                          `0 0 0px ${col.glow}`,
                          `0 0 18px ${col.glow}`,
                          `0 0 0px ${col.glow}`,
                        ],
                      }}
                      transition={{
                        duration: 2.5,
                        repeat: Infinity,
                        delay: i * 0.35,
                      }}
                      className={`w-14 h-14 ${col.bg} border ${col.border} flex items-center justify-center rounded-xl`}
                    >
                      <span className={`text-lg font-black ${col.text}`}>
                        {i + 1}
                      </span>
                    </motion.div>
                    <p
                      className={`text-[8px] font-black ${col.text} uppercase tracking-wider text-center max-w-[56px] leading-tight`}
                    >
                      {label}
                    </p>
                  </motion.div>
                  {!isLast && (
                    <div
                      className="relative flex-1 mx-2 flex items-center"
                      style={{ minWidth: 24, marginBottom: 16 }}
                    >
                      <div className="w-full h-px bg-white/10" />
                      <motion.div
                        animate={{ x: ["0%", "100%"] }}
                        transition={{
                          duration: 1.8,
                          repeat: Infinity,
                          ease: "linear",
                          delay: i * 0.3,
                        }}
                        className="absolute w-2 h-2 rounded-full bg-cyan-400/70 top-1/2 -translate-y-1/2"
                        style={{ left: 0 }}
                      />
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 border-t-[3px] border-b-[3px] border-l-[5px] border-t-transparent border-b-transparent border-l-white/20" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── NETWORK — center concept + orbiting nodes ── */}
        {type === "network" && (
          <div className="relative" style={{ width: 260, height: 260 }}>
            <svg
              className="absolute inset-0 w-full h-full"
              style={{ zIndex: 0 }}
            >
              {effectiveLabels.slice(1, 7).map((_, i, arr) => {
                const angle = (i / arr.length) * Math.PI * 2 - Math.PI / 2;
                return (
                  <motion.g
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.12 + 0.3, duration: 0.4 }}
                  >
                    <line
                      x1={130}
                      y1={130}
                      x2={130 + 102 * Math.cos(angle)}
                      y2={130 + 102 * Math.sin(angle)}
                      stroke="rgba(99,102,241,0.2)"
                      strokeWidth="1.5"
                      strokeDasharray="5 4"
                    />
                  </motion.g>
                );
              })}
            </svg>
            <motion.div
              animate={{ scale: [1, 1.07, 1] }}
              transition={{ duration: 3.5, repeat: Infinity }}
              className="absolute w-20 h-20 bg-primary/20 border-2 border-primary/50 flex items-center justify-center z-10 shadow-[0_0_28px_rgba(249,115,22,0.3)]"
              style={{
                left: "50%",
                top: "50%",
                transform: "translate(-50%,-50%)",
              }}
            >
              <p className="text-[8px] font-black text-primary uppercase text-center leading-tight px-1">
                {effectiveLabels[0] || "Core"}
              </p>
            </motion.div>
            {effectiveLabels.slice(1, 7).map((label, i, arr) => {
              const angle = (i / arr.length) * Math.PI * 2 - Math.PI / 2;
              const col = MOTION_COLORS[i % MOTION_COLORS.length];
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.15 + 0.5, type: "spring" }}
                  className={`absolute w-12 h-12 ${col.bg} border ${col.border} flex items-center justify-center z-10`}
                  style={{
                    left: 130 + 102 * Math.cos(angle),
                    top: 130 + 102 * Math.sin(angle),
                    transform: "translate(-50%,-50%)",
                  }}
                >
                  <p
                    className={`text-[7px] font-black ${col.text} text-center leading-tight px-0.5`}
                  >
                    {label}
                  </p>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* ── ORBIT — planetary rings with labels ── */}
        {type === "orbit" && (
          <div
            className="relative flex items-center justify-center"
            style={{ width: 280, height: 280 }}
          >
            {effectiveLabels
              .slice(1, Math.min(effectiveLabels.length, 5))
              .map((label, i) => {
                const r = (i + 1) * 50;
                const col = MOTION_COLORS[i % MOTION_COLORS.length];
                return (
                  <div key={i}>
                    <div
                      className={`absolute rounded-full border ${col.border} opacity-15`}
                      style={{
                        width: r * 2,
                        height: r * 2,
                        left: "50%",
                        top: "50%",
                        transform: "translate(-50%,-50%)",
                      }}
                    />
                    <motion.div
                      animate={{ rotate: i % 2 === 0 ? 360 : -360 }}
                      transition={{
                        duration: 6 + i * 3,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      className="absolute"
                      style={{
                        width: r * 2,
                        height: r * 2,
                        left: "50%",
                        top: "50%",
                        transform: "translate(-50%,-50%)",
                      }}
                    >
                      <motion.div
                        animate={{ rotate: i % 2 === 0 ? -360 : 360 }}
                        transition={{
                          duration: 6 + i * 3,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                        className={`absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 ${col.bg} border ${col.border} px-1.5 py-0.5 shadow-lg flex items-center justify-center min-w-[48px]`}
                      >
                        <p
                          className={`text-[7px] font-black ${col.text} text-center leading-tight`}
                        >
                          {label}
                        </p>
                      </motion.div>
                    </motion.div>
                  </div>
                );
              })}
            <motion.div
              animate={{ scale: [1, 1.12, 1] }}
              transition={{
                duration: 3.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute w-16 h-16 bg-primary/25 border-2 border-primary/50 flex items-center justify-center shadow-[0_0_25px_rgba(249,115,22,0.4)] z-10 text-center px-1"
            >
              <p className="text-[8px] font-black text-primary leading-tight">
                {effectiveLabels[0] || "Core"}
              </p>
            </motion.div>
          </div>
        )}

        {/* ── PARTICLES — multi-color concept burst ── */}
        {type === "particles" && (
          <div className="relative w-full h-52">
            {[...Array(28)].map((_, i) => {
              const col = MOTION_COLORS[i % MOTION_COLORS.length];
              return (
                <motion.div
                  key={i}
                  className={`absolute w-1.5 h-1.5 rounded-full ${col.bg} border ${col.border}`}
                  animate={{
                    x: [Math.random() * 500 - 250, Math.random() * 500 - 250],
                    y: [Math.random() * 160 - 80, Math.random() * 160 - 80],
                    opacity: [0, 0.9, 0],
                    scale: [0, 1.5, 0],
                  }}
                  transition={{
                    duration: Math.random() * 4 + 2.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: Math.random() * 3,
                  }}
                  style={{ left: "50%", top: "50%" }}
                />
              );
            })}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <motion.p
                animate={{ opacity: [0.05, 0.15, 0.05] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="text-5xl font-black text-foreground/10 uppercase tracking-[0.3em] select-none"
              >
                LIVE
              </motion.p>
            </div>
          </div>
        )}

        {/* ── WAVE — multi-color frequency bars ── */}
        {type === "wave" && (
          <div className="flex gap-1 items-end h-40">
            {[...Array(20)].map((_, i) => {
              const col = MOTION_COLORS[i % MOTION_COLORS.length];
              return (
                <motion.div
                  key={i}
                  className={`flex-1 ${col.bg} border-t ${col.border} min-w-[8px] rounded-xl`}
                  animate={{ height: [12, Math.random() * 110 + 20, 12] }}
                  transition={{
                    duration: 1.6,
                    repeat: Infinity,
                    delay: i * 0.07,
                    ease: "easeInOut",
                  }}
                />
              );
            })}
          </div>
        )}

        {/* ── TIMELINE — vertical milestones ── */}
        {type === "timeline" && (
          <div className="w-full max-w-md space-y-0 relative px-4">
            <div className="absolute left-[28px] top-4 bottom-4 w-px bg-gradient-to-b from-cyan-500/60 via-primary/40 to-transparent" />
            {effectiveLabels.slice(0, 7).map((label, i) => {
              const col = MOTION_COLORS[i % MOTION_COLORS.length];
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    delay: i * 0.18,
                    type: "spring",
                    stiffness: 160,
                  }}
                  className="flex items-start gap-4 pb-6 last:pb-0 relative"
                >
                  <motion.div
                    animate={{
                      boxShadow: [
                        `0 0 0px ${col.glow}`,
                        `0 0 12px ${col.glow}`,
                        `0 0 0px ${col.glow}`,
                      ],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: i * 0.3,
                    }}
                    className={`shrink-0 w-7 h-7 ${col.bg} border ${col.border} flex items-center justify-center text-[10px] font-black z-10`}
                  >
                    <span className={col.text}>{i + 1}</span>
                  </motion.div>
                  <div
                    className={`flex-1 p-2.5 ${col.bg} border ${col.border} border-l-4`}
                  >
                    <p
                      className={`text-[10px] font-black ${col.text} uppercase tracking-wider leading-tight`}
                    >
                      {label}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* ── PULSE — concentric rings with center glow ── */}
        {(type === "pulse" ||
          ![
            "flow",
            "network",
            "orbit",
            "particles",
            "wave",
            "timeline",
          ].includes(type)) && (
          <div className="relative flex items-center justify-center">
            {[...Array(3)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute border border-cyan-500/30 rounded-xl"
                animate={{ scale: [1, 2.5 + i * 0.6], opacity: [0.5, 0] }}
                transition={{
                  duration: 2.2,
                  repeat: Infinity,
                  delay: i * 0.65,
                  ease: "easeOut",
                }}
                style={{ width: 80, height: 80 }}
              />
            ))}
            <motion.div
              animate={{ scale: [1, 1.08, 1], rotate: [0, 90, 0] }}
              transition={{
                duration: 4.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="w-20 h-20 bg-cyan-500/20 border-2 border-cyan-500/50 flex items-center justify-center shadow-[0_0_32px_rgba(6,182,212,0.4)]"
            >
              <div className="w-8 h-8 bg-cyan-500/40 border border-cyan-400/50" />
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}

function InteractiveQuiz({
  block,
  lessonContext,
}: {
  block: any;
  lessonContext?: {
    lessonTitle: string;
    courseTitle?: string;
    gradeLevel?: string;
  };
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);

  const handleSelect = (idx: number) => {
    if (revealed) return;
    setSelected(idx);
    setRevealed(true);
    if (idx === block.correctAnswer) {
      if (block.onComplete) block.onComplete();
    } else {
      // Wrong answer — fetch an AI explanation
      const correctOption =
        block.options?.[block.correctAnswer] ?? "the correct answer";
      const wrongOption = block.options?.[idx] ?? "your answer";
      setLoadingExplanation(true);
      fetch("/api/ai/study-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `In this quiz question: "${block.question}" — the correct answer is "${correctOption}" but I chose "${wrongOption}". Can you explain clearly why "${correctOption}" is correct and help me understand?`,
          lessonTitle: lessonContext?.lessonTitle ?? "this lesson",
          courseTitle: lessonContext?.courseTitle,
          gradeLevel: lessonContext?.gradeLevel,
          conversationHistory: [],
        }),
      })
        .then(async (response) => {
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || typeof payload.reply !== "string" || !payload.reply.trim()) {
            throw new Error("Explanation unavailable");
          }
          return payload;
        })
        .then((payload) => setAiExplanation(payload.reply))
        .catch(() => {
          setAiExplanation(
            "This explanation is temporarily unavailable. Your quiz result is safe, so you can continue and try again later."
          );
        })
        .finally(() => setLoadingExplanation(false));
    }
  };

  return (
    <div className="p-5 rounded-xl border border-primary/20 bg-background space-y-5 relative overflow-hidden hover:border-primary/40 transition-all my-6 shadow-lg">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10 text-primary flex-shrink-0">
          <QuestionMarkCircleIcon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[9px] font-bold text-primary uppercase tracking-widest">
            Quick Check
          </p>
          <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">
            Quiz
          </h3>
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-sm font-semibold text-foreground leading-snug">
          {block.question}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {block.options?.map((opt: string, optIdx: number) => {
            const isCorrect = optIdx === block.correctAnswer;
            const isSelected = selected === optIdx;
            let stateClass =
              "border-border/60 bg-white/[0.02] hover:border-primary/40 hover:bg-primary/5";
            if (revealed) {
              if (isCorrect)
                stateClass = "border-emerald-500/50 bg-emerald-500/10";
              else if (isSelected)
                stateClass = "border-rose-500/50 bg-rose-500/10";
              else stateClass = "border-border/30 bg-transparent opacity-40";
            }
            return (
              <motion.button
                key={optIdx}
                onClick={() => handleSelect(optIdx)}
                whileHover={!revealed ? { scale: 1.01 } : {}}
                whileTap={!revealed ? { scale: 0.99 } : {}}
                className={`p-3.5 rounded-xl border transition-all text-left ${stateClass}`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-xl border flex items-center justify-center text-[11px] font-black flex-shrink-0 ${
                      revealed && isCorrect
                        ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                        : revealed && isSelected
                        ? "bg-rose-500/20 border-rose-500/40 text-rose-600 dark:text-rose-400"
                        : "bg-card border-border text-muted-foreground"
                    }`}
                  >
                    {String.fromCharCode(65 + optIdx)}
                  </div>
                  <span
                    className={`text-xs font-medium leading-snug flex-1 ${
                      revealed && isCorrect
                        ? "text-emerald-700 dark:text-emerald-300"
                        : revealed && isSelected
                        ? "text-rose-700 dark:text-rose-300"
                        : "text-muted-foreground"
                    }`}
                  >
                    {opt}
                  </span>
                  {revealed && isCorrect && (
                    <CheckCircleIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>

        <AnimatePresence>
          {revealed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              className="pt-4 border-t border-border"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-xl flex-shrink-0 ${
                    selected === block.correctAnswer
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {selected === block.correctAnswer ? (
                    <CheckBadgeIcon className="w-4 h-4" />
                  ) : (
                    <XMarkIcon className="w-4 h-4" />
                  )}
                </div>
                <p className="text-xs font-medium text-foreground flex-1">
                  {selected === block.correctAnswer
                    ? "Correct! Well done."
                    : "Not quite — see the explanation below."}
                </p>
                <button
                  onClick={() => {
                    setRevealed(false);
                    setSelected(null);
                    setAiExplanation(null);
                  }}
                  className="px-4 py-1.5 bg-card border border-border text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all flex-shrink-0"
                >
                  Retry
                </button>
              </div>
              {selected !== block.correctAnswer && (
                <div className="mt-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                  <p className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <span>✦</span> AI Tutor Explanation
                  </p>
                  {loadingExplanation ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs">Thinking...</span>
                    </div>
                  ) : aiExplanation ? (
                    <AIMarkdown
                      content={aiExplanation}
                      variant="compact"
                      className="text-sm text-muted-foreground"
                    />
                  ) : null}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function CompletionCelebration({
  onDismiss,
  lessonTitle,
  courseTitle,
  gradeLevel,
  objectives,
}: {
  onDismiss: () => void;
  lessonTitle?: string;
  courseTitle?: string;
  gradeLevel?: string;
  objectives?: string[];
}) {
  const [recap, setRecap] = useState<string | null>(null);
  const [recapLoading, setRecapLoading] = useState(true);

  useEffect(() => {
    if (!lessonTitle) {
      setRecapLoading(false);
      return;
    }
    fetch("/api/ai/study-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `I just completed the lesson "${lessonTitle}". Give me exactly 3 bullet points summarising the most important things I learned. Be brief, specific, and exciting! Use ✓ for each bullet.`,
        lessonTitle,
        courseTitle,
        gradeLevel,
        lessonObjectives: objectives,
        conversationHistory: [],
      }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || typeof payload.reply !== "string" || !payload.reply.trim()) {
          throw new Error("Recap unavailable");
        }
        return payload;
      })
      .then((payload) => setRecap(payload.reply))
      .catch(() => {
        setRecap(
          "Your lesson is complete and your progress is saved. The personalised recap is temporarily unavailable."
        );
      })
      .finally(() => setRecapLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-2xl flex items-center justify-center p-6"
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(30)].map((_, i) => (
          <motion.div
            key={i}
            initial={{
              x: "50%",
              y: "50%",
              scale: 0,
              rotate: 0,
            }}
            animate={{
              x: `${Math.random() * 100}%`,
              y: `${Math.random() * 100}%`,
              scale: [0, 1, 0.5],
              rotate: 360,
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              ease: "easeOut",
            }}
            className={`absolute w-4 h-4 rounded-full ${
              ["bg-cyan-500", "bg-primary", "bg-amber-500", "bg-emerald-500"][
                i % 4
              ]
            }`}
          />
        ))}
      </div>

      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 40 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="max-w-2xl w-full bg-background border border-border rounded-xl p-12 sm:p-20 text-center space-y-12 shadow-[0_50px_100px_rgba(6,182,212,0.15)] relative"
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="w-32 h-32 rounded-xl bg-gradient-to-br from-primary to-primary to-indigo-600 flex items-center justify-center text-foreground shadow-3xl rotate-12">
            <TrophyIcon className="w-16 h-16" />
          </div>
        </div>

        <div className="space-y-6 pt-10">
          <div className="flex items-center justify-center gap-4">
            <div className="h-px w-12 bg-muted" />
            <p className="text-[12px] font-bold text-primary uppercase tracking-widest">
              Achievement
            </p>
            <div className="h-px w-12 bg-muted" />
          </div>
          <h2 className="text-5xl sm:text-7xl font-black text-foreground leading-none tracking-tighter">
            LESSON COMPLETE!
          </h2>
          <p className="text-base text-muted-foreground font-medium">
            {courseTitle ? `${courseTitle} · ` : ""}
            {lessonTitle}
          </p>
        </div>

        {/* AI recap */}
        <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-6 text-left min-h-[80px]">
          <p className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <span>✦</span> What You Mastered Today
          </p>
          {recapLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground/50">
              <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">Generating your recap...</span>
            </div>
          ) : recap ? (
            <AIMarkdown
              content={recap}
              variant="compact"
              className="text-sm text-muted-foreground"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              You've successfully completed this lesson. Great work!
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="bg-card shadow-sm border border-border rounded-xl p-8">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
              XP Earned
            </p>
            <p className="text-3xl font-black text-primary">+250 XP</p>
          </div>
          <div className="bg-card shadow-sm border border-border rounded-xl p-8">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
              Status
            </p>
            <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
              COMPLETE
            </p>
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="w-full py-8 bg-primary hover:bg-primary text-white font-black uppercase tracking-[0.4em] text-xs rounded-xl transition-all shadow-2xl active:scale-95"
        >
          Continue
        </button>
      </motion.div>
    </motion.div>
  );
}

// ── Activity Steps — auto-detects Scratch-like steps and shows them as colored blocks ──
const SCRATCH_KEYWORDS =
  /^(when|move|turn|go to|say|think|show|hide|play|repeat|forever|if|wait|stop|set|change|broadcast|switch|next costume|ask|glide|point)/i;

function ActivitySteps({
  steps,
  isCoding,
}: {
  steps: string[];
  isCoding?: boolean;
}) {
  const scratchSteps = steps.filter((s) => SCRATCH_KEYWORDS.test(s.trim()));
  const hasBlocks = scratchSteps.length >= Math.ceil(steps.length / 2); // majority look like scratch blocks
  const [viewMode, setViewMode] = useState<"steps" | "blocks">(
    hasBlocks ? "blocks" : "steps"
  );

  return (
    <div className="space-y-4">
      {hasBlocks && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("steps")}
            className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded transition-colors ${
              viewMode === "steps"
                ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            📋 Steps
          </button>
          <button
            onClick={() => setViewMode("blocks")}
            className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded transition-colors ${
              viewMode === "blocks"
                ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            🧩 Block View
          </button>
        </div>
      )}

      {viewMode === "blocks" ? (
        <div
          style={{
            background:
              "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)",
            border: "2px solid rgba(255,213,0,0.15)",
            borderRadius: 8,
            padding: "24px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 12,
              opacity: 0.1,
              fontSize: 10,
              fontWeight: 900,
              color: "#FFD500",
              letterSpacing: "0.1em",
            }}
          >
            SCRATCH BLOCKS
          </div>
          <div
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              gap: 0,
              alignItems: "start",
            }}
          >
            {(() => {
              const tree = parseScratchBlocks(steps);
              return tree.map((node, i) => (
                <ScratchBlockPiece
                  key={i}
                  node={node}
                  index={i}
                  total={tree.length}
                  isFirst={i === 0}
                  isLast={i === tree.length - 1}
                />
              ));
            })()}
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {steps.map((step, sIdx) => (
            <div
              key={sIdx}
              className="flex gap-4 p-4 rounded-xl bg-background/50 border border-emerald-500/10 hover:border-emerald-500/30 transition-all group/step"
            >
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] font-black text-emerald-600 dark:text-emerald-400 shrink-0">
                {sIdx + 1}
              </div>
              <p className="text-sm font-medium text-muted-foreground leading-relaxed pt-1 group-hover/step:text-foreground transition-colors">
                {step}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Recharts wrapper (simpler alternative to D3 for data charts) ─────────────
const RCHART_COLORS = [
  "#06b6d4",
  "#8b5cf6",
  "#f97316",
  "#10b981",
  "#ef4444",
  "#f59e0b",
  "#3b82f6",
  "#ec4899",
];

function RechartsBlock({
  chartType,
  data,
  dataKey,
  labels,
}: {
  chartType: string;
  data: any[];
  dataKey?: string;
  labels?: string[];
}) {
  const normalized = data.map((v: any, i: number) => ({
    name:
      labels?.[i] ??
      (typeof v === "object" ? v.name ?? `${i + 1}` : `${i + 1}`),
    value: typeof v === "number" ? v : v.value ?? v.y ?? 0,
  }));

  const commonProps = {
    margin: { top: 10, right: 10, left: -20, bottom: 5 },
  };

  if (chartType === "pie") {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={normalized}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={100}
            innerRadius={40}
            paddingAngle={2}
          >
            {normalized.map((_: any, i: number) => (
              <Cell key={i} fill={RCHART_COLORS[i % RCHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 11,
              color: "var(--foreground)",
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}
          />
        </PieChart>
      </ResponsiveContainer>
    );
  }
  if (chartType === "area") {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={normalized} {...commonProps}>
          <defs>
            <linearGradient id="rcg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.04)"
          />
          <XAxis
            dataKey="name"
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 11,
              color: "var(--foreground)",
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#06b6d4"
            strokeWidth={2}
            fill="url(#rcg)"
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }
  if (chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={normalized} {...commonProps}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.04)"
          />
          <XAxis
            dataKey="name"
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 11,
              color: "var(--foreground)",
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#f97316"
            strokeWidth={2.5}
            dot={{ fill: "#f97316", r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }
  // Default: bar
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={normalized} {...commonProps}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey="name"
          tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 11,
            color: "var(--foreground)",
          }}
        />
        <Bar dataKey="value" radius={[3, 3, 0, 0]}>
          {normalized.map((_: any, i: number) => (
            <Cell key={i} fill={RCHART_COLORS[i % RCHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Lottie animation block ────────────────────────────────────────────────────
// Free Lottie JSON presets by topic keyword
const LOTTIE_PRESETS: Record<string, string> = {
  robot: "https://assets7.lottiefiles.com/packages/lf20_ysrn2iwp.json",
  code: "https://assets10.lottiefiles.com/packages/lf20_fcfjwiyb.json",
  science: "https://assets2.lottiefiles.com/packages/lf20_i9mxcD.json",
  idea: "https://assets5.lottiefiles.com/packages/lf20_twijbubv.json",
  success: "https://assets2.lottiefiles.com/packages/lf20_jbrw3hcz.json",
  loading: "https://assets4.lottiefiles.com/packages/lf20_p8bfn5to.json",
  star: "https://assets4.lottiefiles.com/packages/lf20_touohxv0.json",
  math: "https://assets4.lottiefiles.com/packages/lf20_YXD37q.json",
};

function LottieBlock({
  url,
  keyword,
  title,
  loop = true,
}: {
  url?: string;
  keyword?: string;
  title?: string;
  loop?: boolean;
}) {
  const [animData, setAnimData] = useState<any>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const src =
      url ||
      LOTTIE_PRESETS[keyword?.toLowerCase() ?? ""] ||
      LOTTIE_PRESETS["idea"];
    fetch(src)
      .then((r) => r.json())
      .then(setAnimData)
      .catch(() => setError(true));
  }, [url, keyword]);

  if (error) return null;

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      {animData && (
        <div className="w-48 h-48 sm:w-64 sm:h-64">
          <Lottie animationData={animData} loop={loop} />
        </div>
      )}
      {title && (
        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest text-center">
          {title}
        </p>
      )}
    </div>
  );
}

// ── Blockly block (read-only display with live code gen) ──────────────────────
function BlocklyBlock({
  xml,
  language,
  title,
}: {
  xml?: string;
  language?: string;
  title?: string;
}) {
  const [generatedCode, setGeneratedCode] = useState<string>("");
  const [showCode, setShowCode] = useState(false);

  return (
    <div className="space-y-3">
      {title && (
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-500/20 text-yellow-600 dark:text-yellow-400">
            <RectangleGroupIcon className="w-4 h-4" />
          </div>
          <p className="text-[10px] font-black text-yellow-600 dark:text-yellow-400 uppercase tracking-[0.4em]">
            {title}
          </p>
        </div>
      )}
      <div className="border border-yellow-500/20 bg-card overflow-hidden min-h-[240px] sm:min-h-[360px]">
        <BlocklyEditor
          xml={xml}
          language={language || "python"}
          onChange={(_xml: string, code: string) => setGeneratedCode(code)}
        />
      </div>
      {generatedCode && (
        <div>
          <button
            onClick={() => setShowCode((s) => !s)}
            className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-yellow-600/60 dark:text-yellow-400/60 hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors mb-2"
          >
            <ChevronRightIcon
              className={`w-3 h-3 transition-transform ${
                showCode ? "rotate-90" : ""
              }`}
            />
            {showCode ? "Hide" : "Show"} generated {language || "python"} code
          </button>
          {showCode && (
            <pre className="p-4 bg-card/80 border border-border text-xs font-mono text-emerald-700 dark:text-emerald-300 overflow-x-auto rounded-xl leading-relaxed">
              {generatedCode}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ── ImageBlock: image with loading skeleton + error fallback ─────────────────
function ImageBlock({ url, caption }: { url?: string; caption?: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    !url ? "loading" : "loading"
  );

  if (!url) {
    return (
      <div className="space-y-4">
        <div className="w-full aspect-video bg-card border border-border flex flex-col items-center justify-center gap-3 animate-pulse">
          <div className="w-8 h-8 border-2 border-cyan-500/40 border-t-cyan-500 rounded-full animate-spin" />
          <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">
            Generating image…
          </p>
        </div>
        {caption && (
          <p className="text-center text-[10px] text-muted-foreground/50 italic">
            {caption}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden border border-border shadow-2xl hover:border-cyan-500/20 transition-colors duration-500 group">
        {status === "loading" && (
          <div className="absolute inset-0 bg-card flex items-center justify-center z-10">
            <div className="w-8 h-8 border-2 border-cyan-500/40 border-t-cyan-500 rounded-full animate-spin" />
          </div>
        )}
        {status === "error" ? (
          <div className="w-full aspect-video bg-rose-500/5 border border-rose-500/10 flex flex-col items-center justify-center gap-2">
            <PhotoIcon className="w-8 h-8 text-rose-600/30 dark:text-rose-400/30" />
            <p className="text-[10px] font-black text-rose-600/40 dark:text-rose-400/40 uppercase tracking-widest">
              Image unavailable
            </p>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={caption || ""}
            className={`w-full object-cover group-hover:scale-[1.02] transition-transform duration-700 ${
              status === "loading"
                ? "opacity-0"
                : "opacity-100 transition-opacity duration-300"
            }`}
            onLoad={() => setStatus("loaded")}
            onError={() => setStatus("error")}
            loading="lazy"
          />
        )}
      </div>
      {caption && (
        <p className="text-center text-[10px] sm:text-xs text-muted-foreground font-black uppercase tracking-[0.3em] italic px-10">
          {caption}
        </p>
      )}
    </div>
  );
}

// ── BlockMarkdown: lightweight markdown for block content (text, callouts, etc) ─
function renderScratchCodeBlock(children: React.ReactNode) {
  const text = String(children).trim();

  // Check if it is a manual Scratch block notation: "category: text" or a standard Scratch block
  const scratchPrefixMatch = text.match(
    /^(event|motion|looks|sound|control|sensing|operator|variable|custom):\s*(.+)$/i
  );
  const isAutoScratch =
    !scratchPrefixMatch &&
    /^(when flag clicked|when green flag clicked|move \d+ steps|turn (right|left) \d+ degrees|say .+ for \d+ seconds|forever|repeat \d+|wait \d+ seconds|show|hide|pen down|pen up)/i.test(
      text
    );

  if (scratchPrefixMatch || isAutoScratch) {
    const cat = scratchPrefixMatch
      ? (scratchPrefixMatch[1].toLowerCase() as ScratchBlockCategory)
      : categorizeScratchBlock(text);
    const blockText = scratchPrefixMatch ? scratchPrefixMatch[2] : text;
    const colors = SCRATCH_COLORS[cat];
    const hat = isHatBlock(blockText);

    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 mx-0.5 text-[0.8em] font-black tracking-wide rounded-md font-mono select-none"
        style={{
          backgroundColor: colors.bg,
          border: `1.2px solid ${colors.border}`,
          color: colors.text,
          boxShadow: `0 1.2px 0 ${colors.border}`,
          borderRadius: hat ? "8px 8px 3px 3px" : "4px",
          textShadow: cat === "event" ? "none" : "0 1px 1px rgba(0,0,0,0.15)",
        }}
      >
        <span className="text-[1.1em]">{SCRATCH_ICONS[cat]}</span>
        <span>{blockText}</span>
      </span>
    );
  }

  return (
    <code className="bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 px-1.5 py-0.5 rounded text-[0.83em] font-mono border border-cyan-500/20">
      {children}
    </code>
  );
}

function BlockMarkdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  if (!content) return null;
  return (
    <div className={className}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <p className="text-base font-black text-foreground mb-1">
              {children}
            </p>
          ),
          h2: ({ children }) => (
            <p className="text-sm font-black text-foreground mb-1">
              {children}
            </p>
          ),
          h3: ({ children }) => (
            <p className="text-sm font-bold text-foreground/80 mb-0.5">
              {children}
            </p>
          ),
          p: ({ children }) => (
            <p className="text-sm text-muted-foreground leading-relaxed mb-1.5 last:mb-0">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="list-none space-y-1 my-1.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-none space-y-1 my-1.5">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="flex gap-2 text-sm text-muted-foreground leading-relaxed">
              <span className="text-cyan-600/70 dark:text-cyan-400/70 shrink-0 mt-1 text-[10px]">
                ▸
              </span>
              <span>{children}</span>
            </li>
          ),
          strong: ({ children }) => (
            <strong className="font-black text-foreground">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-foreground/70">{children}</em>
          ),
          del: ({ children }) => <del className="opacity-40">{children}</del>,
          code: ({ children, className }: any) => {
            if (className) return null; // handled by pre
            return renderScratchCodeBlock(children);
          },
          pre: ({ children }: any) => {
            const codeEl = (children as any)?.props;
            const match = /language-(\w+)/.exec(codeEl?.className || "");
            const code = String(codeEl?.children || "").replace(/\n$/, "");
            return <NoteCodeBlock lang={match?.[1] || ""} code={code} />;
          },
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline decoration-primary/30 hover:decoration-primary underline-offset-2 transition-all"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/50 pl-3 my-1.5 italic text-foreground/60">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}

// ── AnimatedBlock: scroll-triggered entrance for every lesson block ──────────
// Premium entrance: slight scale + rise + fade; gpu-accelerated via transform.
// Stagger is capped so later blocks don't feel laggy during rapid scrolling.
function AnimatedBlock({
  children,
  i,
}: {
  children: React.ReactNode;
  i: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.985 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{
        duration: 0.55,
        delay: Math.min(i * 0.05, 0.25),
        ease: [0.22, 1, 0.36, 1],
      }}
      style={{ willChange: "transform, opacity" }}
    >
      {children}
    </motion.div>
  );
}

function CanvaRenderer({
  blocks,
  lessonType,
  onInteraction,
  onExplainRequest,
  lessonContext,
  courseAssignments = [],
}: {
  blocks: any[];
  lessonType?: string;
  onInteraction?: (idx: number) => void;
  onExplainRequest?: (text: string) => void;
  lessonContext?: {
    lessonTitle: string;
    courseTitle?: string;
    gradeLevel?: string;
  };
  courseAssignments?: any[];
}) {
  if (!blocks || blocks.length === 0) return null;

  const INFO_COLORS = [
    {
      accent: "border-l-cyan-500",
      num: "bg-cyan-500",
      text: "text-cyan-600 dark:text-cyan-400",
      bg: "bg-cyan-500/5",
    },
    {
      accent: "border-l-primary",
      num: "bg-primary",
      text: "text-primary",
      bg: "bg-primary/5",
    },
    {
      accent: "border-l-primary",
      num: "bg-primary",
      text: "text-primary",
      bg: "bg-primary/5",
    },
    {
      accent: "border-l-emerald-500",
      num: "bg-emerald-500",
      text: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/5",
    },
    {
      accent: "border-l-rose-500",
      num: "bg-rose-500",
      text: "text-rose-600 dark:text-rose-400",
      bg: "bg-rose-500/5",
    },
    {
      accent: "border-l-amber-500",
      num: "bg-amber-500",
      text: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/5",
    },
  ];

  return (
    <div
      className={`space-y-10 sm:space-y-16 ${
        lessonType === "reading" ? "max-w-3xl mx-auto" : ""
      }`}
    >
      {blocks.map((block: any, i: number) => {
        switch (block.type) {
          /* ── HEADING ───────────────────────────────────────────────── */
          case "heading":
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="relative group pt-4">
                  <div className="absolute -left-4 top-0 bottom-0 w-1.5 rounded-full bg-gradient-to-b from-primary via-indigo-500 to-cyan-500 opacity-0 group-hover:opacity-100 transition-all duration-300 scale-y-0 group-hover:scale-y-100 origin-top shadow-[0_0_12px_rgba(6,182,212,0.6)]" />
                  <h2 className="text-xl sm:text-3xl font-extrabold tracking-tight leading-snug break-words bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-all duration-300">
                    {block.content}
                  </h2>
                  <div className="mt-3 h-[2px] w-0 group-hover:w-full bg-gradient-to-r from-primary via-indigo-500 to-transparent transition-all duration-500" />
                </div>
              </AnimatedBlock>
            );

          /* ── TEXT ──────────────────────────────────────────────────── */
          case "text":
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="relative py-2 pl-4 border-l-2 border-border hover:border-primary/30 transition-colors duration-300 selection:bg-cyan-500/30">
                  <BlockMarkdown
                    content={block.content || ""}
                    className="text-sm sm:text-base font-medium break-words"
                  />
                </div>
              </AnimatedBlock>
            );

          /* ── CODE ──────────────────────────────────────────────────── */
          case "code":
            return (
              <AnimatedBlock key={i} i={i}>
                <MonacoEditorBlock
                  code={block.content}
                  language={block.language}
                />
              </AnimatedBlock>
            );

          /* ── IMAGE ─────────────────────────────────────────────────── */
          case "image":
            return (
              <AnimatedBlock key={i} i={i}>
                <ImageBlock url={block.url} caption={block.caption} />
              </AnimatedBlock>
            );

          /* ── CALLOUT ───────────────────────────────────────────────── */
          case "callout": {
            const isWarning = block.style === "warning";
            return (
              <AnimatedBlock key={i} i={i}>
                <div
                  className={`p-8 sm:p-12 border border-white/10 rounded-2xl shadow-2xl relative overflow-hidden group backdrop-blur-md ${
                    isWarning
                      ? "bg-rose-500/5 hover:border-rose-500/30"
                      : "bg-primary/5 hover:border-primary/30"
                  } transition-all duration-300`}
                >
                  <div
                    className={`absolute -right-12 -top-12 w-48 sm:w-64 h-48 sm:h-64 opacity-[0.03] transition-transform group-hover:scale-110 group-hover:rotate-12 duration-500 ${
                      isWarning
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-primary"
                    }`}
                  >
                    {isWarning ? (
                      <ExclamationTriangleIcon />
                    ) : (
                      <InformationCircleIcon />
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-6 sm:gap-10 relative z-10">
                    <div
                      className={`shrink-0 p-4 sm:p-6 rounded-xl shadow-xl flex items-center justify-center ${
                        isWarning
                          ? "bg-rose-500/20 text-rose-600 dark:text-rose-400"
                          : "bg-primary/20 text-primary"
                      }`}
                    >
                      {isWarning ? (
                        <ExclamationTriangleIcon className="w-8 h-8 sm:w-12 sm:h-12" />
                      ) : (
                        <InformationCircleIcon className="w-8 h-8 sm:w-12 sm:h-12" />
                      )}
                    </div>
                    <div className="space-y-2 flex-1">
                      <p
                        className={`text-[10px] font-black uppercase tracking-[0.3em] ${
                          isWarning
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-primary"
                        }`}
                      >
                        {isWarning ? "Important Note" : "Key Insight"}
                      </p>
                      <BlockMarkdown
                        content={block.content || ""}
                        className="text-base sm:text-lg font-bold text-muted-foreground leading-relaxed"
                      />
                    </div>
                  </div>
                </div>
              </AnimatedBlock>
            );
          }

          /* ── ACTIVITY ──────────────────────────────────────────────── */
          case "activity":
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="p-8 sm:p-12 border-2 border-emerald-500/20 bg-emerald-500/5 space-y-8 relative overflow-hidden shadow-2xl group/activity">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-3xl pointer-events-none" />
                  <div className="flex items-center gap-6">
                    <div className="p-4 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex-shrink-0 shadow-lg group-hover/activity:scale-110 transition-transform">
                      <RocketLaunchIcon className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.5em] mb-1">
                        Interactive Synthesis Lab
                      </p>
                      <h3 className="text-xl font-black uppercase tracking-tight text-foreground">
                        {block.title || "Practical Implementation"}
                      </h3>
                    </div>
                  </div>
                  <div className="space-y-6">
                    {block.steps && Array.isArray(block.steps) ? (
                      <ActivitySteps
                        steps={block.steps}
                        isCoding={block.is_coding}
                      />
                    ) : (
                      <div className="border-l-4 border-emerald-500/40 pl-6 py-2">
                        <BlockMarkdown
                          content={
                            block.instructions ||
                            "Follow the experiential learning prompt below."
                          }
                          className="text-base font-medium italic opacity-80"
                        />
                      </div>
                    )}
                  </div>
                  {block.is_coding && (
                    <div className="mt-8">
                      <IntegratedCodeRunner
                        initialCode={block.initialCode || ""}
                        language={
                          (block.language?.toLowerCase() as any) || "javascript"
                        }
                        title={block.title || "Implementation Sandbox"}
                        onRun={() => onInteraction?.(i)}
                      />
                    </div>
                  )}
                </div>
              </AnimatedBlock>
            );

          /* ── QUIZ ──────────────────────────────────────────────────── */
          case "quiz":
            return (
              <AnimatedBlock key={i} i={i}>
                <InteractiveQuiz
                  block={{ ...block, onComplete: () => onInteraction?.(i) }}
                  lessonContext={lessonContext}
                />
              </AnimatedBlock>
            );

          /* ── VIDEO ─────────────────────────────────────────────────── */
          case "video":
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="space-y-4 sm:space-y-6">
                  <VideoPlayer url={block.url} title={block.caption} />
                  {block.caption && (
                    <p className="text-center text-xs sm:text-sm font-black uppercase tracking-[0.3em] text-muted-foreground italic px-4">
                      {block.caption}
                    </p>
                  )}
                </div>
              </AnimatedBlock>
            );

          /* ── SCRATCH ───────────────────────────────────────────────── */
          case "scratch":
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="border-2 border-yellow-500/20 bg-yellow-500/5 space-y-6 p-6 sm:p-10">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 flex-shrink-0">
                      <RectangleGroupIcon className="w-7 h-7" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-yellow-600 dark:text-yellow-400 uppercase tracking-[0.4em] mb-0.5">
                        Visual Coding Lab — KG to Basic 6
                      </p>
                      <h3 className="text-lg font-black uppercase tracking-tight text-foreground">
                        Scratch Block Mission
                      </h3>
                    </div>
                  </div>
                  <ScratchBlockRenderer
                    blocks={block.blocks || []}
                    instructions={block.instructions}
                  />
                </div>
              </AnimatedBlock>
            );

          /* ── FILE ──────────────────────────────────────────────────── */
          case "file":
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="p-6 sm:p-10 border-2 border-border bg-card flex flex-col sm:flex-row items-center justify-between gap-6 group hover:border-cyan-500/30 transition-all text-center sm:text-left shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-600/5 blur-3xl rounded-full" />
                  <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8 relative z-10">
                    <div className="p-5 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 group-hover:scale-110 transition-transform shadow-lg">
                      <ArrowDownTrayIcon className="w-8 h-8 sm:w-10 sm:h-10" />
                    </div>
                    <div>
                      <h4 className="text-xl sm:text-2xl font-black text-foreground group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors truncate max-w-[200px] sm:max-w-md tracking-tight">
                        {block.fileName || "Learning Resource"}
                      </h4>
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mt-1">
                        Ready for Download
                      </p>
                    </div>
                  </div>
                  <a
                    href={block.url}
                    target="_blank"
                    className="relative z-10 w-full sm:w-auto px-8 py-4 bg-cyan-700 hover:bg-cyan-800 text-white font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl active:scale-95"
                  >
                    Download Now
                  </a>
                </div>
              </AnimatedBlock>
            );

          /* ── ILLUSTRATION (bento grid) ─────────────────────────────── */
          case "illustration": {
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="my-4 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="h-px flex-1 bg-gradient-to-r from-indigo-500/30 to-transparent" />
                    <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em] shrink-0 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" />
                      {block.title || "Key Concepts"}
                    </h3>
                    <div className="h-px flex-1 bg-gradient-to-l from-indigo-500/30 to-transparent" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(block.items || []).map((item: any, idx: number) => {
                      const col = INFO_COLORS[idx % INFO_COLORS.length];
                      return (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, y: 16 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true }}
                          transition={{
                            delay: idx * 0.07,
                            type: "spring",
                            stiffness: 180,
                          }}
                          className={`flex gap-4 p-4 border border-border border-l-4 ${col.accent} ${col.bg} group hover:shadow-lg transition-all`}
                        >
                          <div
                            className={`w-7 h-7 ${col.num} flex items-center justify-center text-[10px] font-black text-foreground shrink-0 mt-0.5`}
                          >
                            {idx + 1}
                          </div>
                          <div className="space-y-1 flex-1 min-w-0">
                            <p
                              className={`text-[9px] font-black ${col.text} uppercase tracking-widest leading-none`}
                            >
                              {item.label}
                            </p>
                            <p className="text-sm font-medium text-muted-foreground leading-relaxed group-hover:text-foreground transition-colors">
                              {item.value}
                            </p>
                            {onExplainRequest && (
                              <button
                                onClick={() =>
                                  onExplainRequest(
                                    `Explain "${item.label}": ${item.value}`
                                  )
                                }
                                className={`mt-1 text-[8px] font-black uppercase tracking-widest ${col.text} opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity flex items-center gap-1`}
                              >
                                <span>✦</span> Ask AI
                              </button>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </AnimatedBlock>
            );
          }

          /* ── CODE-MAP (timeline) ───────────────────────────────────── */
          case "code-map":
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="p-8 sm:p-12 bg-card border border-border shadow-2xl">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="w-2 h-2 rounded-full bg-cyan-500" />
                    <p className="text-[10px] font-black text-cyan-600 dark:text-cyan-400 uppercase tracking-[0.4em]">
                      Logic Maps &amp; Flow
                    </p>
                  </div>
                  <div className="relative pl-6 border-l border-cyan-500/20 space-y-0">
                    {(block.components || []).map((comp: any, idx: number) => (
                      <div key={idx} className="relative pb-8 group last:pb-0">
                        <div className="absolute -left-[25px] top-1 w-4 h-4 rounded-full bg-cyan-500/20 border-2 border-cyan-500 group-hover:bg-cyan-500 transition-colors shadow-[0_0_10px_rgba(6,182,212,0.4)]" />
                        <div className="space-y-1">
                          <h4 className="text-base font-black text-foreground uppercase tracking-tight group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                            {comp.name}
                          </h4>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {comp.description}
                          </p>
                          {onExplainRequest && (
                            <button
                              onClick={() =>
                                onExplainRequest(
                                  `Explain "${comp.name}": ${comp.description}`
                                )
                              }
                              className="mt-1 text-[8px] font-black uppercase tracking-widest text-cyan-600 dark:text-cyan-400 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity flex items-center gap-1"
                            >
                              <span>✦</span> Ask AI
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </AnimatedBlock>
            );

          /* ── ASSIGNMENT-BLOCK ──────────────────────────────────────── */
          case "assignment-block": {
            const matchedAssignment =
              courseAssignments.find(
                (a: any) =>
                  a.title.toLowerCase().trim() ===
                  (block.title || "").toLowerCase().trim()
              ) || courseAssignments[0];

            const displayTitle =
              matchedAssignment?.title || block.title || "Mastery Synthesis";
            const displayInstructions =
              matchedAssignment?.instructions || block.instructions || "";
            const matchedMeta = matchedAssignment?.metadata as
              | { deliverables?: string[] }
              | null
              | undefined;
            const displayDeliverables =
              matchedMeta?.deliverables || block.deliverables || [];

            return (
              <AnimatedBlock key={i} i={i}>
                <div className="relative overflow-hidden group border border-white/5 rounded-2xl">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border-2 border-emerald-500/20 rounded-2xl" />
                  <div className="relative p-8 sm:p-12 space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/40 rotate-3 group-hover:rotate-0 transition-transform duration-500">
                        <TrophyIcon className="w-7 h-7 text-white" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1">
                          Capstone Challenge
                        </p>
                        <h3 className="text-2xl sm:text-3xl font-black text-foreground uppercase tracking-tight">
                          {displayTitle}
                        </h3>
                      </div>
                    </div>
                    <div className="p-6 bg-[#161628]/40 border border-white/5 rounded-xl shadow-lg">
                      <BlockMarkdown
                        content={displayInstructions}
                        className="text-sm font-medium mb-6"
                      />
                      {displayDeliverables &&
                        displayDeliverables.length > 0 && (
                          <div className="space-y-3 pt-4 border-t border-emerald-500/20">
                            <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.3em]">
                              Required Deliverables
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {displayDeliverables.map(
                                (del: string, idx: number) => (
                                  <div
                                    key={idx}
                                    className="flex items-center gap-3 p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl"
                                  >
                                    <div className="w-5 h-5 bg-emerald-500/20 flex items-center justify-center text-[10px] font-black text-emerald-600 dark:text-emerald-400 rounded">
                                      {idx + 1}
                                    </div>
                                    <span className="text-xs font-bold text-foreground/80">
                                      {del}
                                    </span>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        )}

                      {matchedAssignment && (
                        <div className="mt-8 pt-6 border-t border-emerald-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
                          <div className="text-center sm:text-left">
                            <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
                              Active Assignment Synced
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {matchedAssignment.title}
                            </p>
                          </div>
                          <Link
                            href={`/dashboard/assignments/${matchedAssignment.id}`}
                            className="w-full sm:w-auto text-center px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs uppercase tracking-widest transition-all rounded-xl shadow-lg hover:shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2"
                          >
                            <RocketLaunchIcon className="w-4 h-4" /> Go to
                            Submission Portal
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </AnimatedBlock>
            );
          }

          /* ── MATH ──────────────────────────────────────────────────── */
          case "math":
            return (
              <AnimatedBlock key={i} i={i}>
                <MathRenderer formula={block.formula || ""} />
              </AnimatedBlock>
            );

          /* ── MOTION-GRAPHICS ───────────────────────────────────────── */
          case "motion-graphics":
            return (
              <AnimatedBlock key={i} i={i}>
                <MotionGraphicRenderer
                  type={block.animationType || "particles"}
                  config={block.config || {}}
                  title={block.title || block.concept}
                />
              </AnimatedBlock>
            );

          /* ── D3-CHART ──────────────────────────────────────────────── */
          case "d3-chart":
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="space-y-3">
                  {(block.title || block.concept) && (
                    <div className="flex items-center gap-3">
                      <div className="w-1 h-4 bg-primary rounded-full" />
                      <p className="text-[10px] font-black text-primary/70 uppercase tracking-widest">
                        {block.title || block.concept}
                      </p>
                    </div>
                  )}
                  <D3ChartRenderer
                    type={block.chartType || "bar"}
                    dataset={block.dataset || []}
                    labels={block.labels}
                  />
                </div>
              </AnimatedBlock>
            );

          /* ── VISUALIZER ────────────────────────────────────────────── */
          case "visualizer":
            return (
              <AnimatedBlock key={i} i={i}>
                <VisualizerBlock block={block} />
              </AnimatedBlock>
            );

          /* ── KEY-TERMS ─────────────────────────────────────────────── */
          case "key-terms": {
            const terms: { term: string; definition: string }[] =
              block.terms || block.items || [];
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500/20 text-amber-600 dark:text-amber-400">
                      <BookOpenIcon className="w-4 h-4" />
                    </div>
                    <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-[0.4em]">
                      {block.title || "Key Terms & Definitions"}
                    </p>
                  </div>
                  <div className="divide-y divide-white/5 border border-border">
                    {terms.map((t: any, idx: number) => (
                      <div
                        key={idx}
                        className="group flex gap-4 p-4 hover:bg-muted/30 transition-colors"
                      >
                        <div className="shrink-0 mt-1">
                          <div className="w-2 h-2 rounded-full bg-amber-500/60 group-hover:bg-amber-400 transition-colors" />
                        </div>
                        <div className="space-y-1 min-w-0">
                          <p className="text-sm font-black text-amber-700 dark:text-amber-300 tracking-tight">
                            {t.term || t.label || t.word}
                          </p>
                          <BlockMarkdown
                            content={t.definition || t.value || t.meaning || ""}
                            className="text-sm"
                          />
                        </div>
                        {onExplainRequest && (
                          <button
                            onClick={() =>
                              onExplainRequest(
                                `Explain term: "${
                                  t.term || t.label
                                }". Definition: ${t.definition || t.value}`
                              )
                            }
                            className="shrink-0 self-start text-[8px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity mt-1"
                          >
                            ✦ AI
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </AnimatedBlock>
            );
          }

          /* ── QUOTE ─────────────────────────────────────────────────── */
          case "quote":
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="relative pl-8 py-6 border-l-4 border-primary/60 bg-primary/5 overflow-hidden group">
                  <div className="absolute top-3 right-4 text-5xl font-black text-primary/10 leading-none select-none">
                    "
                  </div>
                  <blockquote className="text-base sm:text-lg font-semibold text-foreground/80 italic leading-relaxed mb-3">
                    <span className="select-none text-primary/50 mr-1">"</span>
                    <BlockMarkdown
                      content={block.content || block.quote || ""}
                      className="inline"
                    />
                    <span className="select-none text-primary/50 ml-0.5">
                      "
                    </span>
                  </blockquote>
                  {(block.author || block.source) && (
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest">
                      — {block.author || block.source}
                    </p>
                  )}
                </div>
              </AnimatedBlock>
            );

          /* ── STEPS-LIST ────────────────────────────────────────────── */
          case "steps-list": {
            const steps: string[] = block.steps || block.items || [];
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="space-y-3">
                  {block.title && (
                    <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.4em] flex items-center gap-2">
                      <CheckCircleIcon className="w-4 h-4" />
                      {block.title}
                    </p>
                  )}
                  <div className="space-y-2">
                    {steps.map((step: any, idx: number) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -12 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{
                          delay: idx * 0.07,
                          type: "spring",
                          stiffness: 200,
                        }}
                        className="flex items-start gap-4 p-4 bg-muted/30 border border-border hover:border-emerald-500/20 hover:bg-emerald-500/5 transition-all group"
                      >
                        <div className="shrink-0 w-7 h-7 bg-emerald-700/20 border border-emerald-500/30 flex items-center justify-center text-[11px] font-black text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-800 group-hover:text-white transition-colors">
                          {idx + 1}
                        </div>
                        <BlockMarkdown
                          content={
                            typeof step === "string"
                              ? step
                              : step.text || step.content || step.label || ""
                          }
                          className="text-sm text-muted-foreground group-hover:text-foreground transition-colors pt-0.5"
                        />
                      </motion.div>
                    ))}
                  </div>
                </div>
              </AnimatedBlock>
            );
          }

          /* ── TABLE ─────────────────────────────────────────────────── */
          case "table": {
            // Support both AI-generated format (headers array) and editor format (col1_header/col2_header)
            const headers: string[] =
              block.headers ||
              block.columns ||
              (block.col1_header
                ? [block.col1_header, block.col2_header].filter(Boolean)
                : []);
            const rows: any[][] = block.rows || block.data || [];
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="space-y-3">
                  {block.title && (
                    <p className="text-[10px] font-black text-cyan-600 dark:text-cyan-400 uppercase tracking-[0.4em]">
                      {block.title}
                    </p>
                  )}
                  <div className="overflow-x-auto border border-border">
                    <table className="w-full text-sm border-collapse">
                      {headers.length > 0 && (
                        <thead>
                          <tr className="bg-muted/50">
                            {headers.map((h: string, hi: number) => (
                              <th
                                key={hi}
                                className="px-4 py-3 text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest border-b border-border"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                      )}
                      <tbody>
                        {rows.map((row: any[], ri: number) => (
                          <tr
                            key={ri}
                            className="border-b border-border hover:bg-muted/30 transition-colors group"
                          >
                            {(Array.isArray(row)
                              ? row
                              : Object.values(row)
                            ).map((cell: any, ci: number) => (
                              <td
                                key={ci}
                                className={`px-4 py-3 text-sm text-muted-foreground group-hover:text-foreground transition-colors ${
                                  ci === 0
                                    ? "font-semibold text-foreground/80"
                                    : ""
                                }`}
                              >
                                {String(cell ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </AnimatedBlock>
            );
          }

          /* ── COLUMNS ───────────────────────────────────────────────── */
          case "columns": {
            // Support editor format (left/right strings) and AI format (columns array)
            const cols: any[] =
              block.columns ||
              block.items ||
              (block.left !== undefined
                ? [{ content: block.left }, { content: block.right }]
                : []);
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {cols.map((col: any, ci: number) => {
                    const accent = INFO_COLORS[ci % INFO_COLORS.length];
                    return (
                      <motion.div
                        key={ci}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{
                          delay: ci * 0.1,
                          type: "spring",
                          stiffness: 160,
                        }}
                        className={`p-5 border border-border border-t-2 ${accent.accent.replace(
                          "border-l-",
                          "border-t-"
                        )} ${
                          accent.bg
                        } space-y-2 group hover:shadow-lg transition-all`}
                      >
                        {(col.title || col.heading || col.label) && (
                          <p
                            className={`text-[10px] font-black uppercase tracking-widest ${accent.text}`}
                          >
                            {col.title || col.heading || col.label}
                          </p>
                        )}
                        <BlockMarkdown
                          content={
                            col.content ||
                            col.text ||
                            col.value ||
                            col.body ||
                            ""
                          }
                          className="group-hover:text-foreground transition-colors"
                        />
                      </motion.div>
                    );
                  })}
                </div>
              </AnimatedBlock>
            );
          }

          /* ── MERMAID / DIAGRAM ─────────────────────────────────────── */
          case "mermaid":
          case "diagram":
            return (
              <AnimatedBlock key={i} i={i}>
                <MermaidRenderer code={block.code || block.content || ""} />
              </AnimatedBlock>
            );

          /* ── LOTTIE ANIMATION ──────────────────────────────────────── */
          case "lottie":
            return (
              <AnimatedBlock key={i} i={i}>
                <LottieBlock
                  url={block.url}
                  keyword={block.keyword || block.topic}
                  title={block.title || block.caption}
                  loop={block.loop !== false}
                />
              </AnimatedBlock>
            );

          /* ── BLOCKLY VISUAL CODING ─────────────────────────────────── */
          case "blockly":
            return (
              <AnimatedBlock key={i} i={i}>
                <BlocklyBlock
                  xml={block.xml || block.workspace}
                  language={block.language || "python"}
                  title={block.title}
                />
              </AnimatedBlock>
            );

          /* ── RECHARTS DATA CHART ───────────────────────────────────── */
          case "chart":
          case "recharts": {
            const chartData = block.data || block.dataset || [];
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="space-y-3">
                  {(block.title || block.concept) && (
                    <div className="flex items-center gap-3">
                      <div className="w-1 h-4 bg-primary rounded-full" />
                      <p className="text-[10px] font-black text-primary/70 uppercase tracking-widest">
                        {block.title || block.concept}
                      </p>
                    </div>
                  )}
                  <div className="p-4 bg-card border border-border">
                    <RechartsBlock
                      chartType={block.chartType || block.type2 || "bar"}
                      data={chartData}
                      labels={block.labels}
                    />
                  </div>
                  {block.caption && (
                    <p className="text-center text-[10px] text-muted-foreground italic">
                      {block.caption}
                    </p>
                  )}
                </div>
              </AnimatedBlock>
            );
          }

          default:
            return null;
        }
      })}
    </div>
  );
}

// ── Full markdown renderer for lesson_notes ──────────────────────────────────
function NoteCodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const LANG_COLOR: Record<string, string> = {
    python: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    javascript: "text-yellow-600 dark:text-yellow-400 bg-yellow-500/10",
    js: "text-yellow-600 dark:text-yellow-400 bg-yellow-500/10",
    html: "text-primary bg-primary/10",
    css: "text-primary bg-primary/10",
    robotics: "text-primary bg-primary/10",
    bash: "text-muted-foreground bg-muted/50",
    json: "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10",
  };
  const langClass =
    LANG_COLOR[lang?.toLowerCase()] ??
    "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="my-5 bg-card border border-border overflow-hidden shadow-xl"
    >
      <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
          </div>
          {lang && (
            <span
              className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${langClass}`}
            >
              {lang}
            </span>
          )}
        </div>
        <button
          onClick={copy}
          className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 hover:text-muted-foreground transition-colors flex items-center gap-1"
        >
          {copied ? "✓ Copied" : "⧉ Copy"}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-[13px] font-mono leading-relaxed text-cyan-700 dark:text-cyan-300">
        <code>{code}</code>
      </pre>
    </motion.div>
  );
}

function MarkdownNotes({ content }: { content: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="text-2xl font-black text-foreground pt-6 pb-2 border-b border-border/50 mt-4"
          >
            {children}
          </motion.h1>
        ),
        h2: ({ children }) => (
          <motion.h2
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35 }}
            className="text-lg font-black text-foreground pt-8 pb-2 border-b border-border uppercase tracking-widest mt-4"
          >
            {children}
          </motion.h2>
        ),
        h3: ({ children }) => (
          <motion.h3
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3 }}
            className="text-base font-black text-foreground/80 pt-5 pb-1 flex items-center gap-2"
          >
            <span className="w-1 h-1 rounded-full bg-cyan-500 inline-block shrink-0" />
            {children}
          </motion.h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-sm font-black text-foreground/70 pt-3 pb-1 uppercase tracking-wider">
            {children}
          </h4>
        ),
        p: ({ children }) => (
          <p className="text-sm text-muted-foreground leading-relaxed my-1.5">
            {children}
          </p>
        ),
        ul: ({ children }) => (
          <ul className="list-none space-y-2 pl-0 my-3">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-none space-y-2 pl-0 my-3 [counter-reset:li]">
            {children}
          </ol>
        ),
        li: ({ children, ordered, index }: any) => (
          <motion.li
            initial={{ opacity: 0, x: -6 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: (index ?? 0) * 0.04, duration: 0.3 }}
            className="flex gap-3 items-start text-sm text-muted-foreground leading-relaxed"
          >
            {ordered ? (
              <span className="w-5 h-5 rounded bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
                {(index ?? 0) + 1}
              </span>
            ) : (
              <span className="text-cyan-600/70 dark:text-cyan-400/70 mt-1.5 shrink-0 text-xs">
                ▸
              </span>
            )}
            <span className="flex-1">{children}</span>
          </motion.li>
        ),
        blockquote: ({ children }) => (
          <motion.blockquote
            initial={{ opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35 }}
            className="my-4 pl-5 border-l-4 border-primary/50 bg-primary/5 py-3 pr-4"
          >
            <div className="text-sm text-foreground/70 italic leading-relaxed [&>p]:my-0">
              {children}
            </div>
          </motion.blockquote>
        ),
        pre: ({ children }: any) => {
          const codeEl = (children as any)?.props;
          const match = /language-(\w+)/.exec(codeEl?.className || "");
          const code = String(codeEl?.children || "").replace(/\n$/, "");
          return <NoteCodeBlock lang={match?.[1] || ""} code={code} />;
        },
        code: ({ children, className }: any) => {
          if (className) return null; // handled by pre
          return renderScratchCodeBlock(children);
        },
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline decoration-primary/30 hover:decoration-primary underline-offset-2 transition-all"
          >
            {children}
          </a>
        ),
        img: ({ src, alt }) => (
          <motion.span
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="block my-4"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt || ""}
              className="rounded-xl max-w-full border border-border shadow-lg"
              loading="lazy"
            />
            {alt && (
              <span className="block text-[11px] text-muted-foreground/60 text-center mt-2 italic">
                {alt}
              </span>
            )}
          </motion.span>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-4 border border-border">
            <table className="w-full text-xs border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-muted/50">{children}</thead>
        ),
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => (
          <tr className="border-b border-border hover:bg-muted/30 transition-colors">
            {children}
          </tr>
        ),
        th: ({ children }) => (
          <th className="px-4 py-2.5 text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest border-b border-border">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-4 py-2.5 text-sm text-muted-foreground first:font-semibold first:text-foreground/80">
            {children}
          </td>
        ),
        hr: () => <hr className="my-6 border-border/50" />,
        strong: ({ children }) => (
          <strong className="font-black text-foreground">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="text-foreground/70 italic">{children}</em>
        ),
        del: ({ children }) => <del className="opacity-40">{children}</del>,
      }}
    >
      {content}
    </Markdown>
  );
}

const TabBtn = ({ active, onClick, icon: Icon, label, count }: any) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 sm:gap-2.5 px-4 sm:px-6 py-3 sm:py-4 rounded-xl transition-all relative group whitespace-nowrap ${
      active
        ? "bg-gradient-to-r from-primary to-primary to-indigo-500 text-foreground shadow-[0_10px_30px_-10px_rgba(6,182,212,0.5)]"
        : "text-muted-foreground hover:text-foreground hover:bg-card shadow-sm"
    }`}
  >
    <Icon
      className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform group-hover:scale-110 ${
        active ? "text-foreground" : "text-current"
      }`}
    />
    <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.1em] sm:tracking-[0.15em] shrink-0">
      {label}
    </span>
    {count !== undefined && count > 0 && (
      <span
        className={`px-1.5 py-0.5 rounded-full text-[8px] font-black min-w-[16px] sm:min-w-[18px] text-center ${
          active
            ? "bg-muted text-foreground"
            : "bg-card shadow-sm text-muted-foreground group-hover:text-muted-foreground"
        }`}
      >
        {count}
      </span>
    )}
    {active && (
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-cyan-400 rounded-full blur-[2px] shadow-[0_0_8px_cyan]" />
    )}
  </button>
);

// --- Main Page Component ---

export default function LessonDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedClassId =
    searchParams?.get("return_class_id") || searchParams?.get("class_id");
  const { profile, loading: authLoading, profileLoading } = useAuth();

  const [lesson, setLesson] = useState<any>(null);
  const classId = requestedClassId || lesson?.class_id || null;
  const [courseLessons, setCourseLessons] = useState<any[]>([]);
  const [courseAssignments, setCourseAssignments] = useState<any[]>([]);
  const [programQuizzes, setProgramQuizzes] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [flashcardDecks, setFlashcardDecks] = useState<any[]>([]);
  const [generatingAssignment, setGeneratingAssignment] = useState(false);
  const [generatingFlashcards, setGeneratingFlashcards] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"content" | "materials" | "tasks">(
    "content"
  );
  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("tab") === "materials"
    ) {
      setActiveTab("materials");
    }
  }, []);
  const [addingResource, setAddingResource] = useState(false);
  const [newResource, setNewResource] = useState({
    title: "",
    file_url: "",
    file_type: "link",
  });
  const [savingResource, setSavingResource] = useState(false);
  const [deckTitle, setDeckTitle] = useState("");
  const [deckUploading, setDeckUploading] = useState(false);
  const [viewerDeck, setViewerDeck] = useState<{
    slides?: string[];
    pdf?: string;
    title: string;
  } | null>(null);
  const [manageDeck, setManageDeck] = useState<any | null>(null);
  const [deckProgress, setDeckProgress] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ttsOpen, setTtsOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const [completed, setCompleted] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const [generatingNotes, setGeneratingNotes] = useState(false);
  const startTimeRef = useState<number>(() => Date.now())[0];
  const [notesRead, setNotesRead] = useState(false);
  const [lessonHook, setLessonHook] = useState<{
    hook_title: string;
    hook: string;
    real_world_example: string;
    challenge_question: string;
  } | null>(null);
  const [hookLoading, setHookLoading] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const hookFetchedRef = useRef(false);
  const [isCinemaMode, setIsCinemaMode] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [viewerItem, setViewerItem] = useState<ResourceItem | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [interactions, setInteractions] = useState<Set<number>>(new Set());
  const [explainRequest, setExplainRequest] = useState<string | undefined>(
    undefined
  );
  const [notesExpanded, setNotesExpanded] = useState(false);

  const handleInteraction = (idx: number) => {
    setInteractions((prev) => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
  };

  const handleGenerateNotes = async () => {
    if (!lesson || generatingNotes) return;
    setGeneratingNotes(true);
    try {
      const siblingTitles = courseLessons
        .filter((l) => l.id !== id)
        .map((l) => l.title);
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "lesson-notes",
          topic: lesson.title,
          gradeLevel: lesson.grade_level || "JSS1–SS3",
          subject: lesson.subject || undefined,
          durationMinutes: lesson.duration_minutes || 60,
          courseName: lesson.courses?.title || undefined,
          programName: lesson.courses?.programs?.name || undefined,
          siblingLessons: siblingTitles.length ? siblingTitles : undefined,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Generation failed");
      let notes: string | undefined = payload.data?.lesson_notes;
      if (notes) {
        // Sanitize: if AI returned escaped \n sequences instead of real newlines, fix them
        if (
          typeof notes === "string" &&
          !notes.includes("\n") &&
          notes.includes("\\n")
        ) {
          notes = notes.replace(/\\n/g, "\n");
        }
        // Save to DB
        const db = createClient();
        await db.from("lessons").update({ lesson_notes: notes }).eq("id", id);
        // Update local state
        setLesson((prev: any) => ({ ...prev, lesson_notes: notes }));
      }
    } catch (e: any) {
      alert(e.message ?? "Failed to generate notes. Please try again.");
    } finally {
      setGeneratingNotes(false);
    }
  };

  /** Profile is null only while auth/profile loads or when the session has no portal_users row. */
  const requireProfile = () => {
    if (profileLoading) {
      alert(
        "Your profile is still loading. Please wait a moment and try again."
      );
      return null;
    }
    if (!profile) {
      alert(
        "Could not load your account profile. Please refresh the page or sign in again."
      );
      return null;
    }
    return profile;
  };

  const handleGenerateAssignment = async () => {
    if (!lesson || generatingAssignment) return;
    const user = profile as any;
    if (!user) return;
    setGeneratingAssignment(true);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "assignment",
          topic: lesson.title,
          gradeLevel: lesson.grade_level || "JSS1–SS3",
          subject:
            lesson.subject || lesson.courses?.title || "Coding & Technology",
          courseName: lesson.courses?.title || undefined,
          programName: lesson.courses?.programs?.name || undefined,
          assignmentType: "homework",
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Generation failed");
      const data = payload.data;
      if (data) {
        const db = createClient();
        let resolvedSchoolId: string | null = user.school_id ?? null;
        if (!resolvedSchoolId && user.role === "teacher") {
          const { data: tsRows } = await db
            .from("teacher_schools")
            .select("school_id")
            .eq("teacher_id", user.id)
            .limit(1);
          resolvedSchoolId = (tsRows?.[0] as any)?.school_id ?? null;
        }

        const { resolveAssignmentTermId } = await import(
          "@/lib/assignments/session"
        );
        const assignmentTermId = await resolveAssignmentTermId(db as any, {
          classId: lesson.class_id ?? (user as any).class_id ?? null,
        });
        const assignmentPayload: any = {
          title: data.title || `${lesson.title} Assignment`,
          instructions: data.instructions || "",
          course_id: lesson.course_id,
          lesson_id: lesson.id,
          lesson_plan_id: lesson.lesson_plan_id ?? undefined,
          class_id: lesson.class_id ?? undefined,
          curriculum_week_number: lesson.curriculum_week_number ?? undefined,
          assignment_type: data.assignment_type || "homework",
          max_points: 100,
          is_active: true,
          created_by: user.id,
          term_id: assignmentTermId,
          metadata: {
            ...(data.metadata || {
              deliverables: data.metadata?.deliverables || [],
              rubric: data.metadata?.rubric || [],
            }),
            ...(lesson.lesson_plan_id
              ? { lesson_plan_id: lesson.lesson_plan_id }
              : {}),
            ...(lesson.curriculum_week_number
              ? { week: lesson.curriculum_week_number }
              : {}),
            ...(assignmentTermId ? { term_id: assignmentTermId } : {}),
          },
        };
        if (resolvedSchoolId) {
          assignmentPayload.school_id = resolvedSchoolId;
        }

        const assignmentRes = await fetch("/api/assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(assignmentPayload),
        });
        const assignmentJson = await assignmentRes.json().catch(() => ({}));
        if (!assignmentRes.ok || !assignmentJson.data) {
          throw new Error(assignmentJson.error || "Failed to save assignment");
        }
        const newAsgn = assignmentJson.data;

        // Auto-add assignment-block in content_layout of the lesson if not already existing
        const existingBlocks = lesson.content_layout || [];
        const hasAsgnBlock = existingBlocks.some(
          (b: any) => b.type === "assignment-block"
        );
        if (!hasAsgnBlock) {
          const asgnMeta = newAsgn.metadata as {
            deliverables?: string[];
          } | null;
          const newBlock = {
            type: "assignment-block",
            title: newAsgn.title,
            instructions: newAsgn.instructions,
            deliverables: asgnMeta?.deliverables || [],
          };
          const updatedLayout = [...existingBlocks, newBlock];
          await db
            .from("lessons")
            .update({ content_layout: updatedLayout })
            .eq("id", id);
          setLesson((prev: any) => ({
            ...prev,
            content_layout: updatedLayout,
          }));
        }

        const { data: cAsgns } = await db
          .from("assignments")
          .select(
            "id, title, assignment_type, due_date, instructions, description, metadata, max_points"
          )
          .eq("lesson_id", lesson.id);
        setCourseAssignments(cAsgns ?? []);
        alert("AI assignment generated successfully and added to this lesson!");
      }
    } catch (e: any) {
      alert(e.message ?? "Failed to generate assignment. Please try again.");
    } finally {
      setGeneratingAssignment(false);
    }
  };

  const handleGenerateFlashcards = async () => {
    if (!lesson || generatingFlashcards) return;
    const user = profile as any;
    if (!user) return;
    setGeneratingFlashcards(true);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "flashcard",
          topic: lesson.title,
          gradeLevel: lesson.grade_level || "JSS1–SS3",
          subject:
            lesson.subject || lesson.courses?.title || "Coding & Technology",
          difficulty: "medium",
          questionCount: 10,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Generation failed");
      const data = payload.data;
      if (data && data.cards && data.cards.length > 0) {
        const db = createClient();
        let resolvedSchoolId: string | null = user.school_id ?? null;
        if (!resolvedSchoolId && user.role === "teacher") {
          const { data: tsRows } = await db
            .from("teacher_schools")
            .select("school_id")
            .eq("teacher_id", user.id)
            .limit(1);
          resolvedSchoolId = (tsRows?.[0] as any)?.school_id ?? null;
        }

        const deckPayload: any = {
          title: `${lesson.title} - Study Deck`,
          lesson_id: lesson.id,
          course_id: lesson.course_id,
          created_by: user.id,
          ...(lesson.class_id && lesson.lesson_plan_id
            ? {
                class_id: lesson.class_id,
                lesson_plan_id: lesson.lesson_plan_id,
                curriculum_week_number: lesson.curriculum_week_number ?? null,
              }
            : {}),
        };
        if (resolvedSchoolId) {
          deckPayload.school_id = resolvedSchoolId;
        }

        const deckRes = await fetch("/api/flashcards/decks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(deckPayload),
        });
        const deckData = await deckRes.json();
        if (!deckRes.ok)
          throw new Error(deckData.error ?? "Failed to create flashcard deck");

        const deckId = deckData.data.id;

        for (const card of data.cards) {
          await fetch(`/api/flashcards/decks/${deckId}/cards`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              front: card.front,
              back: card.back,
              tags: card.tags || [],
              difficulty_level: card.difficulty || "medium",
            }),
          });
        }

        const { resolveAssignmentTermId, matchesAssignmentSession } =
          await import("@/lib/assignments/session");
        const liveTermId = await resolveAssignmentTermId(db as any, {
          classId: lesson.class_id ?? (user as any).class_id ?? null,
        });
        const { data: fDecks } = await db
          .from("flashcard_decks")
          .select("id, title, term_id, flashcard_cards(count)")
          .eq("lesson_id", id);
        setFlashcardDecks(
          ((fDecks ?? []) as any[]).filter((d) =>
            matchesAssignmentSession(d.term_id, liveTermId, true)
          )
        );
        alert("AI study flashcards deck generated successfully!");
      }
    } catch (e: any) {
      alert(e.message ?? "Failed to generate flashcards. Please try again.");
    } finally {
      setGeneratingFlashcards(false);
    }
  };

  const handleAddResource = async () => {
    if (!newResource.title.trim() || !newResource.file_url.trim()) return;
    setSavingResource(true);
    try {
      const res = await fetch(`/api/lessons/${id}/materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newResource),
      });
      if (!res.ok) throw new Error("Failed to add resource");
      const { data } = await res.json();
      setMaterials((prev) => [...prev, data]);
      setNewResource({ title: "", file_url: "", file_type: "link" });
      setAddingResource(false);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSavingResource(false);
    }
  };

  const handleDeleteResource = async (mid: string) => {
    if (!confirm("Remove this resource?")) return;
    const res = await fetch(`/api/lessons/${id}/materials/${mid}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      alert(payload.error || "Failed to remove this resource");
      return;
    }
    setMaterials((prev) => prev.filter((m) => m.id !== mid));
  };

  // Upload a view-only slide deck. Teachers can upload EITHER a single PDF
  // (PowerPoint → "Save as PDF") OR multiple slide images. Each file → R2; we store
  // the R2 key(s) on a 'slide-deck' material. The /api/files/upload public_url is
  // /api/media/<key>; we strip that prefix to get the key the viewer streams.
  const handleAddSlideDeck = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    if (!deckTitle.trim()) {
      alert("Give the slides a title first.");
      return;
    }
    const files = Array.from(fileList);
    const isPdf = files.length === 1 && files[0].type === "application/pdf";
    setDeckUploading(true);
    setDeckProgress("");
    try {
      const keys: string[] = [];
      for (let n = 0; n < files.length; n++) {
        setDeckProgress(
          files.length > 1
            ? `Uploading ${n + 1} of ${files.length}…`
            : "Uploading…"
        );
        const fd = new FormData();
        fd.append("file", files[n]);
        const up = await fetch("/api/files/upload", {
          method: "POST",
          body: fd,
        });
        const payload = await up.json();
        if (!up.ok) throw new Error(payload.error || "Upload failed");
        const publicUrl: string = payload.data.public_url || "";
        const key =
          payload.data.storage_path ||
          publicUrl.replace(/^.*\/api\/media\//, "");
        if (key) keys.push(key);
      }
      if (keys.length === 0) throw new Error("No slides uploaded");
      const fileUrl = isPdf
        ? JSON.stringify({ pdf: keys[0] })
        : JSON.stringify({ slides: keys });
      const res = await fetch(`/api/lessons/${id}/materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: deckTitle.trim(),
          file_type: "slide-deck",
          file_url: fileUrl,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to save slides");
      }
      const { data } = await res.json();
      setMaterials((prev) => [...prev, data]);
      setDeckTitle("");
    } catch (e: any) {
      alert(e.message ?? "Slide upload failed");
    } finally {
      setDeckUploading(false);
      setDeckProgress("");
    }
  };

  const parseDeck = (fileUrl: string): { pdf?: string; slides?: string[] } => {
    try {
      const p = JSON.parse(fileUrl);
      return {
        pdf: typeof p?.pdf === "string" ? p.pdf : undefined,
        slides: Array.isArray(p?.slides) ? p.slides : undefined,
      };
    } catch {
      return {};
    }
  };

  useEffect(() => {
    const mainEl = document.querySelector("main");
    if (!mainEl) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = mainEl;
      const progress = (scrollTop / (scrollHeight - clientHeight)) * 100;
      setScrollProgress(progress);
    };

    mainEl.addEventListener("scroll", handleScroll);
    return () => mainEl.removeEventListener("scroll", handleScroll);
  }, []);

  const nextLesson = useMemo(() => {
    if (!id || courseLessons.length === 0) return null;
    const idx = courseLessons.findIndex((l) => l.id === id);
    return idx !== -1 && idx < courseLessons.length - 1
      ? courseLessons[idx + 1]
      : null;
  }, [id, courseLessons]);

  const isStaff = profile?.role === "admin" || profile?.role === "teacher";

  const fetchData = useCallback(async () => {
    const user = profile as any;
    if (!id || !user) return;
    const db = createClient();
    try {
      const { data: lessonData, error: lErr } = await db
        .from("lessons")
        .select(
          `
          *, 
          lesson_notes, 
          courses (
            id, 
            title, 
            program_id,
            programs ( id, name )
          ), 
          portal_users!lessons_created_by_fkey ( full_name )
        `
        )
        .eq("id", id)
        .maybeSingle();

      if (lErr) throw lErr;
      if (!lessonData) {
        setError("Lesson not found");
        return;
      }
      const lessonObj = lessonData as any;

      // If the user is a student, check if their class has a course lock focus active
      if (user.role === "student" && user.class_id) {
        const { data: clsData } = await db
          .from("classes")
          .select("current_course_id")
          .eq("id", user.class_id)
          .maybeSingle();
        if (
          clsData?.current_course_id &&
          clsData.current_course_id !== lessonObj.course_id
        ) {
          setError("This lesson is not active for your class yet.");
          return;
        }
      }

      setLesson(lessonObj);

      const assignmentQuery = db
        .from("assignments")
        .select(
          "id, title, assignment_type, due_date, instructions, description, metadata, max_points, term_id, lesson_id, lesson_plan_id, curriculum_week_number"
        );
      const scopedAssignmentQuery = lessonObj.lesson_plan_id
        ? assignmentQuery.or(
            `lesson_id.eq.${lessonObj.id},lesson_plan_id.eq.${lessonObj.lesson_plan_id}`
          )
        : assignmentQuery.eq("lesson_id", lessonObj.id);
      const materialsRes = await db
        .from("lesson_materials")
        .select("*")
        .eq("lesson_id", id)
        .order("created_at", { ascending: true });
      setMaterials(materialsRes.data ?? []);

      if (lessonObj.course_id) {
        const { resolveAssignmentTermId, matchesAssignmentSession } =
          await import("@/lib/assignments/session");
        const { loadAcademicTermBounds, filterCbtExamsByAcademicTerm } =
          await import("@/lib/cbt/session");
        const liveTermId = await resolveAssignmentTermId(db as any, {
          classId: lessonObj.class_id ?? user.class_id ?? null,
        });
        const termBounds = await loadAcademicTermBounds(db as any, liveTermId);
        const [cLessons, cAsgns, cQuizzes, fDecks] = await Promise.all([
          db
            .from("lessons")
            .select("id, title, order_index, lesson_type")
            .eq("course_id", lessonObj.course_id)
            .order("order_index", { ascending: true }),
          scopedAssignmentQuery,
          // cbt_exams has no total_points column; asking for it failed this read, so the lesson
          // page showed no exams at all. Nothing rendered the value.
          db
            .from("cbt_exams")
            .select(
              "id, title, duration_minutes, term_id, metadata, start_date, end_date"
            )
            .eq(
              "program_id",
              lessonObj.courses?.program_id ||
                lessonObj.courses?.programs?.id ||
                ""
            ),
          db
            .from("flashcard_decks")
            .select("id, title, term_id, flashcard_cards(count)")
            .eq("lesson_id", id),
        ]);
        setCourseLessons(cLessons.data ?? []);
        const lessonWeek = Number(
          lessonObj.curriculum_week_number ??
            lessonObj.metadata?.week ??
            lessonObj.metadata?.week_number
        );
        setCourseAssignments(
          ((cAsgns.data ?? []) as any[]).filter((assignment) => {
            if (!matchesAssignmentSession(assignment.term_id, liveTermId, true))
              return false;
            if (assignment.lesson_id === lessonObj.id) return true;
            const assignmentWeek = Number(
              assignment.curriculum_week_number ??
                assignment.metadata?.week ??
                assignment.metadata?.week_number
            );
            return (
              Number.isInteger(lessonWeek) && assignmentWeek === lessonWeek
            );
          })
        );
        setProgramQuizzes(
          filterCbtExamsByAcademicTerm(
            (cQuizzes.data ?? []) as any[],
            liveTermId,
            termBounds,
            {
              includeUntagged: true,
            }
          )
        );
        setFlashcardDecks(
          ((fDecks.data ?? []) as any[]).filter((d) =>
            matchesAssignmentSession(d.term_id, liveTermId, true)
          )
        );
      }

      if (user.role === "student") {
        const { data: progress } = await db
          .from("lesson_progress")
          .select("lesson_id, completed_at")
          .eq("portal_user_id", user.id);
        const cIds = new Set<string>();
        progress?.forEach((p: any) => {
          if (p.completed_at) cIds.add(p.lesson_id);
        });
        setCompletedIds(cIds);
        if (cIds.has(id)) setCompleted(true);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id, profile]);

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!profile) {
      setError("Could not load your account. Please sign in again.");
      setLoading(false);
      return;
    }
    fetchData();
  }, [authLoading, profileLoading, profile, fetchData]);

  // Auto-fetch lesson hook once when lesson loads
  useEffect(() => {
    if (!lesson || hookFetchedRef.current) return;
    hookFetchedRef.current = true;
    setHookLoading(true);
    setHookError(null);
    fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "lesson-hook",
        topic: lesson.title,
        gradeLevel: lesson.grade_level || "JSS1–SS3",
        courseName: lesson.courses?.title || undefined,
        programName: lesson.courses?.programs?.name || undefined,
      }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || typeof payload.data?.hook !== "string" || !payload.data.hook.trim()) {
          throw new Error("Lesson opener unavailable");
        }
        return payload;
      })
      .then((payload) => setLessonHook(payload.data))
      .catch(() => {
        setHookError(
          "The optional lesson opener is temporarily unavailable. Continue with the objectives below; the prepared lesson is unaffected."
        );
      })
      .finally(() => setHookLoading(false));
  }, [lesson]);

  const handleMarkComplete = async () => {
    if (!profile || !id || marking || completed) return;
    setMarking(true);
    const timeSpent = Math.round((Date.now() - startTimeRef) / 60000);
    try {
      const res = await fetch(`/api/lessons/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeSpentMinutes: Math.max(timeSpent, 1),
          progressPercentage: 100,
        }),
      });
      if (!res.ok) throw new Error("Failed to mark complete");
      setCompleted(true);
      setCompletedIds((prev) => new Set([...prev, id]));
      setShowCelebration(true);
    } catch (e: any) {
      setMarkError(e.message);
    } finally {
      setMarking(false);
    }
  };

  // Scripts always rendered so Mermaid/KaTeX load regardless of auth/data state
  const alwaysScripts = (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"
        strategy="afterInteractive"
        onLoad={() => {
          (window as any).mermaid?.initialize({
            startOnLoad: false,
            theme: "dark",
            themeVariables: {
              background: "#0d0d1a",
              mainBkg: "#1a1a2e",
              nodeBorder: "#4f46e5",
              clusterBkg: "#16213e",
              titleColor: "#e2e8f0",
              edgeLabelBackground: "#1a1a2e",
              primaryColor: "#312e81",
              primaryTextColor: "#e2e8f0",
              primaryBorderColor: "#4f46e5",
              lineColor: "#6366f1",
              secondaryColor: "#164e63",
              tertiaryColor: "#1e293b",
              fontFamily: "Inter, sans-serif",
              fontSize: "13px",
            },
            securityLevel: "loose",
            flowchart: { htmlLabels: true, useMaxWidth: true, curve: "basis" },
          });
        }}
      />
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"
        strategy="afterInteractive"
      />
    </>
  );

  if (authLoading || profileLoading || loading)
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 mobile-page-root">
        {alwaysScripts}
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest">
          Loading lesson...
        </p>
      </div>
    );

  if (error || !lesson)
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8 text-center gap-6 mobile-page-root">
        <ExclamationTriangleIcon className="w-16 h-16 text-rose-600/20 dark:text-rose-400/20" />
        <h2 className="text-2xl font-bold text-rose-600 dark:text-rose-400">
          Could not load lesson
        </h2>
        <p className="text-muted-foreground max-w-md">
          {error ||
            "Unable to load lesson content. Please check your connection or contact support."}
        </p>
        <Link
          href="/dashboard/lessons"
          className="px-6 py-2.5 bg-card shadow-sm border border-border rounded-xl text-xs font-bold"
        >
          Back to Lessons
        </Link>
      </div>
    );

  const heroVideo =
    lesson.lesson_type === "video"
      ? (lesson.content_layout as any[])?.find((b) => b.type === "video")
      : null;
  const isCoding = lesson.lesson_type === "coding";
  const isReading = lesson.lesson_type === "reading";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row h-screen overflow-hidden mobile-page-root">
      {alwaysScripts}
      <AnimatePresence>
        {showCelebration && (
          <CompletionCelebration
            onDismiss={() => setShowCelebration(false)}
            lessonTitle={lesson?.title}
            courseTitle={lesson?.courses?.title ?? undefined}
            gradeLevel={lesson?.grade_level ?? undefined}
            objectives={
              Array.isArray(lesson?.objectives) ? lesson.objectives : undefined
            }
          />
        )}
      </AnimatePresence>
      {/* Mobile Header (Techy & Clean) */}
      <div className="md:hidden px-4 py-3 border-b border-border bg-background/80 backdrop-blur-xl flex items-center justify-between z-50 sticky top-0 gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2.5 bg-card shadow-sm rounded-xl text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 transition-all border border-border active:scale-95 shrink-0"
          >
            <RectangleGroupIcon className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-0.5">
              Lesson
            </p>
            <h2 className="text-xs font-bold text-foreground truncate max-w-[120px]">
              {lesson.title}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {lesson.lesson_notes && (
            <button
              onClick={() => setTtsOpen((v) => !v)}
              className={`p-2.5 rounded-xl border transition-all active:scale-95 ${
                ttsOpen
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "bg-card border-border text-muted-foreground hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-500/40"
              }`}
              title="Listen to lesson"
            >
              <SpeakerWaveIcon className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setAiOpen((v) => !v)}
            className={`p-2.5 rounded-xl border transition-all active:scale-95 ${
              aiOpen
                ? "bg-primary border-primary/60 text-white"
                : "bg-card border-border text-muted-foreground hover:text-primary hover:border-primary/40"
            }`}
            title="Ask AI"
          >
            <SparklesIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sidebar - Course Syllabus (Nucleus Style) */}
      <aside
        className={`fixed inset-0 z-[100] md:relative md:inset-auto transition-all duration-700 ease-in-out md:translate-x-0 ${
          sidebarOpen
            ? "translate-x-0 w-full md:w-[380px]"
            : "-translate-x-full w-full md:w-0 overflow-hidden"
        }`}
      >
        {/* Mobile Backdrop */}
        <div
          className={`md:hidden absolute inset-0 bg-slate-950/80 backdrop-blur-3xl transition-opacity duration-700 ${
            sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          onClick={() => setSidebarOpen(false)}
        />

        <div className="relative h-full bg-slate-950/50 backdrop-blur-3xl border-r border-white/10 flex flex-col w-[85%] max-w-[340px] md:w-full shadow-[40px_0_100px_rgba(0,0,0,0.5)]">
          <div className="p-10 border-b border-white/10 flex items-center justify-between bg-gradient-to-br from-white/[0.05] to-transparent">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <h2 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em]">
                  Curriculum Nucleus
                </h2>
              </div>
              <p className="font-black text-foreground text-xl leading-tight truncate max-w-[200px] tracking-tight">
                {lesson.courses?.programs?.name || "Academic Track"}
              </p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden w-12 h-12 bg-white/5 border border-white/10 rounded-2xl text-foreground flex items-center justify-center transition-all hover:bg-rose-500/20 hover:border-rose-500/30"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
            <div className="px-8 py-6 bg-white/5 border border-white/10 rounded-[32px] mb-8 shadow-3xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-3xl -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-1000" />
              <h3 className="text-xs font-black text-primary uppercase tracking-[0.2em] relative z-10">
                {lesson.courses?.title || "Course"}
              </h3>
              <div className="flex items-center gap-3 mt-3 relative z-10">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                  {courseLessons.length} units of intelligence
                </span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
            </div>

            <div className="space-y-2">
              {courseLessons.map((l, idx) => {
                const isActive = l.id === id;
                const isCompleted = completedIds.has(l.id);
                return (
                  <Link
                    key={l.id}
                    href={`/dashboard/lessons/${l.id}${
                      classId ? `?class_id=${classId}` : ""
                    }`}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-5 p-5 rounded-[24px] transition-all relative group overflow-hidden ${
                      isActive
                        ? "bg-primary/20 text-foreground border border-primary/30 shadow-2xl"
                        : "hover:bg-white/5 text-muted-foreground hover:text-white border border-transparent"
                    }`}
                  >
                    <div
                      className={`shrink-0 w-10 h-10 rounded-2xl border flex items-center justify-center text-[10px] font-black transition-all duration-500 ${
                        isCompleted
                          ? "bg-emerald-500 border-emerald-500 text-white shadow-[0_10px_20px_rgba(16,185,129,0.3)]"
                          : isActive
                          ? "bg-white text-black border-white"
                          : "border-white/10 group-hover:border-white/20 group-hover:bg-white/5"
                      }`}
                    >
                      {isCompleted ? (
                        <CheckBadgeIcon className="w-5 h-5" />
                      ) : (
                        idx + 1
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <span
                        className={`text-[12px] font-black block truncate leading-tight uppercase tracking-wide ${
                          isActive
                            ? "text-white"
                            : "group-hover:text-white transition-colors"
                        }`}
                      >
                        {l.title}
                      </span>
                      <div className="flex items-center gap-2 mt-1.5 opacity-40">
                        <span className="text-[8px] uppercase tracking-[0.2em] font-black">
                          {l.lesson_type}
                        </span>
                        {isCompleted && (
                          <span className="w-1 h-1 rounded-full bg-emerald-500" />
                        )}
                        {isCompleted && (
                          <span className="text-[8px] text-emerald-600 dark:text-emerald-400 font-black uppercase tracking-widest">
                            Mastered
                          </span>
                        )}
                      </div>
                    </div>

                    {isActive && (
                      <motion.div
                        layoutId="active-indicator"
                        className="absolute right-4 w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_10px_rgba(234,88,12,0.8)]"
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="p-10 border-t border-white/10 bg-gradient-to-t from-slate-950 to-transparent">
            <Link
              href={
                classId ? `/dashboard/classes/${classId}` : `/dashboard/lessons`
              }
              className="flex items-center justify-center gap-4 px-8 py-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[24px] text-[10px] font-black text-muted-foreground hover:text-white uppercase tracking-[0.4em] transition-all group shadow-2xl"
            >
              <ArrowLeftIcon className="w-5 h-5 transition-transform group-hover:-translate-x-2" />
              {classId ? "Return to Class" : "System Exit"}
            </Link>
          </div>
        </div>
      </aside>

      <main
        className={`flex-1 overflow-y-auto relative custom-scrollbar scroll-smooth ${
          isCinemaMode
            ? ""
            : "pb-[calc(var(--app-bottom-nav-height)+var(--app-sticky-actions-height)+0.5rem)] md:pb-0"
        } ${isCinemaMode ? "bg-background" : "bg-background"}`}
      >
        {/* Dynamic Progress Indicator — sits below mobile lesson header */}
        <div className="fixed top-[52px] md:top-0 left-0 right-0 h-1.5 z-[100]">
          <motion.div
            className="h-full bg-gradient-to-r from-primary to-primary via-indigo-500 to-primary shadow-[0_0_15px_rgba(6,182,212,0.5)]"
            style={{ width: `${scrollProgress}%` }}
          />
        </div>
        {/* Video Hero — handles both YouTube links and R2-uploaded videos */}
        {lesson.lesson_type === "video" && heroVideo && (
          <VideoPlayer
            url={heroVideo.url}
            title={lesson.title}
            cinemaMode
            onCinemaModeChange={setIsCinemaMode}
            className="w-full border-b border-border"
          />
        )}

        {!isCinemaMode && (
          <div
            className={`max-w-6xl mx-auto px-4 sm:px-16 py-8 sm:py-24 space-y-10 sm:space-y-20 ${
              isReading ? "max-w-4xl" : ""
            }`}
          >
            {/* Header */}
            <header className="space-y-12 sm:space-y-20 animate-in fade-in slide-in-from-top-12 duration-1000 relative">
              <div className="absolute -left-20 -top-20 w-96 h-96 bg-primary/10 blur-[120px] rounded-full pointer-events-none" />

              <div className="flex flex-wrap items-center gap-5 sm:gap-8">
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="hidden md:flex w-16 h-16 bg-white/5 border border-white/10 rounded-2xl text-muted-foreground hover:text-primary hover:border-primary/30 transition-all shadow-2xl group items-center justify-center backdrop-blur-xl"
                >
                  <BoltIcon className="w-8 h-8 group-hover:rotate-12 transition-transform duration-500" />
                </button>
                {(lesson.lesson_plan_id || lesson.metadata?.lesson_plan_id) &&
                  isStaff && (
                    <Link
                      href={`/dashboard/lesson-plans/${
                        lesson.lesson_plan_id || lesson.metadata.lesson_plan_id
                      }`}
                      className="flex items-center gap-2 px-4 py-1.5 bg-primary/10 border border-primary/20 rounded-full text-[10px] font-black text-primary hover:bg-primary/20 transition-all uppercase tracking-widest"
                    >
                      <AcademicCapIcon className="w-3.5 h-3.5" /> View Plan
                    </Link>
                  )}
                {classId && isStaff && (
                  <Link
                    href={buildClassTeachingHref({
                      classId,
                      courseId: lesson.course_id,
                    })}
                    className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-700 transition-all hover:bg-emerald-500/20 dark:text-emerald-300"
                  >
                    <CheckCircleIcon className="h-3.5 w-3.5" /> Week package
                  </Link>
                )}
                <div
                  className={`px-6 py-2 rounded-full text-[10px] sm:text-[11px] font-black border uppercase tracking-[0.3em] shadow-3xl ${
                    TYPE_COLOR[lesson.lesson_type] ||
                    "bg-muted text-foreground border-border"
                  }`}
                >
                  {lesson.lesson_type}
                </div>
                {lesson.duration_minutes && (
                  <div className="text-[10px] sm:text-[11px] font-black text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-3 bg-card shadow-sm px-6 py-2 rounded-full border border-border">
                    <ClockIcon className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                    {lesson.duration_minutes} Min
                  </div>
                )}
                <div className="flex-1"></div>
                {completed && (
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-black text-[10px] sm:text-[11px] uppercase tracking-[0.3em] bg-emerald-500/10 px-6 py-2.5 rounded-xl border border-emerald-500/20 shadow-3xl shadow-emerald-500/20">
                    <CheckBadgeIcon className="w-5 h-5 sm:w-6 sm:h-6" /> Mastery
                  </div>
                )}
              </div>
              <div className="space-y-8">
                <h1 className="text-2xl sm:text-4xl font-black tracking-tight leading-[1.0] text-foreground selection:bg-cyan-500 selection:text-black break-words">
                  {lesson.title}
                </h1>
                <div className="h-2 w-32 bg-gradient-to-r from-primary to-primary to-transparent rounded-full opacity-40"></div>
                <div className="flex items-start gap-8 max-w-4xl">
                  <p className="text-sm sm:text-base text-muted-foreground font-medium leading-relaxed italic border-l-4 border-border pl-5 sm:pl-8 py-2">
                    {lesson.description}
                  </p>
                </div>
              </div>
            </header>
            {/* Nav Tabs — mobile strip + desktop glass tabs */}
            <MobileScrollStrip
              label="Sections"
              ariaLabel="Lesson sections"
              items={[
                {
                  id: "content",
                  label: "Lesson",
                  icon: BookOpenIcon,
                  selected: activeTab === "content",
                  onClick: () => setActiveTab("content"),
                },
                {
                  id: "materials",
                  label: "Resources",
                  icon: PaperClipIcon,
                  selected: activeTab === "materials",
                  onClick: () => setActiveTab("materials"),
                  hint: materials.length ? String(materials.length) : undefined,
                },
                {
                  id: "tasks",
                  label: "Assignments",
                  icon: ClipboardDocumentListIcon,
                  selected: activeTab === "tasks",
                  onClick: () => setActiveTab("tasks"),
                  hint:
                    courseAssignments.length + programQuizzes.length
                      ? String(courseAssignments.length + programQuizzes.length)
                      : undefined,
                },
              ]}
            />
            <div className="hidden md:flex relative pt-4 pb-12 justify-center sm:justify-start">
              <div className="flex items-center gap-1.5 sm:gap-2 bg-card/95 backdrop-blur-3xl p-2 rounded-xl border border-border w-fit shadow-3xl overflow-x-auto no-scrollbar max-w-full">
                <TabBtn
                  active={activeTab === "content"}
                  onClick={() => setActiveTab("content")}
                  icon={BookOpenIcon}
                  label="Lesson"
                />
                <TabBtn
                  active={activeTab === "materials"}
                  onClick={() => setActiveTab("materials")}
                  icon={PaperClipIcon}
                  label="Resources"
                  count={materials.length}
                />
                <TabBtn
                  active={activeTab === "tasks"}
                  onClick={() => setActiveTab("tasks")}
                  icon={ClipboardDocumentListIcon}
                  label="Assignments"
                  count={courseAssignments.length + programQuizzes.length}
                />
              </div>
            </div>

            {/* Display Area */}
            <div className="min-h-[50vh]">
              {activeTab === "content" && (
                <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 space-y-16 sm:space-y-24">
                  {/* The slide deck used to sit here, above the hook, as a
                      banner that opened a fullscreen viewer. A recap belongs
                      after the material it recaps, so it now renders inline as
                      STAGE 5, below the study notes. */}

                  {/* ── STAGE 1: HOOK — cinematic opener ────────────────── */}
                  <AnimatePresence>
                    {(hookLoading || lessonHook || hookError) && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        className="relative overflow-hidden border border-primary/20 bg-gradient-to-br from-primary/8 via-indigo-500/5 to-amber-500/5"
                      >
                        {/* Animated scanline */}
                        <motion.div
                          animate={{ x: ["-100%", "200%"] }}
                          transition={{
                            duration: 3.5,
                            repeat: Infinity,
                            ease: "linear",
                            repeatDelay: 4,
                          }}
                          className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-primary/8 to-transparent pointer-events-none z-0"
                        />
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

                        {hookLoading ? (
                          <div className="p-8 sm:p-12 flex items-center gap-4">
                            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                            <div className="space-y-1.5">
                              <div className="h-2 w-48 bg-primary/20 rounded animate-pulse" />
                              <div className="h-2 w-72 bg-muted/30 rounded animate-pulse" />
                            </div>
                          </div>
                        ) : lessonHook ? (
                            <div className="relative z-10 p-8 sm:p-12 space-y-6">
                              <div className="flex items-start gap-4">
                                <div className="shrink-0 w-10 h-10 bg-primary/20 border border-primary/30 flex items-center justify-center text-lg">
                                  🔥
                                </div>
                                <div className="space-y-1">
                                  <p className="text-[9px] font-black text-primary/70 uppercase tracking-[0.4em]">
                                    Lesson Hook
                                  </p>
                                  <h3 className="text-lg sm:text-xl font-black text-foreground leading-snug tracking-tight">
                                    {lessonHook.hook_title}
                                  </h3>
                                </div>
                              </div>
                              <BlockMarkdown
                                content={lessonHook.hook}
                                className="text-sm sm:text-base text-muted-foreground leading-relaxed pl-14"
                              />
                              <div className="grid sm:grid-cols-2 gap-3 pl-14">
                                {lessonHook.real_world_example && (
                                  <div className="flex gap-3 p-4 bg-amber-500/8 border border-amber-500/15">
                                    <span className="shrink-0 mt-0.5">🌍</span>
                                    <div>
                                      <p className="text-[9px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1">
                                        Real-World Connection
                                      </p>
                                      <p className="text-sm text-muted-foreground leading-relaxed">
                                        {lessonHook.real_world_example}
                                      </p>
                                    </div>
                                  </div>
                                )}
                                {lessonHook.challenge_question && (
                                  <div className="flex gap-3 p-4 bg-indigo-500/8 border border-indigo-500/15">
                                    <span className="shrink-0 mt-0.5">💭</span>
                                    <div>
                                      <p className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-1">
                                        Think About It
                                      </p>
                                      <p className="text-sm font-semibold text-foreground italic leading-relaxed">
                                        {lessonHook.challenge_question}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                        ) : hookError ? (
                          <div className="relative z-10 p-6 sm:p-8">
                            <p className="text-sm font-semibold leading-relaxed text-muted-foreground">
                              {hookError}
                            </p>
                          </div>
                        ) : null}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* ── STAGE 2: OBJECTIVES — scannable before diving in ─ */}
                  {lesson.objectives?.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-px w-8 bg-emerald-500/40" />
                        <p className="text-[10px] font-black text-emerald-600/70 dark:text-emerald-400/70 uppercase tracking-[0.4em]">
                          What You'll Learn
                        </p>
                        <div className="h-px flex-1 bg-emerald-500/10" />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {lesson.objectives
                          .slice(0, 6)
                          .map((obj: string, oi: number) => (
                            <motion.div
                              key={oi}
                              initial={{ opacity: 0, scale: 0.9 }}
                              whileInView={{ opacity: 1, scale: 1 }}
                              viewport={{ once: true }}
                              transition={{
                                delay: oi * 0.06,
                                type: "spring",
                                stiffness: 200,
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/8 border border-emerald-500/15 hover:border-emerald-500/30 transition-colors group"
                            >
                              <CheckCircleIcon className="w-3 h-3 text-emerald-600/60 dark:text-emerald-400/60 shrink-0 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" />
                              <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                                {obj}
                              </span>
                            </motion.div>
                          ))}
                      </div>
                    </motion.div>
                  )}

                  {/* ── STAGE 3: VISUAL JOURNEY — the main lesson experience */}
                  {(lesson.content_layout || []).length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="h-px w-8 bg-cyan-500/40" />
                        <p className="text-[10px] font-black text-cyan-600/70 dark:text-cyan-400/70 uppercase tracking-[0.4em]">
                          Lesson Content
                        </p>
                        <div className="h-px flex-1 bg-cyan-500/10" />
                        <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest">
                          {lesson.content_layout.length} blocks
                        </span>
                      </div>
                      <CanvaRenderer
                        blocks={lesson.content_layout || []}
                        lessonType={lesson.lesson_type}
                        onInteraction={handleInteraction}
                        onExplainRequest={(text) => {
                          setExplainRequest(`${text}__${Date.now()}`);
                          setAiOpen(true);
                        }}
                        lessonContext={{
                          lessonTitle: lesson.title,
                          courseTitle: lesson.courses?.title ?? undefined,
                          gradeLevel: lesson.grade_level ?? undefined,
                        }}
                        courseAssignments={courseAssignments}
                      />
                    </div>
                  )}

                  {/* ── STAGE 4: STUDY NOTES — collapsible deep-dive ────── */}
                  <div className="space-y-4">
                    <button
                      onClick={() => setNotesExpanded((e) => !e)}
                      className="w-full flex items-center gap-4 group text-left"
                    >
                      <div className="h-px w-8 bg-indigo-500/40" />
                      <p className="text-[10px] font-black text-indigo-600/70 dark:text-indigo-400/70 uppercase tracking-[0.4em] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        Study Notes & Reference
                      </p>
                      <div className="h-px flex-1 bg-indigo-500/10" />
                      <div className="flex items-center gap-2 ml-auto shrink-0">
                        {isStaff && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGenerateNotes();
                            }}
                            disabled={generatingNotes}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[9px] font-black uppercase tracking-widest hover:bg-indigo-500/20 transition-all disabled:opacity-50"
                          >
                            {generatingNotes ? (
                              <>
                                <div className="w-2.5 h-2.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />{" "}
                                Generating…
                              </>
                            ) : (
                              <>
                                <span>✦</span>
                                {lesson.lesson_notes ? "Regen" : "Generate"}
                              </>
                            )}
                          </button>
                        )}
                        <motion.div
                          animate={{ rotate: notesExpanded ? 90 : 0 }}
                          transition={{ duration: 0.2 }}
                          className="p-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400"
                        >
                          <ChevronRightIcon className="w-3.5 h-3.5" />
                        </motion.div>
                      </div>
                    </button>

                    <AnimatePresence>
                      {notesExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{
                            duration: 0.45,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          className="overflow-hidden"
                        >
                          {lesson.lesson_notes ? (
                            <div className="bg-card border border-border border-t-2 border-t-indigo-500/40 p-8 sm:p-16 relative overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
                              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/5 blur-[100px] pointer-events-none" />
                              <div className="space-y-4">
                                <MarkdownNotes content={lesson.lesson_notes} />
                              </div>
                            </div>
                          ) : (
                            <div className="bg-card border border-dashed border-indigo-500/20 p-12 flex flex-col items-center justify-center gap-4 text-center min-h-[160px]">
                              <div className="text-3xl opacity-30">📖</div>
                              <p className="text-sm text-muted-foreground">
                                {isStaff
                                  ? 'Click "Generate" above to create study notes.'
                                  : "Study notes will appear here once published."}
                              </p>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {!notesExpanded && lesson.lesson_notes && (
                      <p className="text-[10px] text-muted-foreground/30 font-black uppercase tracking-widest text-center">
                        ~
                        {Math.ceil(
                          (lesson.lesson_notes.split(" ").length || 0) / 200
                        )}{" "}
                        min read · click to expand
                      </p>
                    )}
                  </div>

                  {/* ── STAGE 5: SLIDE RECAP — the deck, in the lesson ───── */}
                  {(() => {
                    const deckMat = materials.find(
                      (m: any) => m.file_type === "slide-deck"
                    );
                    if (!deckMat) return null;
                    const deck = parseDeck(deckMat.file_url);
                    const imageSlides = deck.slides ?? [];

                    // An image deck turns in place. A PDF cannot be paginated
                    // inline without shipping a renderer into the lesson page,
                    // so that one still opens the fullscreen viewer.
                    if (imageSlides.length > 0) {
                      return (
                        <LessonSlideStrip
                          slides={imageSlides}
                          title={deckMat.title}
                          lessonId={lesson.id}
                          onOpenFullscreen={() =>
                            setViewerDeck({
                              slides: deck.slides,
                              pdf: deck.pdf,
                              title: deckMat.title,
                            })
                          }
                        />
                      );
                    }
                    if (!deck.pdf) return null;
                    return (
                      <button
                        onClick={() =>
                          setViewerDeck({
                            slides: deck.slides,
                            pdf: deck.pdf,
                            title: deckMat.title,
                          })
                        }
                        className="w-full flex items-center gap-4 p-5 bg-cyan-500/10 border border-cyan-500/25 rounded-2xl hover:bg-cyan-500/15 transition-all text-left group"
                      >
                        <PresentationChartLineIcon className="w-7 h-7 text-cyan-600 dark:text-cyan-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-widest text-cyan-700/70 dark:text-cyan-300/70">
                            Slide Recap
                          </p>
                          <p className="text-base font-black text-foreground truncate">
                            {deckMat.title}
                          </p>
                        </div>
                        <span className="px-4 py-2 text-xs font-black uppercase tracking-widest text-white bg-cyan-700 group-hover:bg-cyan-800 rounded-xl transition-all shrink-0">
                          Open
                        </span>
                      </button>
                    );
                  })()}

                  {/* Logic: Interaction Progress Check */}
                  <div className="mt-24 sm:mt-40 pt-24 border-t border-border space-y-12">
                    {!completed && (
                      <div className="max-w-xl mx-auto p-8 bg-card border border-border space-y-6">
                        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.4em]">
                          <span className="text-muted-foreground flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                            Progress
                          </span>
                          <span className="text-primary">
                            {interactions.size} interactive blocks done
                          </span>
                        </div>
                        <div className="h-1 bg-muted/50 rounded-xl overflow-hidden">
                          <motion.div
                            className="h-full bg-primary shadow-[0_0_15px_rgba(234,88,12,0.5)]"
                            initial={{ width: 0 }}
                            animate={{
                              width: `${Math.min(
                                100,
                                (interactions.size /
                                  (lesson.content_layout?.filter(
                                    (b: any) =>
                                      b.type === "quiz" || b.type === "activity"
                                  ).length || 1)) *
                                  100
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Lesson Complete & Navigation */}
                    <div className="flex flex-col items-center gap-12 sm:gap-20 text-center pb-8 sm:pb-56">
                      {!completed && profile?.role === "student" ? (
                        <div className="relative group">
                          <div className="absolute -inset-1 bg-gradient-to-r from-primary to-primary via-indigo-500 to-primary rounded-xl sm:rounded-xl blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-pulse"></div>
                          <button
                            onClick={handleMarkComplete}
                            disabled={marking}
                            className="relative px-12 sm:px-20 py-8 sm:py-12 bg-background rounded-xl sm:rounded-xl text-foreground flex flex-col items-center gap-4 transition-all active:scale-95 border border-border"
                          >
                            <div className="p-5 bg-cyan-500/20 rounded-xl text-cyan-600 dark:text-cyan-400 shadow-2xl group-hover:scale-110 transition-transform duration-500">
                              <CheckBadgeIcon className="w-10 h-10 sm:w-14 sm:h-14" />
                            </div>
                            <div>
                              <span className="text-xl sm:text-3xl font-black uppercase tracking-[0.2em]">
                                {marking ? "Saving..." : "Mark as Complete"}
                              </span>
                              <span className="block text-[10px] sm:text-[12px] opacity-40 font-black uppercase tracking-[0.4em] mt-2">
                                Mark this lesson as completed
                              </span>
                            </div>
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-8 group">
                          <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-emerald-500/10 border-4 border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-[0_0_50px_rgba(16,185,129,0.2)] group-hover:scale-110 transition-transform duration-700">
                            <CheckBadgeIcon className="w-12 h-12 sm:w-20 sm:h-20" />
                          </div>
                          <div className="space-y-2">
                            <h4 className="text-3xl sm:text-4xl font-black text-foreground italic tracking-tighter">
                              Lesson Completed
                            </h4>
                            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                              Progress saved
                            </p>
                          </div>
                        </div>
                      )}

                      {nextLesson && (
                        <div className="w-full max-w-4xl bg-background border border-border rounded-xl p-10 sm:p-20 space-y-10 sm:space-y-14 group hover:border-cyan-500/20 transition-all shadow-3xl relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-600/5 blur-[120px] -mr-32 -mt-32 pointer-events-none" />
                          <div className="space-y-6 relative z-10">
                            <div className="flex items-center justify-center gap-4">
                              <div className="h-px w-12 bg-cyan-500/30" />
                              <h5 className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground">
                                Next Lesson
                              </h5>
                              <div className="h-px w-12 bg-cyan-500/30" />
                            </div>
                            <h3 className="text-3xl sm:text-5xl font-black text-foreground group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors tracking-tighter leading-none">
                              {nextLesson.title}
                            </h3>
                            <div className="flex items-center justify-center gap-6">
                              <span className="px-6 py-2 bg-card shadow-sm rounded-full text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                {nextLesson.lesson_type}
                              </span>
                              <span className="text-[10px] font-black text-cyan-600/30 dark:text-cyan-400/30 uppercase tracking-[0.3em]">
                                Module{" "}
                                {courseLessons.findIndex(
                                  (l) => l.id === nextLesson.id
                                ) + 1}{" "}
                                of {courseLessons.length}
                              </span>
                            </div>
                          </div>
                          <Link
                            href={`/dashboard/lessons/${nextLesson.id}${
                              classId ? `?class_id=${classId}` : ""
                            }`}
                            className="relative z-10 inline-flex items-center gap-4 px-12 sm:px-16 py-6 sm:py-8 bg-card text-foreground font-black uppercase text-[12px] sm:text-[14px] tracking-[0.3em] rounded-xl hover:bg-cyan-500 hover:text-foreground transition-all shadow-[0_20px_60px_rgba(255,255,255,0.1)] active:scale-95 group/btn"
                          >
                            Start Lesson{" "}
                            <ChevronRightIcon className="w-5 h-5 transition-transform group-hover/btn:translate-x-2" />
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "materials" && (
                <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* Staff: add resource */}
                  {isStaff && (
                    <div className="bg-card border border-white/[0.08] rounded-2xl p-4">
                      {addingResource ? (
                        <div className="space-y-3">
                          <p className="text-xs font-bold text-card-foreground/60 uppercase tracking-widest">
                            Add Resource
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <input
                              type="text"
                              placeholder="Title"
                              value={newResource.title}
                              onChange={(e) =>
                                setNewResource((r) => ({
                                  ...r,
                                  title: e.target.value,
                                }))
                              }
                              className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50"
                            />
                            <input
                              type="url"
                              placeholder="URL (video, PDF, doc, link…)"
                              value={newResource.file_url}
                              onChange={(e) =>
                                setNewResource((r) => ({
                                  ...r,
                                  file_url: e.target.value,
                                }))
                              }
                              className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50"
                            />
                            <select
                              value={newResource.file_type}
                              onChange={(e) =>
                                setNewResource((r) => ({
                                  ...r,
                                  file_type: e.target.value,
                                }))
                              }
                              className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50"
                            >
                              <option value="link">Link</option>
                              <option value="video">Video</option>
                              <option value="pdf">PDF</option>
                              <option value="doc">Document</option>
                              <option value="image">Image</option>
                              <option value="audio">Audio</option>
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={handleAddResource}
                              disabled={
                                savingResource ||
                                !newResource.title.trim() ||
                                !newResource.file_url.trim()
                              }
                              className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all"
                            >
                              {savingResource ? "Adding…" : "Add Resource"}
                            </button>
                            <button
                              onClick={() => {
                                setAddingResource(false);
                                setNewResource({
                                  title: "",
                                  file_url: "",
                                  file_type: "link",
                                });
                              }}
                              className="px-4 py-1.5 bg-white/5 hover:bg-white/10 text-card-foreground/60 text-xs font-bold rounded-xl transition-all"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingResource(true)}
                          className="flex items-center gap-2 text-xs font-bold text-primary hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
                        >
                          <PlusIcon className="w-4 h-4" /> Add Resource (video,
                          PDF, link…)
                        </button>
                      )}
                    </div>
                  )}

                  {/* Staff: upload a view-only slide deck */}
                  {isStaff && (
                    <div
                      id="learning-slides"
                      className="scroll-mt-28 bg-card border border-violet-500/15 rounded-2xl p-4"
                    >
                      <p className="text-xs font-black text-violet-700 dark:text-violet-300 uppercase tracking-widest mb-1">
                        📊 Slides (view-only)
                      </p>
                      <p className="text-[11px] text-card-foreground/40 mb-3">
                        Upload your slides as a{" "}
                        <b className="text-violet-700/80 dark:text-violet-300/80">
                          PDF
                        </b>{" "}
                        (in PowerPoint: File → Save as PDF) or as images.
                        Students view them in-platform — they can't download or
                        save them.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          placeholder="Slides title"
                          value={deckTitle}
                          onChange={(e) => setDeckTitle(e.target.value)}
                          className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500/50"
                        />
                        <label
                          className={`px-4 py-2 text-xs font-black uppercase tracking-widest text-white rounded-xl cursor-pointer text-center transition-all ${
                            deckUploading
                              ? "bg-violet-500/40 cursor-wait"
                              : "bg-violet-600 hover:bg-violet-500"
                          }`}
                        >
                          {deckUploading
                            ? deckProgress || "Uploading…"
                            : "Upload PDF / Images"}
                          <input
                            type="file"
                            className="hidden"
                            accept="application/pdf,image/*"
                            multiple
                            disabled={deckUploading}
                            onChange={(e) => {
                              handleAddSlideDeck(e.target.files);
                              e.currentTarget.value = "";
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Resource list */}
                  {materials.length === 0 ? (
                    <div className="py-20 text-center bg-card border border-dashed border-white/[0.08] rounded-2xl">
                      <PaperClipIcon className="w-10 h-10 mx-auto text-card-foreground/20 mb-3" />
                      <p className="text-sm font-bold text-card-foreground/40">
                        No resources linked to this lesson yet.
                      </p>
                      {isStaff && (
                        <p className="text-xs text-card-foreground/30 mt-1">
                          Use "Add Resource" above to attach videos, PDFs or
                          links.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {materials.map((m: any) => {
                        // View-only slide deck — opens the in-platform SlideViewer (no download).
                        if (m.file_type === "slide-deck") {
                          const deck = parseDeck(m.file_url);
                          const hasContent =
                            !!deck.pdf || (deck.slides?.length ?? 0) > 0;
                          const label = deck.pdf
                            ? "PDF · view-only"
                            : `${deck.slides?.length ?? 0} slides · view-only`;
                          return (
                            <div
                              key={m.id}
                              className="group bg-white/5 border border-violet-500/20 rounded-[32px] p-6 flex items-center gap-6 hover:border-violet-500/50 hover:bg-white/10 transition-all duration-500 shadow-xl"
                            >
                              <div className="p-4 rounded-2xl flex-shrink-0 bg-violet-500/10 text-violet-700 dark:text-violet-300 transition-transform duration-500 group-hover:scale-110">
                                <PaperClipIcon className="w-6 h-6" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-violet-700/60 dark:text-violet-300/60 mb-1">
                                  Slides · {label}
                                </p>
                                <p className="text-base font-black text-foreground truncate">
                                  {m.title}
                                </p>
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0">
                                <button
                                  onClick={() =>
                                    hasContent &&
                                    setViewerDeck({
                                      slides: deck.slides,
                                      pdf: deck.pdf,
                                      title: m.title,
                                    })
                                  }
                                  disabled={!hasContent}
                                  className="px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 rounded-xl transition-all"
                                >
                                  View Slides
                                </button>
                                {isStaff && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setManageDeck(m);
                                    }}
                                    className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white rounded-xl transition-all"
                                    title="Manage slides"
                                  >
                                    <PencilSquareIcon className="w-5 h-5" />
                                  </button>
                                )}
                                {isStaff && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteResource(m.id);
                                    }}
                                    className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-rose-500/20 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 rounded-xl transition-all"
                                    title="Remove deck"
                                  >
                                    <TrashIcon className="w-5 h-5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        }
                        const isVideo = m.file_type === "video";
                        const isPdf = m.file_type === "pdf";
                        const iconColor = isVideo
                          ? "bg-red-500/10 text-red-600 dark:text-red-400"
                          : isPdf
                          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                          : "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400";
                        const Icon = isVideo
                          ? VideoCameraIcon
                          : isPdf
                          ? DocumentIcon
                          : PaperClipIcon;
                        return (
                          <div
                            key={m.id}
                            onClick={() => setViewerItem(m)}
                            className="group bg-white/5 border border-white/10 rounded-[32px] p-6 flex items-center gap-6 hover:border-primary/40 hover:bg-white/10 transition-all duration-500 cursor-pointer shadow-xl"
                          >
                            <div
                              className={`p-4 rounded-2xl flex-shrink-0 ${iconColor} transition-transform duration-500 group-hover:scale-110`}
                            >
                              <Icon className="w-6 h-6" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground mb-1">
                                {m.file_type || "Academic Asset"}
                              </p>
                              <p className="text-base font-black text-foreground truncate group-hover:text-primary transition-colors">
                                {m.title}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(m.file_url, "_blank");
                                }}
                                className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white rounded-xl transition-all"
                              >
                                <ArrowDownTrayIcon className="w-5 h-5" />
                              </button>
                              {isStaff && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteResource(m.id);
                                  }}
                                  className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-rose-500/20 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 rounded-xl transition-all"
                                  title="Purge Asset"
                                >
                                  <TrashIcon className="w-5 h-5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Library link */}
                  <div className="flex items-center gap-2 pt-2">
                    <Link
                      href="/dashboard/library"
                      className="text-xs text-primary hover:text-violet-700 dark:hover:text-violet-300 font-bold transition-colors"
                    >
                      Browse Content Library →
                    </Link>
                  </div>
                </div>
              )}

              {activeTab === "tasks" && (
                <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-8">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest flex items-center gap-2 px-4 py-1.5 bg-amber-500/5 border border-amber-500/10 w-fit">
                        <ClipboardDocumentListIcon className="w-4 h-4" />{" "}
                        Assignments
                      </h3>
                      {isStaff && (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Link
                            href={buildAssignmentNewHref({
                              classId,
                              courseId: lesson.course_id,
                              lessonPlanId: lesson.lesson_plan_id,
                              lessonId: lesson.id,
                              week: lesson.curriculum_week_number,
                            })}
                            className="flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-amber-800"
                          >
                            <PlusIcon className="h-3.5 w-3.5" /> Assignment
                          </Link>
                          <Link
                            href={buildProjectNewHref({
                              classId,
                              courseId: lesson.course_id,
                              schoolId: lesson.school_id,
                              lessonPlanId: lesson.lesson_plan_id,
                              lessonId: lesson.id,
                              week: lesson.curriculum_week_number,
                            })}
                            className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold uppercase tracking-widest text-foreground"
                          >
                            <RocketLaunchIcon className="h-3.5 w-3.5" /> Project
                          </Link>
                        </div>
                      )}
                    </div>
                    {courseAssignments.length === 0 ? (
                      <div className="flex flex-col items-center gap-3 py-12 text-center bg-card/40 backdrop-blur-md border border-white/5 rounded-2xl shadow-2xl relative overflow-hidden p-8 sm:p-12">
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none" />
                        <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-amber-600 dark:text-amber-400 mb-4 animate-pulse">
                          <ClipboardDocumentListIcon className="w-8 h-8" />
                        </div>
                        <h4 className="text-xl font-black text-foreground uppercase tracking-wider">
                          AI Assignment Suggester
                        </h4>
                        <p className="text-muted-foreground text-xs max-w-md mx-auto mb-6 leading-relaxed">
                          No assignment or project is linked yet. Generate a
                          focused assignment here, or create a separate
                          practical project from the actions above.
                        </p>
                        {isStaff ? (
                          <div className="flex flex-wrap items-center justify-center gap-3">
                            <button
                              onClick={handleGenerateAssignment}
                              disabled={generatingAssignment}
                              className="px-6 py-3 bg-gradient-to-r from-amber-700 to-amber-700 hover:from-amber-800 hover:to-amber-800 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-amber-500/20 active:scale-95 flex items-center gap-2"
                            >
                              {generatingAssignment ? (
                                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                "✦ AI Generate Assignment"
                              )}
                            </button>
                            <Link
                              href={buildAssignmentNewHref({
                                classId,
                                courseId: lesson.course_id,
                                lessonPlanId: lesson.lesson_plan_id,
                                lessonId: lesson.id,
                                week: lesson.curriculum_week_number,
                              })}
                              className="px-5 py-3 border border-border bg-background/40 hover:bg-card text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 font-black text-xs uppercase tracking-widest rounded-xl transition-all active:scale-95"
                            >
                              Manual Create
                            </Link>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            Your teacher hasn't released any assignment tasks
                            yet.
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4">
                        {courseAssignments.map((a: any) => (
                          <Link
                            key={a.id}
                            href={`/dashboard/assignments/${a.id}`}
                            className="p-8 sm:p-10 bg-background border border-border rounded-xl hover:bg-amber-500/[0.03] hover:border-amber-500/30 transition-all group flex items-center justify-between gap-8 shadow-2xl relative overflow-hidden"
                          >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-600/5 blur-3xl rounded-full" />
                            <div className="flex items-center gap-10 relative z-10">
                              <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform shadow-xl hidden sm:flex">
                                <DocumentTextIcon className="w-8 h-8" />
                              </div>
                              <div className="space-y-2">
                                <h4 className="font-black text-2xl text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors tracking-tight">
                                  {a.title}
                                </h4>
                                <div className="flex flex-wrap items-center gap-4 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                                  <span className="px-3 py-1 bg-card shadow-sm rounded-xl text-amber-600/60 dark:text-amber-400/60 font-black">
                                    {a.assignment_type}
                                  </span>
                                  <span className="w-1.5 h-1.5 rounded-full bg-muted"></span>
                                  <span
                                    className={
                                      a.due_date &&
                                      new Date(a.due_date) < new Date()
                                        ? "text-rose-600 dark:text-rose-400 animate-pulse"
                                        : "text-muted-foreground"
                                    }
                                  >
                                    {a.due_date
                                      ? `Deadline: ${new Date(
                                          a.due_date
                                        ).toLocaleDateString()}`
                                      : "No deadline"}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="w-12 h-12 rounded-xl bg-card shadow-sm border border-border flex items-center justify-center text-muted-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400 group-hover:border-amber-500/40 group-hover:translate-x-1 transition-all shadow-xl">
                              <ChevronRightIcon className="w-6 h-6" />
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-6 pt-12 border-t border-border">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-2 px-4 py-1.5 bg-emerald-500/5 border border-emerald-500/10 w-fit">
                        <SparklesIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />{" "}
                        Study Flashcard Decks
                      </h3>
                      {isStaff && (
                        <button
                          onClick={handleGenerateFlashcards}
                          disabled={generatingFlashcards}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
                        >
                          {generatingFlashcards ? (
                            <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <PlusIcon className="w-3.5 h-3.5" />
                          )}
                          {generatingFlashcards
                            ? "Generating..."
                            : "AI Generate Decks"}
                        </button>
                      )}
                    </div>
                    {flashcardDecks.length === 0 ? (
                      <div className="flex flex-col items-center gap-3 py-12 text-center bg-card/40 backdrop-blur-md border border-white/5 rounded-2xl shadow-2xl relative overflow-hidden p-8 sm:p-12">
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
                        <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4 animate-pulse">
                          <SparklesIcon className="w-8 h-8" />
                        </div>
                        <h4 className="text-xl font-black text-foreground uppercase tracking-wider">
                          AI Study Flashcards
                        </h4>
                        <p className="text-muted-foreground text-xs max-w-md mx-auto mb-6 leading-relaxed">
                          No flashcard study decks linked to this lesson yet.
                          Generate a customized set of spaced-repetition
                          flashcards matching this topic for rapid recall.
                        </p>
                        {isStaff ? (
                          <button
                            onClick={handleGenerateFlashcards}
                            disabled={generatingFlashcards}
                            className="px-6 py-3 bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-800 hover:to-teal-800 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center gap-2"
                          >
                            {generatingFlashcards ? (
                              <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              "✦ AI Generate Study Deck"
                            )}
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            Spaced-repetition study decks will appear here once
                            your teacher generates them.
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {flashcardDecks.map((deck: any) => {
                          const cardCount =
                            deck.flashcard_cards?.[0]?.count ?? 0;
                          return (
                            <div
                              key={deck.id}
                              className="p-6 bg-background border border-border rounded-xl hover:border-emerald-500/30 transition-all group flex flex-col justify-between gap-4 shadow-2xl relative overflow-hidden"
                            >
                              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-600/5 blur-3xl rounded-full" />
                              <div className="flex items-start justify-between relative z-10">
                                <div className="space-y-1">
                                  <h4 className="font-black text-lg text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors tracking-tight">
                                    {deck.title}
                                  </h4>
                                  <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
                                    {cardCount} card{cardCount !== 1 ? "s" : ""}{" "}
                                    in deck
                                  </p>
                                </div>
                                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400">
                                  <SparklesIcon className="w-5 h-5" />
                                </div>
                              </div>
                              <div className="flex items-center gap-2 w-full mt-2 relative z-10">
                                <Link
                                  href={`/dashboard/flashcards/${deck.id}/review`}
                                  className="flex-1 text-center py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs uppercase tracking-widest transition-all rounded-xl shadow-lg active:scale-95 flex items-center justify-center gap-1.5"
                                >
                                  <ArrowPathIcon className="w-3.5 h-3.5" />{" "}
                                  Study Deck
                                </Link>
                                {isStaff && (
                                  <Link
                                    href={`/dashboard/flashcards?deckId=${
                                      deck.id
                                    }&topic=${encodeURIComponent(
                                      lesson.title
                                    )}&autoGenerate=true`}
                                    className="px-4 py-2.5 bg-card hover:bg-muted border border-border text-muted-foreground text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                                  >
                                    Manage Cards
                                  </Link>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="space-y-6 pt-12 border-t border-border">
                    <h3 className="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-2 px-4 py-1.5 bg-primary/5 border border-primary/10 w-fit">
                      <AcademicCapIcon className="w-4 h-4" /> CBT Exams
                    </h3>
                    {programQuizzes.length === 0 ? (
                      <p className="text-muted-foreground text-xs italic px-4">
                        No CBT exams found for this programme.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 gap-4">
                        {programQuizzes.map((q: any) => (
                          <Link
                            key={q.id}
                            href={`/dashboard/cbt/${q.id}`}
                            className="p-8 sm:p-10 bg-background border border-border rounded-xl hover:bg-primary/[0.03] hover:border-primary/30 transition-all group flex items-center justify-between gap-8 shadow-2xl relative overflow-hidden"
                          >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full" />
                            <div className="flex items-center gap-10 relative z-10">
                              <div className="p-6 bg-primary/10 border border-primary/20 rounded-xl text-primary group-hover:scale-110 transition-transform shadow-xl hidden sm:flex">
                                <StarIcon className="w-8 h-8" />
                              </div>
                              <div className="space-y-2">
                                <h4 className="font-black text-2xl text-foreground group-hover:text-primary transition-colors tracking-tight">
                                  {q.title}
                                </h4>
                                <div className="flex flex-wrap items-center gap-4 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                                  <span className="px-3 py-1 bg-card shadow-sm rounded-xl text-primary/60 font-bold">
                                    {q.duration_minutes} min
                                  </span>
                                  <span className="w-1.5 h-1.5 rounded-full bg-muted"></span>
                                  <span className="text-muted-foreground">
                                    {q.total_questions} questions
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="w-12 h-12 rounded-xl bg-card shadow-sm border border-border flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:border-primary/40 group-hover:translate-x-1 transition-all shadow-xl">
                              <ChevronRightIcon className="w-6 h-6" />
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {/* Mobile lesson actions — fixed above app dock */}
        {!isCinemaMode && (
          <div className="md:hidden fixed inset-x-0 bottom-[var(--app-bottom-nav-height)] z-[55] border-t border-border bg-background/95 backdrop-blur-md shadow-[0_-8px_24px_rgba(0,0,0,0.1)]">
            <div className="flex items-center gap-2 px-3 py-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className={`${MOBILE_TOUCH_BTN} shrink-0 border border-border bg-card text-muted-foreground px-3`}
                aria-label="Open syllabus"
              >
                <RectangleGroupIcon className="h-4 w-4" />
              </button>
              <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                {isStaff && (
                  <Link
                    href={`/dashboard/lessons/${id}/edit`}
                    className={`${MOBILE_TOUCH_BTN} shrink-0 border border-border bg-card text-foreground px-3`}
                    aria-label="Edit lesson"
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                  </Link>
                )}
                {!completed && profile?.role === "student" && (
                  <button
                    type="button"
                    onClick={handleMarkComplete}
                    disabled={marking}
                    className={`${MOBILE_TOUCH_BTN} min-w-0 flex-1 bg-primary text-primary-foreground shadow-lg disabled:opacity-60`}
                  >
                    <CheckBadgeIcon className="h-4 w-4 shrink-0" />
                    <span className="truncate">
                      {marking ? "Saving…" : "Mark complete"}
                    </span>
                  </button>
                )}
                {completed && nextLesson && (
                  <Link
                    href={`/dashboard/lessons/${nextLesson.id}${
                      classId ? `?class_id=${classId}` : ""
                    }`}
                    className={`${MOBILE_TOUCH_BTN} min-w-0 flex-1 bg-cyan-700 text-white shadow-lg`}
                  >
                    <span className="truncate">Next lesson</span>
                    <ChevronRightIcon className="h-4 w-4 shrink-0" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
        {lesson && lesson.lesson_notes && (
          <NeuralVoiceReader
            content={lesson.lesson_notes}
            title={lesson.title}
            isOpen={ttsOpen}
            onClose={() => setTtsOpen(false)}
          />
        )}
        {lesson && (
          <StudyAssistant
            lessonTitle={lesson.title}
            lessonType={lesson.lesson_type ?? undefined}
            courseTitle={lesson.courses?.title ?? undefined}
            programName={lesson.courses?.programs?.name ?? undefined}
            gradeLevel={lesson.grade_level ?? undefined}
            lessonObjectives={
              Array.isArray(lesson.objectives) ? lesson.objectives : undefined
            }
            externalMessage={explainRequest ?? undefined}
            isOpen={aiOpen}
            onClose={() => setAiOpen(false)}
          />
        )}
      </main>

      <AnimatePresence>
        {viewerItem && (
          <InAppViewer item={viewerItem} onClose={() => setViewerItem(null)} />
        )}
      </AnimatePresence>

      {viewerDeck && (
        <SlideViewer
          slides={viewerDeck.slides}
          pdfKey={viewerDeck.pdf}
          title={viewerDeck.title}
          lessonId={id}
          onClose={() => setViewerDeck(null)}
        />
      )}

      {manageDeck && (
        <SlideDeckManager
          lessonId={id}
          material={manageDeck}
          onClose={() => setManageDeck(null)}
          onSaved={(updated) =>
            setMaterials((prev) =>
              prev.map((m) => (m.id === updated.id ? updated : m))
            )
          }
        />
      )}
    </div>
  );
}

const LayoutIcon = ({ className }: any) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
    />
  </svg>
);
