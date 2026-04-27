'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  XMarkIcon, CheckCircleIcon, ExclamationTriangleIcon, 
  InformationCircleIcon, XCircleIcon, SparklesIcon,
  FireIcon, TrophyIcon
} from '@/lib/icons';
import { playNotificationSound } from '@/lib/sounds';

interface PopupNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'achievement' | 'streak' | 'celebration';
  timestamp: string;
  autoClose?: number;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  actionLabel?: string;
  actionUrl?: string;
  category?: string;
  sound?: boolean;
}

interface PopupNotificationProps {
  notification: PopupNotification;
  onClose: (id: string) => void;
  onAction?: (notification: PopupNotification) => void;
}

const typeConfig = {
  info: {
    icon: InformationCircleIcon,
    bgGradient: 'bg-gradient-to-br from-primary/15 via-primary/10 to-cyan-500/5',
    borderColor: 'border-primary/40',
    textColor: 'text-primary dark:text-blue-300',
    iconColor: 'text-primary dark:text-primary',
    glowColor: 'shadow-primary/20',
    progressColor: 'bg-gradient-to-r from-primary to-cyan-400',
    emoji: '💡'
  },
  success: {
    icon: CheckCircleIcon,
    bgGradient: 'bg-gradient-to-br from-emerald-500/15 via-green-400/10 to-teal-500/5',
    borderColor: 'border-emerald-500/40',
    textColor: 'text-emerald-500 dark:text-emerald-300',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    glowColor: 'shadow-emerald-500/20',
    progressColor: 'bg-gradient-to-r from-emerald-500 to-teal-400',
    emoji: '✅'
  },
  warning: {
    icon: ExclamationTriangleIcon,
    bgGradient: 'bg-gradient-to-br from-amber-500/15 via-yellow-400/10 to-primary/5',
    borderColor: 'border-amber-500/40',
    textColor: 'text-amber-600 dark:text-amber-300',
    iconColor: 'text-amber-700 dark:text-amber-400',
    glowColor: 'shadow-amber-500/20',
    progressColor: 'bg-gradient-to-r from-amber-500 to-primary',
    emoji: '⚠️'
  },
  error: {
    icon: XCircleIcon,
    bgGradient: 'bg-gradient-to-br from-rose-500/15 via-red-400/10 to-pink-500/5',
    borderColor: 'border-rose-500/40',
    textColor: 'text-rose-600 dark:text-rose-300',
    iconColor: 'text-rose-700 dark:text-rose-400',
    glowColor: 'shadow-rose-500/20',
    progressColor: 'bg-gradient-to-r from-rose-500 to-pink-400',
    emoji: '❌'
  },
  achievement: {
    icon: TrophyIcon,
    bgGradient: 'bg-gradient-to-br from-yellow-500/20 via-amber-400/15 to-primary/10',
    borderColor: 'border-yellow-500/50',
    textColor: 'text-yellow-600 dark:text-yellow-300',
    iconColor: 'text-yellow-700 dark:text-yellow-400',
    glowColor: 'shadow-yellow-500/30',
    progressColor: 'bg-gradient-to-r from-yellow-500 to-primary',
    emoji: '🏆'
  },
  streak: {
    icon: FireIcon,
    bgGradient: 'bg-gradient-to-br from-primary/20 via-red-400/15 to-pink-500/10',
    borderColor: 'border-primary/50',
    textColor: 'text-primary dark:text-primary',
    iconColor: 'text-orange-700 dark:text-primary',
    glowColor: 'shadow-primary/30',
    progressColor: 'bg-gradient-to-r from-primary to-red-400',
    emoji: '🔥'
  },
  celebration: {
    icon: SparklesIcon,
    bgGradient: 'bg-gradient-to-br from-purple-500/20 via-pink-400/15 to-primary/10',
    borderColor: 'border-purple-500/50',
    textColor: 'text-purple-600 dark:text-purple-300',
    iconColor: 'text-purple-700 dark:text-purple-400',
    glowColor: 'shadow-purple-500/30',
    progressColor: 'bg-gradient-to-r from-purple-500 to-pink-400',
    emoji: '🎉'
  }
};

const priorityConfig = {
  low: { scale: 0.95, duration: 0.4, shake: false },
  normal: { scale: 1, duration: 0.3, shake: false },
  high: { scale: 1.02, duration: 0.25, shake: false },
  urgent: { scale: 1.05, duration: 0.2, shake: true }
};

