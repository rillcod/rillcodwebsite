import { motion } from 'framer-motion';
import { XMarkIcon, CheckIcon, ExclamationTriangleIcon } from '@/lib/icons';

interface NotificationProps {
  message: string;
  onClose: () => void;
}

export function ErrorNotification({ message, onClose }: NotificationProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="absolute top-20 left-4 right-4 bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-lg z-10 flex items-center justify-between shadow-lg"
    >
      <div className="flex items-center gap-2">
        <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
        <span className="text-sm">{message}</span>
      </div>
      <button
        onClick={onClose}
        className="text-red-400 hover:text-red-300 transition-colors"
      >
        <XMarkIcon className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

export function SuccessNotification({ message, onClose }: NotificationProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="absolute top-20 left-4 right-4 bg-green-500/10 border border-green-500/30 text-green-400 p-3 rounded-lg z-10 flex items-center justify-between shadow-lg"
    >
      <div className="flex items-center gap-2">
        <CheckIcon className="w-5 h-5 flex-shrink-0" />
        <span className="text-sm">{message}</span>
      </div>
      <button
        onClick={onClose}
        className="text-green-400 hover:text-green-300 transition-colors"
      >
        <XMarkIcon className="w-4 h-4" />
      </button>
    </motion.div>
  );
}
