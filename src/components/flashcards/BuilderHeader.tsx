import { motion } from 'framer-motion';
import {
  XMarkIcon,
  CheckIcon,
  EyeIcon,
  SparklesIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  Bars3Icon
} from '@/lib/icons';

interface BuilderHeaderProps {
  validCardCount: number;
  showPreview: boolean;
  saving: boolean;
  onTogglePreview: () => void;
  onShowAI: () => void;
  onShowImport: () => void;
  onSave: () => void;
  onClose: () => void;
  onToggleSidebar?: () => void;
}

export default function BuilderHeader({
  validCardCount,
  showPreview,
  saving,
  onTogglePreview,
  onShowAI,
  onShowImport,
  onSave,
  onClose,
  onToggleSidebar,
}: BuilderHeaderProps) {
  return (
    <div className="absolute top-0 left-0 right-0 bg-background/95 backdrop-blur-md border-b border-border px-3 py-3 flex items-center justify-between z-10 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="md:hidden p-2 hover:bg-muted rounded-lg transition-colors flex-shrink-0"
            aria-label="Toggle sidebar"
          >
            <Bars3Icon className="w-5 h-5" />
          </button>
        )}
        <motion.h2
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-base sm:text-xl font-black truncate"
        >
          Flashcard Builder
        </motion.h2>
        <span className="hidden sm:inline text-xs bg-muted px-2 py-1 rounded-full font-medium whitespace-nowrap flex-shrink-0">
          {validCardCount} {validCardCount === 1 ? 'card' : 'cards'} ready
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onShowImport}
          className="flex items-center gap-1.5 px-2 sm:px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors rounded-lg"
        >
          <ArrowUpTrayIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Import</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onShowAI}
          className="flex items-center gap-1.5 px-2 sm:px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold transition-colors rounded-lg"
        >
          <SparklesIcon className="w-4 h-4" />
          <span className="hidden sm:inline">AI Generate</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onTogglePreview}
          className={`flex items-center gap-1.5 px-2 sm:px-4 py-2 text-sm font-bold transition-colors rounded-lg ${
            showPreview
              ? 'bg-orange-600 hover:bg-orange-500 text-white'
              : 'bg-muted hover:bg-muted/80 text-foreground'
          }`}
        >
          <EyeIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Preview</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onSave}
          disabled={saving || validCardCount === 0}
          className="flex items-center gap-1.5 px-2 sm:px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors rounded-lg"
        >
          {saving ? (
            <>
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
              <span className="hidden sm:inline">Saving...</span>
            </>
          ) : (
            <>
              <CheckIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Save Cards</span>
            </>
          )}
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onClose}
          className="p-2 hover:bg-muted rounded-lg transition-colors"
        >
          <XMarkIcon className="w-5 h-5" />
        </motion.button>
      </div>
    </div>
  );
}
