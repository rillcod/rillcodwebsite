'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { motion } from 'framer-motion';
import {
  BellIcon, EnvelopeIcon, DevicePhoneMobileIcon,
  CheckCircleIcon, ExclamationTriangleIcon,
  TrophyIcon, FireIcon, SparklesIcon,
  CogIcon, SpeakerWaveIcon, XMarkIcon
} from '@/lib/icons';
import SoundSettings from './SoundSettings';

interface NotificationPreferences {
  email_enabled: boolean;
  sms_enabled: boolean;
  payment_updates: boolean;
  report_published: boolean;
  attendance_alerts: boolean;
  weekly_summary: boolean;
  streak_reminder: boolean;
  assignment_reminders: boolean;
}

const preferenceCategories = [
  {
    title: 'Communication Channels',
    icon: BellIcon,
    preferences: [
      {
        key: 'email_enabled' as keyof NotificationPreferences,
        label: 'Email Notifications',
        description: 'Receive notifications via email',
        icon: EnvelopeIcon
      },
      {
        key: 'sms_enabled' as keyof NotificationPreferences,
        label: 'SMS Notifications',
        description: 'Receive notifications via SMS',
        icon: DevicePhoneMobileIcon
      }
    ]
  },
  {
    title: 'Academic & Learning',
    icon: TrophyIcon,
    preferences: [
      {
        key: 'assignment_reminders' as keyof NotificationPreferences,
        label: 'Assignment Reminders',
        description: 'Get reminded about upcoming assignments',
        icon: CheckCircleIcon
      },
      {
        key: 'streak_reminder' as keyof NotificationPreferences,
        label: 'Streak Reminders',
        description: 'Daily reminders to maintain your learning streak',
        icon: FireIcon
      }
    ]
  },
  {
    title: 'Administrative',
    icon: CogIcon,
    preferences: [
      {
        key: 'payment_updates' as keyof NotificationPreferences,
        label: 'Payment Updates',
        description: 'Billing and payment notifications',
        icon: ExclamationTriangleIcon
      },
      {
        key: 'report_published' as keyof NotificationPreferences,
        label: 'Report Notifications',
        description: 'When new reports are available',
        icon: CheckCircleIcon
      },
      {
        key: 'attendance_alerts' as keyof NotificationPreferences,
        label: 'Attendance Alerts',
        description: 'Attendance-related notifications',
        icon: ExclamationTriangleIcon
      },
      {
        key: 'weekly_summary' as keyof NotificationPreferences,
        label: 'Weekly Summary',
        description: 'Weekly progress and activity summaries',
        icon: CheckCircleIcon
      }
    ]
  }
];

