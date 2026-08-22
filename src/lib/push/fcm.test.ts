import { describe, expect, it } from 'vitest';
import { buildFcmMessage } from './fcm';

describe('FCM HTTP v1 message', () => {
  it('keeps the same destination and customer copy across notification platforms', () => {
    const result = buildFcmMessage('device-token', {
      title: 'New result',
      body: 'Ada’s report is ready.',
      url: '/dashboard/parent-results',
    });

    expect(result.message.token).toBe('device-token');
    expect(result.message.notification).toEqual({
      title: 'New result',
      body: 'Ada’s report is ready.',
    });
    expect(result.message.data.url).toBe('/dashboard/parent-results');
    expect(result.message.android.notification.click_action).toBe('FCM_PLUGIN_ACTIVITY');
    expect(result.message.apns.payload.url).toBe('/dashboard/parent-results');
  });
});
