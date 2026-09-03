import {
  createDashboardGateToken,
  DASHBOARD_GATE_TTL_SECONDS,
  verifyDashboardGateToken,
} from './dashboard-gate';

const SECRET = 'test-only-dashboard-gate-secret';
const NOW = Date.UTC(2026, 8, 3, 12, 0, 0);

describe('dashboard gate token', () => {
  it('round-trips a short-lived signed account snapshot', () => {
    const token = createDashboardGateToken(
      { userId: 'user-1', role: 'teacher', active: true },
      NOW,
      SECRET,
    );

    expect(verifyDashboardGateToken(token ?? undefined, 'user-1', NOW, SECRET)).toEqual({
      userId: 'user-1',
      role: 'teacher',
      active: true,
      expiresAt: Math.floor(NOW / 1000) + DASHBOARD_GATE_TTL_SECONDS,
    });
  });

  it('rejects tampering, a different user, expiry, and an absent secret', () => {
    const token = createDashboardGateToken(
      { userId: 'user-1', role: 'student', active: true },
      NOW,
      SECRET,
    )!;

    expect(verifyDashboardGateToken(`${token}x`, 'user-1', NOW, SECRET)).toBeNull();
    expect(verifyDashboardGateToken(token, 'user-2', NOW, SECRET)).toBeNull();
    expect(verifyDashboardGateToken(
      token,
      'user-1',
      NOW + DASHBOARD_GATE_TTL_SECONDS * 1000,
      SECRET,
    )).toBeNull();
    expect(createDashboardGateToken(
      { userId: 'user-1', role: 'student', active: true },
      NOW,
      null,
    )).toBeNull();
  });
});