export default function NotificationPreferences() {
  const { profile } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    email_enabled: true,
    sms_enabled: true,
    payment_updates: true,
    report_published: true,
    attendance_alerts: true,
    weekly_summary: true,
    streak_reminder: true,
    assignment_reminders: true
  });
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [popupEnabled, setPopupEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  useEffect(() => {
    if (profile) {
      loadPreferences();
    }
    
    const savedSoundEnabled = localStorage.getItem('notificationSoundEnabled');
    if (savedSoundEnabled !== null) {
      setSoundEnabled(savedSoundEnabled === 'true');
    }
    
    const savedPopupEnabled = localStorage.getItem('notificationPopupEnabled');
    if (savedPopupEnabled !== null) {
      setPopupEnabled(savedPopupEnabled === 'true');
    }
  }, [profile]);

  async function loadPreferences() {
    if (!profile?.id) return;
    
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('portal_user_id', profile.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setPreferences({
          email_enabled: data.email_enabled ?? true,
          sms_enabled: data.sms_enabled ?? true,
          payment_updates: data.payment_updates ?? true,
          report_published: data.report_published ?? true,
          attendance_alerts: data.attendance_alerts ?? true,
          weekly_summary: data.weekly_summary ?? true,
          streak_reminder: data.streak_reminder ?? true,
          assignment_reminders: data.assignment_reminders ?? true
        });
      }
    } catch (error) {
      console.error('Failed to load notification preferences:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updatePreference(key: keyof NotificationPreferences, value: boolean) {
    if (!profile?.id) return;

    const newPreferences = { ...preferences, [key]: value };
    setPreferences(newPreferences);
    setSaving(true);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({
          portal_user_id: profile.id,
          ...newPreferences
        });

      if (error) throw error;
      
      setLastSaved(new Date());
    } catch (error) {
      console.error('Failed to update notification preferences:', error);
      setPreferences(preferences);
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefaults() {
    if (!profile?.id) return;
    
    const defaultPreferences: NotificationPreferences = {
      email_enabled: true,
      sms_enabled: false,
      payment_updates: true,
      report_published: true,
      attendance_alerts: true,
      weekly_summary: true,
      streak_reminder: true,
      assignment_reminders: true
    };

    setPreferences(defaultPreferences);
    setSoundEnabled(true);
    setPopupEnabled(true);
    setSaving(true);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({
          portal_user_id: profile.id,
          ...defaultPreferences
        });

      if (error) throw error;
      setLastSaved(new Date());
    } catch (error) {
      console.error('Failed to reset preferences:', error);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-foreground">Notification Preferences</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Customize how and when you receive notifications
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {lastSaved && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-xs text-emerald-400 flex items-center gap-1"
            >
              <CheckCircleIcon className="w-3 h-3" />
              Saved {lastSaved.toLocaleTimeString()}
            </motion.span>
          )}
          
          <button
            onClick={resetToDefaults}
            disabled={saving}
            className="px-4 py-2 bg-muted hover:bg-muted/80 text-muted-foreground text-sm font-medium transition-colors disabled:opacity-50"
          >
            Reset to Defaults
          </button>
        </div>
      </div>

      {/* Preference Categories */}
      <div className="space-y-8">
        {preferenceCategories.map((category, categoryIndex) => {
          const CategoryIcon = category.icon;
          
          return (
            <motion.div
              key={category.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: categoryIndex * 0.1 }}
              className="bg-card border border-border p-6"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 bg-orange-500/10 border border-orange-500/30 flex items-center justify-center">
                  <CategoryIcon className="w-4 h-4 text-orange-400" />
                </div>
                <h3 className="text-lg font-bold text-foreground">{category.title}</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {category.preferences.map((pref, prefIndex) => {
                  const PrefIcon = pref.icon;
                  const isEnabled = preferences[pref.key];
                  
                  return (
                    <motion.div
                      key={pref.key}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: (categoryIndex * 0.1) + (prefIndex * 0.05) }}
                      className={`
                        relative p-4 border transition-all duration-200 cursor-pointer
                        ${isEnabled 
                          ? 'border-orange-500/30 bg-orange-500/5' 
                          : 'border-border bg-background hover:border-muted-foreground/30'
                        }
                      `}
                      onClick={() => updatePreference(pref.key, !isEnabled)}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`
                          flex-shrink-0 w-8 h-8 rounded-full border flex items-center justify-center transition-all
                          ${isEnabled 
                            ? 'bg-orange-500 border-orange-500 text-white' 
                            : 'bg-muted border-border text-muted-foreground'
                          }
                        `}>
                          {isEnabled ? (
                            <CheckCircleIcon className="w-4 h-4" />
                          ) : (
                            <PrefIcon className="w-4 h-4" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className={`
                            text-sm font-bold mb-1 transition-colors
                            ${isEnabled ? 'text-foreground' : 'text-muted-foreground'}
                          `}>
                            {pref.label}
                          </h4>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {pref.description}
                          </p>
                        </div>

                        {/* Toggle Switch */}
                        <div className="flex-shrink-0">
                          <div className={`
                            relative w-10 h-6 rounded-full transition-all duration-200 cursor-pointer
                            ${isEnabled ? 'bg-orange-500' : 'bg-muted'}
                          `}>
                            <motion.div
                              className="absolute top-1 w-4 h-4 bg-card rounded-full shadow-sm"
                              animate={{ x: isEnabled ? 20 : 2 }}
                              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Loading overlay */}
                      {saving && (
                        <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center">
                          <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="bg-muted/30 border border-border p-6">
        <h3 className="text-lg font-bold text-foreground mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            onClick={() => {
              Object.keys(preferences).forEach(key => {
                if (key.includes('enabled')) {
                  updatePreference(key as keyof NotificationPreferences, true);
                }
              });
            }}
            className="flex items-center justify-center gap-2 p-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
          >
            <BellIcon className="w-4 h-4" />
            Enable All
          </button>
          
          <button
            onClick={() => {
              Object.keys(preferences).forEach(key => {
                if (key.includes('enabled')) {
                  updatePreference(key as keyof NotificationPreferences, false);
                }
              });
            }}
            className="flex items-center justify-center gap-2 p-3 bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
            Disable All
          </button>
          
          <button
            onClick={() => {
              setSoundEnabled(!soundEnabled);
              localStorage.setItem('notificationSoundEnabled', (!soundEnabled).toString());
            }}
            className={`
              flex items-center justify-center gap-2 p-3 text-sm font-medium transition-colors
              ${soundEnabled 
                ? 'bg-orange-600 hover:bg-orange-500 text-white' 
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
              }
            `}
          >
            {soundEnabled ? (
              <SpeakerWaveIcon className="w-4 h-4" />
            ) : (
              <XMarkIcon className="w-4 h-4" />
            )}
            {soundEnabled ? 'Sounds On' : 'Sounds Off'}
          </button>
        </div>
      </div>

      {/* Sound Settings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-card border border-border p-6"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 bg-orange-500/10 border border-orange-500/30 flex items-center justify-center">
            <SpeakerWaveIcon className="w-4 h-4 text-orange-400" />
          </div>
          <h3 className="text-lg font-bold text-foreground">Sound Settings</h3>
        </div>
        
        <SoundSettings />
      </motion.div>
    </div>
  );
}