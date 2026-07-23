import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverPortalCredentials } from '@/lib/credentials/deliver-portal-credentials';

type AnySupabase = SupabaseClient<any>;

export type ConsentNewStudentCredential = {
  studentPortalId: string;
  email: string;
  name: string;
  password: string;
};

/** Deliver (or silently archive) credentials after consent portal account creation. */
export async function deliverConsentPortalCreationCredentials(
  admin: AnySupabase,
  input: {
    parentId: string;
    parentEmail: string;
    parentName: string;
    parentPhone: string | null;
    parentPassword: string;
    newStudents: ConsentNewStudentCredential[];
    schoolId: string | null;
    schoolName: string | null;
    silent?: boolean;
    title?: string;
    emailSubject?: string;
    bodyIntro?: string;
  },
) {
  return deliverPortalCredentials(admin, {
    parent: {
      userId: input.parentId,
      email: input.parentEmail,
      displayName: input.parentName,
      role: 'parent',
      storedPassword: input.parentPassword,
    },
    students: input.newStudents.map((student) => ({
      userId: student.studentPortalId,
      email: student.email,
      displayName: student.name,
      role: 'student' as const,
      storedPassword: student.password,
    })),
    parentPhone: input.parentPhone,
    parentName: input.parentName,
    schoolName: input.schoolName,
    schoolId: input.schoolId,
    resetPolicy: 'never',
    archiveToRegistrationResults: true,
    emailChannel: 'system',
    skipDelivery: input.silent === true,
    title: input.title ?? `Welcome to ${input.schoolName ?? 'Rillcod'}`,
    emailSubject: input.emailSubject ?? 'Your Rillcod Parent Portal Account Details',
    bodyIntro: input.bodyIntro,
  });
}

/** Notify an existing parent when brand-new student logins were added from consent. */
export async function deliverConsentNewStudentCredentials(
  admin: AnySupabase,
  input: {
    parentId: string;
    parentEmail: string;
    parentName: string;
    parentPhone: string | null;
    newStudents: ConsentNewStudentCredential[];
    schoolId: string | null;
    schoolName: string | null;
    silent?: boolean;
  },
) {
  if (input.newStudents.length === 0) {
    return { email: false, whatsapp: false, channels: [] as string[] };
  }
  return deliverPortalCredentials(admin, {
    parent: {
      userId: input.parentId,
      email: input.parentEmail,
      displayName: input.parentName,
      role: 'parent',
      storedPassword: null,
    },
    students: input.newStudents.map((student) => ({
      userId: student.studentPortalId,
      email: student.email,
      displayName: student.name,
      role: 'student' as const,
      storedPassword: student.password,
    })),
    parentPhone: input.parentPhone,
    parentName: input.parentName,
    schoolName: input.schoolName,
    schoolId: input.schoolId,
    resetPolicy: 'never',
    archiveToRegistrationResults: true,
    emailChannel: 'system',
    skipDelivery: input.silent === true,
    title: `New Student Login${input.newStudents.length > 1 ? 's' : ''} Ready`,
    emailSubject: `Your Child's Rillcod Student Login`,
    bodyIntro: `Dear ${input.parentName}, ${input.newStudents.length > 1 ? 'your children now have their own student logins' : 'your child now has their own student login'} on your Rillcod parent account.`,
  });
}
