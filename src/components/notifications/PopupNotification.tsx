'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, XCircleIcon } from '@/lib/icons';

interface PopupNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
  autoClose?: number;
}

interface PopupNotificationProps {
  notification: PopupNotification;
  onClose: (id: string) => void;
}

const typeConfig = {
  info: {
    icon: InformationCircleIcon,
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    textColor: 'text-blue-400',
    iconColor: 'text-blue-400'
  },
  success: {
    icon: CheckCircleIcon,
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    textColor: 'text-emerald-400',
    iconColor: 'text-emerald-400'
  },
  warning: {
    icon: ExclamationTriangleIcon,
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    textColor: 'text-amber-400',
    iconColor: 'text-amber-400'
  },
  error: {
    icon: XCircleIcon,
    bgColor: 'bg-rose-500/10',
    borderColor: 'border-rose-500/30',
    textColor: 'text-rose-400',
    iconColor: 'text-rose-400'
  }
};

export default function PopupNotification({ notification, onClose }: PopupNotificationProps) {
  const [isVisible, setIsVisible] = useState(true);
  const config = typeConfig[notification.type];
  const Icon = config.icon;

  useEffect(() => {
    if (notification.autoClose) {
      const timer = setTimeout(() => {
        handleClose();
      }, notification.autoClose);
      return () => clearTimeout(timer);
    }
  }, [notification.autoClose]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => onClose(notification.id), 300);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, x: 300, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 300, scale: 0.9 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className={`relative w-full max-w-sm ${config.bgColor} ${config.borderColor} border rounded-none shadow-2xl backdrop-blur-sm overflow-hidden`}
        >
          <div className="p-4">
            <div className="flex items-start gap-3">
              <Icon className={`w-5 h-5 ${config.iconColor} flex-shrink-0 mt-0.5`} />
              <div className="flex-1 min-w-0">
                <h4 className={`text-sm font-bold ${config.textColor} mb-1`}>
                  {notification.title}
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {notification.message}
                </p>
                <p className="text-[10px] text-muted-foreground/60 mt-2">
                  {new Date(notification.timestamp).toLocaleTimeString()}
                </p>
              </div>
              <button
                onClick={handleClose}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          {/* Progress bar for auto-close */}
          {notification.autoClose && (
            <motion.div
              className={`h-1 ${config.iconColor.replace('text-', 'bg-')}`}
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: notification.autoClose / 1000, ease: 'linear' }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}