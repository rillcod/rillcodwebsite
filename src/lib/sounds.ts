'use client';

/**
 * Sound utility for playing notification sounds
 * Handles different notification types with appropriate audio feedback
 * Uses Web Audio API to generate sounds programmatically
 */

interface SoundConfig {
  volume: number;
  playbackRate?: number;
  loop?: boolean;
}

interface NotificationSounds {
  info: string;
  success: string;
  warning: string;
  error: string;
  achievement: string;
  streak: string;
  celebration: string;
}

// Sound generation parameters for different notification types
interface SoundParams {
  frequency: number;
  duration: number;
  type: OscillatorType;
  envelope?: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  modulation?: {
    frequency: number;
    depth: number;
  };
}

const SOUND_PARAMS: Record<keyof NotificationSounds, SoundParams> = {
  info: {
    frequency: 800,
    duration: 0.2,
    type: 'sine',
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.1 }
  },
  success: {
    frequency: 523, // C5
    duration: 0.4,
    type: 'sine',
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.3 }
  },
  warning: {
    frequency: 440, // A4
    duration: 0.3,
    type: 'triangle',
    envelope: { attack: 0.05, decay: 0.1, sustain: 0.4, release: 0.15 },
    modulation: { frequency: 6, depth: 0.1 }
  },
  error: {
    frequency: 200,
    duration: 0.5,
    type: 'sawtooth',
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.27 }
  },
  achievement: {
    frequency: 659, // E5
    duration: 0.6,
    type: 'sine',
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.4 }
  },
  streak: {
    frequency: 880, // A5
    duration: 0.3,
    type: 'square',
    envelope: { attack: 0.01, decay: 0.05, sustain: 0.6, release: 0.24 },
    modulation: { frequency: 10, depth: 0.2 }
  },
  celebration: {
    frequency: 1047, // C6
    duration: 0.8,
    type: 'sine',
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.5 }
  }
};

// Default sound configurations for each type
const SOUND_CONFIGS: Record<keyof NotificationSounds, SoundConfig> = {
  info: { volume: 0.3, playbackRate: 1.0 },
  success: { volume: 0.4, playbackRate: 1.0 },
  warning: { volume: 0.5, playbackRate: 1.0 },
  error: { volume: 0.6, playbackRate: 1.0 },
  achievement: { volume: 0.7, playbackRate: 1.0 },
  streak: { volume: 0.6, playbackRate: 1.1 },
  celebration: { volume: 0.8, playbackRate: 1.0 }
};

class SoundManager {
  private audioContext: AudioContext | null = null;
  private isEnabled: boolean = true;
  private masterVolume: number = 1.0;

  constructor() {
    // Check if user has disabled sounds in preferences
    if (typeof window !== 'undefined') {
      const savedPreference = localStorage.getItem('notification-sounds-enabled');
      this.isEnabled = savedPreference !== 'false';
      
      const savedVolume = localStorage.getItem('notification-sounds-volume');
      this.masterVolume = savedVolume ? parseFloat(savedVolume) : 1.0;
    }
  }

