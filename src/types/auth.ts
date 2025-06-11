// User Roles and Authentication Types
export type UserRole = 'super_admin' | 'school_admin' | 'teacher' | 'student' | 'parent';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  schoolId?: string; // For school-specific users
  isActive: boolean;
  createdAt: Date;
  lastLogin?: Date;
  profileImage?: string;
}

export interface SuperAdmin extends User {
  role: 'super_admin';
  permissions: {
    manageSchools: boolean;
    manageUsers: boolean;
    viewAnalytics: boolean;
    systemSettings: boolean;
  };
}

export interface SchoolAdmin extends User {
  role: 'school_admin';
  schoolId: string;
  permissions: {
    manageTeachers: boolean;
    manageStudents: boolean;
    manageClasses: boolean;
    viewReports: boolean;
    manageFinance: boolean;
  };
}

export interface Teacher extends User {
  role: 'teacher';
  schoolId: string;
  subjects: string[];
  classes: string[];
  permissions: {
    manageStudents: boolean;
    createAssignments: boolean;
    gradeAssignments: boolean;
    viewReports: boolean;
    communicateWithParents: boolean;
  };
}

export interface Student extends User {
  role: 'student';
  schoolId: string;
  classId: string;
  grade: string;
  parentId?: string;
  enrollmentDate: Date;
  academicStatus: 'active' | 'suspended' | 'graduated' | 'transferred';
}

export interface Parent extends User {
  role: 'parent';
  children: string[]; // Array of student IDs
  phoneNumber: string;
  address: string;
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
  logo?: string;
  isActive: boolean;
  subscriptionPlan: 'basic' | 'premium' | 'enterprise';
  maxStudents: number;
  maxTeachers: number;
  createdAt: Date;
  adminId: string;
}

export interface Class {
  id: string;
  name: string;
  schoolId: string;
  grade: string;
  section: string;
  teacherId: string;
  academicYear: string;
  isActive: boolean;
  subjects: string[];
  schedule: ClassSchedule[];
}

export interface ClassSchedule {
  day: string;
  startTime: string;
  endTime: string;
  subject: string;
  teacherId: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  schoolId: string;
  description: string;
  isActive: boolean;
}

// Academic Management Types
export interface Enrollment {
  id: string;
  studentId: string;
  schoolId: string;
  classId: string;
  academicYear: string;
  enrollmentDate: Date;
  status: 'active' | 'withdrawn' | 'graduated';
  previousSchool?: string;
}

export interface Attendance {
  id: string;
  studentId: string;
  classId: string;
  subjectId: string;
  date: Date;
  status: 'present' | 'absent' | 'late' | 'excused';
  markedBy: string;
  remarks?: string;
}

export interface BehaviorRecord {
  id: string;
  studentId: string;
  teacherId: string;
  date: Date;
  type: 'positive' | 'negative' | 'neutral';
  description: string;
  points: number;
  category: string;
}

export interface PerformanceReport {
  id: string;
  studentId: string;
  classId: string;
  academicYear: string;
  term: string;
  subjects: SubjectPerformance[];
  totalScore: number;
  averageScore: number;
  grade: string;
  remarks: string;
  generatedBy: string;
  generatedAt: Date;
}

export interface SubjectPerformance {
  subjectId: string;
  subjectName: string;
  score: number;
  grade: string;
  remarks: string;
}

// CBT System Types
export interface CBTTest {
  id: string;
  title: string;
  description: string;
  schoolId: string;
  classId: string;
  subjectId: string;
  duration: number; // in minutes
  totalQuestions: number;
  passingScore: number;
  isActive: boolean;
  startDate: Date;
  endDate: Date;
  createdBy: string;
  createdAt: Date;
  questions: CBTQuestion[];
}

