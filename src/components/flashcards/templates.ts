import type { CardTemplate } from '@/types/flashcards';
import {
  DocumentTextIcon,
  CubeIcon,
  BeakerIcon,
  PhotoIcon,
  PaintBrushIcon
} from '@/lib/icons';

export const CARD_TEMPLATES: CardTemplate[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Simple and clean design',
    frontStyle: 'bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-2 border-blue-200 dark:border-blue-800',
    backStyle: 'bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-2 border-green-200 dark:border-green-800',
    textStyle: 'text-gray-800 dark:text-gray-100',
    animation: 'flip',
    icon: 'DocumentTextIcon'
  },
  {
    id: 'modern',
    name: 'Modern',
    description: 'Sleek gradient design',
    frontStyle: 'bg-gradient-to-br from-purple-600 to-blue-600 text-white shadow-xl',
    backStyle: 'bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-xl',
    textStyle: 'text-white',
    animation: 'slide',
    icon: 'CubeIcon'
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Vibrant neon effects',
    frontStyle: 'bg-black border-2 border-cyan-400 shadow-lg shadow-cyan-400/50',
    backStyle: 'bg-black border-2 border-pink-400 shadow-lg shadow-pink-400/50',
    textStyle: 'text-cyan-400',
    animation: 'glow',
    icon: 'BeakerIcon'
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean minimalist style',
    frontStyle: 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm',
    backStyle: 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm',
    textStyle: 'text-gray-900 dark:text-gray-100',
    animation: 'fade',
    icon: 'DocumentTextIcon'
  },
  {
    id: 'playful',
    name: 'Playful',
    description: 'Fun and colorful',
    frontStyle: 'bg-gradient-to-br from-yellow-300 via-pink-300 to-purple-400 shadow-xl',
    backStyle: 'bg-gradient-to-br from-green-300 via-blue-300 to-indigo-400 shadow-xl',
    textStyle: 'text-gray-800 font-bold',
    animation: 'bounce',
    icon: 'PhotoIcon'
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'Corporate and elegant',
    frontStyle: 'bg-gradient-to-br from-slate-800 to-slate-900 text-white shadow-xl',
    backStyle: 'bg-gradient-to-br from-slate-700 to-slate-800 text-white shadow-xl',
    textStyle: 'text-white',
    animation: 'slide',
    icon: 'PaintBrushIcon'
  }
];

export interface FlashcardTemplateStyle {
  front: string;
  back: string;
  text: string;
  glow?: string;
}

export const CARD_TEMPLATE_STYLES: Record<string, FlashcardTemplateStyle> = {
  classic: {
    front: 'bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-2 border-blue-200 dark:border-blue-700',
    back: 'bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900 border-2 border-emerald-200 dark:border-emerald-700',
    text: 'text-gray-800 dark:text-gray-100',
  },
  modern: {
    front: 'bg-gradient-to-br from-violet-600 to-blue-600',
    back: 'bg-gradient-to-br from-orange-500 to-rose-500',
    text: 'text-white',
    glow: 'shadow-violet-500/30',
  },
  neon: {
    front: 'bg-black border-2 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.4)]',
    back: 'bg-black border-2 border-pink-400 shadow-[0_0_20px_rgba(244,114,182,0.4)]',
    text: 'text-cyan-300',
    glow: 'shadow-cyan-400/40',
  },
  minimal: {
    front: 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700',
    back: 'bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700',
    text: 'text-zinc-900 dark:text-zinc-100',
  },
  playful: {
    front: 'bg-gradient-to-br from-yellow-300 via-pink-300 to-purple-400',
    back: 'bg-gradient-to-br from-green-300 via-cyan-300 to-blue-400',
    text: 'text-gray-800 font-bold',
    glow: 'shadow-pink-400/30',
  },
  professional: {
    front: 'bg-gradient-to-br from-slate-800 to-slate-900',
    back: 'bg-gradient-to-br from-slate-700 to-slate-800',
    text: 'text-white',
    glow: 'shadow-slate-900/50',
  },
};

export function getTemplateStyle(template?: string) {
  return CARD_TEMPLATE_STYLES[template ?? 'classic'] ?? CARD_TEMPLATE_STYLES.classic;
}

export const STUDY_MODES = [
  {
    mode: 'all' as const,
    label: 'All Cards',
    description: 'Study all cards in the deck',
    icon: '📚',
    color: 'blue'
  },
  {
    mode: 'due' as const,
    label: 'Due for Review',
    description: 'Cards scheduled for review today',
    icon: '⏰',
    color: 'orange'
  },
  {
    mode: 'starred' as const,
    label: 'Starred',
    description: 'Cards you marked as important',
    icon: '⭐',
    color: 'yellow'
  },
  {
    mode: 'difficult' as const,
    label: 'Difficult',
    description: 'Cards marked as hard',
    icon: '🔥',
    color: 'red'
  },
  {
    mode: 'new' as const,
    label: 'New Cards',
    description: 'Cards never reviewed before',
    icon: '✨',
    color: 'purple'
  }
];
