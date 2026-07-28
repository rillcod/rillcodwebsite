import { describe, expect, it, vi } from 'vitest';
import { resolveConsentGateway } from './pathway-gateway';

function queryReturning(data: unknown) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

function gatewayClient(rows: { classRow?: unknown; offeringRow?: unknown } = {}) {
  const rpc = vi.fn().mockResolvedValue({
    data: { academic_offering_id: 'offering-special' },
    error: null,
  });
  const admin = {
    from: vi.fn((table: string) => queryReturning(
      table === 'classes' ? rows.classRow : rows.offeringRow,
    )),
    rpc,
  };
  return { admin, rpc };
}

describe('consent academic pathway gateway', () => {
  it('accepts Summer School as the canonical Special programme pathway', async () => {
    const { admin } = gatewayClient({
      offeringRow: {
        id: 'offering-special',
        enrollment_type: 'special',
        school_id: 'school-1',
        status: 'active',
      },
    });

    await expect(resolveConsentGateway(admin as never, {
      schoolId: 'school-1',
      enrollmentType: 'summer_school',
      academicOfferingId: 'offering-special',
    })).resolves.toEqual({
      enrollmentType: 'special',
      academicOfferingId: 'offering-special',
      classId: null,
    });
  });

  it('refuses to mix a Special learner gateway with an Online offering', async () => {
    const { admin } = gatewayClient({
      offeringRow: {
        id: 'offering-online',
        enrollment_type: 'online',
        school_id: null,
        status: 'active',
      },
    });

    await expect(resolveConsentGateway(admin as never, {
      schoolId: 'school-1',
      enrollmentType: 'special',
      academicOfferingId: 'offering-online',
    })).rejects.toThrow('learning pathway and academic pathway do not match');
  });

  it('requires an exact offering for every non-school gateway', async () => {
    const { admin } = gatewayClient();

    await expect(resolveConsentGateway(admin as never, {
      schoolId: 'school-1',
      enrollmentType: 'in_person',
    })).rejects.toThrow('Choose the exact Online, Special or In-person academic pathway');
  });

  it('binds an official class through the central database pathway function', async () => {
    const { admin, rpc } = gatewayClient({
      classRow: {
        id: 'class-1',
        school_id: 'school-1',
        status: 'active',
        academic_offering_id: 'offering-special',
      },
      offeringRow: {
        id: 'offering-special',
        enrollment_type: 'special',
        school_id: 'school-1',
        status: 'active',
      },
    });

    const result = await resolveConsentGateway(admin as never, {
      schoolId: 'school-1',
      enrollmentType: 'summer_school',
      classId: 'class-1',
      actorId: 'admin-1',
    });

    expect(rpc).toHaveBeenCalledWith('ensure_class_academic_pathway', {
      p_class_id: 'class-1',
      p_enrollment_type: 'special',
      p_preferred_offering_id: 'offering-special',
      p_actor_id: 'admin-1',
    });
    expect(result.enrollmentType).toBe('special');
  });
});
