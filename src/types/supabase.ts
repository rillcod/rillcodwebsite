export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          school_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          school_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          school_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      announcement_reads: {
        Row: {
          announcement_id: string
          portal_user_id: string
          read_at: string
        }
        Insert: {
          announcement_id: string
          portal_user_id: string
          read_at?: string
        }
        Update: {
          announcement_id?: string
          portal_user_id?: string
          read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_reads_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_reads_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      announcements: {
        Row: {
          author_id: string | null
          content: string
          created_at: string | null
          id: string
          is_active: boolean | null
          school_id: string | null
          target_audience: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          school_id?: string | null
          target_audience?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          school_id?: string | null
          target_audience?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "announcements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value?: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      assignment_submissions: {
        Row: {
          answers: Json | null
          assignment_id: string | null
          feedback: string | null
          file_url: string | null
          grade: number | null
          graded_at: string | null
          graded_by: string | null
          id: string
          portal_user_id: string | null
          status: string | null
          student_id: string | null
          submission_text: string | null
          submitted_at: string | null
          updated_at: string | null
          user_id: string | null
          weighted_score: number | null
        }
        Insert: {
          answers?: Json | null
          assignment_id?: string | null
          feedback?: string | null
          file_url?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          portal_user_id?: string | null
          status?: string | null
          student_id?: string | null
          submission_text?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          weighted_score?: number | null
        }
        Update: {
          answers?: Json | null
          assignment_id?: string | null
          feedback?: string | null
          file_url?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          portal_user_id?: string | null
          status?: string | null
          student_id?: string | null
          submission_text?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          weighted_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "assignment_submissions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "assignment_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      assignments: {
        Row: {
          assignment_type: string | null
          class_id: string | null
          course_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          instructions: string | null
          is_active: boolean | null
          lesson_id: string | null
          max_points: number | null
          metadata: Json | null
          questions: Json | null
          school_id: string | null
          school_name: string | null
          title: string
          updated_at: string | null
          weight: number
        }
        Insert: {
          assignment_type?: string | null
          class_id?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          lesson_id?: string | null
          max_points?: number | null
          metadata?: Json | null
          questions?: Json | null
          school_id?: string | null
          school_name?: string | null
          title: string
          updated_at?: string | null
          weight?: number
        }
        Update: {
          assignment_type?: string | null
          class_id?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          lesson_id?: string | null
          max_points?: number | null
          metadata?: Json | null
          questions?: Json | null
          school_id?: string | null
          school_name?: string | null
          title?: string
          updated_at?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "assignments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          recorded_by: string | null
          session_id: string | null
          status: string | null
          student_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          recorded_by?: string | null
          session_id?: string | null
          status?: string | null
          student_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          recorded_by?: string | null
          session_id?: string | null
          status?: string | null
          student_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      badges: {
        Row: {
          created_at: string | null
          criteria: Json | null
          description: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          name: string
          points_value: number | null
          school_id: string | null
        }
        Insert: {
          created_at?: string | null
          criteria?: Json | null
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          points_value?: number | null
          school_id?: string | null
        }
        Update: {
          created_at?: string | null
          criteria?: Json | null
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          points_value?: number | null
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "badges_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      card_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          card_id: string | null
          created_at: string
          details: Json | null
          entity: string
          id: string
          school_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          card_id?: string | null
          created_at?: string
          details?: Json | null
          entity?: string
          id?: string
          school_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          card_id?: string | null
          created_at?: string
          details?: Json | null
          entity?: string
          id?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "card_audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "card_audit_logs_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "identity_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_audit_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      card_scan_logs: {
        Row: {
          card_id: string
          created_at: string
          id: string
          metadata: Json | null
          scan_result: string
          scanned_by: string | null
          school_id: string | null
          source: string
        }
        Insert: {
          card_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          scan_result?: string
          scanned_by?: string | null
          school_id?: string | null
          source?: string
        }
        Update: {
          card_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          scan_result?: string
          scanned_by?: string | null
          school_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_scan_logs_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "identity_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_scan_logs_scanned_by_fkey"
            columns: ["scanned_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_scan_logs_scanned_by_fkey"
            columns: ["scanned_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "card_scan_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      cbt_exams: {
        Row: {
          course_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          duration_minutes: number
          end_date: string | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          passing_score: number | null
          program_id: string | null
          school_id: string | null
          start_date: string | null
          title: string
          total_questions: number
          updated_at: string | null
        }
        Insert: {
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes: number
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          passing_score?: number | null
          program_id?: string | null
          school_id?: string | null
          start_date?: string | null
          title: string
          total_questions: number
          updated_at?: string | null
        }
        Update: {
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          passing_score?: number | null
          program_id?: string | null
          school_id?: string | null
          start_date?: string | null
          title?: string
          total_questions?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cbt_exams_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cbt_exams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cbt_exams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "cbt_exams_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cbt_exams_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      cbt_questions: {
        Row: {
          correct_answer: string | null
          created_at: string | null
          exam_id: string | null
          id: string
          metadata: Json | null
          options: Json | null
          order_index: number | null
          points: number | null
          question_text: string
          question_type: string | null
          updated_at: string | null
        }
        Insert: {
          correct_answer?: string | null
          created_at?: string | null
          exam_id?: string | null
          id?: string
          metadata?: Json | null
          options?: Json | null
          order_index?: number | null
          points?: number | null
          question_text: string
          question_type?: string | null
          updated_at?: string | null
        }
        Update: {
          correct_answer?: string | null
          created_at?: string | null
          exam_id?: string | null
          id?: string
          metadata?: Json | null
          options?: Json | null
          order_index?: number | null
          points?: number | null
          question_text?: string
          question_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cbt_questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "cbt_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      cbt_sessions: {
        Row: {
          answers: Json | null
          created_at: string | null
          end_time: string | null
          exam_id: string | null
          grading_notes: string | null
          id: string
          manual_scores: Json | null
          needs_grading: boolean | null
          score: number | null
          start_time: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          answers?: Json | null
          created_at?: string | null
          end_time?: string | null
          exam_id?: string | null
          grading_notes?: string | null
          id?: string
          manual_scores?: Json | null
          needs_grading?: boolean | null
          score?: number | null
          start_time?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          answers?: Json | null
          created_at?: string | null
          end_time?: string | null
          exam_id?: string | null
          grading_notes?: string | null
          id?: string
          manual_scores?: Json | null
          needs_grading?: boolean | null
          score?: number | null
          start_time?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cbt_sessions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "cbt_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cbt_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cbt_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      certificates: {
        Row: {
          certificate_number: string
          course_id: string | null
          created_at: string | null
          id: string
          issued_date: string
          metadata: Json | null
          pdf_url: string | null
          portal_user_id: string | null
          template_id: string | null
          verification_code: string
        }
        Insert: {
          certificate_number: string
          course_id?: string | null
          created_at?: string | null
          id?: string
          issued_date: string
          metadata?: Json | null
          pdf_url?: string | null
          portal_user_id?: string | null
          template_id?: string | null
          verification_code: string
        }
        Update: {
          certificate_number?: string
          course_id?: string | null
          created_at?: string | null
          id?: string
          issued_date?: string
          metadata?: Json | null
          pdf_url?: string | null
          portal_user_id?: string | null
          template_id?: string | null
          verification_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      class_sessions: {
        Row: {
          class_id: string | null
          created_at: string | null
          description: string | null
          end_time: string | null
          id: string
          is_active: boolean | null
          is_online: boolean | null
          location: string | null
          meeting_url: string | null
          session_date: string
          start_time: string | null
          status: string | null
          title: string | null
          topic: string | null
          updated_at: string | null
        }
        Insert: {
          class_id?: string | null
          created_at?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          is_active?: boolean | null
          is_online?: boolean | null
          location?: string | null
          meeting_url?: string | null
          session_date: string
          start_time?: string | null
          status?: string | null
          title?: string | null
          topic?: string | null
          updated_at?: string | null
        }
        Update: {
          class_id?: string | null
          created_at?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          is_active?: boolean | null
          is_online?: boolean | null
          location?: string | null
          meeting_url?: string | null
          session_date?: string
          start_time?: string | null
          status?: string | null
          title?: string | null
          topic?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_sessions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string | null
          current_students: number | null
          description: string | null
          end_date: string | null
          id: string
          max_students: number | null
          name: string
          program_id: string | null
          schedule: string | null
          school_id: string | null
          start_date: string | null
          status: string | null
          teacher_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_students?: number | null
          description?: string | null
          end_date?: string | null
          id?: string
          max_students?: number | null
          name: string
          program_id?: string | null
          schedule?: string | null
          school_id?: string | null
          start_date?: string | null
          status?: string | null
          teacher_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_students?: number | null
          description?: string | null
          end_date?: string | null
          id?: string
          max_students?: number | null
          name?: string
          program_id?: string | null
          schedule?: string | null
          school_id?: string | null
          start_date?: string | null
          status?: string | null
          teacher_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      content_library: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attribution: string | null
          category: string | null
          content_type: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          file_id: string | null
          grade_level: string | null
          id: string
          is_active: boolean | null
          is_approved: boolean | null
          license_type: string | null
          rating_average: number | null
          rating_count: number | null
          school_id: string | null
          subject: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          usage_count: number | null
          version: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attribution?: string | null
          category?: string | null
          content_type?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          file_id?: string | null
          grade_level?: string | null
          id?: string
          is_active?: boolean | null
          is_approved?: boolean | null
          license_type?: string | null
          rating_average?: number | null
          rating_count?: number | null
          school_id?: string | null
          subject?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          usage_count?: number | null
          version?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attribution?: string | null
          category?: string | null
          content_type?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          file_id?: string | null
          grade_level?: string | null
          id?: string
          is_active?: boolean | null
          is_approved?: boolean | null
          license_type?: string | null
          rating_average?: number | null
          rating_count?: number | null
          school_id?: string | null
          subject?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          usage_count?: number | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_library_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_library_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "content_library_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_library_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "content_library_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_library_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      content_ratings: {
        Row: {
          content_id: string | null
          created_at: string | null
          id: string
          portal_user_id: string | null
          rating: number | null
          review: string | null
        }
        Insert: {
          content_id?: string | null
          created_at?: string | null
          id?: string
          portal_user_id?: string | null
          rating?: number | null
          review?: string | null
        }
        Update: {
          content_id?: string | null
          created_at?: string | null
          id?: string
          portal_user_id?: string | null
          rating?: number | null
          review?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_ratings_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_ratings_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_ratings_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      course_materials: {
        Row: {
          course_id: string | null
          created_at: string | null
          description: string | null
          file_size: number | null
          file_type: string | null
          file_url: string | null
          id: string
          is_active: boolean | null
          order_index: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          course_id?: string | null
          created_at?: string | null
          description?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          order_index?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          course_id?: string | null
          created_at?: string | null
          description?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          order_index?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_materials_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          content: string | null
          created_at: string | null
          description: string | null
          duration_hours: number | null
          id: string
          is_active: boolean | null
          is_locked: boolean
          order_index: number | null
          program_id: string | null
          school_id: string | null
          school_name: string | null
          teacher_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          description?: string | null
          duration_hours?: number | null
          id?: string
          is_active?: boolean | null
          is_locked?: boolean
          order_index?: number | null
          program_id?: string | null
          school_id?: string | null
          school_name?: string | null
          teacher_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          description?: string | null
          duration_hours?: number | null
          id?: string
          is_active?: boolean | null
          is_locked?: boolean
          order_index?: number | null
          program_id?: string | null
          school_id?: string | null
          school_name?: string | null
          teacher_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      discussion_attachments: {
        Row: {
          created_at: string | null
          file_id: string | null
          id: string
          reply_id: string | null
          topic_id: string | null
        }
        Insert: {
          created_at?: string | null
          file_id?: string | null
          id?: string
          reply_id?: string | null
          topic_id?: string | null
        }
        Update: {
          created_at?: string | null
          file_id?: string | null
          id?: string
          reply_id?: string | null
          topic_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discussion_attachments_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_attachments_reply_id_fkey"
            columns: ["reply_id"]
            isOneToOne: false
            referencedRelation: "discussion_replies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_attachments_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "discussion_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      discussion_replies: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          is_accepted_answer: boolean | null
          parent_reply_id: string | null
          topic_id: string | null
          updated_at: string | null
          upvotes: number | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_accepted_answer?: boolean | null
          parent_reply_id?: string | null
          topic_id?: string | null
          updated_at?: string | null
          upvotes?: number | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_accepted_answer?: boolean | null
          parent_reply_id?: string | null
          topic_id?: string | null
          updated_at?: string | null
          upvotes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "discussion_replies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_replies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "discussion_replies_parent_reply_id_fkey"
            columns: ["parent_reply_id"]
            isOneToOne: false
            referencedRelation: "discussion_replies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_replies_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "discussion_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      discussion_topics: {
        Row: {
          content: string
          course_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_locked: boolean | null
          is_pinned: boolean | null
          is_resolved: boolean | null
          title: string
          updated_at: string | null
          upvotes: number | null
          view_count: number | null
        }
        Insert: {
          content: string
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_locked?: boolean | null
          is_pinned?: boolean | null
          is_resolved?: boolean | null
          title: string
          updated_at?: string | null
          upvotes?: number | null
          view_count?: number | null
        }
        Update: {
          content?: string
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_locked?: boolean | null
          is_pinned?: boolean | null
          is_resolved?: boolean | null
          title?: string
          updated_at?: string | null
          upvotes?: number | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "discussion_topics_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_topics_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_topics_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      engage_posts: {
        Row: {
          author_name: string
          code_snippet: string | null
          content: string
          created_at: string | null
          id: string
          language: string | null
          likes: number
          user_id: string
        }
        Insert: {
          author_name: string
          code_snippet?: string | null
          content: string
          created_at?: string | null
          id?: string
          language?: string | null
          likes?: number
          user_id: string
        }
        Update: {
          author_name?: string
          code_snippet?: string | null
          content?: string
          created_at?: string | null
          id?: string
          language?: string | null
          likes?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engage_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engage_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      enrollments: {
        Row: {
          completion_date: string | null
          created_at: string | null
          enrollment_date: string
          grade: string | null
          id: string
          last_activity_at: string | null
          notes: string | null
          program_id: string | null
          progress_pct: number | null
          role: string
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          completion_date?: string | null
          created_at?: string | null
          enrollment_date?: string
          grade?: string | null
          id?: string
          last_activity_at?: string | null
          notes?: string | null
          program_id?: string | null
          progress_pct?: number | null
          role: string
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          completion_date?: string | null
          created_at?: string | null
          enrollment_date?: string
          grade?: string | null
          id?: string
          last_activity_at?: string | null
          notes?: string | null
          program_id?: string | null
          progress_pct?: number | null
          role?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      exam_attempts: {
        Row: {
          answers: Json | null
          attempt_number: number | null
          created_at: string | null
          exam_id: string | null
          id: string
          percentage: number | null
          portal_user_id: string | null
          score: number | null
          started_at: string | null
          status: string | null
          submitted_at: string | null
          tab_switches: number | null
          total_points: number | null
        }
        Insert: {
          answers?: Json | null
          attempt_number?: number | null
          created_at?: string | null
          exam_id?: string | null
          id?: string
          percentage?: number | null
          portal_user_id?: string | null
          score?: number | null
          started_at?: string | null
          status?: string | null
          submitted_at?: string | null
          tab_switches?: number | null
          total_points?: number | null
        }
        Update: {
          answers?: Json | null
          attempt_number?: number | null
          created_at?: string | null
          exam_id?: string | null
          id?: string
          percentage?: number | null
          portal_user_id?: string | null
          score?: number | null
          started_at?: string | null
          status?: string | null
          submitted_at?: string | null
          tab_switches?: number | null
          total_points?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_attempts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_attempts_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_attempts_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      exam_questions: {
        Row: {
          correct_answer: Json | null
          created_at: string | null
          exam_id: string | null
          explanation: string | null
          id: string
          options: Json | null
          order_index: number | null
          points: number | null
          question_text: string
          question_type: string | null
        }
        Insert: {
          correct_answer?: Json | null
          created_at?: string | null
          exam_id?: string | null
          explanation?: string | null
          id?: string
          options?: Json | null
          order_index?: number | null
          points?: number | null
          question_text: string
          question_type?: string | null
        }
        Update: {
          correct_answer?: Json | null
          created_at?: string | null
          exam_id?: string | null
          explanation?: string | null
          id?: string
          options?: Json | null
          order_index?: number | null
          points?: number | null
          question_text?: string
          question_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          course_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          is_active: boolean | null
          max_attempts: number | null
          passing_score: number | null
          randomize_options: boolean | null
          randomize_questions: boolean | null
          title: string
          total_points: number | null
          updated_at: string | null
        }
        Insert: {
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          max_attempts?: number | null
          passing_score?: number | null
          randomize_options?: boolean | null
          randomize_questions?: boolean | null
          title: string
          total_points?: number | null
          updated_at?: string | null
        }
        Update: {
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          max_attempts?: number | null
          passing_score?: number | null
          randomize_options?: boolean | null
          randomize_questions?: boolean | null
          title?: string
          total_points?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exams_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      files: {
        Row: {
          created_at: string | null
          download_count: number | null
          file_size: number
          file_type: string
          filename: string
          id: string
          is_virus_scanned: boolean | null
          metadata: Json | null
          mime_type: string | null
          original_filename: string
          public_url: string | null
          school_id: string | null
          storage_path: string
          storage_provider: string | null
          thumbnail_url: string | null
          updated_at: string | null
          uploaded_by: string | null
          virus_scan_result: string | null
        }
        Insert: {
          created_at?: string | null
          download_count?: number | null
          file_size: number
          file_type: string
          filename: string
          id?: string
          is_virus_scanned?: boolean | null
          metadata?: Json | null
          mime_type?: string | null
          original_filename: string
          public_url?: string | null
          school_id?: string | null
          storage_path: string
          storage_provider?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          virus_scan_result?: string | null
        }
        Update: {
          created_at?: string | null
          download_count?: number | null
          file_size?: number
          file_type?: string
          filename?: string
          id?: string
          is_virus_scanned?: boolean | null
          metadata?: Json | null
          mime_type?: string | null
          original_filename?: string
          public_url?: string | null
          school_id?: string | null
          storage_path?: string
          storage_provider?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          virus_scan_result?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "files_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      flagged_content: {
        Row: {
          content_id: string
          content_type: string
          created_at: string | null
          id: string
          moderator_id: string | null
          moderator_notes: string | null
          reason: string
          reporter_id: string | null
          school_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string | null
          id?: string
          moderator_id?: string | null
          moderator_notes?: string | null
          reason: string
          reporter_id?: string | null
          school_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string | null
          id?: string
          moderator_id?: string | null
          moderator_notes?: string | null
          reason?: string
          reporter_id?: string | null
          school_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flagged_content_moderator_id_fkey"
            columns: ["moderator_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flagged_content_moderator_id_fkey"
            columns: ["moderator_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "flagged_content_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flagged_content_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "flagged_content_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_reports: {
        Row: {
          created_at: string | null
          file_url: string | null
          generated_at: string | null
          generated_by: string | null
          id: string
          report_data: Json | null
          report_name: string
          template_id: string | null
        }
        Insert: {
          created_at?: string | null
          file_url?: string | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          report_data?: Json | null
          report_name: string
          template_id?: string | null
        }
        Update: {
          created_at?: string | null
          file_url?: string | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          report_data?: Json | null
          report_name?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "generated_reports_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_reports: {
        Row: {
          average_score: number | null
          generated_at: string | null
          graded_assignments: number | null
          highest_score: number | null
          id: string
          letter_grade: string | null
          lowest_score: number | null
          portal_user_id: string | null
          program_id: string | null
          student_id: string | null
          total_assignments: number | null
          updated_at: string | null
        }
        Insert: {
          average_score?: number | null
          generated_at?: string | null
          graded_assignments?: number | null
          highest_score?: number | null
          id?: string
          letter_grade?: string | null
          lowest_score?: number | null
          portal_user_id?: string | null
          program_id?: string | null
          student_id?: string | null
          total_assignments?: number | null
          updated_at?: string | null
        }
        Update: {
          average_score?: number | null
          generated_at?: string | null
          graded_assignments?: number | null
          highest_score?: number | null
          id?: string
          letter_grade?: string | null
          lowest_score?: number | null
          portal_user_id?: string | null
          program_id?: string | null
          student_id?: string | null
          total_assignments?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grade_reports_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_reports_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "grade_reports_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_reports_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_cards: {
        Row: {
          activated_at: string | null
          card_number: string
          class_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          holder_id: string
          holder_type: string
          id: string
          issued_at: string
          metadata: Json | null
          revoked_at: string | null
          revoked_reason: string | null
          school_id: string | null
          status: string
          template_type: string
          updated_at: string
          updated_by: string | null
          verification_code: string
        }
        Insert: {
          activated_at?: string | null
          card_number: string
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          holder_id: string
          holder_type: string
          id?: string
          issued_at?: string
          metadata?: Json | null
          revoked_at?: string | null
          revoked_reason?: string | null
          school_id?: string | null
          status?: string
          template_type?: string
          updated_at?: string
          updated_by?: string | null
          verification_code: string
        }
        Update: {
          activated_at?: string | null
          card_number?: string
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          holder_id?: string
          holder_type?: string
          id?: string
          issued_at?: string
          metadata?: Json | null
          revoked_at?: string | null
          revoked_reason?: string | null
          school_id?: string | null
          status?: string
          template_type?: string
          updated_at?: string
          updated_by?: string | null
          verification_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_cards_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_cards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_cards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "identity_cards_holder_id_fkey"
            columns: ["holder_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_cards_holder_id_fkey"
            columns: ["holder_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "identity_cards_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_cards_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_cards_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      invoice_payment_proofs: {
        Row: {
          created_at: string
          id: string
          invoice_id: string
          payer_note: string | null
          proof_image_url: string
          submitted_by: string
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_id: string
          payer_note?: string | null
          proof_image_url: string
          submitted_by: string
        }
        Update: {
          created_at?: string
          id?: string
          invoice_id?: string
          payer_note?: string | null
          proof_image_url?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payment_proofs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payment_proofs_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payment_proofs_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          due_date: string | null
          id: string
          invoice_number: string
          items: Json | null
          metadata: Json | null
          notes: string | null
          payment_link: string | null
          payment_transaction_id: string | null
          portal_user_id: string | null
          school_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          due_date?: string | null
          id?: string
          invoice_number: string
          items?: Json | null
          metadata?: Json | null
          notes?: string | null
          payment_link?: string | null
          payment_transaction_id?: string | null
          portal_user_id?: string | null
          school_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string
          items?: Json | null
          metadata?: Json | null
          notes?: string | null
          payment_link?: string | null
          payment_transaction_id?: string | null
          portal_user_id?: string | null
          school_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "invoices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_projects: {
        Row: {
          assignment_id: string | null
          blocks_xml: string | null
          code: string | null
          created_at: string | null
          id: string
          is_public: boolean | null
          language: string
          lesson_id: string | null
          preview_url: string | null
          title: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          assignment_id?: string | null
          blocks_xml?: string | null
          code?: string | null
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          language: string
          lesson_id?: string | null
          preview_url?: string | null
          title: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          assignment_id?: string | null
          blocks_xml?: string | null
          code?: string | null
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          language?: string
          lesson_id?: string | null
          preview_url?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_projects_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_projects_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      leaderboards: {
        Row: {
          course_id: string | null
          created_at: string | null
          id: string
          period_end: string | null
          period_start: string | null
          points: number | null
          portal_user_id: string | null
          rank: number | null
          updated_at: string | null
        }
        Insert: {
          course_id?: string | null
          created_at?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          points?: number | null
          portal_user_id?: string | null
          rank?: number | null
          updated_at?: string | null
        }
        Update: {
          course_id?: string | null
          created_at?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          points?: number | null
          portal_user_id?: string | null
          rank?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leaderboards_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboards_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboards_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      lesson_materials: {
        Row: {
          created_at: string | null
          file_type: string | null
          file_url: string
          id: string
          is_public: boolean | null
          lesson_id: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          file_type?: string | null
          file_url: string
          id?: string
          is_public?: boolean | null
          lesson_id?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          file_type?: string | null
          file_url?: string
          id?: string
          is_public?: boolean | null
          lesson_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_materials_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_plans: {
        Row: {
          activities: string | null
          assessment_methods: string | null
          created_at: string | null
          id: string
          lesson_id: string | null
          objectives: string | null
          staff_notes: string | null
          summary_notes: string | null
          updated_at: string | null
        }
        Insert: {
          activities?: string | null
          assessment_methods?: string | null
          created_at?: string | null
          id?: string
          lesson_id?: string | null
          objectives?: string | null
          staff_notes?: string | null
          summary_notes?: string | null
          updated_at?: string | null
        }
        Update: {
          activities?: string | null
          assessment_methods?: string | null
          created_at?: string | null
          id?: string
          lesson_id?: string | null
          objectives?: string | null
          staff_notes?: string | null
          summary_notes?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_plans_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: true
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          completed_at: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          lesson_id: string | null
          portal_user_id: string | null
          progress_percentage: number | null
          status: string | null
          time_spent_minutes: number | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          lesson_id?: string | null
          portal_user_id?: string | null
          progress_percentage?: number | null
          status?: string | null
          time_spent_minutes?: number | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          lesson_id?: string | null
          portal_user_id?: string | null
          progress_percentage?: number | null
          status?: string | null
          time_spent_minutes?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      lessons: {
        Row: {
          content: string | null
          content_layout: Json | null
          course_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          lesson_notes: string | null
          lesson_type: string | null
          order_index: number | null
          school_id: string | null
          school_name: string | null
          session_date: string | null
          status: string | null
          title: string
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          content?: string | null
          content_layout?: Json | null
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          lesson_notes?: string | null
          lesson_type?: string | null
          order_index?: number | null
          school_id?: string | null
          school_name?: string | null
          session_date?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          content?: string | null
          content_layout?: Json | null
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          lesson_notes?: string | null
          lesson_type?: string | null
          order_index?: number | null
          school_id?: string | null
          school_name?: string | null
          session_date?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "lessons_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      live_session_attendance: {
        Row: {
          created_at: string | null
          duration_minutes: number | null
          id: string
          joined_at: string | null
          left_at: string | null
          portal_user_id: string | null
          session_id: string | null
        }
        Insert: {
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          joined_at?: string | null
          left_at?: string | null
          portal_user_id?: string | null
          session_id?: string | null
        }
        Update: {
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          joined_at?: string | null
          left_at?: string | null
          portal_user_id?: string | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_session_attendance_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_attendance_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      live_session_breakout_participants: {
        Row: {
          created_at: string | null
          id: string
          joined_at: string | null
          left_at: string | null
          portal_user_id: string
          room_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          joined_at?: string | null
          left_at?: string | null
          portal_user_id: string
          room_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          joined_at?: string | null
          left_at?: string | null
          portal_user_id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_session_breakout_participants_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_breakout_participants_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "live_session_breakout_participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "live_session_breakout_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      live_session_breakout_rooms: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          max_participants: number | null
          name: string
          session_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          max_participants?: number | null
          name: string
          session_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          max_participants?: number | null
          name?: string
          session_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_session_breakout_rooms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_breakout_rooms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      live_session_poll_options: {
        Row: {
          created_at: string | null
          id: string
          is_correct: boolean | null
          option_text: string
          order_index: number | null
          poll_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_correct?: boolean | null
          option_text: string
          order_index?: number | null
          poll_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_correct?: boolean | null
          option_text?: string
          order_index?: number | null
          poll_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_session_poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "live_session_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      live_session_poll_responses: {
        Row: {
          created_at: string | null
          id: string
          option_id: string
          poll_id: string
          portal_user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          option_id: string
          poll_id: string
          portal_user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          option_id?: string
          poll_id?: string
          portal_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_session_poll_responses_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "live_session_poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_poll_responses_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "live_session_polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_poll_responses_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_poll_responses_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      live_session_polls: {
        Row: {
          allow_multiple: boolean | null
          created_at: string | null
          created_by: string | null
          ended_at: string | null
          id: string
          poll_type: string | null
          question: string
          session_id: string
          started_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          allow_multiple?: boolean | null
          created_at?: string | null
          created_by?: string | null
          ended_at?: string | null
          id?: string
          poll_type?: string | null
          question: string
          session_id: string
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          allow_multiple?: boolean | null
          created_at?: string | null
          created_by?: string | null
          ended_at?: string | null
          id?: string
          poll_type?: string | null
          question?: string
          session_id?: string
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_session_polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      live_sessions: {
        Row: {
          created_at: string
          description: string | null
          duration_minutes: number
          host_id: string
          id: string
          notes: string | null
          platform: string
          program_id: string | null
          recording_url: string | null
          scheduled_at: string
          school_id: string | null
          session_url: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_minutes?: number
          host_id: string
          id?: string
          notes?: string | null
          platform?: string
          program_id?: string | null
          recording_url?: string | null
          scheduled_at: string
          school_id?: string | null
          session_url?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_minutes?: number
          host_id?: string
          id?: string
          notes?: string | null
          platform?: string
          program_id?: string | null
          recording_url?: string | null
          scheduled_at?: string
          school_id?: string | null
          session_url?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_sessions_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "live_sessions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          read_at: string | null
          recipient_id: string | null
          sender_id: string | null
          subject: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          read_at?: string | null
          recipient_id?: string | null
          sender_id?: string | null
          subject?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          read_at?: string | null
          recipient_id?: string | null
          sender_id?: string | null
          subject?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      newsletter_delivery: {
        Row: {
          delivered_at: string | null
          id: string
          is_viewed: boolean | null
          newsletter_id: string | null
          user_id: string | null
        }
        Insert: {
          delivered_at?: string | null
          id?: string
          is_viewed?: boolean | null
          newsletter_id?: string | null
          user_id?: string | null
        }
        Update: {
          delivered_at?: string | null
          id?: string
          is_viewed?: boolean | null
          newsletter_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_delivery_newsletter_id_fkey"
            columns: ["newsletter_id"]
            isOneToOne: false
            referencedRelation: "newsletters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "newsletter_delivery_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "newsletter_delivery_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      newsletters: {
        Row: {
          author_id: string | null
          content: string
          created_at: string | null
          id: string
          image_url: string | null
          published_at: string | null
          school_id: string | null
          status: string | null
          title: string
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          published_at?: string | null
          school_id?: string | null
          status?: string | null
          title: string
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          published_at?: string | null
          school_id?: string | null
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletters_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "newsletters_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "newsletters_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          announcement_notifications: boolean | null
          assignment_reminders: boolean | null
          created_at: string | null
          discussion_replies: boolean | null
          email_enabled: boolean | null
          grade_notifications: boolean | null
          id: string
          marketing_emails: boolean | null
          portal_user_id: string | null
          push_enabled: boolean | null
          sms_enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          announcement_notifications?: boolean | null
          assignment_reminders?: boolean | null
          created_at?: string | null
          discussion_replies?: boolean | null
          email_enabled?: boolean | null
          grade_notifications?: boolean | null
          id?: string
          marketing_emails?: boolean | null
          portal_user_id?: string | null
          push_enabled?: boolean | null
          sms_enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          announcement_notifications?: boolean | null
          assignment_reminders?: boolean | null
          created_at?: string | null
          discussion_replies?: boolean | null
          email_enabled?: boolean | null
          grade_notifications?: boolean | null
          id?: string
          marketing_emails?: boolean | null
          portal_user_id?: string | null
          push_enabled?: boolean | null
          sms_enabled?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: true
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: true
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          subject: string | null
          type: string
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          subject?: string | null
          type: string
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          subject?: string | null
          type?: string
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string | null
          delivery_status: string | null
          external_id: string | null
          id: string
          is_read: boolean | null
          message: string
          notification_channel: string | null
          read_at: string | null
          retry_count: number | null
          sent_at: string | null
          title: string
          type: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          delivery_status?: string | null
          external_id?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          notification_channel?: string | null
          read_at?: string | null
          retry_count?: number | null
          sent_at?: string | null
          title: string
          type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          delivery_status?: string | null
          external_id?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          notification_channel?: string | null
          read_at?: string | null
          retry_count?: number | null
          sent_at?: string | null
          title?: string
          type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      parent_feedback: {
        Row: {
          category: string
          created_at: string
          id: string
          is_anonymous: boolean
          message: string
          portal_user_id: string
          rating: number | null
          status: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          is_anonymous?: boolean
          message: string
          portal_user_id: string
          rating?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_anonymous?: boolean
          message?: string
          portal_user_id?: string
          rating?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_feedback_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_feedback_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      payment_accounts: {
        Row: {
          account_name: string
          account_number: string
          account_type: string
          bank_name: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          label: string
          owner_type: string
          payment_note: string | null
          school_id: string | null
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number: string
          account_type?: string
          bank_name: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label: string
          owner_type?: string
          payment_note?: string | null
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          account_type?: string
          bank_name?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string
          owner_type?: string
          payment_note?: string | null
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "payment_accounts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount: number
          course_id: string | null
          created_at: string | null
          currency: string | null
          external_transaction_id: string | null
          id: string
          invoice_id: string | null
          paid_at: string | null
          payment_gateway_response: Json | null
          payment_method: string | null
          payment_status: string | null
          portal_user_id: string | null
          receipt_url: string | null
          refund_reason: string | null
          refunded_at: string | null
          school_id: string | null
          transaction_reference: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          course_id?: string | null
          created_at?: string | null
          currency?: string | null
          external_transaction_id?: string | null
          id?: string
          invoice_id?: string | null
          paid_at?: string | null
          payment_gateway_response?: Json | null
          payment_method?: string | null
          payment_status?: string | null
          portal_user_id?: string | null
          receipt_url?: string | null
          refund_reason?: string | null
          refunded_at?: string | null
          school_id?: string | null
          transaction_reference?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          course_id?: string | null
          created_at?: string | null
          currency?: string | null
          external_transaction_id?: string | null
          id?: string
          invoice_id?: string | null
          paid_at?: string | null
          payment_gateway_response?: Json | null
          payment_method?: string | null
          payment_status?: string | null
          portal_user_id?: string | null
          receipt_url?: string | null
          refund_reason?: string | null
          refunded_at?: string | null
          school_id?: string | null
          transaction_reference?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "payment_transactions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          notes: string | null
          payment_date: string | null
          payment_method: string | null
          payment_status: string | null
          program_id: string | null
          student_id: string | null
          transaction_id: string | null
          transaction_reference: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_status?: string | null
          program_id?: string | null
          student_id?: string | null
          transaction_id?: string | null
          transaction_reference?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_status?: string | null
          program_id?: string | null
          student_id?: string | null
          transaction_id?: string | null
          transaction_reference?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      point_transactions: {
        Row: {
          activity_type: string
          created_at: string | null
          description: string | null
          id: string
          points: number
          portal_user_id: string | null
          reference_id: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string | null
          description?: string | null
          id?: string
          points: number
          portal_user_id?: string | null
          reference_id?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string | null
          description?: string | null
          id?: string
          points?: number
          portal_user_id?: string | null
          reference_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "point_transactions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_transactions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      portal_users: {
        Row: {
          avatar_url: string | null
          bio: string | null
          class_id: string | null
          created_at: string | null
          created_by: string | null
          current_module: string | null
          date_of_birth: string | null
          email: string
          email_verified: boolean | null
          enrollment_type: string | null
          full_name: string
          id: string
          is_active: boolean | null
          is_deleted: boolean | null
          is_direct_enrollment: boolean | null
          last_login: string | null
          metadata: Json | null
          phone: string | null
          photo_url: string | null
          profile_image_url: string | null
          reputation_score: number | null
          role: string
          school_id: string | null
          school_name: string | null
          section_class: string | null
          student_id: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          class_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_module?: string | null
          date_of_birth?: string | null
          email: string
          email_verified?: boolean | null
          enrollment_type?: string | null
          full_name: string
          id?: string
          is_active?: boolean | null
          is_deleted?: boolean | null
          is_direct_enrollment?: boolean | null
          last_login?: string | null
          metadata?: Json | null
          phone?: string | null
          photo_url?: string | null
          profile_image_url?: string | null
          reputation_score?: number | null
          role: string
          school_id?: string | null
          school_name?: string | null
          section_class?: string | null
          student_id?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          class_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_module?: string | null
          date_of_birth?: string | null
          email?: string
          email_verified?: boolean | null
          enrollment_type?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          is_deleted?: boolean | null
          is_direct_enrollment?: boolean | null
          last_login?: string | null
          metadata?: Json | null
          phone?: string | null
          photo_url?: string | null
          profile_image_url?: string | null
          reputation_score?: number | null
          role?: string
          school_id?: string | null
          school_name?: string | null
          section_class?: string | null
          student_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_users_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "portal_users_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_users_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_projects: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_featured: boolean
          project_url: string | null
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean
          project_url?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean
          project_url?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      programs: {
        Row: {
          created_at: string | null
          description: string | null
          difficulty_level: string | null
          duration_weeks: number | null
          id: string
          is_active: boolean | null
          max_students: number | null
          name: string
          price: number | null
          school_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          difficulty_level?: string | null
          duration_weeks?: number | null
          id?: string
          is_active?: boolean | null
          max_students?: number | null
          name: string
          price?: number | null
          school_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          difficulty_level?: string | null
          duration_weeks?: number | null
          id?: string
          is_active?: boolean | null
          max_students?: number | null
          name?: string
          price?: number | null
          school_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      project_group_members: {
        Row: {
          group_id: string
          id: string
          individual_feedback: string | null
          individual_score: number | null
          joined_at: string
          student_id: string
          task_description: string | null
        }
        Insert: {
          group_id: string
          id?: string
          individual_feedback?: string | null
          individual_score?: number | null
          joined_at?: string
          student_id: string
          task_description?: string | null
        }
        Update: {
          group_id?: string
          id?: string
          individual_feedback?: string | null
          individual_score?: number | null
          joined_at?: string
          student_id?: string
          task_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "project_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_group_members_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_group_members_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      project_groups: {
        Row: {
          assignment_id: string | null
          class_id: string | null
          class_name: string | null
          created_at: string
          created_by: string | null
          evaluation_type: string
          group_feedback: string | null
          group_score: number | null
          id: string
          is_graded: boolean
          name: string
          school_id: string | null
          school_name: string | null
          updated_at: string
        }
        Insert: {
          assignment_id?: string | null
          class_id?: string | null
          class_name?: string | null
          created_at?: string
          created_by?: string | null
          evaluation_type?: string
          group_feedback?: string | null
          group_score?: number | null
          id?: string
          is_graded?: boolean
          name: string
          school_id?: string | null
          school_name?: string | null
          updated_at?: string
        }
        Update: {
          assignment_id?: string | null
          class_id?: string | null
          class_name?: string | null
          created_at?: string
          created_by?: string | null
          evaluation_type?: string
          group_feedback?: string | null
          group_score?: number | null
          id?: string
          is_graded?: boolean
          name?: string
          school_id?: string | null
          school_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_groups_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_groups_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "project_groups_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      prospective_students: {
        Row: {
          age: number | null
          course_interest: string | null
          created_at: string | null
          email: string
          full_name: string
          gender: string | null
          grade: string | null
          hear_about_us: string | null
          id: string
          is_active: boolean
          is_deleted: boolean
          notes: string | null
          parent_email: string | null
          parent_name: string | null
          parent_phone: string | null
          preferred_schedule: string | null
          school_id: string | null
          school_name: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          age?: number | null
          course_interest?: string | null
          created_at?: string | null
          email: string
          full_name: string
          gender?: string | null
          grade?: string | null
          hear_about_us?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          notes?: string | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          preferred_schedule?: string | null
          school_id?: string | null
          school_name?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          age?: number | null
          course_interest?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          gender?: string | null
          grade?: string | null
          hear_about_us?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          notes?: string | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          preferred_schedule?: string | null
          school_id?: string | null
          school_name?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospective_students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          amount: number
          currency: string | null
          id: string
          issued_at: string | null
          metadata: Json | null
          pdf_url: string | null
          receipt_number: string
          school_id: string | null
          student_id: string | null
          transaction_id: string | null
        }
        Insert: {
          amount: number
          currency?: string | null
          id?: string
          issued_at?: string | null
          metadata?: Json | null
          pdf_url?: string | null
          receipt_number: string
          school_id?: string | null
          student_id?: string | null
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          currency?: string | null
          id?: string
          issued_at?: string | null
          metadata?: Json | null
          pdf_url?: string | null
          receipt_number?: string
          school_id?: string | null
          student_id?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "receipts_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_batches: {
        Row: {
          class_id: string | null
          class_name: string | null
          created_at: string | null
          created_by: string | null
          id: string
          program_id: string | null
          school_id: string | null
          school_name: string | null
          student_count: number | null
        }
        Insert: {
          class_id?: string | null
          class_name?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          program_id?: string | null
          school_id?: string | null
          school_name?: string | null
          student_count?: number | null
        }
        Update: {
          class_id?: string | null
          class_name?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          program_id?: string | null
          school_id?: string | null
          school_name?: string | null
          student_count?: number | null
        }
        Relationships: []
      }
      registration_results: {
        Row: {
          batch_id: string
          class_name: string | null
          created_at: string | null
          email: string
          error: string | null
          full_name: string
          id: string
          password: string
          status: string
        }
        Insert: {
          batch_id: string
          class_name?: string | null
          created_at?: string | null
          email: string
          error?: string | null
          full_name: string
          id?: string
          password: string
          status: string
        }
        Update: {
          batch_id?: string
          class_name?: string | null
          created_at?: string | null
          email?: string
          error?: string | null
          full_name?: string
          id?: string
          password?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_results_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "registration_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      report_settings: {
        Row: {
          created_at: string | null
          default_instructor: string | null
          default_term: string | null
          id: string
          logo_url: string | null
          org_address: string | null
          org_email: string | null
          org_name: string | null
          org_phone: string | null
          org_tagline: string | null
          org_website: string | null
          school_id: string | null
          teacher_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_instructor?: string | null
          default_term?: string | null
          id?: string
          logo_url?: string | null
          org_address?: string | null
          org_email?: string | null
          org_name?: string | null
          org_phone?: string | null
          org_tagline?: string | null
          org_website?: string | null
          school_id?: string | null
          teacher_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_instructor?: string | null
          default_term?: string | null
          id?: string
          logo_url?: string | null
          org_address?: string | null
          org_email?: string | null
          org_name?: string | null
          org_phone?: string | null
          org_tagline?: string | null
          org_website?: string | null
          school_id?: string | null
          teacher_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_settings_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_settings_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      report_templates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          parameters: Json | null
          query_template: string | null
          template_type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          parameters?: Json | null
          query_template?: string | null
          template_type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          parameters?: Json | null
          query_template?: string | null
          template_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      schools: {
        Row: {
          address: string | null
          city: string | null
          contact_person: string | null
          created_at: string | null
          email: string | null
          enrollment_types: string[] | null
          id: string
          is_active: boolean | null
          is_deleted: boolean | null
          lga: string | null
          name: string
          phone: string | null
          program_interest: string[] | null
          rillcod_quota_percent: number | null
          school_type: string | null
          state: string | null
          status: string | null
          student_count: number | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string | null
          email?: string | null
          enrollment_types?: string[] | null
          id?: string
          is_active?: boolean | null
          is_deleted?: boolean | null
          lga?: string | null
          name: string
          phone?: string | null
          program_interest?: string[] | null
          rillcod_quota_percent?: number | null
          school_type?: string | null
          state?: string | null
          status?: string | null
          student_count?: number | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string | null
          email?: string | null
          enrollment_types?: string[] | null
          id?: string
          is_active?: boolean | null
          is_deleted?: boolean | null
          lga?: string | null
          name?: string
          phone?: string | null
          program_interest?: string[] | null
          rillcod_quota_percent?: number | null
          school_type?: string | null
          state?: string | null
          status?: string | null
          student_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      student_enrollments: {
        Row: {
          completion_date: string | null
          created_at: string | null
          enrollment_date: string
          grade: string | null
          id: string
          notes: string | null
          program_id: string | null
          status: string | null
          student_id: string | null
          updated_at: string | null
        }
        Insert: {
          completion_date?: string | null
          created_at?: string | null
          enrollment_date?: string
          grade?: string | null
          id?: string
          notes?: string | null
          program_id?: string | null
          status?: string | null
          student_id?: string | null
          updated_at?: string | null
        }
        Update: {
          completion_date?: string | null
          created_at?: string | null
          enrollment_date?: string
          grade?: string | null
          id?: string
          notes?: string | null
          program_id?: string | null
          status?: string | null
          student_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_enrollments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_progress: {
        Row: {
          assignments_completed: number | null
          average_grade: number | null
          completed_at: string | null
          course_id: string | null
          id: string
          lessons_completed: number | null
          portal_user_id: string | null
          started_at: string | null
          student_id: string | null
          total_assignments: number | null
          total_lessons: number | null
          updated_at: string | null
        }
        Insert: {
          assignments_completed?: number | null
          average_grade?: number | null
          completed_at?: string | null
          course_id?: string | null
          id?: string
          lessons_completed?: number | null
          portal_user_id?: string | null
          started_at?: string | null
          student_id?: string | null
          total_assignments?: number | null
          total_lessons?: number | null
          updated_at?: string | null
        }
        Update: {
          assignments_completed?: number | null
          average_grade?: number | null
          completed_at?: string | null
          course_id?: string | null
          id?: string
          lessons_completed?: number | null
          portal_user_id?: string | null
          started_at?: string | null
          student_id?: string | null
          total_assignments?: number | null
          total_lessons?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_progress_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_progress_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_progress_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_progress_reports: {
        Row: {
          areas_for_growth: string | null
          assignments_grade: string | null
          attendance_score: number | null
          certificate_text: string | null
          course_completed: string | null
          course_duration: string | null
          course_id: string | null
          course_name: string | null
          created_at: string | null
          current_module: string | null
          engagement_metrics: Json | null
          fee_amount: string | null
          fee_label: string | null
          fee_status: string | null
          has_certificate: boolean | null
          homework_grade: string | null
          id: string
          instructor_assessment: string | null
          instructor_name: string | null
          is_published: boolean | null
          key_strengths: string | null
          learning_milestones: string[] | null
          next_module: string | null
          overall_grade: string | null
          overall_score: number | null
          participation_grade: string | null
          participation_score: number | null
          photo_url: string | null
          practical_score: number | null
          proficiency_level: string | null
          projects_grade: string | null
          report_date: string | null
          report_period: string | null
          report_term: string | null
          school_id: string | null
          school_name: string | null
          school_section: string | null
          section_class: string | null
          show_payment_notice: boolean
          student_id: string
          student_name: string | null
          teacher_id: string | null
          theory_score: number | null
          updated_at: string | null
          verification_code: string | null
        }
        Insert: {
          areas_for_growth?: string | null
          assignments_grade?: string | null
          attendance_score?: number | null
          certificate_text?: string | null
          course_completed?: string | null
          course_duration?: string | null
          course_id?: string | null
          course_name?: string | null
          created_at?: string | null
          current_module?: string | null
          engagement_metrics?: Json | null
          fee_amount?: string | null
          fee_label?: string | null
          fee_status?: string | null
          has_certificate?: boolean | null
          homework_grade?: string | null
          id?: string
          instructor_assessment?: string | null
          instructor_name?: string | null
          is_published?: boolean | null
          key_strengths?: string | null
          learning_milestones?: string[] | null
          next_module?: string | null
          overall_grade?: string | null
          overall_score?: number | null
          participation_grade?: string | null
          participation_score?: number | null
          photo_url?: string | null
          practical_score?: number | null
          proficiency_level?: string | null
          projects_grade?: string | null
          report_date?: string | null
          report_period?: string | null
          report_term?: string | null
          school_id?: string | null
          school_name?: string | null
          school_section?: string | null
          section_class?: string | null
          show_payment_notice?: boolean
          student_id: string
          student_name?: string | null
          teacher_id?: string | null
          theory_score?: number | null
          updated_at?: string | null
          verification_code?: string | null
        }
        Update: {
          areas_for_growth?: string | null
          assignments_grade?: string | null
          attendance_score?: number | null
          certificate_text?: string | null
          course_completed?: string | null
          course_duration?: string | null
          course_id?: string | null
          course_name?: string | null
          created_at?: string | null
          current_module?: string | null
          engagement_metrics?: Json | null
          fee_amount?: string | null
          fee_label?: string | null
          fee_status?: string | null
          has_certificate?: boolean | null
          homework_grade?: string | null
          id?: string
          instructor_assessment?: string | null
          instructor_name?: string | null
          is_published?: boolean | null
          key_strengths?: string | null
          learning_milestones?: string[] | null
          next_module?: string | null
          overall_grade?: string | null
          overall_score?: number | null
          participation_grade?: string | null
          participation_score?: number | null
          photo_url?: string | null
          practical_score?: number | null
          proficiency_level?: string | null
          projects_grade?: string | null
          report_date?: string | null
          report_period?: string | null
          report_term?: string | null
          school_id?: string | null
          school_name?: string | null
          school_section?: string | null
          section_class?: string | null
          show_payment_notice?: boolean
          student_id?: string
          student_name?: string | null
          teacher_id?: string | null
          theory_score?: number | null
          updated_at?: string | null
          verification_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_progress_reports_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_progress_reports_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_progress_reports_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_progress_reports_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_progress_reports_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_progress_reports_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      students: {
        Row: {
          age: number | null
          allergies: string | null
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          city: string | null
          country: string | null
          course_interest: string | null
          created_at: string | null
          created_by: string | null
          current_class: string | null
          date_of_birth: string | null
          email: string | null
          enrollment_type: string | null
          full_name: string | null
          gender: string | null
          goals: string | null
          grade: string | null
          grade_level: string | null
          hear_about_us: string | null
          heard_about_us: string | null
          id: string
          interests: string | null
          is_active: boolean | null
          is_deleted: boolean | null
          medical_conditions: string | null
          name: string
          parent_email: string | null
          parent_name: string | null
          parent_phone: string | null
          parent_relationship: string | null
          phone: string | null
          preferred_schedule: string | null
          previous_programming_experience: string | null
          registration_payment_at: string | null
          registration_paystack_reference: string | null
          school: string | null
          school_id: string | null
          school_name: string | null
          section: string | null
          state: string | null
          status: string | null
          student_email: string | null
          student_number: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          age?: number | null
          allergies?: string | null
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          course_interest?: string | null
          created_at?: string | null
          created_by?: string | null
          current_class?: string | null
          date_of_birth?: string | null
          email?: string | null
          enrollment_type?: string | null
          full_name?: string | null
          gender?: string | null
          goals?: string | null
          grade?: string | null
          grade_level?: string | null
          hear_about_us?: string | null
          heard_about_us?: string | null
          id?: string
          interests?: string | null
          is_active?: boolean | null
          is_deleted?: boolean | null
          medical_conditions?: string | null
          name: string
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          parent_relationship?: string | null
          phone?: string | null
          preferred_schedule?: string | null
          previous_programming_experience?: string | null
          registration_payment_at?: string | null
          registration_paystack_reference?: string | null
          school?: string | null
          school_id?: string | null
          school_name?: string | null
          section?: string | null
          state?: string | null
          status?: string | null
          student_email?: string | null
          student_number?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          age?: number | null
          allergies?: string | null
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          course_interest?: string | null
          created_at?: string | null
          created_by?: string | null
          current_class?: string | null
          date_of_birth?: string | null
          email?: string | null
          enrollment_type?: string | null
          full_name?: string | null
          gender?: string | null
          goals?: string | null
          grade?: string | null
          grade_level?: string | null
          hear_about_us?: string | null
          heard_about_us?: string | null
          id?: string
          interests?: string | null
          is_active?: boolean | null
          is_deleted?: boolean | null
          medical_conditions?: string | null
          name?: string
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          parent_relationship?: string | null
          phone?: string | null
          preferred_schedule?: string | null
          previous_programming_experience?: string | null
          registration_payment_at?: string | null
          registration_paystack_reference?: string | null
          school?: string | null
          school_id?: string | null
          school_name?: string | null
          section?: string | null
          state?: string | null
          status?: string | null
          student_email?: string | null
          student_number?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "students_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount: number
          billing_cycle: string | null
          course_id: string | null
          created_at: string | null
          currency: string | null
          current_period_end: string | null
          current_period_start: string | null
          external_subscription_id: string | null
          id: string
          portal_user_id: string | null
          status: string | null
          subscription_plan: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          billing_cycle?: string | null
          course_id?: string | null
          created_at?: string | null
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          external_subscription_id?: string | null
          id?: string
          portal_user_id?: string | null
          status?: string | null
          subscription_plan?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          billing_cycle?: string | null
          course_id?: string | null
          created_at?: string | null
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          external_subscription_id?: string | null
          id?: string
          portal_user_id?: string | null
          status?: string | null
          subscription_plan?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      system_settings: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          is_public: boolean | null
          setting_key: string
          setting_value: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          setting_key: string
          setting_value?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          setting_key?: string
          setting_value?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      teacher_schools: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          id: string
          is_primary: boolean | null
          notes: string | null
          school_id: string
          teacher_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          is_primary?: boolean | null
          notes?: string | null
          school_id: string
          teacher_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          is_primary?: boolean | null
          notes?: string | null
          school_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_schools_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_schools_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "teacher_schools_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_schools_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_schools_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      teachers: {
        Row: {
          bio: string | null
          created_at: string | null
          created_by: string | null
          education: string | null
          email: string
          experience_years: number | null
          full_name: string
          id: string
          is_active: boolean | null
          phone: string | null
          subjects: string[] | null
          updated_at: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string | null
          created_by?: string | null
          education?: string | null
          email: string
          experience_years?: number | null
          full_name: string
          id?: string
          is_active?: boolean | null
          phone?: string | null
          subjects?: string[] | null
          updated_at?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string | null
          created_by?: string | null
          education?: string | null
          email?: string
          experience_years?: number | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          phone?: string | null
          subjects?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teachers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teachers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      timetable_slots: {
        Row: {
          course_id: string | null
          created_at: string
          day_of_week: string
          end_time: string
          id: string
          notes: string | null
          room: string | null
          start_time: string
          subject: string
          teacher_id: string | null
          teacher_name: string | null
          timetable_id: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          day_of_week: string
          end_time: string
          id?: string
          notes?: string | null
          room?: string | null
          start_time: string
          subject: string
          teacher_id?: string | null
          teacher_name?: string | null
          timetable_id: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          day_of_week?: string
          end_time?: string
          id?: string
          notes?: string | null
          room?: string | null
          start_time?: string
          subject?: string
          teacher_id?: string | null
          teacher_name?: string | null
          timetable_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_slots_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "timetable_slots_timetable_id_fkey"
            columns: ["timetable_id"]
            isOneToOne: false
            referencedRelation: "timetables"
            referencedColumns: ["id"]
          },
        ]
      }
      timetables: {
        Row: {
          academic_year: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          school_id: string | null
          section: string | null
          term: string | null
          title: string
          updated_at: string
        }
        Insert: {
          academic_year?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          school_id?: string | null
          section?: string | null
          term?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          academic_year?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          school_id?: string | null
          section?: string | null
          term?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetables_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetables_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "timetables_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_subscriptions: {
        Row: {
          created_at: string | null
          id: string
          topic_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          topic_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          topic_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "topic_subscriptions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "discussion_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      user_badges: {
        Row: {
          badge_id: string | null
          earned_at: string | null
          id: string
          metadata: Json | null
          portal_user_id: string | null
        }
        Insert: {
          badge_id?: string | null
          earned_at?: string | null
          id?: string
          metadata?: Json | null
          portal_user_id?: string | null
        }
        Update: {
          badge_id?: string | null
          earned_at?: string | null
          id?: string
          metadata?: Json | null
          portal_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      user_points: {
        Row: {
          achievement_level: string | null
          created_at: string | null
          current_streak: number | null
          id: string
          last_activity_date: string | null
          longest_streak: number | null
          portal_user_id: string | null
          total_points: number | null
          updated_at: string | null
        }
        Insert: {
          achievement_level?: string | null
          created_at?: string | null
          current_streak?: number | null
          id?: string
          last_activity_date?: string | null
          longest_streak?: number | null
          portal_user_id?: string | null
          total_points?: number | null
          updated_at?: string | null
        }
        Update: {
          achievement_level?: string | null
          created_at?: string | null
          current_streak?: number | null
          id?: string
          last_activity_date?: string | null
          longest_streak?: number | null
          portal_user_id?: string | null
          total_points?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_points_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: true
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_points_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: true
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          address: string | null
          bio: string | null
          city: string | null
          country: string | null
          created_at: string | null
          date_of_birth: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          gender: string | null
          id: string
          postal_code: string | null
          state: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          gender?: string | null
          id?: string
          postal_code?: string | null
          state?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          gender?: string | null
          id?: string
          postal_code?: string | null
          state?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      vault_items: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          id: string
          language: string
          tags: string[] | null
          title: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          language?: string
          tags?: string[] | null
          title: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          language?: string
          tags?: string[] | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      whatsapp_groups: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          link: string
          name: string
          school_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          link: string
          name: string
          school_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          link?: string
          name?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "whatsapp_groups_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      student_performance_summary: {
        Row: {
          avg_assignment_grade: number | null
          avg_exam_score: number | null
          enrolled_programs: number | null
          full_name: string | null
          lessons_completed: number | null
          school_id: string | null
          student_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_users_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_parent_and_link: {
        Args: {
          p_auth_user_id?: string
          p_email: string
          p_full_name: string
          p_phone: string
          p_relationship?: string
          p_student_id: string
        }
        Returns: Json
      }
      current_user_email: { Args: never; Returns: string }
      current_user_role: { Args: never; Returns: string }
      get_at_risk_students: {
        Args: { p_days_inactive?: number; p_school_id?: string }
        Returns: {
          avg_grade: number
          full_name: string
          last_login: string
          risk_level: string
          student_id: string
        }[]
      }
      get_course_avg_assignment_grade: {
        Args: { p_course_id: string }
        Returns: number
      }
      get_course_avg_exam_score: {
        Args: { p_course_id: string }
        Returns: number
      }
      get_my_role: { Args: never; Returns: string }
      get_my_school_id: { Args: never; Returns: string }
      get_parent_child_user_ids: { Args: never; Returns: string[] }
      get_parent_student_ids: { Args: never; Returns: string[] }
      get_timetable_ids_by_school: {
        Args: { p_school_id: string }
        Returns: string[]
      }
      increment_download_count: {
        Args: { file_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_teacher: { Args: never; Returns: boolean }
      is_parent: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      unlink_parent_from_student: {
        Args: { p_student_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