export interface CBTQuestion {
  id: string;
  testId: string;
  question: string;
  type: 'multiple_choice' | 'true_false' | 'essay' | 'diagram';
  options?: string[];
  correctAnswer: string | string[];
  marks: number;
  diagram?: string; // Base64 encoded diagram
  explanation?: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface CBTResult {
  id: string;
  testId: string;
  studentId: string;
  score: number;
  totalMarks: number;
  percentage: number;
  grade: string;
  timeTaken: number; // in minutes
  submittedAt: Date;
  answers: CBTAnswer[];
}

export interface CBTAnswer {
  questionId: string;
  studentAnswer: string;
  isCorrect: boolean;
  marksObtained: number;
}

// Learning Management Types
export interface Lesson {
  id: string;
  title: string;
  description: string;
  subjectId: string;
  classId: string;
  teacherId: string;
  content: string;
  videoUrl?: string;
  attachments: string[];
  objectives: string[];
  duration: number; // in minutes
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Assignment {
  id: string;
  title: string;
  description: string;
  subjectId: string;
  classId: string;
  teacherId: string;
  dueDate: Date;
  totalMarks: number;
  attachments: string[];
  isPublished: boolean;
  createdAt: Date;
  submissions: AssignmentSubmission[];
}

export interface AssignmentSubmission {
  id: string;
  assignmentId: string;
  studentId: string;
  content: string;
  attachments: string[];
  submittedAt: Date;
  gradedAt?: Date;
  marksObtained?: number;
  feedback?: string;
  gradedBy?: string;
}

export interface Quiz {
  id: string;
  title: string;
  description: string;
  subjectId: string;
  classId: string;
  teacherId: string;
  duration: number;
  totalQuestions: number;
  isActive: boolean;
  startDate: Date;
  endDate: Date;
  questions: QuizQuestion[];
}

export interface QuizQuestion {
  id: string;
  quizId: string;
  question: string;
  type: 'multiple_choice' | 'true_false' | 'short_answer';
  options?: string[];
  correctAnswer: string;
  marks: number;
}

// Financial System Types
export interface FeeStructure {
  id: string;
  schoolId: string;
  name: string;
  description: string;
  academicYear: string;
  items: FeeItem[];
  isActive: boolean;
  createdAt: Date;
}

export interface FeeItem {
  id: string;
  name: string;
  amount: number;
  frequency: 'one_time' | 'monthly' | 'quarterly' | 'annually';
  dueDate?: Date;
  isOptional: boolean;
}

export interface Invoice {
  id: string;
  studentId: string;
  schoolId: string;
  academicYear: string;
  term: string;
  items: InvoiceItem[];
  totalAmount: number;
  paidAmount: number;
  balance: number;
  dueDate: Date;
  status: 'pending' | 'partial' | 'paid' | 'overdue';
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceItem {
  id: string;
  name: string;
  amount: number;
  paidAmount: number;
  balance: number;
}

export interface Payment {
  id: string;
  invoiceId: string;
  studentId: string;
  amount: number;
  method: 'cash' | 'bank_transfer' | 'card' | 'online';
  reference: string;
  status: 'pending' | 'completed' | 'failed';
  processedAt: Date;
  processedBy: string;
}

// Communication Types
export interface Message {
  id: string;
  senderId: string;
  senderRole: UserRole;
  recipientId: string;
  recipientRole: UserRole;
  subject: string;
  content: string;
  attachments: string[];
  isRead: boolean;
  isImportant: boolean;
  sentAt: Date;
  readAt?: Date;
}

export interface Announcement {
  id: string;
  schoolId: string;
  title: string;
  content: string;
  targetAudience: UserRole[];
  isImportant: boolean;
  isPublished: boolean;
  publishedAt: Date;
  expiresAt?: Date;
  createdBy: string;
  createdAt: Date;
}

export interface CommunicationBook {
  id: string;
  studentId: string;
  teacherId: string;
  parentId: string;
  date: Date;
  type: 'general' | 'academic' | 'behavior' | 'attendance';
  message: string;
  response?: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Event {
  id: string;
  schoolId: string;
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  location: string;
  targetAudience: UserRole[];
  isActive: boolean;
  createdAt: Date;
  createdBy: string;
}

// Notification Types
export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isRead: boolean;
  actionUrl?: string;
  createdAt: Date;
  readAt?: Date;
}

// Analytics and Reporting Types
export interface SchoolAnalytics {
  schoolId: string;
  totalStudents: number;
  totalTeachers: number;
  totalClasses: number;
  attendanceRate: number;
  averagePerformance: number;
  revenue: number;
  expenses: number;
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  date: Date;
}

export interface StudentAnalytics {
  studentId: string;
  attendanceRate: number;
  averageScore: number;
  behaviorScore: number;
  assignmentsCompleted: number;
  assignmentsPending: number;
  period: 'weekly' | 'monthly' | 'term' | 'yearly';
  date: Date;
} 