export default function PopupNotification({ notification, onClose, onAction }: PopupNotificationProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [progress, setProgress] = useState(100);
  
  const config = typeConfig[notification.type as keyof typeof typeConfig] || typeConfig.info;
  const priority = priorityConfig[notification.priority || 'normal'];
  const Icon = config.icon;

  // Auto-close timer with pause on hover
  useEffect(() => {
    if (!notification.autoClose || isHovered) return;

    const interval = 50; // Update every 50ms for smooth progress
    const decrement = (interval / notification.autoClose) * 100;
    
    const timer = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev - decrement;
        if (newProgress <= 0) {
          handleClose();
          return 0;
        }
        return newProgress;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [notification.autoClose, isHovered]);

  // Sound effect for important notifications
  useEffect(() => {
    if (notification.sound && typeof window !== 'undefined') {
      // Play appropriate sound based on notification type and priority
      playNotificationSound(
        notification.type, 
        notification.priority || 'normal'
      ).catch(() => {
        // Ignore audio play errors (user interaction required, etc.)
      });
    }
  }, [notification.sound, notification.type, notification.priority]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => onClose(notification.id), 300);
  }, [notification.id, onClose]);

  const handleAction = useCallback(() => {
    if (onAction) {
      onAction(notification);
    } else if (notification.actionUrl) {
      window.open(notification.actionUrl, '_blank');
    }
    handleClose();
  }, [notification, onAction, handleClose]);

  // Shake animation for urgent notifications
  const shakeVariants = {
    shake: {
      x: [0, -2, 2, -2, 2, 0],
      transition: { duration: 0.5, repeat: 2 }
    }
  };

  // Determine animation props
  const animationProps = priority.shake 
    ? {
        variants: shakeVariants,
        animate: 'shake' as const
      }
    : {
        animate: { 
          opacity: 1, 
          x: 0, 
          scale: priority.scale,
          rotateY: 0
        }
      };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ 
            opacity: 0, 
            x: 400, 
            scale: 0.8,
            rotateY: 45
          }}
          {...animationProps}
          exit={{ 
            opacity: 0, 
            x: 400, 
            scale: 0.8,
            rotateY: -45
          }}
          transition={{ 
            duration: priority.duration, 
            ease: [0.25, 0.46, 0.45, 0.94],
            type: 'spring',
            stiffness: 300,
            damping: 30
          }}
          whileHover={{ 
            scale: priority.scale * 1.02, 
            y: -2,
            transition: { duration: 0.2 }
          }}
          className={`
            relative w-full max-w-sm ${config.bgGradient} ${config.borderColor} 
            border-2 rounded-xl shadow-2xl ${config.glowColor} backdrop-blur-md 
            overflow-hidden cursor-pointer group bg-card/80
          `}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={notification.actionUrl || onAction ? handleAction : undefined}
        >
          {/* Animated background particles for special notifications */}
          {['achievement', 'streak', 'celebration'].includes(notification.type) && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 h-1 bg-white/30 rounded-full"
                  initial={{ 
                    x: Math.random() * 300, 
                    y: Math.random() * 100,
                    opacity: 0 
                  }}
                  animate={{ 
                    y: [null, -20, -40],
                    opacity: [0, 1, 0],
                    scale: [0, 1, 0]
                  }}
                  transition={{ 
                    duration: 2, 
                    delay: i * 0.2,
                    repeat: Infinity,
                    repeatDelay: 3
                  }}
                />
              ))}
            </div>
          )}

          {/* Priority indicator */}
          {notification.priority === 'urgent' && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 via-primary to-red-500 animate-pulse" />
          )}

          <div className="relative p-5">
            <div className="flex items-start gap-4">
              {/* Enhanced Icon with Animation */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 300 }}
                className={`
                  relative flex-shrink-0 w-10 h-10 rounded-full 
                  ${config.bgGradient} ${config.borderColor} border
                  flex items-center justify-center group-hover:scale-110 
                  transition-transform duration-200
                `}
              >
                <Icon className={`w-5 h-5 ${config.iconColor}`} />
                
                {/* Pulse effect for important notifications */}
                {['achievement', 'streak', 'celebration'].includes(notification.type) && (
                  <motion.div
                    className={`absolute inset-0 rounded-full ${config.borderColor} border-2`}
                    animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}
              </motion.div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between mb-2">
                  <motion.h4 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className={`text-sm font-bold ${config.textColor} leading-tight`}
                  >
                    {config.emoji} {notification.title}
                  </motion.h4>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClose();
                    }}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>

                <motion.p 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-xs text-muted-foreground leading-relaxed mb-3"
                >
                  {notification.message}
                </motion.p>

                {/* Action Button */}
                {notification.actionLabel && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.25 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAction();
                    }}
                    className={`
                      px-3 py-1.5 text-xs font-bold rounded-lg
                      ${config.iconColor} bg-muted/20 hover:bg-muted/30
                      border border-border/30 hover:border-border/50
                      transition-all duration-200 transform hover:scale-105
                    `}
                  >
                    {notification.actionLabel}
                  </motion.button>
                )}

                {/* Metadata */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/30">
                  <motion.p 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-[10px] text-muted-foreground/60"
                  >
                    {new Date(notification.timestamp).toLocaleTimeString()}
                  </motion.p>
                  
                  {notification.category && (
                    <motion.span 
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.35 }}
                      className="text-[9px] px-2 py-0.5 bg-muted/20 text-muted-foreground rounded-full font-medium"
                    >
                      {notification.category}
                    </motion.span>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Enhanced Progress Bar */}
          {notification.autoClose && (
            <div className="relative h-1 bg-muted/30 overflow-hidden">
              <motion.div
                className={`h-full ${config.progressColor} relative`}
                initial={{ width: '100%' }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.1, ease: 'linear' }}
              >
                {/* Shimmer effect */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                />
              </motion.div>
            </div>
          )}

          {/* Hover glow effect */}
          <motion.div
            className={`absolute inset-0 ${config.glowColor} rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`}
            style={{ filter: 'blur(8px)', zIndex: -1 }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}