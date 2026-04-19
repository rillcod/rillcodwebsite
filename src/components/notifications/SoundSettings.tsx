'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  SpeakerWaveIcon, 
  XMarkIcon,
  PlayIcon
} from '@/lib/icons';
import { 
  getSoundSettings, 
  setSoundsEnabled, 
  setSoundVolume, 
  testNotificationSound 
} from '@/lib/sounds';

interface SoundSettingsProps {
  className?: string;
}

export default function SoundSettings({ className = '' }: SoundSettingsProps) {
  const [isEnabled, setIsEnabled] = useState(true);
  const [volume, setVolume] = useState(1.0);
  const [isTestingSound, setIsTestingSound] = useState(false);

  // Load settings on mount
  useEffect(() => {
    const settings = getSoundSettings();
    setIsEnabled(settings.enabled);
    setVolume(settings.volume);
  }, []);

  const handleToggleEnabled = () => {
    const newEnabled = !isEnabled;
    setIsEnabled(newEnabled);
    setSoundsEnabled(newEnabled);
    
    // Play test sound when enabling
    if (newEnabled) {
      testNotificationSound('info');
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    setSoundVolume(newVolume);
  };

  const handleTestSound = async (type: 'info' | 'success' | 'warning' | 'error' | 'achievement' | 'streak' | 'celebration') => {
    if (isTestingSound) return;
    
    setIsTestingSound(true);
    try {
      await testNotificationSound(type);
    } catch (error) {
      console.warn('Failed to test sound:', error);
    }
    
    // Reset testing state after sound duration
    setTimeout(() => setIsTestingSound(false), 1000);
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isEnabled ? (
            <SpeakerWaveIcon className="w-5 h-5 text-primary" />
          ) : (
            <XMarkIcon className="w-5 h-5 text-muted-foreground" />
          )}
          <div>
            <h3 className="text-sm font-medium text-foreground">Notification Sounds</h3>
            <p className="text-xs text-muted-foreground">
              Play audio feedback for notifications
            </p>
          </div>
        </div>
        
        <button
          onClick={handleToggleEnabled}
          className={`
            relative inline-flex h-6 w-11 items-center rounded-full transition-colors
            ${isEnabled ? 'bg-primary' : 'bg-muted'}
          `}
        >
          <motion.span
            className="inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform"
            animate={{ x: isEnabled ? 24 : 4 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        </button>
      </div>

      {/* Volume Control */}
      {isEnabled && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">Volume</label>
            <span className="text-xs text-muted-foreground">{Math.round(volume * 100)}%</span>
          </div>
          
          <div className="flex items-center gap-3">
            <XMarkIcon className="w-4 h-4 text-muted-foreground" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer slider"
            />
            <SpeakerWaveIcon className="w-4 h-4 text-muted-foreground" />
          </div>
        </motion.div>
      )}

      {/* Sound Test Buttons */}
      {isEnabled && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="space-y-3"
        >
          <h4 className="text-sm font-medium text-foreground">Test Sounds</h4>
          
          <div className="grid grid-cols-2 gap-2">
            {[
              { type: 'info' as const, label: 'Info', emoji: '💡' },
              { type: 'success' as const, label: 'Success', emoji: '✅' },
              { type: 'warning' as const, label: 'Warning', emoji: '⚠️' },
              { type: 'error' as const, label: 'Error', emoji: '❌' },
              { type: 'achievement' as const, label: 'Achievement', emoji: '🏆' },
              { type: 'celebration' as const, label: 'Celebration', emoji: '🎉' }
            ].map(({ type, label, emoji }) => (
              <button
                key={type}
                onClick={() => handleTestSound(type)}
                disabled={isTestingSound}
                className={`
                  flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium
                  rounded-lg border transition-all duration-200
                  ${isTestingSound 
                    ? 'bg-muted/50 text-muted-foreground border-border cursor-not-allowed' 
                    : 'bg-card text-foreground border-border hover:border-primary hover:bg-muted/50'
                  }
                `}
              >
                <span>{emoji}</span>
                <span>{label}</span>
                {!isTestingSound && <PlayIcon className="w-3 h-3" />}
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Custom CSS for range slider */}
      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: hsl(var(--primary));
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        
        .slider::-moz-range-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: hsl(var(--primary));
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        
        .slider::-webkit-slider-track {
          background: hsl(var(--muted));
          border-radius: 4px;
        }
        
        .slider::-moz-range-track {
          background: hsl(var(--muted));
          border-radius: 4px;
          border: none;
        }
      `}</style>
    </div>
  );
}