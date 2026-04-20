// ─── Central Type Barrel ──────────────────────────────────────────────────────
// Import all types from one place: import type { Student, Teacher } from '@/types'

export type { UserRole, UserProfile, AuthContextType } from './auth.types';
export type { Student, ProspectiveStudent, StudentFormData } from './student.types';
export type { School, SchoolFormData } from './school.types';
export type { Teacher, TeacherFormData } from './teacher.types';
export type { StudentReport, OrgSettings, EngagementMetrics } from './reports';

// ─── Shared utility types ─────────────────────────────────────────────────────
export type ApiResponse<T> = {
  data: T | null;
  error: string | null;
};

export type PaginatedResponse<T> = ApiResponse<T> & {
  count: number;
  page: number;
  pageSize: number;
};

export type LoadingState = 'idle' | 'loading' | 'success' | 'error';