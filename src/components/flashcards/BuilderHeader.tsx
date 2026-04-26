import { useState } from 'react';
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
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const handleMobileAction = (action: () => void) => {
    action();
    setShowMoreMenu(false);
  };

  return (
    <div className="absolute top-0 left-0 right-0 bg-background/95 backdrop-blur-md border-b border-border px-3 py-3 flex items-center justify-between z-10 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {onToggleSidebar && (
          <button
            type="button"
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

      <div className="relative flex items-center gap-1.5 flex-shrink-0">
        {/* Mobile actions */}
        <div className="flex items-center gap-1.5 md:hidden">
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={onTogglePreview}
            className={`flex items-center gap-1.5 px-2 py-2 text-xs font-bold transition-colors rounded-lg ${showPreview
                ? 'bg-primary hover:bg-primary text-white'
                : 'bg-muted hover:bg-muted/80 text-foreground'
              }`}
          >
            <EyeIcon className="w-4 h-4" />
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={onSave}
            disabled={saving || validCardCount === 0}
            className="flex items-center gap-1.5 px-2 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition-colors rounded-lg"
          >
            {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
          </motion.button>

          <button
            type="button"
            onClick={() => setShowMoreMenu(v => !v)}
            className="px-2 py-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors"
            aria-label="More actions"
          >
            <Bars3Icon className="w-4 h-4" />
          </button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </motion.button>
        </div>

        {showMoreMenu && (
          <div className="md:hidden absolute right-10 top-11 min-w-[10rem] bg-card border border-border rounded-lg shadow-xl p-1.5 z-20">
            <button
              type="button"
              onClick={() => handleMobileAction(onShowImport)}
              className="w-full text-left px-3 py-2 text-xs font-bold rounded-md hover:bg-muted transition-colors"
            >
              Import
            </button>
            <button
              type="button"
              onClick={() => handleMobileAction(onShowAI)}
              className="w-full text-left px-3 py-2 text-xs font-bold rounded-md hover:bg-muted transition-colors"
            >
              AI Generate
            </button>
          </div>
        )}

        {/* Desktop actions */}
        <div className="hidden md:flex items-center gap-1.5">
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={onShowImport}
            className="flex items-center gap-1.5 px-2 sm:px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors rounded-lg"
          >
            <ArrowUpTrayIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Import</span>
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={onShowAI}
            className="flex items-center gap-1.5 px-2 sm:px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold transition-colors rounded-lg"
          >
            <SparklesIcon className="w-4 h-4" />
            <span className="hidden sm:inline">AI Generate</span>
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={onTogglePreview}
            className={`flex items-center gap-1.5 px-2 sm:px-4 py-2 text-sm font-bold transition-colors rounded-lg ${showPreview
                ? 'bg-primary hover:bg-primary text-white'
                : 'bg-muted hover:bg-muted/80 text-foreground'
              }`}
          >
            <EyeIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Preview</span>
          </motion.button>

          <motion.button
            type="button"
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
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
