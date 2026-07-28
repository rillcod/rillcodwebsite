import type { SupabaseClient } from '@supabase/supabase-js';
import {
  normalizeEnrollmentType,
  type CanonicalEnrollmentType,
} from '@/lib/registration/enrollment-types';

type AnySupabase = SupabaseClient<any>;

export type ConsentGatewaySelection = {
  schoolId: string;
  enrollmentType?: string | null;
  academicOfferingId?: string | null;
  classId?: string | null;
  actorId?: string | null;
};

export type ResolvedConsentGateway = {
  enrollmentType: CanonicalEnrollmentType;
  academicOfferingId: string | null;
  classId: string | null;
};

/**
 * Validate one consent-form destination against the central academic pathway.
 * This is deliberately shared by create/edit APIs so a consent form can never
 * point at a class, school and offering that disagree.
 */
export async function resolveConsentGateway(
  admin: AnySupabase,
  input: ConsentGatewaySelection,
): Promise<ResolvedConsentGateway> {
  const enrollmentType = normalizeEnrollmentType(input.enrollmentType, 'school');
  const classId = input.classId || null;
  let academicOfferingId = input.academicOfferingId || null;

  type ClassRow = {
    id: string;
    school_id: string | null;
    status: string | null;
    academic_offering_id: string | null;
  };

  if (classId) {
    const { data } = await admin
      .from('classes')
      .select('id, school_id, status, academic_offering_id')
      .eq('id', classId)
      .maybeSingle();
    const selectedClass = data as ClassRow | null;
    if (!selectedClass || selectedClass.school_id !== input.schoolId || selectedClass.status === 'archived') {
      throw new Error('Choose an active official class belonging to this school.');
    }
    if (academicOfferingId && selectedClass.academic_offering_id
      && selectedClass.academic_offering_id !== academicOfferingId) {
      throw new Error('The selected class belongs to a different academic pathway.');
    }
    academicOfferingId = academicOfferingId || selectedClass.academic_offering_id;
  }

  if (academicOfferingId) {
    const { data: offering } = await admin
      .from('academic_offerings')
      .select('id, enrollment_type, school_id, status')
      .eq('id', academicOfferingId)
      .maybeSingle();
    if (!offering || offering.status !== 'active') {
      throw new Error('Choose an active academic pathway.');
    }
    if (offering.school_id && offering.school_id !== input.schoolId) {
      throw new Error('The selected academic pathway belongs to another school.');
    }
    if (normalizeEnrollmentType(offering.enrollment_type, 'school') !== enrollmentType) {
      throw new Error('The learning pathway and academic pathway do not match.');
    }
  } else if (enrollmentType !== 'school') {
    throw new Error('Choose the exact Online, Special or In-person academic pathway for this form.');
  }

  if (classId) {
    const { data, error } = await (admin as any).rpc('ensure_class_academic_pathway', {
      p_class_id: classId,
      p_enrollment_type: enrollmentType,
      p_preferred_offering_id: academicOfferingId,
      p_actor_id: input.actorId || null,
    });
    if (error) throw new Error(error.message || 'Could not connect the class to this academic pathway.');
    academicOfferingId = data?.academic_offering_id || academicOfferingId;
  }

  return { enrollmentType, academicOfferingId, classId };
}
