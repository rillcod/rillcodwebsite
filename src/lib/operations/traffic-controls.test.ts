import {
  DEFAULT_TRAFFIC_CONTROLS,
  evaluateMutationOrigin,
  isSafeApiMethod,
  mutationRouteFamily,
  parseTrafficControls,
  validateTrafficControls,
} from './traffic-controls';

describe('traffic controls', () => {
  it('does not count safe reads as write traffic', () => {
    expect(isSafeApiMethod('GET')).toBe(true);
    expect(isSafeApiMethod('head')).toBe(true);
    expect(isSafeApiMethod('POST')).toBe(false);
    expect(isSafeApiMethod('DELETE')).toBe(false);
  });

  it('uses one stable family across record ids', () => {
    expect(mutationRouteFamily('/api/assignments/one/submissions')).toBe('assignments');
    expect(mutationRouteFamily('/api/assignments/two')).toBe('assignments');
    expect(mutationRouteFamily('/dashboard')).toBe('api');
  });

  it('keeps generous defaults when settings are absent or malformed', () => {
    expect(parseTrafficControls(null)).toEqual(DEFAULT_TRAFFIC_CONTROLS);
    expect(parseTrafficControls({
      api_mutation_requests_per_window: 'bad',
      api_mutation_window_seconds: -4,
    })).toEqual({
      ...DEFAULT_TRAFFIC_CONTROLS,
      api_mutation_window_seconds: 10,
    });
  });

  it('allows an administrator to turn protection off and tune safe bounds', () => {
    expect(parseTrafficControls({
      api_mutation_rate_limit_enabled: false,
      api_mutation_requests_per_window: 500,
      api_mutation_window_seconds: 120,
      api_origin_guard_mode: 'observe',
      api_additional_allowed_origins: '',
    })).toEqual({
      api_mutation_rate_limit_enabled: false,
      api_mutation_requests_per_window: 500,
      api_mutation_window_seconds: 120,
      api_origin_guard_mode: 'observe',
      api_additional_allowed_origins: '',
    });
    expect(validateTrafficControls({ api_mutation_requests_per_window: 29 })).toMatch(/30/);
    expect(validateTrafficControls({ api_mutation_requests_per_window: 30 })).toBeNull();
  });

  it('observes cross-site browser writes without rejecting native or server work', () => {
    const request = (origin: string | null, site: string | null = null) => ({
      method: 'POST',
      url: 'https://www.rillcod.com/api/assignments',
      headers: { get: (name: string) => name === 'origin' ? origin : name === 'sec-fetch-site' ? site : null },
    });
    expect(evaluateMutationOrigin(request('https://www.rillcod.com'), DEFAULT_TRAFFIC_CONTROLS).accepted).toBe(true);
    expect(evaluateMutationOrigin(request('capacitor://localhost'), DEFAULT_TRAFFIC_CONTROLS).accepted).toBe(true);
    expect(evaluateMutationOrigin(request(null), DEFAULT_TRAFFIC_CONTROLS).accepted).toBe(true);
    expect(evaluateMutationOrigin(request('https://attacker.example', 'cross-site'), DEFAULT_TRAFFIC_CONTROLS).accepted).toBe(false);
  });
});
