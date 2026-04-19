import { motion } from 'framer-motion';
import { 
  XMarkIcon, 
  CheckIcon, 
  EyeIcon, 
  SparklesIcon,
  ArrowPathIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon
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
}

export default function BuilderHeader({
  validCardCount,
  showPreview,
  saving,
  onTogglePreview,
  onShowAI,
  onShowImport,
  onSave,
  onClose
}: BuilderHeaderProps) {
  return (
    <div className="absolute top-0 left-0 right-0 bg-background/95 backdrop-blur-md border-b border-border p-4 flex items-center justify-between z-10">
      <div className="flex items-center gap-3">
        <motion.h2 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-xl font-black"
        >
          Flashcard Builder
        </motion.h2>
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="flex items-center gap-2"
        >
          <span className="text-xs bg-muted px-2 py-1 rounded-full font-medium">
            {validCardCount} {validCardCount === 1 ? 'card' : 'cards'} ready
          </span>
        </motion.div>
      </div>
      
      <div className="flex items-center gap-2">
        <motion.button
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onShowImport}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors rounded-lg"
        >
          <ArrowUpTrayIcon className="w-4 h-4" />
          Import
        </motion.button>
        
        <motion.button
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onShowAI}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold transition-colors rounded-lg"
        >
          <SparklesIcon className="w-4 h-4" />
          AI Generate
        </motion.button>
        
        <motion.button
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onTogglePreview}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-bold transition-colors rounded-lg ${
            showPreview 
              ? 'bg-orange-600 hover:bg-orange-500 text-white' 
              : 'bg-muted hover:bg-muted/80 text-foreground'
          }`}
        >
          <EyeIcon className="w-4 h-4" />
          Preview
        </motion.button>
        
        <motion.button
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onSave}
          disabled={saving || validCardCount === 0}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors rounded-lg"
        >
          {saving ? (
            <>
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckIcon className="w-4 h-4" />
              Save Cards
            </>
          )}
        </motion.button>
        
        <motion.button
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          whileHover={{ scale: 1.05, rotate: 90 }}
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
