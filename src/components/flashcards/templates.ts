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
