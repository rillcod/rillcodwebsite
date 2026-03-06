// User Roles and Authentication Types
export type UserRole = 'admin' | 'teacher' | 'student' | 'school';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url?: string;
  is_active: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  last_sign_in_at?: string;
  metadata?: Record<string, any>;
}

export interface Admin extends User {
  role: 'admin';
  permissions: {
    manage_users: boolean;
    manage_teachers: boolean;
    manage_students: boolean;
    manage_courses: boolean;
    manage_assignments: boolean;
    view_analytics: boolean;
    manage_settings: boolean;
  };
}

export interface Teacher extends User {
  role: 'teacher';
  subjects: string[];
  classes: string[];
  permissions: {
    manage_students: boolean;
    create_assignments: boolean;
    grade_assignments: boolean;
    view_reports: boolean;
    communicate_with_students: boolean;
  };
}

export interface Student extends User {
  role: 'student';
  class_id: string;
  grade: string;
  enrollment_date: string;
  academic_status: 'active' | 'suspended' | 'graduated' | 'transferred';
}

// School Management Types
export interface School {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  email: string;
  website?: string;
  logo_url?: string;
  is_active: boolean;
  is_deleted: boolean;
  subscription_plan: 'basic' | 'premium' | 'enterprise';
  max_students: number;
  max_teachers: number;
  created_at: string;
  updated_at: string;
  admin_id: string;
}

export interface Class {
  id: string;
  name: string;
  school_id: string;
  grade: string;
  section: string;
  teacher_id: string;
  academic_year: string;
  is_active: boolean;
  is_deleted: boolean;
  subjects: string[];
  schedule: ClassSchedule[];
  created_at: string;
  updated_at: string;
}

export interface ClassSchedule {
  day: string;
  start_time: string;
  end_time: string;
  subject: string;
  teacher_id: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  school_id: string;
  description: string;
  is_active: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

// Academic Management Types
export interface Enrollment {
  id: string;
  student_id: string;
  school_id: string;
  class_id: string;
  academic_year: string;
  enrollment_date: string;
  status: 'active' | 'withdrawn' | 'graduated';
  previous_school?: string;
  created_at: string;
  updated_at: string;
}

export interface Attendance {
  id: string;
  student_id: string;
  class_id: string;
  subject_id: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  marked_by: string;
  remarks?: string;
  created_at: string;
  updated_at: string;
}

export interface BehaviorRecord {
  id: string;
  student_id: string;
  teacher_id: string;
  date: string;
  type: 'positive' | 'negative' | 'neutral';
  description: string;
  points: number;
  category: string;
  created_at: string;
  updated_at: string;
}

export interface PerformanceReport {
  id: string;
  student_id: string;
  class_id: string;
  academic_year: string;
  term: string;
  subjects: SubjectPerformance[];
  total_score: number;
  average_score: number;
  grade: string;
  remarks: string;
  generated_by: string;
  generated_at: string;
  created_at: string;
  updated_at: string;
}

export interface SubjectPerformance {
  subject_id: string;
  subject_name: string;
  score: number;
  grade: string;
  remarks: string;
}

// CBT System Types
export interface CBTTest {
  id: string;
  title: string;
  description: string;
  school_id: string;
  class_id: string;
  subject_id: string;
  duration: number; // in minutes
  total_questions: number;
  passing_score: number;
  is_active: boolean;
  is_deleted: boolean;
  start_date: string;
  end_date: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  questions: CBTQuestion[];
}

export interface CBTQuestion {
  id: string;
  test_id: string;
  question: string;
  type: 'multiple_choice' | 'true_false' | 'essay' | 'diagram';
  options?: string[];
  correct_answer: string;
  marks: number;
  diagram?: string; // Base64 encoded diagram
  explanation?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  created_at: string;
  updated_at: string;
}

export interface CBTResult {
  id: string;
  test_id: string;
  student_id: string;
  score: number;
  total_marks: number;
  percentage: number;
  grade: string;
  time_taken: number; // in minutes
  submitted_at: string;
  created_at: string;
  updated_at: string;
  answers: CBTAnswer[];
}

export interface CBTAnswer {
  question_id: string;
  student_answer: string;
  is_correct: boolean;
  marks_obtained: number;
}

// Course Management Types
export interface Lesson {
  id: string;
  title: string;
  description: string;
  subject_id: string;
  class_id: string;
  teacher_id: string;
  content: string;
  video_url?: string;
  attachments: string[];
  objectives: string[];
  duration: number; // in minutes
  is_published: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface Assignment {
  id: string;
  title: string;
  description: string;
  subject_id: string;
  class_id: string;
  teacher_id: string;
  due_date: string;
  total_marks: number;
  attachments: string[];
  is_published: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  submissions: AssignmentSubmission[];
}

export interface AssignmentSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  content: string;
  attachments: string[];
  submitted_at: string;
  graded_at?: string;
  marks_obtained?: number;
  feedback?: string;
  graded_by?: string;
  created_at: string;
  updated_at: string;
}

// Communication Types
export interface Message {
  id: string;
  sender_id: string;
  sender_role: UserRole;
  recipient_id: string;
  recipient_role: UserRole;
  subject: string;
  content: string;
  attachments: string[];
  is_read: boolean;
  is_important: boolean;
  sent_at: string;
  read_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Announcement {
  id: string;
  school_id: string;
  title: string;
  content: string;
  target_audience: UserRole[];
  is_important: boolean;
  is_published: boolean;
  is_deleted: boolean;
  published_at: string;
  expires_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  is_read: boolean;
  action_url?: string;
  created_at: string;
  read_at?: string;
}

// Analytics Types
export interface SchoolAnalytics {
  school_id: string;
  total_students: number;
  total_teachers: number;
  total_classes: number;
  attendance_rate: number;
  average_performance: number;
  revenue: number;
  expenses: number;
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  date: string;
  created_at: string;
  updated_at: string;
}

export interface StudentAnalytics {
  student_id: string;
  attendance_rate: number;
  average_score: number;
  behavior_score: number;
  assignments_completed: number;
  assignments_pending: number;
  period: 'weekly' | 'monthly' | 'term' | 'yearly';
  date: string;
  created_at: string;
  updated_at: string;
} 