  /**
   * Initialize Web Audio Context (requires user interaction)
   */
  private async initAudioContext(): Promise<AudioContext | null> {
    if (typeof window === 'undefined') return null;
    
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // Resume context if suspended (required by some browsers)
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
        }
      } catch (error) {
        console.warn('Failed to initialize audio context:', error);
        return null;
      }
    }
    
    return this.audioContext;
  }

  /**
   * Generate and play a notification sound using Web Audio API
   */
  private async generateSound(params: SoundParams, volume: number): Promise<void> {
    const audioContext = await this.initAudioContext();
    if (!audioContext) return;

    try {
      // Create oscillator for main tone
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      // Connect nodes
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Set oscillator properties
      oscillator.type = params.type;
      oscillator.frequency.setValueAtTime(params.frequency, audioContext.currentTime);
      
      // Add modulation if specified
      if (params.modulation) {
        const modOscillator = audioContext.createOscillator();
        const modGain = audioContext.createGain();
        
        modOscillator.frequency.setValueAtTime(params.modulation.frequency, audioContext.currentTime);
        modGain.gain.setValueAtTime(params.modulation.depth * params.frequency, audioContext.currentTime);
        
        modOscillator.connect(modGain);
        modGain.connect(oscillator.frequency);
        
        modOscillator.start();
        modOscillator.stop(audioContext.currentTime + params.duration);
      }
      
      // Apply ADSR envelope
      const now = audioContext.currentTime;
      const envelope = params.envelope || { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.1 };
      
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(volume, now + envelope.attack);
      gainNode.gain.linearRampToValueAtTime(volume * envelope.sustain, now + envelope.attack + envelope.decay);
      gainNode.gain.setValueAtTime(volume * envelope.sustain, now + params.duration - envelope.release);
      gainNode.gain.linearRampToValueAtTime(0, now + params.duration);
      
      // Start and stop oscillator
      oscillator.start(now);
      oscillator.stop(now + params.duration);
      
    } catch (error) {
      console.warn('Failed to generate sound:', error);
    }
  }

  /**
   * Play complex notification sound (multiple tones for special types)
   */
  private async playComplexSound(type: keyof NotificationSounds, volume: number): Promise<void> {
    const baseParams = SOUND_PARAMS[type];
    
    switch (type) {
      case 'success':
        // Play ascending chord: C-E-G
        await this.generateSound({ ...baseParams, frequency: 523 }, volume * 0.8); // C5
        setTimeout(() => this.generateSound({ ...baseParams, frequency: 659, duration: 0.3 }, volume * 0.6), 100); // E5
        setTimeout(() => this.generateSound({ ...baseParams, frequency: 784, duration: 0.2 }, volume * 0.4), 200); // G5
        break;
        
      case 'achievement':
        // Play triumphant sequence
        await this.generateSound({ ...baseParams, frequency: 523 }, volume); // C5
        setTimeout(() => this.generateSound({ ...baseParams, frequency: 659, duration: 0.4 }, volume * 0.8), 150); // E5
        setTimeout(() => this.generateSound({ ...baseParams, frequency: 784, duration: 0.5 }, volume * 0.9), 300); // G5
        setTimeout(() => this.generateSound({ ...baseParams, frequency: 1047, duration: 0.6 }, volume), 450); // C6
        break;
        
      case 'celebration':
        // Play celebratory arpeggio
        const notes = [523, 659, 784, 1047, 1319]; // C-E-G-C-E
        notes.forEach((freq, i) => {
          setTimeout(() => {
            this.generateSound({ 
              ...baseParams, 
              frequency: freq, 
              duration: 0.3 - (i * 0.02) 
            }, volume * (0.8 - i * 0.1));
          }, i * 80);
        });
        break;
        
      case 'error':
        // Play descending dissonant tones
        await this.generateSound({ ...baseParams, frequency: 400 }, volume);
        setTimeout(() => this.generateSound({ ...baseParams, frequency: 300, duration: 0.4 }, volume * 0.8), 100);
        setTimeout(() => this.generateSound({ ...baseParams, frequency: 200, duration: 0.3 }, volume * 0.6), 200);
        break;
        
      default:
        await this.generateSound(baseParams, volume);
    }
  }

  /**
   * Play notification sound for specific type
   */
  async playNotificationSound(
    type: keyof NotificationSounds,
    priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal'
  ): Promise<void> {
    if (!this.isEnabled || typeof window === 'undefined') return;

    try {
      // Get base configuration
      const config = SOUND_CONFIGS[type];
      
      // Adjust volume based on priority
      const priorityMultiplier = {
        low: 0.7,
        normal: 1.0,
        high: 1.2,
        urgent: 1.4
      }[priority];

      const finalVolume = Math.min(config.volume * this.masterVolume * priorityMultiplier, 1.0);

      // Play the sound
      await this.playComplexSound(type, finalVolume);
    } catch (error) {
      console.debug('Audio play failed:', error);
    }
  }

  /**
   * Play simple beep sound
   */
  async playBeep(frequency: number = 800, duration: number = 0.2): Promise<void> {
    if (!this.isEnabled) return;
    
    const params: SoundParams = {
      frequency,
      duration,
      type: 'sine',
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.1 }
    };
    
    await this.generateSound(params, 0.3 * this.masterVolume);
  }

  /**
   * Enable/disable notification sounds
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('notification-sounds-enabled', enabled.toString());
    }
  }

  /**
   * Set master volume (0.0 to 1.0)
   */
  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (typeof window !== 'undefined') {
      localStorage.setItem('notification-sounds-volume', this.masterVolume.toString());
    }
  }

  /**
   * Get current settings
   */
  getSettings(): { enabled: boolean; volume: number } {
    return {
      enabled: this.isEnabled,
      volume: this.masterVolume
    };
  }

  /**
   * Test sound playback
   */
  async testSound(type: keyof NotificationSounds = 'info'): Promise<void> {
    await this.playNotificationSound(type, 'normal');
  }
}

// Global sound manager instance
export const soundManager = new SoundManager();

// Convenience functions
export const playNotificationSound = (
  type: keyof NotificationSounds,
  priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal'
) => soundManager.playNotificationSound(type, priority);

export const playBeep = (frequency?: number, duration?: number) => 
  soundManager.playBeep(frequency, duration);

export const setSoundsEnabled = (enabled: boolean) => soundManager.setEnabled(enabled);

export const setSoundVolume = (volume: number) => soundManager.setMasterVolume(volume);

export const getSoundSettings = () => soundManager.getSettings();

export const testNotificationSound = (type: keyof NotificationSounds = 'info') => 
  soundManager.testSound(type);

// Initialize audio context on first user interaction
if (typeof window !== 'undefined') {
  const initAudio = () => {
    soundManager.testSound('info').catch(() => {
      // Ignore initialization errors
    });
    
    // Remove listeners after first interaction
    document.removeEventListener('click', initAudio);
    document.removeEventListener('keydown', initAudio);
    document.removeEventListener('touchstart', initAudio);
  };
  
  document.addEventListener('click', initAudio);
  document.addEventListener('keydown', initAudio);
  document.addEventListener('touchstart', initAudio);
}