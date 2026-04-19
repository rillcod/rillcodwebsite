# Notification Sounds

This directory contains sound files for notification alerts.

## Required Sound Files

Add the following sound files to enable audio notifications:

- `notification.mp3` - General notification sound
- `achievement.mp3` - Achievement unlock sound
- `streak.mp3` - Streak milestone sound
- `celebration.mp3` - Celebration/success sound
- `warning.mp3` - Warning/alert sound
- `error.mp3` - Error notification sound

## Sound Guidelines

- Keep files under 100KB for fast loading
- Use MP3 format for broad browser compatibility
- Keep volume levels consistent across all files
- Duration should be 1-3 seconds maximum
- Use pleasant, non-intrusive tones

## Free Sound Resources

You can find free notification sounds at:
- Freesound.org
- Zapsplat.com
- Adobe Stock Audio
- YouTube Audio Library

## Implementation

Sounds are automatically played for notifications when:
1. User has sound enabled in preferences
2. Notification type supports sound
3. Browser allows audio playback (user interaction required)

The notification system gracefully handles missing sound files and audio playback errors.