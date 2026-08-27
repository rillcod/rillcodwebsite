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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      academic_assessment_evidence: {
        Row: {
          academic_offering_id: string | null
          academic_term_id: string | null
          assessment_id: string | null
          class_id: string | null
          context_status: string
          course_id: string | null
          created_at: string
          curriculum_release_id: string | null
          curriculum_term_number: number | null
          curriculum_week_number: number | null
          curriculum_year_number: number | null
          enrollment_type_snapshot: string | null
          evidence_snapshot: Json
          evidence_status: string
          evidence_type: string
          graded_at: string | null
          graded_by: string | null
          grading_mode: string | null
          id: string
          lesson_id: string | null
          lesson_plan_id: string | null
          maximum_score: number | null
          offering_period_id: string | null
          percentage: number | null
          raw_score: number | null
          school_id: string | null
          source_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          academic_offering_id?: string | null
          academic_term_id?: string | null
          assessment_id?: string | null
          class_id?: string | null
          context_status?: string
          course_id?: string | null
          created_at?: string
          curriculum_release_id?: string | null
          curriculum_term_number?: number | null
          curriculum_week_number?: number | null
          curriculum_year_number?: number | null
          enrollment_type_snapshot?: string | null
          evidence_snapshot?: Json
          evidence_status?: string
          evidence_type: string
          graded_at?: string | null
          graded_by?: string | null
          grading_mode?: string | null
          id?: string
          lesson_id?: string | null
          lesson_plan_id?: string | null
          maximum_score?: number | null
          offering_period_id?: string | null
          percentage?: number | null
          raw_score?: number | null
          school_id?: string | null
          source_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          academic_offering_id?: string | null
          academic_term_id?: string | null
          assessment_id?: string | null
          class_id?: string | null
          context_status?: string
          course_id?: string | null
          created_at?: string
          curriculum_release_id?: string | null
          curriculum_term_number?: number | null
          curriculum_week_number?: number | null
          curriculum_year_number?: number | null
          enrollment_type_snapshot?: string | null
          evidence_snapshot?: Json
          evidence_status?: string
          evidence_type?: string
          graded_at?: string | null
          graded_by?: string | null
          grading_mode?: string | null
          id?: string
          lesson_id?: string | null
          lesson_plan_id?: string | null
          maximum_score?: number | null
          offering_period_id?: string | null
          percentage?: number | null
          raw_score?: number | null
          school_id?: string | null
          source_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_assessment_evidence_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["academic_offering_id"]
          },
          {
            foreignKeyName: "academic_assessment_evidence_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_assessment_evidence_academic_term_id_fkey"
            columns: ["academic_term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_assessment_evidence_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_assessment_evidence_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_assessment_evidence_curriculum_release_id_fkey"
            columns: ["curriculum_release_id"]
            isOneToOne: false
            referencedRelation: "academic_curriculum_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_assessment_evidence_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_assessment_evidence_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "academic_lesson_plan_source_issues"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "academic_assessment_evidence_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "class_term_teaching_progress"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "academic_assessment_evidence_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_assessment_evidence_offering_period_id_fkey"
            columns: ["offering_period_id"]
            isOneToOne: false
            referencedRelation: "academic_offering_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_assessment_evidence_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_assessment_schemes: {
        Row: {
          academic_offering_id: string | null
          academic_term_id: string | null
          approved_by: string | null
          components: Json
          course_id: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          school_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          academic_offering_id?: string | null
          academic_term_id?: string | null
          approved_by?: string | null
          components: Json
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          school_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          academic_offering_id?: string | null
          academic_term_id?: string | null
          approved_by?: string | null
          components?: Json
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          school_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_assessment_schemes_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["academic_offering_id"]
          },
          {
            foreignKeyName: "academic_assessment_schemes_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_assessment_schemes_academic_term_id_fkey"
            columns: ["academic_term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_assessment_schemes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_assessment_schemes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_curriculum_adoptions: {
        Row: {
          academic_session: string | null
          adopted_at: string
          adopted_by: string
          auto_update: boolean
          course_id: string
          effective_academic_term_id: string | null
          effective_term_number: number
          id: string
          local_policy: Json
          previous_release_id: string | null
          release_id: string
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          academic_session?: string | null
          adopted_at?: string
          adopted_by: string
          auto_update?: boolean
          course_id: string
          effective_academic_term_id?: string | null
          effective_term_number: number
          id?: string
          local_policy?: Json
          previous_release_id?: string | null
          release_id: string
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          academic_session?: string | null
          adopted_at?: string
          adopted_by?: string
          auto_update?: boolean
          course_id?: string
          effective_academic_term_id?: string | null
          effective_term_number?: number
          id?: string
          local_policy?: Json
          previous_release_id?: string | null
          release_id?: string
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_curriculum_adoptions_adopted_by_fkey"
            columns: ["adopted_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "academic_curriculum_adoptions_adopted_by_fkey"
            columns: ["adopted_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_adoptions_adopted_by_fkey"
            columns: ["adopted_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_adoptions_adopted_by_fkey"
            columns: ["adopted_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "academic_curriculum_adoptions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_adoptions_effective_academic_term_id_fkey"
            columns: ["effective_academic_term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_adoptions_previous_release_id_fkey"
            columns: ["previous_release_id"]
            isOneToOne: false
            referencedRelation: "academic_curriculum_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_adoptions_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "academic_curriculum_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_adoptions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_curriculum_delivery_schedules: {
        Row: {
          academic_term_id: string | null
          class_id: string | null
          course_id: string
          created_at: string
          created_by: string
          curriculum_term_number: number
          curriculum_week_number: number
          curriculum_year_number: number
          entry_term_number: number
          entry_week_number: number
          id: string
          pacing_mode: string
          release_id: string
          school_id: string
          sessions_per_week: number
          status: string
          updated_at: string
        }
        Insert: {
          academic_term_id?: string | null
          class_id?: string | null
          course_id: string
          created_at?: string
          created_by: string
          curriculum_term_number?: number
          curriculum_week_number?: number
          curriculum_year_number?: number
          entry_term_number?: number
          entry_week_number?: number
          id?: string
          pacing_mode?: string
          release_id: string
          school_id: string
          sessions_per_week?: number
          status?: string
          updated_at?: string
        }
        Update: {
          academic_term_id?: string | null
          class_id?: string | null
          course_id?: string
          created_at?: string
          created_by?: string
          curriculum_term_number?: number
          curriculum_week_number?: number
          curriculum_year_number?: number
          entry_term_number?: number
          entry_week_number?: number
          id?: string
          pacing_mode?: string
          release_id?: string
          school_id?: string
          sessions_per_week?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_curriculum_delivery_schedules_academic_term_id_fkey"
            columns: ["academic_term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_delivery_schedules_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_delivery_schedules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_delivery_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "academic_curriculum_delivery_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_delivery_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_delivery_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "academic_curriculum_delivery_schedules_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "academic_curriculum_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_delivery_schedules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_curriculum_proposals: {
        Row: {
          changed_paths: string[]
          class_id: string | null
          course_id: string
          created_at: string
          curriculum_id: string | null
          id: string
          policy_classification: string
          proposal_data: Json
          proposed_by: string
          rationale: string
          release_id: string | null
          requested_scope: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          school_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          changed_paths?: string[]
          class_id?: string | null
          course_id: string
          created_at?: string
          curriculum_id?: string | null
          id?: string
          policy_classification: string
          proposal_data?: Json
          proposed_by: string
          rationale: string
          release_id?: string | null
          requested_scope: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          changed_paths?: string[]
          class_id?: string | null
          course_id?: string
          created_at?: string
          curriculum_id?: string | null
          id?: string
          policy_classification?: string
          proposal_data?: Json
          proposed_by?: string
          rationale?: string
          release_id?: string | null
          requested_scope?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_curriculum_proposals_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_proposals_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_proposals_curriculum_id_fkey"
            columns: ["curriculum_id"]
            isOneToOne: false
            referencedRelation: "course_curricula"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "academic_curriculum_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "academic_curriculum_proposals_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "academic_curriculum_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_proposals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "academic_curriculum_proposals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_proposals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_proposals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "academic_curriculum_proposals_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_curriculum_quality_runs: {
        Row: {
          checked_at: string
          checked_by: string | null
          curriculum_id: string | null
          engine_version: string
          id: string
          readiness: string
          release_id: string | null
          report: Json
          score: number
        }
        Insert: {
          checked_at?: string
          checked_by?: string | null
          curriculum_id?: string | null
          engine_version?: string
          id?: string
          readiness: string
          release_id?: string | null
          report: Json
          score: number
        }
        Update: {
          checked_at?: string
          checked_by?: string | null
          curriculum_id?: string | null
          engine_version?: string
          id?: string
          readiness?: string
          release_id?: string | null
          report?: Json
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "academic_curriculum_quality_runs_curriculum_id_fkey"
            columns: ["curriculum_id"]
            isOneToOne: false
            referencedRelation: "course_curricula"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_quality_runs_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "academic_curriculum_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_curriculum_releases: {
        Row: {
          academic_offering_id: string | null
          academic_session: string | null
          audience_label: string | null
          change_summary: string
          content: Json
          content_hash: string
          course_id: string
          created_at: string
          effective_term_number: number | null
          grade_key: string | null
          id: string
          published_at: string
          published_by: string
          qa_catalog_version: string | null
          quality_checked_at: string | null
          quality_report: Json
          quality_status: string
          release_number: number
          retired_at: string | null
          retired_by: string | null
          source_curriculum_id: string | null
          source_metadata: Json
          status: string
          title: string
        }
        Insert: {
          academic_offering_id?: string | null
          academic_session?: string | null
          audience_label?: string | null
          change_summary: string
          content: Json
          content_hash: string
          course_id: string
          created_at?: string
          effective_term_number?: number | null
          grade_key?: string | null
          id?: string
          published_at?: string
          published_by: string
          qa_catalog_version?: string | null
          quality_checked_at?: string | null
          quality_report?: Json
          quality_status?: string
          release_number: number
          retired_at?: string | null
          retired_by?: string | null
          source_curriculum_id?: string | null
          source_metadata?: Json
          status?: string
          title: string
        }
        Update: {
          academic_offering_id?: string | null
          academic_session?: string | null
          audience_label?: string | null
          change_summary?: string
          content?: Json
          content_hash?: string
          course_id?: string
          created_at?: string
          effective_term_number?: number | null
          grade_key?: string | null
          id?: string
          published_at?: string
          published_by?: string
          qa_catalog_version?: string | null
          quality_checked_at?: string | null
          quality_report?: Json
          quality_status?: string
          release_number?: number
          retired_at?: string | null
          retired_by?: string | null
          source_curriculum_id?: string | null
          source_metadata?: Json
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_curriculum_releases_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["academic_offering_id"]
          },
          {
            foreignKeyName: "academic_curriculum_releases_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_releases_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_releases_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "academic_curriculum_releases_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_releases_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_releases_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "academic_curriculum_releases_retired_by_fkey"
            columns: ["retired_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "academic_curriculum_releases_retired_by_fkey"
            columns: ["retired_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_releases_retired_by_fkey"
            columns: ["retired_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_releases_retired_by_fkey"
            columns: ["retired_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "academic_curriculum_releases_source_curriculum_id_fkey"
            columns: ["source_curriculum_id"]
            isOneToOne: false
            referencedRelation: "course_curricula"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_curriculum_rollout_events: {
        Row: {
          actor_id: string
          adoption_id: string | null
          created_at: string
          id: string
          impact: Json
          previous_release_id: string | null
          reason: string | null
          release_id: string
          school_id: string
          status: string
        }
        Insert: {
          actor_id: string
          adoption_id?: string | null
          created_at?: string
          id?: string
          impact?: Json
          previous_release_id?: string | null
          reason?: string | null
          release_id: string
          school_id: string
          status: string
        }
        Update: {
          actor_id?: string
          adoption_id?: string | null
          created_at?: string
          id?: string
          impact?: Json
          previous_release_id?: string | null
          reason?: string | null
          release_id?: string
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_curriculum_rollout_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "academic_curriculum_rollout_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_rollout_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_rollout_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "academic_curriculum_rollout_events_adoption_id_fkey"
            columns: ["adoption_id"]
            isOneToOne: false
            referencedRelation: "academic_curriculum_adoptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_rollout_events_previous_release_id_fkey"
            columns: ["previous_release_id"]
            isOneToOne: false
            referencedRelation: "academic_curriculum_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_rollout_events_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "academic_curriculum_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_curriculum_rollout_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_offering_curriculum_directions: {
        Row: {
          academic_offering_id: string
          assigned_at: string
          assigned_by: string | null
          course_id: string
          id: string
          release_id: string
          status: string
          updated_at: string
        }
        Insert: {
          academic_offering_id: string
          assigned_at?: string
          assigned_by?: string | null
          course_id: string
          id?: string
          release_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          academic_offering_id?: string
          assigned_at?: string
          assigned_by?: string | null
          course_id?: string
          id?: string
          release_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_offering_curriculum_directio_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["academic_offering_id"]
          },
          {
            foreignKeyName: "academic_offering_curriculum_directio_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_offering_curriculum_directions_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "academic_offering_curriculum_directions_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_offering_curriculum_directions_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_offering_curriculum_directions_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "academic_offering_curriculum_directions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_offering_curriculum_directions_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "academic_curriculum_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_offering_periods: {
        Row: {
          created_at: string
          ends_on: string | null
          id: string
          label: string
          offering_id: string
          sequence_number: number
          starts_on: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          id?: string
          label: string
          offering_id: string
          sequence_number?: number
          starts_on?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          id?: string
          label?: string
          offering_id?: string
          sequence_number?: number
          starts_on?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_offering_periods_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["academic_offering_id"]
          },
          {
            foreignKeyName: "academic_offering_periods_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "academic_offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_offerings: {
        Row: {
          academic_model: string
          awards_certificate: boolean
          calendar_mode: string
          created_at: string
          created_by: string | null
          delivery_mode: string
          ends_on: string | null
          enrollment_type: string
          id: string
          learner_account_model: string
          parent_onboarding_model: string
          pathway: string
          programme_id: string | null
          result_destination: string
          school_id: string | null
          settings: Json
          special_program_page_id: string | null
          special_programme_kind: string | null
          starts_on: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          academic_model: string
          awards_certificate?: boolean
          calendar_mode: string
          created_at?: string
          created_by?: string | null
          delivery_mode: string
          ends_on?: string | null
          enrollment_type: string
          id?: string
          learner_account_model: string
          parent_onboarding_model: string
          pathway: string
          programme_id?: string | null
          result_destination?: string
          school_id?: string | null
          settings?: Json
          special_program_page_id?: string | null
          special_programme_kind?: string | null
          starts_on?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          academic_model?: string
          awards_certificate?: boolean
          calendar_mode?: string
          created_at?: string
          created_by?: string | null
          delivery_mode?: string
          ends_on?: string | null
          enrollment_type?: string
          id?: string
          learner_account_model?: string
          parent_onboarding_model?: string
          pathway?: string
          programme_id?: string | null
          result_destination?: string
          school_id?: string | null
          settings?: Json
          special_program_page_id?: string | null
          special_programme_kind?: string | null
          starts_on?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_offerings_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_offerings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_offerings_special_program_page_id_fkey"
            columns: ["special_program_page_id"]
            isOneToOne: false
            referencedRelation: "special_program_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_progression_decisions: {
        Row: {
          academic_offering_id: string | null
          academic_term_id: string
          approved_at: string | null
          approved_by: string | null
          class_id: string | null
          created_at: string
          decided_at: string
          decided_by: string | null
          decision: string
          evidence_snapshot: Json
          id: string
          next_class_id: string | null
          offering_period_id: string | null
          progress_report_id: string | null
          rationale: string
          school_id: string
          status: string
          student_id: string
          support_plan: Json
          updated_at: string
        }
        Insert: {
          academic_offering_id?: string | null
          academic_term_id: string
          approved_at?: string | null
          approved_by?: string | null
          class_id?: string | null
          created_at?: string
          decided_at?: string
          decided_by?: string | null
          decision: string
          evidence_snapshot?: Json
          id?: string
          next_class_id?: string | null
          offering_period_id?: string | null
          progress_report_id?: string | null
          rationale: string
          school_id: string
          status?: string
          student_id: string
          support_plan?: Json
          updated_at?: string
        }
        Update: {
          academic_offering_id?: string | null
          academic_term_id?: string
          approved_at?: string | null
          approved_by?: string | null
          class_id?: string | null
          created_at?: string
          decided_at?: string
          decided_by?: string | null
          decision?: string
          evidence_snapshot?: Json
          id?: string
          next_class_id?: string | null
          offering_period_id?: string | null
          progress_report_id?: string | null
          rationale?: string
          school_id?: string
          status?: string
          student_id?: string
          support_plan?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_progression_decisions_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["academic_offering_id"]
          },
          {
            foreignKeyName: "academic_progression_decisions_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_progression_decisions_academic_term_id_fkey"
            columns: ["academic_term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_progression_decisions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_progression_decisions_next_class_id_fkey"
            columns: ["next_class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_progression_decisions_offering_period_id_fkey"
            columns: ["offering_period_id"]
            isOneToOne: false
            referencedRelation: "academic_offering_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_progression_decisions_progress_report_id_fkey"
            columns: ["progress_report_id"]
            isOneToOne: false
            referencedRelation: "student_progress_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_progression_decisions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_result_components: {
        Row: {
          calculated_at: string
          component_key: string
          component_label: string
          evidence_count: number
          evidence_ids: string[]
          evidence_missing: boolean
          id: string
          progress_report_id: string
          raw_score: number | null
          source_summary: Json
          weight: number
          weighted_score: number | null
        }
        Insert: {
          calculated_at?: string
          component_key: string
          component_label: string
          evidence_count?: number
          evidence_ids?: string[]
          evidence_missing?: boolean
          id?: string
          progress_report_id: string
          raw_score?: number | null
          source_summary?: Json
          weight: number
          weighted_score?: number | null
        }
        Update: {
          calculated_at?: string
          component_key?: string
          component_label?: string
          evidence_count?: number
          evidence_ids?: string[]
          evidence_missing?: boolean
          id?: string
          progress_report_id?: string
          raw_score?: number | null
          source_summary?: Json
          weight?: number
          weighted_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "academic_result_components_progress_report_id_fkey"
            columns: ["progress_report_id"]
            isOneToOne: false
            referencedRelation: "student_progress_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_terms: {
        Row: {
          academic_year: string
          created_at: string
          end_date: string | null
          id: string
          is_current: boolean
          start_date: string | null
          term_label: string
          term_number: number
          updated_at: string
        }
        Insert: {
          academic_year: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          start_date?: string | null
          term_label: string
          term_number: number
          updated_at?: string
        }
        Update: {
          academic_year?: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          start_date?: string | null
          term_label?: string
          term_number?: number
          updated_at?: string
        }
        Relationships: []
      }
      account_deletion_requests: {
        Row: {
          account_role: string | null
          admin_note: string | null
          completed_at: string | null
          email: string
          full_name: string | null
          id: string
          reason: string | null
          requested_at: string
          retention_note: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_role?: string | null
          admin_note?: string | null
          completed_at?: string | null
          email: string
          full_name?: string | null
          id?: string
          reason?: string | null
          requested_at?: string
          retention_note?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_role?: string | null
          admin_note?: string | null
          completed_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          reason?: string | null
          requested_at?: string
          retention_note?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "announcement_reads_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
          class_id: string | null
          content: string
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          school_id: string | null
          status: string
          target_audience: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          author_id?: string | null
          class_id?: string | null
          content: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          school_id?: string | null
          status?: string
          target_audience?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string | null
          class_id?: string | null
          content?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          school_id?: string | null
          status?: string
          target_audience?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "announcements_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
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
          ai_suggested_feedback: string | null
          ai_suggested_grade: number | null
          answers: Json | null
          assignment_id: string | null
          attachments: Json
          feedback: string | null
          file_url: string | null
          grade: number | null
          graded_at: string | null
          graded_by: string | null
          grading_details: Json | null
          grading_mode: string | null
          id: string
          last_change_reason: string | null
          portal_user_id: string | null
          status: string | null
          status_changed_at: string
          status_changed_by: string | null
          student_id: string | null
          submission_text: string | null
          submitted_at: string | null
          updated_at: string | null
          user_id: string | null
          version: number
          weighted_score: number | null
        }
        Insert: {
          ai_suggested_feedback?: string | null
          ai_suggested_grade?: number | null
          answers?: Json | null
          assignment_id?: string | null
          attachments?: Json
          feedback?: string | null
          file_url?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          grading_details?: Json | null
          grading_mode?: string | null
          id?: string
          last_change_reason?: string | null
          portal_user_id?: string | null
          status?: string | null
          status_changed_at?: string
          status_changed_by?: string | null
          student_id?: string | null
          submission_text?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          version?: number
          weighted_score?: number | null
        }
        Update: {
          ai_suggested_feedback?: string | null
          ai_suggested_grade?: number | null
          answers?: Json | null
          assignment_id?: string | null
          attachments?: Json
          feedback?: string | null
          file_url?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          grading_details?: Json | null
          grading_mode?: string | null
          id?: string
          last_change_reason?: string | null
          portal_user_id?: string | null
          status?: string | null
          status_changed_at?: string
          status_changed_by?: string | null
          student_id?: string | null
          submission_text?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          version?: number
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "assignment_submissions_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "assignment_submissions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
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
            foreignKeyName: "assignment_submissions_status_changed_by_fkey"
            columns: ["status_changed_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "assignment_submissions_status_changed_by_fkey"
            columns: ["status_changed_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_status_changed_by_fkey"
            columns: ["status_changed_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_status_changed_by_fkey"
            columns: ["status_changed_by"]
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "assignment_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
          academic_offering_id: string | null
          assignment_type: string | null
          class_id: string | null
          content_locked_at: string | null
          content_locked_by: string | null
          course_id: string | null
          created_at: string | null
          created_by: string | null
          curriculum_release_id: string | null
          curriculum_term_number: number | null
          curriculum_week_number: number | null
          curriculum_year_number: number | null
          description: string | null
          due_date: string | null
          grading_mode: string
          id: string
          instructions: string | null
          is_active: boolean | null
          learning_outcomes: Json
          lesson_id: string | null
          lesson_plan_id: string | null
          max_points: number | null
          metadata: Json | null
          offering_period_id: string | null
          program_id: string | null
          project_template_id: string | null
          questions: Json | null
          school_id: string | null
          school_name: string | null
          session_number: number
          shared_master_id: string | null
          term_id: string | null
          title: string
          updated_at: string | null
          weight: number
        }
        Insert: {
          academic_offering_id?: string | null
          assignment_type?: string | null
          class_id?: string | null
          content_locked_at?: string | null
          content_locked_by?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          curriculum_release_id?: string | null
          curriculum_term_number?: number | null
          curriculum_week_number?: number | null
          curriculum_year_number?: number | null
          description?: string | null
          due_date?: string | null
          grading_mode?: string
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          learning_outcomes?: Json
          lesson_id?: string | null
          lesson_plan_id?: string | null
          max_points?: number | null
          metadata?: Json | null
          offering_period_id?: string | null
          program_id?: string | null
          project_template_id?: string | null
          questions?: Json | null
          school_id?: string | null
          school_name?: string | null
          session_number?: number
          shared_master_id?: string | null
          term_id?: string | null
          title: string
          updated_at?: string | null
          weight?: number
        }
        Update: {
          academic_offering_id?: string | null
          assignment_type?: string | null
          class_id?: string | null
          content_locked_at?: string | null
          content_locked_by?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          curriculum_release_id?: string | null
          curriculum_term_number?: number | null
          curriculum_week_number?: number | null
          curriculum_year_number?: number | null
          description?: string | null
          due_date?: string | null
          grading_mode?: string
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          learning_outcomes?: Json
          lesson_id?: string | null
          lesson_plan_id?: string | null
          max_points?: number | null
          metadata?: Json | null
          offering_period_id?: string | null
          program_id?: string | null
          project_template_id?: string | null
          questions?: Json | null
          school_id?: string | null
          school_name?: string | null
          session_number?: number
          shared_master_id?: string | null
          term_id?: string | null
          title?: string
          updated_at?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "assignments_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["academic_offering_id"]
          },
          {
            foreignKeyName: "assignments_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_offerings"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
            foreignKeyName: "assignments_curriculum_release_id_fkey"
            columns: ["curriculum_release_id"]
            isOneToOne: false
            referencedRelation: "academic_curriculum_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "academic_lesson_plan_source_issues"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "assignments_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "class_term_teaching_progress"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "assignments_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_offering_period_id_fkey"
            columns: ["offering_period_id"]
            isOneToOne: false
            referencedRelation: "academic_offering_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_project_template_id_fkey"
            columns: ["project_template_id"]
            isOneToOne: false
            referencedRelation: "curriculum_project_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_shared_master_id_fkey"
            columns: ["shared_master_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          class_term_roster_id: string | null
          created_at: string | null
          id: string
          notes: string | null
          recorded_by: string | null
          session_id: string | null
          status: string | null
          student_id: string | null
          term_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          class_term_roster_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          recorded_by?: string | null
          session_id?: string | null
          status?: string | null
          student_id?: string | null
          term_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          class_term_roster_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          recorded_by?: string | null
          session_id?: string | null
          status?: string | null
          student_id?: string | null
          term_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_class_term_roster_id_fkey"
            columns: ["class_term_roster_id"]
            isOneToOne: false
            referencedRelation: "class_term_rosters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "attendance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "attendance_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
          actor_id: string | null
          created_at: string | null
          id: string
          ip_address: unknown
          new_value: string | null
          new_values: Json | null
          old_value: string | null
          old_values: Json | null
          record_id: string | null
          resource_id: string | null
          resource_type: string | null
          table_name: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string | null
          id?: string
          ip_address?: unknown
          new_value?: string | null
          new_values?: Json | null
          old_value?: string | null
          old_values?: Json | null
          record_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string | null
          id?: string
          ip_address?: unknown
          new_value?: string | null
          new_values?: Json | null
          old_value?: string | null
          old_values?: Json | null
          record_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "fk_audit_actor"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "fk_audit_actor"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_audit_actor"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_audit_actor"
            columns: ["actor_id"]
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
      balance_reminder_settings: {
        Row: {
          channel_email: boolean
          channel_whatsapp: boolean
          enabled: boolean
          every_days: number
          id: number
          max_reminders: number
          updated_at: string
        }
        Insert: {
          channel_email?: boolean
          channel_whatsapp?: boolean
          enabled?: boolean
          every_days?: number
          id?: number
          max_reminders?: number
          updated_at?: string
        }
        Update: {
          channel_email?: boolean
          channel_whatsapp?: boolean
          enabled?: boolean
          every_days?: number
          id?: number
          max_reminders?: number
          updated_at?: string
        }
        Relationships: []
      }
      billing_contacts: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          owner_type: string
          owner_user_id: string | null
          representative_email: string | null
          representative_name: string | null
          representative_whatsapp: string | null
          school_id: string | null
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          owner_type?: string
          owner_user_id?: string | null
          representative_email?: string | null
          representative_name?: string | null
          representative_whatsapp?: string | null
          school_id?: string | null
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          owner_type?: string
          owner_user_id?: string | null
          representative_email?: string | null
          representative_name?: string | null
          representative_whatsapp?: string | null
          school_id?: string | null
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_contacts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "billing_contacts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_contacts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_contacts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "billing_contacts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_contacts_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "billing_contacts_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_contacts_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_contacts_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      billing_cycles: {
        Row: {
          academic_term_id: string | null
          amount_due: number
          archived_at: string | null
          created_at: string
          currency: string
          due_date: string
          id: string
          invoice_id: string | null
          items: Json
          owner_school_id: string | null
          owner_type: string
          owner_user_id: string | null
          reminder_week6_sent_at: string | null
          reminder_week7_sent_at: string | null
          reminder_week8_sent_at: string | null
          rillcod_retain_amount: number | null
          school_id: string | null
          school_settlement_amount: number | null
          status: string
          sticky_notice_id: string | null
          subscription_id: string | null
          term_label: string
          term_start_date: string
          updated_at: string
        }
        Insert: {
          academic_term_id?: string | null
          amount_due?: number
          archived_at?: string | null
          created_at?: string
          currency?: string
          due_date: string
          id?: string
          invoice_id?: string | null
          items?: Json
          owner_school_id?: string | null
          owner_type: string
          owner_user_id?: string | null
          reminder_week6_sent_at?: string | null
          reminder_week7_sent_at?: string | null
          reminder_week8_sent_at?: string | null
          rillcod_retain_amount?: number | null
          school_id?: string | null
          school_settlement_amount?: number | null
          status?: string
          sticky_notice_id?: string | null
          subscription_id?: string | null
          term_label: string
          term_start_date: string
          updated_at?: string
        }
        Update: {
          academic_term_id?: string | null
          amount_due?: number
          archived_at?: string | null
          created_at?: string
          currency?: string
          due_date?: string
          id?: string
          invoice_id?: string | null
          items?: Json
          owner_school_id?: string | null
          owner_type?: string
          owner_user_id?: string | null
          reminder_week6_sent_at?: string | null
          reminder_week7_sent_at?: string | null
          reminder_week8_sent_at?: string | null
          rillcod_retain_amount?: number | null
          school_id?: string | null
          school_settlement_amount?: number | null
          status?: string
          sticky_notice_id?: string | null
          subscription_id?: string | null
          term_label?: string
          term_start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_cycles_academic_term_id_fkey"
            columns: ["academic_term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_cycles_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "finance_ledger"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "billing_cycles_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_cycles_owner_school_id_fkey"
            columns: ["owner_school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_cycles_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "billing_cycles_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_cycles_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_cycles_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "billing_cycles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_cycles_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_document_archive: {
        Row: {
          amount: number | null
          created_at: string
          created_by: string | null
          currency: string | null
          doc_ref: string
          doc_type: string
          due_date: string | null
          html_body: string | null
          id: string
          invoice_number: string | null
          metadata: Json
          period_label: string | null
          school_id: string | null
          school_name: string | null
          student_count: number | null
          term_label: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          doc_ref: string
          doc_type: string
          due_date?: string | null
          html_body?: string | null
          id?: string
          invoice_number?: string | null
          metadata?: Json
          period_label?: string | null
          school_id?: string | null
          school_name?: string | null
          student_count?: number | null
          term_label?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          doc_ref?: string
          doc_type?: string
          due_date?: string | null
          html_body?: string | null
          id?: string
          invoice_number?: string | null
          metadata?: Json
          period_label?: string | null
          school_id?: string | null
          school_name?: string | null
          student_count?: number | null
          term_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_document_archive_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "billing_document_archive_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_document_archive_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_document_archive_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "billing_document_archive_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_notices: {
        Row: {
          created_at: string
          due_date: string | null
          id: string
          is_resolved: boolean
          is_sticky: boolean
          message: string
          metadata: Json | null
          owner_school_id: string | null
          owner_type: string
          owner_user_id: string | null
          resolved_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_date?: string | null
          id?: string
          is_resolved?: boolean
          is_sticky?: boolean
          message: string
          metadata?: Json | null
          owner_school_id?: string | null
          owner_type: string
          owner_user_id?: string | null
          resolved_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_date?: string | null
          id?: string
          is_resolved?: boolean
          is_sticky?: boolean
          message?: string
          metadata?: Json | null
          owner_school_id?: string | null
          owner_type?: string
          owner_user_id?: string | null
          resolved_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_notices_owner_school_id_fkey"
            columns: ["owner_school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_notices_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "billing_notices_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_notices_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_notices_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      billing_reminder_logs: {
        Row: {
          billing_cycle_id: string
          channel: string
          created_at: string
          error_message: string | null
          id: string
          metadata: Json | null
          status: string
          target: string | null
          week_number: number
        }
        Insert: {
          billing_cycle_id: string
          channel: string
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          target?: string | null
          week_number: number
        }
        Update: {
          billing_cycle_id?: string
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          target?: string | null
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_reminder_logs_billing_cycle_id_fkey"
            columns: ["billing_cycle_id"]
            isOneToOne: false
            referencedRelation: "billing_cycles"
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "card_audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "card_scan_logs_scanned_by_fkey"
            columns: ["scanned_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
          academic_offering_id: string | null
          class_id: string | null
          course_id: string | null
          created_at: string | null
          created_by: string | null
          curriculum_release_id: string | null
          curriculum_term_number: number | null
          curriculum_week_number: number | null
          curriculum_year_number: number | null
          description: string | null
          duration_minutes: number
          end_date: string | null
          grading_mode: string
          id: string
          is_active: boolean | null
          learning_outcomes: Json
          lesson_id: string | null
          lesson_plan_id: string | null
          metadata: Json | null
          offering_period_id: string | null
          passing_score: number | null
          program_id: string | null
          school_id: string | null
          start_date: string | null
          term_id: string | null
          title: string
          total_questions: number
          updated_at: string | null
        }
        Insert: {
          academic_offering_id?: string | null
          class_id?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          curriculum_release_id?: string | null
          curriculum_term_number?: number | null
          curriculum_week_number?: number | null
          curriculum_year_number?: number | null
          description?: string | null
          duration_minutes: number
          end_date?: string | null
          grading_mode?: string
          id?: string
          is_active?: boolean | null
          learning_outcomes?: Json
          lesson_id?: string | null
          lesson_plan_id?: string | null
          metadata?: Json | null
          offering_period_id?: string | null
          passing_score?: number | null
          program_id?: string | null
          school_id?: string | null
          start_date?: string | null
          term_id?: string | null
          title: string
          total_questions: number
          updated_at?: string | null
        }
        Update: {
          academic_offering_id?: string | null
          class_id?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          curriculum_release_id?: string | null
          curriculum_term_number?: number | null
          curriculum_week_number?: number | null
          curriculum_year_number?: number | null
          description?: string | null
          duration_minutes?: number
          end_date?: string | null
          grading_mode?: string
          id?: string
          is_active?: boolean | null
          learning_outcomes?: Json
          lesson_id?: string | null
          lesson_plan_id?: string | null
          metadata?: Json | null
          offering_period_id?: string | null
          passing_score?: number | null
          program_id?: string | null
          school_id?: string | null
          start_date?: string | null
          term_id?: string | null
          title?: string
          total_questions?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cbt_exams_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["academic_offering_id"]
          },
          {
            foreignKeyName: "cbt_exams_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cbt_exams_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "cbt_exams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
            foreignKeyName: "cbt_exams_curriculum_release_id_fkey"
            columns: ["curriculum_release_id"]
            isOneToOne: false
            referencedRelation: "academic_curriculum_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cbt_exams_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cbt_exams_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "academic_lesson_plan_source_issues"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "cbt_exams_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "class_term_teaching_progress"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "cbt_exams_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cbt_exams_offering_period_id_fkey"
            columns: ["offering_period_id"]
            isOneToOne: false
            referencedRelation: "academic_offering_periods"
            referencedColumns: ["id"]
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
          {
            foreignKeyName: "cbt_exams_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
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
          deadline: string | null
          end_time: string | null
          exam_id: string | null
          grading_change_reason: string | null
          grading_changed_at: string | null
          grading_changed_by: string | null
          grading_notes: string | null
          grading_version: number
          id: string
          manual_scores: Json | null
          moderation_status: string
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
          deadline?: string | null
          end_time?: string | null
          exam_id?: string | null
          grading_change_reason?: string | null
          grading_changed_at?: string | null
          grading_changed_by?: string | null
          grading_notes?: string | null
          grading_version?: number
          id?: string
          manual_scores?: Json | null
          moderation_status?: string
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
          deadline?: string | null
          end_time?: string | null
          exam_id?: string | null
          grading_change_reason?: string | null
          grading_changed_at?: string | null
          grading_changed_by?: string | null
          grading_notes?: string | null
          grading_version?: number
          id?: string
          manual_scores?: Json | null
          moderation_status?: string
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
            foreignKeyName: "cbt_sessions_grading_changed_by_fkey"
            columns: ["grading_changed_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "cbt_sessions_grading_changed_by_fkey"
            columns: ["grading_changed_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cbt_sessions_grading_changed_by_fkey"
            columns: ["grading_changed_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cbt_sessions_grading_changed_by_fkey"
            columns: ["grading_changed_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "cbt_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "cbt_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
          academic_offering_id: string | null
          certificate_number: string
          completion_status: string | null
          course_id: string | null
          created_at: string | null
          eligibility_snapshot: Json
          id: string
          issued_date: string
          metadata: Json | null
          offering_period_id: string | null
          pdf_url: string | null
          portal_user_id: string | null
          progress_report_id: string | null
          template_id: string | null
          verification_code: string
        }
        Insert: {
          academic_offering_id?: string | null
          certificate_number: string
          completion_status?: string | null
          course_id?: string | null
          created_at?: string | null
          eligibility_snapshot?: Json
          id?: string
          issued_date: string
          metadata?: Json | null
          offering_period_id?: string | null
          pdf_url?: string | null
          portal_user_id?: string | null
          progress_report_id?: string | null
          template_id?: string | null
          verification_code: string
        }
        Update: {
          academic_offering_id?: string | null
          certificate_number?: string
          completion_status?: string | null
          course_id?: string | null
          created_at?: string | null
          eligibility_snapshot?: Json
          id?: string
          issued_date?: string
          metadata?: Json | null
          offering_period_id?: string | null
          pdf_url?: string | null
          portal_user_id?: string | null
          progress_report_id?: string | null
          template_id?: string | null
          verification_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["academic_offering_id"]
          },
          {
            foreignKeyName: "certificates_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_offering_period_id_fkey"
            columns: ["offering_period_id"]
            isOneToOne: false
            referencedRelation: "academic_offering_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "certificates_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
          {
            foreignKeyName: "certificates_progress_report_id_fkey"
            columns: ["progress_report_id"]
            isOneToOne: false
            referencedRelation: "student_progress_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      class_lesson_delivery: {
        Row: {
          academic_term_id: string | null
          class_id: string
          class_session_id: string | null
          course_id: string
          created_at: string
          delivered_at: string | null
          delivered_by: string | null
          id: string
          lesson_id: string | null
          lesson_plan_id: string
          notes: string | null
          offering_period_id: string | null
          session_number: number
          status: string
          updated_at: string
          week_number: number
        }
        Insert: {
          academic_term_id?: string | null
          class_id: string
          class_session_id?: string | null
          course_id: string
          created_at?: string
          delivered_at?: string | null
          delivered_by?: string | null
          id?: string
          lesson_id?: string | null
          lesson_plan_id: string
          notes?: string | null
          offering_period_id?: string | null
          session_number?: number
          status?: string
          updated_at?: string
          week_number: number
        }
        Update: {
          academic_term_id?: string | null
          class_id?: string
          class_session_id?: string | null
          course_id?: string
          created_at?: string
          delivered_at?: string | null
          delivered_by?: string | null
          id?: string
          lesson_id?: string | null
          lesson_plan_id?: string
          notes?: string | null
          offering_period_id?: string | null
          session_number?: number
          status?: string
          updated_at?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "class_lesson_delivery_academic_term_id_fkey"
            columns: ["academic_term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_lesson_delivery_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_lesson_delivery_class_session_id_fkey"
            columns: ["class_session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_lesson_delivery_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_lesson_delivery_delivered_by_fkey"
            columns: ["delivered_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "class_lesson_delivery_delivered_by_fkey"
            columns: ["delivered_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_lesson_delivery_delivered_by_fkey"
            columns: ["delivered_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_lesson_delivery_delivered_by_fkey"
            columns: ["delivered_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "class_lesson_delivery_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_lesson_delivery_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "academic_lesson_plan_source_issues"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "class_lesson_delivery_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "class_term_teaching_progress"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "class_lesson_delivery_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_lesson_delivery_offering_period_id_fkey"
            columns: ["offering_period_id"]
            isOneToOne: false
            referencedRelation: "academic_offering_periods"
            referencedColumns: ["id"]
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
          term_id: string | null
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
          term_id?: string | null
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
          term_id?: string | null
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
          {
            foreignKeyName: "class_sessions_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      class_term_rosters: {
        Row: {
          access_suspended_at: string | null
          access_suspension_reason: string | null
          billing_checked_at: string | null
          billing_cycle_id: string | null
          billing_status: string | null
          class_id: string
          created_at: string
          created_by: string | null
          ended_at: string | null
          id: string
          invoice_id: string | null
          notes: string | null
          program_id: string | null
          reinstated_at: string | null
          school_id: string | null
          started_at: string
          status: string
          student_id: string
          subscription_id: string | null
          subscription_status: string | null
          term_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          access_suspended_at?: string | null
          access_suspension_reason?: string | null
          billing_checked_at?: string | null
          billing_cycle_id?: string | null
          billing_status?: string | null
          class_id: string
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          program_id?: string | null
          reinstated_at?: string | null
          school_id?: string | null
          started_at?: string
          status?: string
          student_id: string
          subscription_id?: string | null
          subscription_status?: string | null
          term_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          access_suspended_at?: string | null
          access_suspension_reason?: string | null
          billing_checked_at?: string | null
          billing_cycle_id?: string | null
          billing_status?: string | null
          class_id?: string
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          program_id?: string | null
          reinstated_at?: string | null
          school_id?: string | null
          started_at?: string
          status?: string
          student_id?: string
          subscription_id?: string | null
          subscription_status?: string | null
          term_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_term_rosters_billing_cycle_id_fkey"
            columns: ["billing_cycle_id"]
            isOneToOne: false
            referencedRelation: "billing_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_term_rosters_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_term_rosters_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "class_term_rosters_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_term_rosters_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_term_rosters_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "class_term_rosters_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "finance_ledger"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "class_term_rosters_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_term_rosters_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_term_rosters_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_term_rosters_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "class_term_rosters_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_term_rosters_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_term_rosters_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "class_term_rosters_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_term_rosters_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_term_rosters_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "class_term_rosters_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_term_rosters_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_term_rosters_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      classes: {
        Row: {
          academic_offering_id: string | null
          band_high: number | null
          band_low: number | null
          band_lvl: string | null
          created_at: string | null
          current_course_id: string | null
          current_students: number | null
          description: string | null
          end_date: string | null
          id: string
          max_students: number | null
          name: string
          offering_period_id: string | null
          program_id: string | null
          qa_grade_band: string | null
          qa_grade_key: string | null
          qa_grade_mode: string | null
          qa_spine_lane: number | null
          qa_track_hint: string | null
          schedule: string | null
          school_id: string
          start_date: string | null
          status: string | null
          teacher_id: string
          term_id: string | null
          tier: string | null
          updated_at: string | null
        }
        Insert: {
          academic_offering_id?: string | null
          band_high?: number | null
          band_low?: number | null
          band_lvl?: string | null
          created_at?: string | null
          current_course_id?: string | null
          current_students?: number | null
          description?: string | null
          end_date?: string | null
          id?: string
          max_students?: number | null
          name: string
          offering_period_id?: string | null
          program_id?: string | null
          qa_grade_band?: string | null
          qa_grade_key?: string | null
          qa_grade_mode?: string | null
          qa_spine_lane?: number | null
          qa_track_hint?: string | null
          schedule?: string | null
          school_id: string
          start_date?: string | null
          status?: string | null
          teacher_id: string
          term_id?: string | null
          tier?: string | null
          updated_at?: string | null
        }
        Update: {
          academic_offering_id?: string | null
          band_high?: number | null
          band_low?: number | null
          band_lvl?: string | null
          created_at?: string | null
          current_course_id?: string | null
          current_students?: number | null
          description?: string | null
          end_date?: string | null
          id?: string
          max_students?: number | null
          name?: string
          offering_period_id?: string | null
          program_id?: string | null
          qa_grade_band?: string | null
          qa_grade_key?: string | null
          qa_grade_mode?: string | null
          qa_spine_lane?: number | null
          qa_track_hint?: string | null
          schedule?: string | null
          school_id?: string
          start_date?: string | null
          status?: string | null
          teacher_id?: string
          term_id?: string | null
          tier?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["academic_offering_id"]
          },
          {
            foreignKeyName: "classes_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_current_course_id_fkey"
            columns: ["current_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_offering_period_id_fkey"
            columns: ["offering_period_id"]
            isOneToOne: false
            referencedRelation: "academic_offering_periods"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "classes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
          {
            foreignKeyName: "classes_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_abuse_events: {
        Row: {
          channel: string
          created_at: string
          event_type: string
          id: string
          metadata: Json
          reason: string
          sender_id: string | null
          sender_role: string | null
          target_conversation_id: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          reason: string
          sender_id?: string | null
          sender_role?: string | null
          target_conversation_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          reason?: string
          sender_id?: string | null
          sender_role?: string | null
          target_conversation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_abuse_events_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "communication_abuse_events_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_abuse_events_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_abuse_events_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      communication_case_events: {
        Row: {
          actor_id: string | null
          automated: boolean
          body: string
          case_id: string
          channel: string
          created_at: string
          delivered_at: string | null
          delivery_status: string
          direction: string
          external_thread_id: string | null
          failed_at: string | null
          id: string
          metadata: Json
          provider: string | null
          provider_message_id: string | null
          read_at: string | null
          source_id: string | null
          source_type: string | null
          subject: string | null
          template_key: string | null
        }
        Insert: {
          actor_id?: string | null
          automated?: boolean
          body: string
          case_id: string
          channel: string
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string
          direction: string
          external_thread_id?: string | null
          failed_at?: string | null
          id?: string
          metadata?: Json
          provider?: string | null
          provider_message_id?: string | null
          read_at?: string | null
          source_id?: string | null
          source_type?: string | null
          subject?: string | null
          template_key?: string | null
        }
        Update: {
          actor_id?: string | null
          automated?: boolean
          body?: string
          case_id?: string
          channel?: string
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string
          direction?: string
          external_thread_id?: string | null
          failed_at?: string | null
          id?: string
          metadata?: Json
          provider?: string | null
          provider_message_id?: string | null
          read_at?: string | null
          source_id?: string | null
          source_type?: string | null
          subject?: string | null
          template_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_case_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "communication_case_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_case_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_case_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "communication_case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "communication_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_cases: {
        Row: {
          assigned_to: string | null
          category: string
          channels: string[]
          created_at: string
          customer_key: string | null
          department: string
          first_responded_at: string | null
          first_response_due_at: string | null
          id: string
          last_inbound_at: string | null
          last_outbound_at: string | null
          next_action: string
          next_action_due_at: string | null
          next_follow_up_at: string | null
          outcome: string | null
          priority: string
          reopened_count: number
          requester_email: string | null
          requester_id: string | null
          requester_name: string | null
          requester_phone: string | null
          resolution_summary: string | null
          resolved_at: string | null
          restricted: boolean
          satisfaction_requested_at: string | null
          satisfaction_score: number | null
          school_id: string | null
          sensitivity: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          channels?: string[]
          created_at?: string
          customer_key?: string | null
          department?: string
          first_responded_at?: string | null
          first_response_due_at?: string | null
          id?: string
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          next_action?: string
          next_action_due_at?: string | null
          next_follow_up_at?: string | null
          outcome?: string | null
          priority?: string
          reopened_count?: number
          requester_email?: string | null
          requester_id?: string | null
          requester_name?: string | null
          requester_phone?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          restricted?: boolean
          satisfaction_requested_at?: string | null
          satisfaction_score?: number | null
          school_id?: string | null
          sensitivity?: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          channels?: string[]
          created_at?: string
          customer_key?: string | null
          department?: string
          first_responded_at?: string | null
          first_response_due_at?: string | null
          id?: string
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          next_action?: string
          next_action_due_at?: string | null
          next_follow_up_at?: string | null
          outcome?: string | null
          priority?: string
          reopened_count?: number
          requester_email?: string | null
          requester_id?: string | null
          requester_name?: string | null
          requester_phone?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          restricted?: boolean
          satisfaction_requested_at?: string | null
          satisfaction_score?: number | null
          school_id?: string | null
          sensitivity?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_cases_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "communication_cases_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_cases_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_cases_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "communication_cases_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "communication_cases_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_cases_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_cases_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "communication_cases_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_conversation_meta: {
        Row: {
          conversation_id: string
          created_at: string
          escalated_at: string | null
          last_inbound_at: string | null
          last_outbound_at: string | null
          last_reminder_at: string | null
          notes: string | null
          priority: string
          reminder_count: number
          sla_due_at: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          escalated_at?: string | null
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          last_reminder_at?: string | null
          notes?: string | null
          priority?: string
          reminder_count?: number
          sla_due_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          escalated_at?: string | null
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          last_reminder_at?: string | null
          notes?: string | null
          priority?: string
          reminder_count?: number
          sla_due_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_conversation_meta_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_conversation_meta_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "communication_conversation_meta_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_conversation_meta_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_conversation_meta_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      communication_customer_identities: {
        Row: {
          created_at: string
          customer_key: string
          id: string
          identity_type: string
          identity_value: string
          portal_user_id: string | null
          updated_at: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          customer_key?: string
          id?: string
          identity_type: string
          identity_value: string
          portal_user_id?: string | null
          updated_at?: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          customer_key?: string
          id?: string
          identity_type?: string
          identity_value?: string
          portal_user_id?: string | null
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "communication_customer_identities_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "communication_customer_identities_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_customer_identities_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_customer_identities_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      communication_delivery_events: {
        Row: {
          channel: string
          delivery_id: string | null
          error: string | null
          event_key: string
          id: string
          metadata: Json
          occurred_at: string
          provider: string | null
          provider_message_id: string | null
          provider_status: string | null
          received_at: string
          status: string
        }
        Insert: {
          channel: string
          delivery_id?: string | null
          error?: string | null
          event_key: string
          id?: string
          metadata?: Json
          occurred_at?: string
          provider?: string | null
          provider_message_id?: string | null
          provider_status?: string | null
          received_at?: string
          status: string
        }
        Update: {
          channel?: string
          delivery_id?: string | null
          error?: string | null
          event_key?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          provider?: string | null
          provider_message_id?: string | null
          provider_status?: string | null
          received_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_delivery_events_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "communication_delivery_log"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_delivery_log: {
        Row: {
          attempt_count: number
          automated: boolean
          campaign_key: string | null
          case_event_id: string | null
          case_id: string | null
          channel: string
          created_at: string
          delivered_at: string | null
          error: string | null
          failed_at: string | null
          id: string
          idempotency_key: string | null
          last_event_at: string | null
          metadata: Json
          outbox_id: string | null
          provider: string | null
          provider_accepted_at: string | null
          provider_message_id: string | null
          queued_at: string | null
          read_at: string | null
          recipient: string | null
          recipient_user_id: string | null
          school_id: string | null
          sent_at: string | null
          source_id: string | null
          source_type: string | null
          status: string
          template_key: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          automated?: boolean
          campaign_key?: string | null
          case_event_id?: string | null
          case_id?: string | null
          channel: string
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          last_event_at?: string | null
          metadata?: Json
          outbox_id?: string | null
          provider?: string | null
          provider_accepted_at?: string | null
          provider_message_id?: string | null
          queued_at?: string | null
          read_at?: string | null
          recipient?: string | null
          recipient_user_id?: string | null
          school_id?: string | null
          sent_at?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          template_key?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          automated?: boolean
          campaign_key?: string | null
          case_event_id?: string | null
          case_id?: string | null
          channel?: string
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          last_event_at?: string | null
          metadata?: Json
          outbox_id?: string | null
          provider?: string | null
          provider_accepted_at?: string | null
          provider_message_id?: string | null
          queued_at?: string | null
          read_at?: string | null
          recipient?: string | null
          recipient_user_id?: string | null
          school_id?: string | null
          sent_at?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          template_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_delivery_log_case_event_id_fkey"
            columns: ["case_event_id"]
            isOneToOne: false
            referencedRelation: "communication_case_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_delivery_log_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "communication_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_delivery_log_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_outbox"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_delivery_log_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "communication_delivery_log_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_delivery_log_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_delivery_log_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "communication_delivery_log_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_escalations: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_conversation_id: string | null
          target_user_id: string | null
          trigger: string
          trigger_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_conversation_id?: string | null
          target_user_id?: string | null
          trigger: string
          trigger_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_conversation_id?: string | null
          target_user_id?: string | null
          trigger?: string
          trigger_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_escalations_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "communication_escalations_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_escalations_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_escalations_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "communication_escalations_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "communication_escalations_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_escalations_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_escalations_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      communication_rate_limits: {
        Row: {
          created_at: string
          daily_count: number
          day_bucket: string
          id: string
          last_message_at: string | null
          sender_id: string
          sender_role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_count?: number
          day_bucket: string
          id?: string
          last_message_at?: string | null
          sender_id: string
          sender_role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_count?: number
          day_bucket?: string
          id?: string
          last_message_at?: string | null
          sender_id?: string
          sender_role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_rate_limits_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "communication_rate_limits_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_rate_limits_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_rate_limits_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      communication_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string
          reporter_role: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_conversation_id: string | null
          target_message_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id: string
          reporter_role: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_conversation_id?: string | null
          target_message_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          reporter_role?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_conversation_id?: string | null
          target_message_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "communication_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "communication_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "communication_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      communication_template_versions: {
        Row: {
          body: string
          change_note: string | null
          created_at: string
          created_by: string | null
          id: string
          subject: string | null
          template_id: string
          test_notes: string | null
          test_status: string
          tested_at: string | null
          version_number: number
        }
        Insert: {
          body: string
          change_note?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          subject?: string | null
          template_id: string
          test_notes?: string | null
          test_status?: string
          tested_at?: string | null
          version_number: number
        }
        Update: {
          body?: string
          change_note?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          subject?: string | null
          template_id?: string
          test_notes?: string | null
          test_status?: string
          tested_at?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "communication_template_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "communication_template_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_template_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_template_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "communication_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "communication_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_templates: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          category: string
          channel: string
          created_at: string
          created_by: string | null
          current_version_id: string | null
          description: string | null
          id: string
          name: string
          required_variables: Json
          status: string
          template_key: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          category?: string
          channel: string
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          description?: string | null
          id?: string
          name: string
          required_variables?: Json
          status?: string
          template_key: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          category?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          description?: string | null
          id?: string
          name?: string
          required_variables?: Json
          status?: string
          template_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_templates_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "communication_templates_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_templates_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_templates_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "communication_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "communication_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "communication_templates_current_version_id_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "communication_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_forms: {
        Row: {
          academic_offering_id: string | null
          access_code: string
          body: string
          class_id: string | null
          created_at: string
          created_by: string
          due_date: string | null
          enrollment_type: string
          form_type: string | null
          id: string
          is_public: boolean | null
          school_id: string
          title: string
        }
        Insert: {
          academic_offering_id?: string | null
          access_code?: string
          body: string
          class_id?: string | null
          created_at?: string
          created_by: string
          due_date?: string | null
          enrollment_type?: string
          form_type?: string | null
          id?: string
          is_public?: boolean | null
          school_id: string
          title: string
        }
        Update: {
          academic_offering_id?: string | null
          access_code?: string
          body?: string
          class_id?: string | null
          created_at?: string
          created_by?: string
          due_date?: string | null
          enrollment_type?: string
          form_type?: string | null
          id?: string
          is_public?: boolean | null
          school_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_forms_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["academic_offering_id"]
          },
          {
            foreignKeyName: "consent_forms_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_forms_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_forms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "consent_forms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_forms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_forms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "consent_forms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_responses: {
        Row: {
          form_id: string
          id: string
          parent_id: string
          response_data: Json | null
          signed_at: string
          student_id: string | null
        }
        Insert: {
          form_id: string
          id?: string
          parent_id: string
          response_data?: Json | null
          signed_at?: string
          student_id?: string | null
        }
        Update: {
          form_id?: string
          id?: string
          parent_id?: string
          response_data?: Json | null
          signed_at?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_responses_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "consent_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_responses_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "consent_responses_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_responses_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_responses_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "consent_responses_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_submission_throttle: {
        Row: {
          expires_at: string
          form_id: string
          id: string
          ip_hmac: string
          submitted_at: string
        }
        Insert: {
          expires_at: string
          form_id: string
          id?: string
          ip_hmac: string
          submitted_at?: string
        }
        Update: {
          expires_at?: string
          form_id?: string
          id?: string
          ip_hmac?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_submission_throttle_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "consent_forms"
            referencedColumns: ["id"]
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
          program_id: string | null
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
          program_id?: string | null
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
          program_id?: string | null
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "content_library_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "content_library_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
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
            foreignKeyName: "content_library_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "content_ratings_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
      course_curricula: {
        Row: {
          content: Json
          course_id: string
          created_at: string
          created_by: string
          id: string
          is_visible_to_school: boolean
          school_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          content?: Json
          course_id: string
          created_at?: string
          created_by: string
          id?: string
          is_visible_to_school?: boolean
          school_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          content?: Json
          course_id?: string
          created_at?: string
          created_by?: string
          id?: string
          is_visible_to_school?: boolean
          school_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_curricula_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_curricula_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "course_curricula_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_curricula_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_curricula_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "course_curricula_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
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
          level_order: number
          metadata: Json
          next_course_id: string | null
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
          level_order?: number
          metadata?: Json
          next_course_id?: string | null
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
          level_order?: number
          metadata?: Json
          next_course_id?: string | null
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
            foreignKeyName: "courses_next_course_id_fkey"
            columns: ["next_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "courses_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
      crm_attachments: {
        Row: {
          contact_id: string
          contact_name: string
          contact_type: string
          created_at: string
          file_key: string
          file_name: string
          file_size: number | null
          file_type: string | null
          id: string
          uploaded_by: string | null
          uploaded_by_name: string | null
        }
        Insert: {
          contact_id: string
          contact_name: string
          contact_type?: string
          created_at?: string
          file_key: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
        }
        Update: {
          contact_id?: string
          contact_name?: string
          contact_type?: string
          created_at?: string
          file_key?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "crm_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      crm_interactions: {
        Row: {
          contact_id: string
          contact_name: string
          contact_type: string
          content: string
          created_at: string
          direction: string
          id: string
          staff_id: string | null
          staff_name: string | null
          type: string
        }
        Insert: {
          contact_id: string
          contact_name: string
          contact_type?: string
          content: string
          created_at?: string
          direction?: string
          id?: string
          staff_id?: string | null
          staff_name?: string | null
          type?: string
        }
        Update: {
          contact_id?: string
          contact_name?: string
          contact_type?: string
          content?: string
          created_at?: string
          direction?: string
          id?: string
          staff_id?: string | null
          staff_name?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_interactions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "crm_interactions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_interactions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_interactions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      crm_opportunities: {
        Row: {
          close_probability: number | null
          contact_id: string
          contact_name: string
          created_at: string
          estimated_value: number | null
          expected_close_at: string | null
          id: string
          notes: string | null
          owner_id: string | null
          owner_name: string | null
          source: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          close_probability?: number | null
          contact_id: string
          contact_name: string
          created_at?: string
          estimated_value?: number | null
          expected_close_at?: string | null
          id?: string
          notes?: string | null
          owner_id?: string | null
          owner_name?: string | null
          source?: string | null
          stage?: string
          updated_at?: string
        }
        Update: {
          close_probability?: number | null
          contact_id?: string
          contact_name?: string
          created_at?: string
          estimated_value?: number | null
          expected_close_at?: string | null
          id?: string
          notes?: string | null
          owner_id?: string | null
          owner_name?: string | null
          source?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_opportunities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "crm_opportunities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_opportunities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_opportunities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      crm_pipeline: {
        Row: {
          contact_id: string
          contact_name: string | null
          contact_type: string
          created_at: string
          id: string
          pipeline_notes: string | null
          stage: string
          updated_at: string
          updated_by: string | null
          updated_by_name: string | null
        }
        Insert: {
          contact_id: string
          contact_name?: string | null
          contact_type?: string
          created_at?: string
          id?: string
          pipeline_notes?: string | null
          stage?: string
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Update: {
          contact_id?: string
          contact_name?: string | null
          contact_type?: string
          created_at?: string
          id?: string
          pipeline_notes?: string | null
          stage?: string
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_pipeline_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "crm_pipeline_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_pipeline_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_pipeline_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      crm_tasks: {
        Row: {
          contact_id: string
          contact_name: string
          created_at: string
          created_by: string | null
          due_at: string | null
          id: string
          owner_id: string | null
          owner_name: string | null
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          contact_id: string
          contact_name: string
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          owner_id?: string | null
          owner_name?: string | null
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          contact_id?: string
          contact_name?: string
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          owner_id?: string | null
          owner_name?: string | null
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "crm_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "crm_tasks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "crm_tasks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      cron_job_health: {
        Row: {
          consecutive_failures: number
          expected_interval_minutes: number
          job_name: string
          last_alerted_at: string | null
          last_duration_ms: number | null
          last_error: string | null
          last_finished_at: string | null
          last_result: Json
          last_started_at: string | null
          last_status_code: number | null
          last_success_at: string | null
          next_expected_at: string | null
          updated_at: string
        }
        Insert: {
          consecutive_failures?: number
          expected_interval_minutes: number
          job_name: string
          last_alerted_at?: string | null
          last_duration_ms?: number | null
          last_error?: string | null
          last_finished_at?: string | null
          last_result?: Json
          last_started_at?: string | null
          last_status_code?: number | null
          last_success_at?: string | null
          next_expected_at?: string | null
          updated_at?: string
        }
        Update: {
          consecutive_failures?: number
          expected_interval_minutes?: number
          job_name?: string
          last_alerted_at?: string | null
          last_duration_ms?: number | null
          last_error?: string | null
          last_finished_at?: string | null
          last_result?: Json
          last_started_at?: string | null
          last_status_code?: number | null
          last_success_at?: string | null
          next_expected_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cron_job_leases: {
        Row: {
          claimed_at: string
          job_name: string
          lease_until: string
          run_id: string
          updated_at: string
        }
        Insert: {
          claimed_at?: string
          job_name: string
          lease_until: string
          run_id: string
          updated_at?: string
        }
        Update: {
          claimed_at?: string
          job_name?: string
          lease_until?: string
          run_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      cron_run_history: {
        Row: {
          created_at: string
          duration_ms: number
          error: string | null
          finished_at: string
          id: string
          job_name: string
          result: Json
          started_at: string
          status_code: number | null
          success: boolean
        }
        Insert: {
          created_at?: string
          duration_ms: number
          error?: string | null
          finished_at: string
          id?: string
          job_name: string
          result?: Json
          started_at: string
          status_code?: number | null
          success: boolean
        }
        Update: {
          created_at?: string
          duration_ms?: number
          error?: string | null
          finished_at?: string
          id?: string
          job_name?: string
          result?: Json
          started_at?: string
          status_code?: number | null
          success?: boolean
        }
        Relationships: []
      }
      curriculum_progression_levels: {
        Row: {
          capstone: string | null
          created_at: string
          grade: string
          id: string
          portfolio: string | null
          progression_id: string
          terms: Json
          theme: string
          updated_at: string
          year_number: number
        }
        Insert: {
          capstone?: string | null
          created_at?: string
          grade: string
          id?: string
          portfolio?: string | null
          progression_id: string
          terms: Json
          theme: string
          updated_at?: string
          year_number: number
        }
        Update: {
          capstone?: string | null
          created_at?: string
          grade?: string
          id?: string
          portfolio?: string | null
          progression_id?: string
          terms?: Json
          theme?: string
          updated_at?: string
          year_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_progression_levels_progression_id_fkey"
            columns: ["progression_id"]
            isOneToOne: false
            referencedRelation: "curriculum_progressions"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_progressions: {
        Row: {
          change_summary: string | null
          created_at: string
          created_by: string | null
          edition: number
          id: string
          published_at: string | null
          published_by: string | null
          retired_at: string | null
          retired_by: string | null
          slug: string
          source: string | null
          status: string
          subtitle: string | null
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          edition?: number
          id?: string
          published_at?: string | null
          published_by?: string | null
          retired_at?: string | null
          retired_by?: string | null
          slug: string
          source?: string | null
          status?: string
          subtitle?: string | null
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          edition?: number
          id?: string
          published_at?: string | null
          published_by?: string | null
          retired_at?: string | null
          retired_by?: string | null
          slug?: string
          source?: string | null
          status?: string
          subtitle?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_progressions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "curriculum_progressions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_progressions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_progressions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "curriculum_progressions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "curriculum_progressions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_progressions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_progressions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "curriculum_progressions_retired_by_fkey"
            columns: ["retired_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "curriculum_progressions_retired_by_fkey"
            columns: ["retired_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_progressions_retired_by_fkey"
            columns: ["retired_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_progressions_retired_by_fkey"
            columns: ["retired_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      curriculum_project_registry: {
        Row: {
          classwork_prompt: string | null
          concept_tags: string[]
          course_id: string | null
          created_at: string
          created_by: string | null
          difficulty_level: number
          estimated_minutes: number | null
          id: string
          is_active: boolean
          metadata: Json
          program_id: string | null
          project_key: string
          school_id: string | null
          title: string
          track: string
          updated_at: string
        }
        Insert: {
          classwork_prompt?: string | null
          concept_tags?: string[]
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          difficulty_level?: number
          estimated_minutes?: number | null
          id?: string
          is_active?: boolean
          metadata?: Json
          program_id?: string | null
          project_key: string
          school_id?: string | null
          title: string
          track: string
          updated_at?: string
        }
        Update: {
          classwork_prompt?: string | null
          concept_tags?: string[]
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          difficulty_level?: number
          estimated_minutes?: number | null
          id?: string
          is_active?: boolean
          metadata?: Json
          program_id?: string | null
          project_key?: string
          school_id?: string | null
          title?: string
          track?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_project_registry_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_project_registry_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "curriculum_project_registry_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_project_registry_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_project_registry_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "curriculum_project_registry_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_project_registry_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_project_usage: {
        Row: {
          class_id: string | null
          course_id: string | null
          id: string
          is_repeat: boolean
          lesson_plan_id: string | null
          metadata: Json
          project_id: string
          school_id: string
          term_number: number
          used_at: string
          week_number: number
          year_number: number
        }
        Insert: {
          class_id?: string | null
          course_id?: string | null
          id?: string
          is_repeat?: boolean
          lesson_plan_id?: string | null
          metadata?: Json
          project_id: string
          school_id: string
          term_number: number
          used_at?: string
          week_number: number
          year_number: number
        }
        Update: {
          class_id?: string | null
          course_id?: string | null
          id?: string
          is_repeat?: boolean
          lesson_plan_id?: string | null
          metadata?: Json
          project_id?: string
          school_id?: string
          term_number?: number
          used_at?: string
          week_number?: number
          year_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_project_usage_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_project_usage_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_project_usage_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "academic_lesson_plan_source_issues"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "curriculum_project_usage_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "class_term_teaching_progress"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "curriculum_project_usage_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_project_usage_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "curriculum_project_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_project_usage_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_week_performance: {
        Row: {
          class_id: string | null
          completed: boolean
          completion_seconds: number
          course_id: string | null
          created_at: string
          id: string
          lesson_plan_id: string
          practical_score: number
          recorded_by: string | null
          retry_count: number
          school_id: string
          student_id: string
          term_number: number
          updated_at: string
          week_number: number
          year_number: number
        }
        Insert: {
          class_id?: string | null
          completed?: boolean
          completion_seconds?: number
          course_id?: string | null
          created_at?: string
          id?: string
          lesson_plan_id: string
          practical_score?: number
          recorded_by?: string | null
          retry_count?: number
          school_id: string
          student_id: string
          term_number: number
          updated_at?: string
          week_number: number
          year_number: number
        }
        Update: {
          class_id?: string | null
          completed?: boolean
          completion_seconds?: number
          course_id?: string | null
          created_at?: string
          id?: string
          lesson_plan_id?: string
          practical_score?: number
          recorded_by?: string | null
          retry_count?: number
          school_id?: string
          student_id?: string
          term_number?: number
          updated_at?: string
          week_number?: number
          year_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_week_performance_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_week_performance_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_week_performance_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "academic_lesson_plan_source_issues"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "curriculum_week_performance_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "class_term_teaching_progress"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "curriculum_week_performance_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_week_performance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "curriculum_week_performance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_week_performance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_week_performance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "curriculum_week_performance_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_week_performance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "curriculum_week_performance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_week_performance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_week_performance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      curriculum_week_tracking: {
        Row: {
          actual_date: string | null
          class_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          curriculum_id: string
          curriculum_release_id: string | null
          id: string
          lesson_plan_id: string | null
          school_id: string | null
          status: string
          teacher_notes: string | null
          term_number: number
          updated_at: string | null
          week_number: number
        }
        Insert: {
          actual_date?: string | null
          class_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          curriculum_id: string
          curriculum_release_id?: string | null
          id?: string
          lesson_plan_id?: string | null
          school_id?: string | null
          status?: string
          teacher_notes?: string | null
          term_number: number
          updated_at?: string | null
          week_number: number
        }
        Update: {
          actual_date?: string | null
          class_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          curriculum_id?: string
          curriculum_release_id?: string | null
          id?: string
          lesson_plan_id?: string | null
          school_id?: string | null
          status?: string
          teacher_notes?: string | null
          term_number?: number
          updated_at?: string | null
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_week_tracking_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_week_tracking_curriculum_fkey"
            columns: ["curriculum_id"]
            isOneToOne: false
            referencedRelation: "course_curricula"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_week_tracking_curriculum_release_id_fkey"
            columns: ["curriculum_release_id"]
            isOneToOne: false
            referencedRelation: "academic_curriculum_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_week_tracking_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "academic_lesson_plan_source_issues"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "curriculum_week_tracking_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "class_term_teaching_progress"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "curriculum_week_tracking_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_contact_book: {
        Row: {
          class_name: string | null
          confirmed_at: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          last_channel: string
          metadata: Json
          phone: string | null
          role: string
          school_name: string | null
          source: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          class_name?: string | null
          confirmed_at?: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          last_channel?: string
          metadata?: Json
          phone?: string | null
          role: string
          school_name?: string | null
          source?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          class_name?: string | null
          confirmed_at?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          last_channel?: string
          metadata?: Json
          phone?: string | null
          role?: string
          school_name?: string | null
          source?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_contact_book_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "customer_contact_book_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_contact_book_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_contact_book_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      customer_value_outcomes: {
        Row: {
          case_id: string | null
          comment: string | null
          created_at: string
          feedback_id: string | null
          id: string
          outcome_type: string
          portal_user_id: string | null
          score: number | null
          source: string
        }
        Insert: {
          case_id?: string | null
          comment?: string | null
          created_at?: string
          feedback_id?: string | null
          id?: string
          outcome_type: string
          portal_user_id?: string | null
          score?: number | null
          source?: string
        }
        Update: {
          case_id?: string | null
          comment?: string | null
          created_at?: string
          feedback_id?: string | null
          id?: string
          outcome_type?: string
          portal_user_id?: string | null
          score?: number | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_value_outcomes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "communication_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_value_outcomes_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_value_outcomes_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "customer_value_outcomes_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_value_outcomes_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_value_outcomes_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      device_push_tokens: {
        Row: {
          created_at: string
          device_hint: string | null
          id: string
          platform: string
          portal_user_id: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_hint?: string | null
          id?: string
          platform: string
          portal_user_id: string
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_hint?: string | null
          id?: string
          platform?: string
          portal_user_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_push_tokens_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "device_push_tokens_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_push_tokens_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_push_tokens_portal_user_id_fkey"
            columns: ["portal_user_id"]
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "discussion_replies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "discussion_topics_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
      dismissed_duplicate_pairs: {
        Row: {
          created_at: string
          dismissed_by: string | null
          id: string
          pair_key: string
          reason: string | null
          student_a: string | null
          student_b: string | null
        }
        Insert: {
          created_at?: string
          dismissed_by?: string | null
          id?: string
          pair_key: string
          reason?: string | null
          student_a?: string | null
          student_b?: string | null
        }
        Update: {
          created_at?: string
          dismissed_by?: string | null
          id?: string
          pair_key?: string
          reason?: string | null
          student_a?: string | null
          student_b?: string | null
        }
        Relationships: []
      }
      email_events: {
        Row: {
          email: string | null
          event: string
          id: string
          occurred_at: string | null
          report_id: string | null
        }
        Insert: {
          email?: string | null
          event: string
          id?: string
          occurred_at?: string | null
          report_id?: string | null
        }
        Update: {
          email?: string | null
          event?: string
          id?: string
          occurred_at?: string | null
          report_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_events_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "student_progress_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      email_thread_links: {
        Row: {
          case_id: string
          created_at: string
          id: string
          internet_message_id: string | null
          provider: string | null
          provider_message_id: string | null
          subject_token: string
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          internet_message_id?: string | null
          provider?: string | null
          provider_message_id?: string | null
          subject_token: string
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          internet_message_id?: string | null
          provider?: string | null
          provider_message_id?: string | null
          subject_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_thread_links_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "communication_cases"
            referencedColumns: ["id"]
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "engage_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
      enrollment_term_grades: {
        Row: {
          class_id: string | null
          course_id: string | null
          created_at: string
          curriculum_release_id: string | null
          enrollment_id: string
          evidence_manifest: Json
          grade: string | null
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_status: string
          notes: string | null
          school_id: string | null
          term_id: string
          updated_at: string
        }
        Insert: {
          class_id?: string | null
          course_id?: string | null
          created_at?: string
          curriculum_release_id?: string | null
          enrollment_id: string
          evidence_manifest?: Json
          grade?: string | null
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_status?: string
          notes?: string | null
          school_id?: string | null
          term_id: string
          updated_at?: string
        }
        Update: {
          class_id?: string | null
          course_id?: string | null
          created_at?: string
          curriculum_release_id?: string | null
          enrollment_id?: string
          evidence_manifest?: Json
          grade?: string | null
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_status?: string
          notes?: string | null
          school_id?: string | null
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_term_grades_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_term_grades_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_term_grades_curriculum_release_id_fkey"
            columns: ["curriculum_release_id"]
            isOneToOne: false
            referencedRelation: "academic_curriculum_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_term_grades_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_term_grades_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_term_grades_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
          grading_change_reason: string | null
          grading_changed_at: string | null
          grading_changed_by: string | null
          grading_version: number
          id: string
          moderation_status: string
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
          grading_change_reason?: string | null
          grading_changed_at?: string | null
          grading_changed_by?: string | null
          grading_version?: number
          id?: string
          moderation_status?: string
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
          grading_change_reason?: string | null
          grading_changed_at?: string | null
          grading_changed_by?: string | null
          grading_version?: number
          id?: string
          moderation_status?: string
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
            foreignKeyName: "exam_attempts_grading_changed_by_fkey"
            columns: ["grading_changed_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "exam_attempts_grading_changed_by_fkey"
            columns: ["grading_changed_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_attempts_grading_changed_by_fkey"
            columns: ["grading_changed_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_attempts_grading_changed_by_fkey"
            columns: ["grading_changed_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "exam_attempts_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "exam_attempts_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
          academic_offering_id: string | null
          class_id: string | null
          course_id: string | null
          created_at: string | null
          created_by: string | null
          curriculum_release_id: string | null
          curriculum_term_number: number | null
          curriculum_week_number: number | null
          curriculum_year_number: number | null
          description: string | null
          duration_minutes: number | null
          grading_mode: string
          id: string
          is_active: boolean | null
          learning_outcomes: Json
          lesson_id: string | null
          lesson_plan_id: string | null
          max_attempts: number | null
          metadata: Json
          offering_period_id: string | null
          passing_score: number | null
          program_id: string | null
          randomize_options: boolean | null
          randomize_questions: boolean | null
          school_id: string | null
          term_id: string | null
          title: string
          total_points: number | null
          updated_at: string | null
        }
        Insert: {
          academic_offering_id?: string | null
          class_id?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          curriculum_release_id?: string | null
          curriculum_term_number?: number | null
          curriculum_week_number?: number | null
          curriculum_year_number?: number | null
          description?: string | null
          duration_minutes?: number | null
          grading_mode?: string
          id?: string
          is_active?: boolean | null
          learning_outcomes?: Json
          lesson_id?: string | null
          lesson_plan_id?: string | null
          max_attempts?: number | null
          metadata?: Json
          offering_period_id?: string | null
          passing_score?: number | null
          program_id?: string | null
          randomize_options?: boolean | null
          randomize_questions?: boolean | null
          school_id?: string | null
          term_id?: string | null
          title: string
          total_points?: number | null
          updated_at?: string | null
        }
        Update: {
          academic_offering_id?: string | null
          class_id?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          curriculum_release_id?: string | null
          curriculum_term_number?: number | null
          curriculum_week_number?: number | null
          curriculum_year_number?: number | null
          description?: string | null
          duration_minutes?: number | null
          grading_mode?: string
          id?: string
          is_active?: boolean | null
          learning_outcomes?: Json
          lesson_id?: string | null
          lesson_plan_id?: string | null
          max_attempts?: number | null
          metadata?: Json
          offering_period_id?: string | null
          passing_score?: number | null
          program_id?: string | null
          randomize_options?: boolean | null
          randomize_questions?: boolean | null
          school_id?: string | null
          term_id?: string | null
          title?: string
          total_points?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exams_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["academic_offering_id"]
          },
          {
            foreignKeyName: "exams_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "exams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
          {
            foreignKeyName: "exams_curriculum_release_id_fkey"
            columns: ["curriculum_release_id"]
            isOneToOne: false
            referencedRelation: "academic_curriculum_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "academic_lesson_plan_source_issues"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "exams_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "class_term_teaching_progress"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "exams_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_offering_period_id_fkey"
            columns: ["offering_period_id"]
            isOneToOne: false
            referencedRelation: "academic_offering_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          admin_response: string | null
          assigned_at: string | null
          assigned_to: string | null
          created_at: string
          department: string
          first_response_due_at: string | null
          id: string
          message: string
          outcome: string | null
          priority: string
          rating: number | null
          reopened_at: string | null
          reopened_count: number
          resolution_minutes: number | null
          resolved_at: string | null
          responded_at: string | null
          responded_by: string | null
          satisfaction_score: number | null
          status: string
          subject: string
          type: string
          updated_at: string | null
          user_email: string | null
          user_id: string | null
          user_name: string
          user_role: string | null
        }
        Insert: {
          admin_response?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          created_at?: string
          department?: string
          first_response_due_at?: string | null
          id?: string
          message: string
          outcome?: string | null
          priority?: string
          rating?: number | null
          reopened_at?: string | null
          reopened_count?: number
          resolution_minutes?: number | null
          resolved_at?: string | null
          responded_at?: string | null
          responded_by?: string | null
          satisfaction_score?: number | null
          status?: string
          subject: string
          type: string
          updated_at?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name: string
          user_role?: string | null
        }
        Update: {
          admin_response?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          created_at?: string
          department?: string
          first_response_due_at?: string | null
          id?: string
          message?: string
          outcome?: string | null
          priority?: string
          rating?: number | null
          reopened_at?: string | null
          reopened_count?: number
          resolution_minutes?: number | null
          resolved_at?: string | null
          responded_at?: string | null
          responded_by?: string | null
          satisfaction_score?: number | null
          status?: string
          subject?: string
          type?: string
          updated_at?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string
          user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "feedback_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "feedback_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "feedback_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
      finance_academic_links: {
        Row: {
          academic_offering_id: string
          billing_cycle_id: string | null
          created_at: string
          id: string
          invoice_id: string | null
          link_source: string
          offering_period_id: string
          payment_transaction_id: string | null
        }
        Insert: {
          academic_offering_id: string
          billing_cycle_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          link_source?: string
          offering_period_id: string
          payment_transaction_id?: string | null
        }
        Update: {
          academic_offering_id?: string
          billing_cycle_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          link_source?: string
          offering_period_id?: string
          payment_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_academic_links_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["academic_offering_id"]
          },
          {
            foreignKeyName: "finance_academic_links_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_academic_links_billing_cycle_id_fkey"
            columns: ["billing_cycle_id"]
            isOneToOne: false
            referencedRelation: "billing_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_academic_links_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "finance_ledger"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "finance_academic_links_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_academic_links_offering_period_id_fkey"
            columns: ["offering_period_id"]
            isOneToOne: false
            referencedRelation: "academic_offering_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_academic_links_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "finance_ledger"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "finance_academic_links_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_automation_log: {
        Row: {
          action: string
          attempt: number
          channel: string
          created_at: string
          entity_id: string
          entity_type: string
          error: string | null
          id: string
          metadata: Json
          stage: string | null
          status: string
          stream: string
        }
        Insert: {
          action: string
          attempt?: number
          channel?: string
          created_at?: string
          entity_id: string
          entity_type: string
          error?: string | null
          id?: string
          metadata?: Json
          stage?: string | null
          status?: string
          stream: string
        }
        Update: {
          action?: string
          attempt?: number
          channel?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          error?: string | null
          id?: string
          metadata?: Json
          stage?: string | null
          status?: string
          stream?: string
        }
        Relationships: []
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "flagged_content_moderator_id_fkey"
            columns: ["moderator_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "flagged_content_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
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
      flashcard_card_statistics: {
        Row: {
          average_confidence: number | null
          card_id: string
          correct_reviews: number
          id: string
          incorrect_reviews: number
          last_updated: string
          total_reviews: number
        }
        Insert: {
          average_confidence?: number | null
          card_id: string
          correct_reviews?: number
          id?: string
          incorrect_reviews?: number
          last_updated?: string
          total_reviews?: number
        }
        Update: {
          average_confidence?: number | null
          card_id?: string
          correct_reviews?: number
          id?: string
          incorrect_reviews?: number
          last_updated?: string
          total_reviews?: number
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_card_statistics_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: true
            referencedRelation: "flashcard_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcard_cards: {
        Row: {
          back: string
          back_image_url: string | null
          created_at: string
          deck_id: string
          difficulty_level: string | null
          front: string
          front_image_url: string | null
          id: string
          is_starred: boolean | null
          notes: string | null
          position: number
          tags: string[] | null
          template: string | null
          updated_at: string | null
        }
        Insert: {
          back: string
          back_image_url?: string | null
          created_at?: string
          deck_id: string
          difficulty_level?: string | null
          front: string
          front_image_url?: string | null
          id?: string
          is_starred?: boolean | null
          notes?: string | null
          position?: number
          tags?: string[] | null
          template?: string | null
          updated_at?: string | null
        }
        Update: {
          back?: string
          back_image_url?: string | null
          created_at?: string
          deck_id?: string
          difficulty_level?: string | null
          front?: string
          front_image_url?: string | null
          id?: string
          is_starred?: boolean | null
          notes?: string | null
          position?: number
          tags?: string[] | null
          template?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_cards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "flashcard_decks"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcard_decks: {
        Row: {
          academic_offering_id: string | null
          class_id: string | null
          content_stale_at: string | null
          course_id: string | null
          created_at: string
          created_by: string
          curriculum_release_id: string | null
          curriculum_week_number: number | null
          description: string | null
          id: string
          is_public: boolean | null
          lesson_id: string | null
          lesson_plan_id: string | null
          metadata: Json | null
          offering_period_id: string | null
          progression_delivery_mode: string | null
          progression_policy_snapshot: Json
          progression_track: string | null
          progression_weekly_frequency: number | null
          school_id: string | null
          school_progression_enabled: boolean
          session_number: number
          tags: string[] | null
          term_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          academic_offering_id?: string | null
          class_id?: string | null
          content_stale_at?: string | null
          course_id?: string | null
          created_at?: string
          created_by: string
          curriculum_release_id?: string | null
          curriculum_week_number?: number | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          lesson_id?: string | null
          lesson_plan_id?: string | null
          metadata?: Json | null
          offering_period_id?: string | null
          progression_delivery_mode?: string | null
          progression_policy_snapshot?: Json
          progression_track?: string | null
          progression_weekly_frequency?: number | null
          school_id?: string | null
          school_progression_enabled?: boolean
          session_number?: number
          tags?: string[] | null
          term_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          academic_offering_id?: string | null
          class_id?: string | null
          content_stale_at?: string | null
          course_id?: string | null
          created_at?: string
          created_by?: string
          curriculum_release_id?: string | null
          curriculum_week_number?: number | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          lesson_id?: string | null
          lesson_plan_id?: string | null
          metadata?: Json | null
          offering_period_id?: string | null
          progression_delivery_mode?: string | null
          progression_policy_snapshot?: Json
          progression_track?: string | null
          progression_weekly_frequency?: number | null
          school_id?: string | null
          school_progression_enabled?: boolean
          session_number?: number
          tags?: string[] | null
          term_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_decks_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["academic_offering_id"]
          },
          {
            foreignKeyName: "flashcard_decks_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_decks_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_decks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_decks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "flashcard_decks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_decks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_decks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "flashcard_decks_curriculum_release_id_fkey"
            columns: ["curriculum_release_id"]
            isOneToOne: false
            referencedRelation: "academic_curriculum_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_decks_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_decks_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "academic_lesson_plan_source_issues"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "flashcard_decks_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "class_term_teaching_progress"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "flashcard_decks_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_decks_offering_period_id_fkey"
            columns: ["offering_period_id"]
            isOneToOne: false
            referencedRelation: "academic_offering_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_decks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_decks_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcard_reviews: {
        Row: {
          card_id: string
          confidence_level: number | null
          ease_factor: number
          id: string
          interval_days: number
          last_reviewed_at: string | null
          next_review_at: string
          repetitions: number
          student_id: string
          study_time_seconds: number | null
          updated_at: string | null
        }
        Insert: {
          card_id: string
          confidence_level?: number | null
          ease_factor?: number
          id?: string
          interval_days?: number
          last_reviewed_at?: string | null
          next_review_at?: string
          repetitions?: number
          student_id: string
          study_time_seconds?: number | null
          updated_at?: string | null
        }
        Update: {
          card_id?: string
          confidence_level?: number | null
          ease_factor?: number
          id?: string
          interval_days?: number
          last_reviewed_at?: string | null
          next_review_at?: string
          repetitions?: number
          student_id?: string
          study_time_seconds?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_reviews_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "flashcard_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_reviews_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "flashcard_reviews_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_reviews_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_reviews_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      flashcard_study_sessions: {
        Row: {
          cards_correct: number
          cards_incorrect: number
          cards_studied: number
          completed_at: string
          created_at: string
          deck_id: string
          id: string
          max_streak: number
          student_id: string
          study_duration_seconds: number
        }
        Insert: {
          cards_correct?: number
          cards_incorrect?: number
          cards_studied?: number
          completed_at?: string
          created_at?: string
          deck_id: string
          id?: string
          max_streak?: number
          student_id: string
          study_duration_seconds?: number
        }
        Update: {
          cards_correct?: number
          cards_incorrect?: number
          cards_studied?: number
          completed_at?: string
          created_at?: string
          deck_id?: string
          id?: string
          max_streak?: number
          student_id?: string
          study_duration_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_study_sessions_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "flashcard_decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_study_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "flashcard_study_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_study_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_study_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      form_lead_child_links: {
        Row: {
          child_index: number
          created_at: string
          id: string
          lead_id: string
          linked_at: string | null
          linked_by: string | null
          metadata: Json
          source: string
          status: string
          student_portal_user_id: string
          updated_at: string
        }
        Insert: {
          child_index: number
          created_at?: string
          id?: string
          lead_id: string
          linked_at?: string | null
          linked_by?: string | null
          metadata?: Json
          source: string
          status?: string
          student_portal_user_id: string
          updated_at?: string
        }
        Update: {
          child_index?: number
          created_at?: string
          id?: string
          lead_id?: string
          linked_at?: string | null
          linked_by?: string | null
          metadata?: Json
          source?: string
          status?: string
          student_portal_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_lead_child_links_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "form_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_lead_child_links_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "form_lead_child_links_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_lead_child_links_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_lead_child_links_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "form_lead_child_links_student_portal_user_id_fkey"
            columns: ["student_portal_user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "form_lead_child_links_student_portal_user_id_fkey"
            columns: ["student_portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_lead_child_links_student_portal_user_id_fkey"
            columns: ["student_portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_lead_child_links_student_portal_user_id_fkey"
            columns: ["student_portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      form_leads: {
        Row: {
          child_current_school: string | null
          contact_id: string | null
          email: string | null
          form_id: string
          id: string
          match_candidate_id: string | null
          match_confidence: string | null
          match_notes: string | null
          match_status: string | null
          matched_parent_id: string | null
          matched_school_id: string | null
          matched_student_id: string | null
          prospect_id: string | null
          response_data: Json
          school_id: string | null
          status: string | null
          submitted_at: string | null
        }
        Insert: {
          child_current_school?: string | null
          contact_id?: string | null
          email?: string | null
          form_id: string
          id?: string
          match_candidate_id?: string | null
          match_confidence?: string | null
          match_notes?: string | null
          match_status?: string | null
          matched_parent_id?: string | null
          matched_school_id?: string | null
          matched_student_id?: string | null
          prospect_id?: string | null
          response_data?: Json
          school_id?: string | null
          status?: string | null
          submitted_at?: string | null
        }
        Update: {
          child_current_school?: string | null
          contact_id?: string | null
          email?: string | null
          form_id?: string
          id?: string
          match_candidate_id?: string | null
          match_confidence?: string | null
          match_notes?: string | null
          match_status?: string | null
          matched_parent_id?: string | null
          matched_school_id?: string | null
          matched_student_id?: string | null
          prospect_id?: string | null
          response_data?: Json
          school_id?: string | null
          status?: string | null
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contact_book"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_leads_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "consent_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_leads_match_candidate_id_fkey"
            columns: ["match_candidate_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "form_leads_match_candidate_id_fkey"
            columns: ["match_candidate_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_leads_match_candidate_id_fkey"
            columns: ["match_candidate_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_leads_match_candidate_id_fkey"
            columns: ["match_candidate_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "form_leads_matched_parent_id_fkey"
            columns: ["matched_parent_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "form_leads_matched_parent_id_fkey"
            columns: ["matched_parent_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_leads_matched_parent_id_fkey"
            columns: ["matched_parent_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_leads_matched_parent_id_fkey"
            columns: ["matched_parent_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "form_leads_matched_school_id_fkey"
            columns: ["matched_school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_leads_matched_student_id_fkey"
            columns: ["matched_student_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "form_leads_matched_student_id_fkey"
            columns: ["matched_student_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_leads_matched_student_id_fkey"
            columns: ["matched_student_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_leads_matched_student_id_fkey"
            columns: ["matched_student_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "form_leads_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospective_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_leads_school_id_fkey"
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "generated_reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "grade_reports_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "identity_cards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "identity_cards_holder_id_fkey"
            columns: ["holder_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "identity_cards_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
      instalment_items: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          id: string
          paid_at: string | null
          plan_id: string
          status: string
          transaction_ref: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          due_date: string
          id?: string
          paid_at?: string | null
          plan_id: string
          status?: string
          transaction_ref?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          id?: string
          paid_at?: string | null
          plan_id?: string
          status?: string
          transaction_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instalment_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "instalment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      instalment_plans: {
        Row: {
          created_at: string
          currency: string
          id: string
          invoice_id: string
          parent_id: string
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          invoice_id: string
          parent_id: string
          status?: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          invoice_id?: string
          parent_id?: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instalment_plans_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "finance_ledger"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "instalment_plans_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instalment_plans_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "instalment_plans_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instalment_plans_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instalment_plans_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      invoice_automation_logs: {
        Row: {
          created_at: string
          details: Json
          errors: number
          id: string
          invoices_scanned: number
          overdue_marked: number
          reminders_sent: number
          triggered_by: string
        }
        Insert: {
          created_at?: string
          details?: Json
          errors?: number
          id?: string
          invoices_scanned?: number
          overdue_marked?: number
          reminders_sent?: number
          triggered_by: string
        }
        Update: {
          created_at?: string
          details?: Json
          errors?: number
          id?: string
          invoices_scanned?: number
          overdue_marked?: number
          reminders_sent?: number
          triggered_by?: string
        }
        Relationships: []
      }
      invoice_payment_proofs: {
        Row: {
          admin_note: string | null
          created_at: string
          id: string
          invoice_id: string
          payer_note: string | null
          proof_image_url: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_by: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          id?: string
          invoice_id: string
          payer_note?: string | null
          proof_image_url: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          id?: string
          invoice_id?: string
          payer_note?: string | null
          proof_image_url?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payment_proofs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "finance_ledger"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "invoice_payment_proofs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payment_proofs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "invoice_payment_proofs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payment_proofs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payment_proofs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "invoice_payment_proofs_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "invoice_payment_proofs_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
          amount_paid: number
          amount_remaining: number
          billing_cycle_id: string | null
          created_at: string | null
          currency: string | null
          due_date: string | null
          id: string
          invoice_number: string
          items: Json | null
          metadata: Json | null
          notes: string | null
          original_amount: number
          payment_link: string | null
          payment_transaction_id: string | null
          portal_user_id: string | null
          reminder_1_sent_at: string | null
          reminder_2_sent_at: string | null
          reminder_3_sent_at: string | null
          school_id: string | null
          status: string | null
          stream: string
          updated_at: string | null
        }
        Insert: {
          amount?: number
          amount_paid?: number
          amount_remaining?: number
          billing_cycle_id?: string | null
          created_at?: string | null
          currency?: string | null
          due_date?: string | null
          id?: string
          invoice_number: string
          items?: Json | null
          metadata?: Json | null
          notes?: string | null
          original_amount?: number
          payment_link?: string | null
          payment_transaction_id?: string | null
          portal_user_id?: string | null
          reminder_1_sent_at?: string | null
          reminder_2_sent_at?: string | null
          reminder_3_sent_at?: string | null
          school_id?: string | null
          status?: string | null
          stream?: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          amount_paid?: number
          amount_remaining?: number
          billing_cycle_id?: string | null
          created_at?: string | null
          currency?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string
          items?: Json | null
          metadata?: Json | null
          notes?: string | null
          original_amount?: number
          payment_link?: string | null
          payment_transaction_id?: string | null
          portal_user_id?: string | null
          reminder_1_sent_at?: string | null
          reminder_2_sent_at?: string | null
          reminder_3_sent_at?: string | null
          school_id?: string | null
          status?: string | null
          stream?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_billing_cycle_id_fkey"
            columns: ["billing_cycle_id"]
            isOneToOne: false
            referencedRelation: "billing_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "finance_ledger"
            referencedColumns: ["transaction_id"]
          },
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "invoices_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "lab_projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "leaderboards_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
          academic_offering_id: string | null
          class_id: string | null
          content_stale_at: string | null
          created_at: string | null
          curriculum_release_id: string | null
          curriculum_week_number: number | null
          file_type: string | null
          file_url: string
          id: string
          is_public: boolean | null
          lesson_id: string | null
          lesson_plan_id: string | null
          metadata: Json | null
          offering_period_id: string | null
          session_number: number
          title: string
        }
        Insert: {
          academic_offering_id?: string | null
          class_id?: string | null
          content_stale_at?: string | null
          created_at?: string | null
          curriculum_release_id?: string | null
          curriculum_week_number?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          is_public?: boolean | null
          lesson_id?: string | null
          lesson_plan_id?: string | null
          metadata?: Json | null
          offering_period_id?: string | null
          session_number?: number
          title: string
        }
        Update: {
          academic_offering_id?: string | null
          class_id?: string | null
          content_stale_at?: string | null
          created_at?: string | null
          curriculum_release_id?: string | null
          curriculum_week_number?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          is_public?: boolean | null
          lesson_id?: string | null
          lesson_plan_id?: string | null
          metadata?: Json | null
          offering_period_id?: string | null
          session_number?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_materials_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["academic_offering_id"]
          },
          {
            foreignKeyName: "lesson_materials_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_materials_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_materials_curriculum_release_id_fkey"
            columns: ["curriculum_release_id"]
            isOneToOne: false
            referencedRelation: "academic_curriculum_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_materials_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_materials_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "academic_lesson_plan_source_issues"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "lesson_materials_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "class_term_teaching_progress"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "lesson_materials_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_materials_offering_period_id_fkey"
            columns: ["offering_period_id"]
            isOneToOne: false
            referencedRelation: "academic_offering_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_plan_pattern_applications: {
        Row: {
          applied_at: string
          applied_by: string | null
          id: string
          lesson_plan_id: string
          pattern_id: string
          pattern_snapshot: Json
        }
        Insert: {
          applied_at?: string
          applied_by?: string | null
          id?: string
          lesson_plan_id: string
          pattern_id: string
          pattern_snapshot: Json
        }
        Update: {
          applied_at?: string
          applied_by?: string | null
          id?: string
          lesson_plan_id?: string
          pattern_id?: string
          pattern_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "lesson_plan_pattern_applications_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "academic_lesson_plan_source_issues"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "lesson_plan_pattern_applications_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "class_term_teaching_progress"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "lesson_plan_pattern_applications_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plan_pattern_applications_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "teacher_delivery_patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_plans: {
        Row: {
          academic_offering_id: string | null
          activities: string | null
          assessment_methods: string | null
          class_id: string | null
          course_id: string | null
          created_at: string | null
          created_by: string | null
          curriculum_release_id: string | null
          curriculum_version_id: string | null
          id: string
          lesson_id: string | null
          metadata: Json | null
          objectives: string | null
          offering_period_id: string | null
          plan_data: Json
          school_id: string | null
          sessions_per_week: number | null
          staff_notes: string | null
          status: string
          summary_notes: string | null
          term: string | null
          term_end: string | null
          term_id: string | null
          term_start: string | null
          updated_at: string | null
          version: number
        }
        Insert: {
          academic_offering_id?: string | null
          activities?: string | null
          assessment_methods?: string | null
          class_id?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          curriculum_release_id?: string | null
          curriculum_version_id?: string | null
          id?: string
          lesson_id?: string | null
          metadata?: Json | null
          objectives?: string | null
          offering_period_id?: string | null
          plan_data?: Json
          school_id?: string | null
          sessions_per_week?: number | null
          staff_notes?: string | null
          status?: string
          summary_notes?: string | null
          term?: string | null
          term_end?: string | null
          term_id?: string | null
          term_start?: string | null
          updated_at?: string | null
          version?: number
        }
        Update: {
          academic_offering_id?: string | null
          activities?: string | null
          assessment_methods?: string | null
          class_id?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          curriculum_release_id?: string | null
          curriculum_version_id?: string | null
          id?: string
          lesson_id?: string | null
          metadata?: Json | null
          objectives?: string | null
          offering_period_id?: string | null
          plan_data?: Json
          school_id?: string | null
          sessions_per_week?: number | null
          staff_notes?: string | null
          status?: string
          summary_notes?: string | null
          term?: string | null
          term_end?: string | null
          term_id?: string | null
          term_start?: string | null
          updated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_lesson_plans_curriculum"
            columns: ["curriculum_version_id"]
            isOneToOne: false
            referencedRelation: "course_curricula"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["academic_offering_id"]
          },
          {
            foreignKeyName: "lesson_plans_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "lesson_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "lesson_plans_curriculum_release_id_fkey"
            columns: ["curriculum_release_id"]
            isOneToOne: false
            referencedRelation: "academic_curriculum_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: true
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_offering_period_id_fkey"
            columns: ["offering_period_id"]
            isOneToOne: false
            referencedRelation: "academic_offering_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "lesson_progress_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
          academic_offering_id: string | null
          academic_term_id: string | null
          class_id: string | null
          content: string | null
          content_layout: Json | null
          content_locked_at: string | null
          content_locked_by: string | null
          course_id: string | null
          created_at: string | null
          created_by: string | null
          curriculum_release_id: string | null
          curriculum_week_number: number | null
          description: string | null
          duration_minutes: number | null
          id: string
          lesson_notes: string | null
          lesson_plan_id: string | null
          lesson_type: string | null
          metadata: Json | null
          offering_period_id: string | null
          order_index: number | null
          school_id: string | null
          school_name: string | null
          session_date: string | null
          session_number: number
          shared_master_id: string | null
          status: string | null
          title: string
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          academic_offering_id?: string | null
          academic_term_id?: string | null
          class_id?: string | null
          content?: string | null
          content_layout?: Json | null
          content_locked_at?: string | null
          content_locked_by?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          curriculum_release_id?: string | null
          curriculum_week_number?: number | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          lesson_notes?: string | null
          lesson_plan_id?: string | null
          lesson_type?: string | null
          metadata?: Json | null
          offering_period_id?: string | null
          order_index?: number | null
          school_id?: string | null
          school_name?: string | null
          session_date?: string | null
          session_number?: number
          shared_master_id?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          academic_offering_id?: string | null
          academic_term_id?: string | null
          class_id?: string | null
          content?: string | null
          content_layout?: Json | null
          content_locked_at?: string | null
          content_locked_by?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          curriculum_release_id?: string | null
          curriculum_week_number?: number | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          lesson_notes?: string | null
          lesson_plan_id?: string | null
          lesson_type?: string | null
          metadata?: Json | null
          offering_period_id?: string | null
          order_index?: number | null
          school_id?: string | null
          school_name?: string | null
          session_date?: string | null
          session_number?: number
          shared_master_id?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["academic_offering_id"]
          },
          {
            foreignKeyName: "lessons_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_academic_term_id_fkey"
            columns: ["academic_term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "lessons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
            foreignKeyName: "lessons_curriculum_release_id_fkey"
            columns: ["curriculum_release_id"]
            isOneToOne: false
            referencedRelation: "academic_curriculum_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "academic_lesson_plan_source_issues"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "lessons_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "class_term_teaching_progress"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "lessons_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_offering_period_id_fkey"
            columns: ["offering_period_id"]
            isOneToOne: false
            referencedRelation: "academic_offering_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_shared_master_id_fkey"
            columns: ["shared_master_id"]
            isOneToOne: false
            referencedRelation: "lessons"
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "live_session_attendance_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "live_session_attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "live_session_breakout_participants_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "live_session_breakout_rooms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "live_session_breakout_rooms_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "live_session_poll_responses_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "live_session_polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "live_session_polls_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_session_questions: {
        Row: {
          answer: string | null
          answered: boolean | null
          answered_at: string | null
          answered_by: string | null
          body: string
          created_at: string
          id: string
          session_id: string
          upvotes: number | null
          user_id: string
        }
        Insert: {
          answer?: string | null
          answered?: boolean | null
          answered_at?: string | null
          answered_by?: string | null
          body: string
          created_at?: string
          id?: string
          session_id: string
          upvotes?: number | null
          user_id: string
        }
        Update: {
          answer?: string | null
          answered?: boolean | null
          answered_at?: string | null
          answered_by?: string | null
          body?: string
          created_at?: string
          id?: string
          session_id?: string
          upvotes?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_session_questions_session_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_questions_user_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "live_session_questions_user_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_questions_user_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_questions_user_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      live_session_removals: {
        Row: {
          id: string
          portal_user_id: string
          removed_at: string
          removed_by: string | null
          session_id: string
        }
        Insert: {
          id?: string
          portal_user_id: string
          removed_at?: string
          removed_by?: string | null
          session_id: string
        }
        Update: {
          id?: string
          portal_user_id?: string
          removed_at?: string
          removed_by?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_session_removals_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "live_session_removals_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_removals_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_removals_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "live_session_removals_session_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_removals_user_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "live_session_removals_user_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_removals_user_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_removals_user_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      live_session_series: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          duration_minutes: number
          ends_on: string | null
          host_id: string
          id: string
          is_active: boolean
          notify_parents: boolean
          platform: string
          program_id: string | null
          school_id: string | null
          start_time: string
          starts_on: string | null
          term_id: string | null
          timezone: string
          title: string
          updated_at: string
          weekdays: number[]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          ends_on?: string | null
          host_id: string
          id?: string
          is_active?: boolean
          notify_parents?: boolean
          platform?: string
          program_id?: string | null
          school_id?: string | null
          start_time: string
          starts_on?: string | null
          term_id?: string | null
          timezone?: string
          title: string
          updated_at?: string
          weekdays: number[]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          ends_on?: string | null
          host_id?: string
          id?: string
          is_active?: boolean
          notify_parents?: boolean
          platform?: string
          program_id?: string | null
          school_id?: string | null
          start_time?: string
          starts_on?: string | null
          term_id?: string | null
          timezone?: string
          title?: string
          updated_at?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "live_session_series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "live_session_series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "live_session_series_host_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "live_session_series_host_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_series_host_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_series_host_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "live_session_series_program_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_series_school_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_series_term_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
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
          series_id: string | null
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
          series_id?: string | null
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
          series_id?: string | null
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "live_sessions_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "live_sessions_series_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "live_session_series"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          campaign_key: string
          conversion_count: number
          created_at: string
          delivered_count: number
          id: string
          name: string
          owner_id: string | null
          purpose: string
          response_count: number
          scheduled_for: string | null
          sent_count: number
          status: string
          suppressed_count: number
          updated_at: string
          viewed_count: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          campaign_key: string
          conversion_count?: number
          created_at?: string
          delivered_count?: number
          id?: string
          name: string
          owner_id?: string | null
          purpose?: string
          response_count?: number
          scheduled_for?: string | null
          sent_count?: number
          status?: string
          suppressed_count?: number
          updated_at?: string
          viewed_count?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          campaign_key?: string
          conversion_count?: number
          created_at?: string
          delivered_count?: number
          id?: string
          name?: string
          owner_id?: string | null
          purpose?: string
          response_count?: number
          scheduled_for?: string | null
          sent_count?: number
          status?: string
          suppressed_count?: number
          updated_at?: string
          viewed_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "marketing_campaigns_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "marketing_campaigns_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "marketing_campaigns_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      marketing_events: {
        Row: {
          campaign_id: string
          channel: string
          created_at: string
          event_type: string
          id: string
          metadata: Json
          portal_user_id: string | null
          reason: string | null
          source_id: string | null
          value: number | null
        }
        Insert: {
          campaign_id: string
          channel: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          portal_user_id?: string | null
          reason?: string | null
          source_id?: string | null
          value?: number | null
        }
        Update: {
          campaign_id?: string
          channel?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          portal_user_id?: string | null
          reason?: string | null
          source_id?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_events_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "marketing_events_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_events_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_events_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      marketing_suppressions: {
        Row: {
          channel: string
          created_at: string
          expires_at: string | null
          id: string
          identity_type: string
          identity_value: string
          portal_user_id: string | null
          reason: string
          source: string
        }
        Insert: {
          channel: string
          created_at?: string
          expires_at?: string | null
          id?: string
          identity_type: string
          identity_value: string
          portal_user_id?: string | null
          reason: string
          source?: string
        }
        Update: {
          channel?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          identity_type?: string
          identity_value?: string
          portal_user_id?: string | null
          reason?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_suppressions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "marketing_suppressions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_suppressions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_suppressions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
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
          campaign_id: string | null
          delivered_at: string | null
          email_status: string | null
          id: string
          is_viewed: boolean | null
          newsletter_id: string | null
          status: string
          suppressed_reason: string | null
          user_id: string | null
          viewed_at: string | null
        }
        Insert: {
          campaign_id?: string | null
          delivered_at?: string | null
          email_status?: string | null
          id?: string
          is_viewed?: boolean | null
          newsletter_id?: string | null
          status?: string
          suppressed_reason?: string | null
          user_id?: string | null
          viewed_at?: string | null
        }
        Update: {
          campaign_id?: string | null
          delivered_at?: string | null
          email_status?: string | null
          id?: string
          is_viewed?: boolean | null
          newsletter_id?: string | null
          status?: string
          suppressed_reason?: string | null
          user_id?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_delivery_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "newsletter_delivery_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
          campaign_id: string | null
          content: string
          created_at: string | null
          id: string
          image_url: string | null
          published_at: string | null
          purpose: string
          scheduled_for: string | null
          scheduled_send_email: boolean
          scheduled_target: string | null
          school_id: string | null
          status: string | null
          title: string
        }
        Insert: {
          author_id?: string | null
          campaign_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          published_at?: string | null
          purpose?: string
          scheduled_for?: string | null
          scheduled_send_email?: boolean
          scheduled_target?: string | null
          school_id?: string | null
          status?: string | null
          title: string
        }
        Update: {
          author_id?: string | null
          campaign_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          published_at?: string | null
          purpose?: string
          scheduled_for?: string | null
          scheduled_send_email?: boolean
          scheduled_target?: string | null
          school_id?: string | null
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletters_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "newsletters_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "newsletters_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
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
      notification_dead_letters: {
        Row: {
          attempts: number
          created_at: string
          error: string
          id: string
          job_type: string
          last_retry_at: string | null
          original_job_id: string | null
          payload: Json
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          retry_count: number
          source: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          error: string
          id?: string
          job_type: string
          last_retry_at?: string | null
          original_job_id?: string | null
          payload?: Json
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number
          source?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string
          id?: string
          job_type?: string
          last_retry_at?: string | null
          original_job_id?: string | null
          payload?: Json
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number
          source?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_dead_letters_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "notification_dead_letters_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_dead_letters_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_dead_letters_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "notification_dead_letters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "notification_dead_letters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_dead_letters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_dead_letters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          announcement_notifications: boolean | null
          assignment_reminders: boolean | null
          attendance_alerts: boolean
          created_at: string | null
          discussion_replies: boolean | null
          email_enabled: boolean | null
          grade_notifications: boolean | null
          id: string
          live_session_reminders: boolean
          marketing_emails: boolean | null
          payment_updates: boolean
          portal_user_id: string | null
          push_enabled: boolean | null
          report_published: boolean
          sms_enabled: boolean | null
          streak_reminder: boolean
          updated_at: string | null
          weekly_summary: boolean
        }
        Insert: {
          announcement_notifications?: boolean | null
          assignment_reminders?: boolean | null
          attendance_alerts?: boolean
          created_at?: string | null
          discussion_replies?: boolean | null
          email_enabled?: boolean | null
          grade_notifications?: boolean | null
          id?: string
          live_session_reminders?: boolean
          marketing_emails?: boolean | null
          payment_updates?: boolean
          portal_user_id?: string | null
          push_enabled?: boolean | null
          report_published?: boolean
          sms_enabled?: boolean | null
          streak_reminder?: boolean
          updated_at?: string | null
          weekly_summary?: boolean
        }
        Update: {
          announcement_notifications?: boolean | null
          assignment_reminders?: boolean | null
          attendance_alerts?: boolean
          created_at?: string | null
          discussion_replies?: boolean | null
          email_enabled?: boolean | null
          grade_notifications?: boolean | null
          id?: string
          live_session_reminders?: boolean
          marketing_emails?: boolean | null
          payment_updates?: boolean
          portal_user_id?: string | null
          push_enabled?: boolean | null
          report_published?: boolean
          sms_enabled?: boolean | null
          streak_reminder?: boolean
          updated_at?: string | null
          weekly_summary?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: true
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "notification_preferences_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: true
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
      operations_duty_rota: {
        Row: {
          created_at: string
          created_by: string | null
          duty_kind: string
          ends_at: string
          id: string
          is_primary: boolean
          notes: string | null
          staff_id: string
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          duty_kind?: string
          ends_at: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          staff_id: string
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          duty_kind?: string
          ends_at?: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          staff_id?: string
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operations_duty_rota_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "operations_duty_rota_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_duty_rota_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_duty_rota_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "operations_duty_rota_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "operations_duty_rota_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_duty_rota_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_duty_rota_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      operations_staff_settings: {
        Row: {
          accepts_general_queue: boolean
          created_at: string
          is_available: boolean
          is_primary_admin: boolean
          max_active_cases: number
          notes: string | null
          skill_tags: string[]
          unavailable_until: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          accepts_general_queue?: boolean
          created_at?: string
          is_available?: boolean
          is_primary_admin?: boolean
          max_active_cases?: number
          notes?: string | null
          skill_tags?: string[]
          unavailable_until?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          accepts_general_queue?: boolean
          created_at?: string
          is_available?: boolean
          is_primary_admin?: boolean
          max_active_cases?: number
          notes?: string | null
          skill_tags?: string[]
          unavailable_until?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operations_staff_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "operations_staff_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_staff_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_staff_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "operations_staff_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "operations_staff_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_staff_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_staff_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      parent_claim_audit: {
        Row: {
          action: string
          created_at: string
          email: string | null
          id: string
          ip: string | null
          note: string | null
          parent_id: string | null
          phone: string | null
          siblings_linked: number
          student_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          email?: string | null
          id?: string
          ip?: string | null
          note?: string | null
          parent_id?: string | null
          phone?: string | null
          siblings_linked?: number
          student_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          email?: string | null
          id?: string
          ip?: string | null
          note?: string | null
          parent_id?: string | null
          phone?: string | null
          siblings_linked?: number
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parent_claim_audit_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "parent_claim_audit_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_claim_audit_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_claim_audit_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "parent_claim_audit_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "parent_claim_audit_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_claim_audit_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_claim_audit_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      parent_claim_otps: {
        Row: {
          attempts: number
          child_age: number | null
          child_dob: string | null
          child_gender: string | null
          child_name: string | null
          code_hash: string
          created_at: string
          email: string
          expires_at: string
          full_name: string
          id: string
          phone: string | null
          processing_at: string | null
          relationship: string | null
          student_id: string
          verified: boolean
          whatsapp_opt_in: boolean
        }
        Insert: {
          attempts?: number
          child_age?: number | null
          child_dob?: string | null
          child_gender?: string | null
          child_name?: string | null
          code_hash: string
          created_at?: string
          email: string
          expires_at: string
          full_name: string
          id?: string
          phone?: string | null
          processing_at?: string | null
          relationship?: string | null
          student_id: string
          verified?: boolean
          whatsapp_opt_in?: boolean
        }
        Update: {
          attempts?: number
          child_age?: number | null
          child_dob?: string | null
          child_gender?: string | null
          child_name?: string | null
          code_hash?: string
          created_at?: string
          email?: string
          expires_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          processing_at?: string | null
          relationship?: string | null
          student_id?: string
          verified?: boolean
          whatsapp_opt_in?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "parent_claim_otps_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "parent_claim_otps_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_claim_otps_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_claim_otps_student_id_fkey"
            columns: ["student_id"]
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "parent_feedback_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
      parent_student_links: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          parent_id: string
          source: string | null
          student_id: string
          updated_at: string
          verified_by_parent_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          parent_id: string
          source?: string | null
          student_id: string
          updated_at?: string
          verified_by_parent_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          parent_id?: string
          source?: string | null
          student_id?: string
          updated_at?: string
          verified_by_parent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parent_student_links_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "parent_student_links_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_student_links_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_student_links_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "parent_student_links_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_teacher_messages: {
        Row: {
          body: string
          id: string
          is_read: boolean
          sender_id: string
          sent_at: string
          thread_id: string
        }
        Insert: {
          body: string
          id?: string
          is_read?: boolean
          sender_id: string
          sent_at?: string
          thread_id: string
        }
        Update: {
          body?: string
          id?: string
          is_read?: boolean
          sender_id?: string
          sent_at?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_teacher_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "parent_teacher_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_teacher_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_teacher_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "parent_teacher_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "parent_teacher_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_teacher_threads: {
        Row: {
          created_at: string
          id: string
          parent_id: string
          student_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parent_id: string
          student_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parent_id?: string
          student_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_teacher_threads_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "parent_teacher_threads_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_teacher_threads_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_teacher_threads_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "parent_teacher_threads_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "parent_teacher_threads_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_teacher_threads_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_teacher_threads_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "parent_teacher_threads_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "parent_teacher_threads_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_teacher_threads_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_teacher_threads_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      partnership_agreements: {
        Row: {
          access_code: string | null
          created_at: string
          created_by: string | null
          document_html: string | null
          document_kind: string
          first_opened_at: string | null
          id: string
          last_opened_at: string | null
          open_count: number
          pdf_r2_key: string | null
          reference: string | null
          school_id: string
          sent_at: string | null
          share_token: string
          signature_ip: string | null
          signed_at: string | null
          signed_by_name: string | null
          signed_by_role: string | null
          signed_by_user_id: string | null
          status: string
          terms_id: string | null
          terms_snapshot: Json
          updated_at: string
          valid_until: string | null
          version: number
        }
        Insert: {
          access_code?: string | null
          created_at?: string
          created_by?: string | null
          document_html?: string | null
          document_kind: string
          first_opened_at?: string | null
          id?: string
          last_opened_at?: string | null
          open_count?: number
          pdf_r2_key?: string | null
          reference?: string | null
          school_id: string
          sent_at?: string | null
          share_token?: string
          signature_ip?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          signed_by_role?: string | null
          signed_by_user_id?: string | null
          status?: string
          terms_id?: string | null
          terms_snapshot: Json
          updated_at?: string
          valid_until?: string | null
          version?: number
        }
        Update: {
          access_code?: string | null
          created_at?: string
          created_by?: string | null
          document_html?: string | null
          document_kind?: string
          first_opened_at?: string | null
          id?: string
          last_opened_at?: string | null
          open_count?: number
          pdf_r2_key?: string | null
          reference?: string | null
          school_id?: string
          sent_at?: string | null
          share_token?: string
          signature_ip?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          signed_by_role?: string | null
          signed_by_user_id?: string | null
          status?: string
          terms_id?: string | null
          terms_snapshot?: Json
          updated_at?: string
          valid_until?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "partnership_agreements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "partnership_agreements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partnership_agreements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partnership_agreements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "partnership_agreements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partnership_agreements_signed_by_user_id_fkey"
            columns: ["signed_by_user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "partnership_agreements_signed_by_user_id_fkey"
            columns: ["signed_by_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partnership_agreements_signed_by_user_id_fkey"
            columns: ["signed_by_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partnership_agreements_signed_by_user_id_fkey"
            columns: ["signed_by_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "partnership_agreements_terms_id_fkey"
            columns: ["terms_id"]
            isOneToOne: false
            referencedRelation: "partnership_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      partnership_reference_counters: {
        Row: {
          next_value: number
          prefix: string
          updated_at: string
        }
        Insert: {
          next_value?: number
          prefix: string
          updated_at?: string
        }
        Update: {
          next_value?: number
          prefix?: string
          updated_at?: string
        }
        Relationships: []
      }
      partnership_terms: {
        Row: {
          agreed_at: string | null
          amount_per_student: number | null
          billing_cycle: string
          billing_model: string
          created_at: string
          created_by: string | null
          currency: string
          deposit_amount: number | null
          effective_from: string | null
          effective_to: string | null
          fixed_package_price: number | null
          id: string
          minimum_students: number | null
          notes: string | null
          rillcod_share_percent: number | null
          school_id: string
          school_share_percent: number | null
          settlement_days: number | null
          settlement_trigger: string | null
          status: string
          supersedes_id: string | null
          tiers: Json | null
          updated_at: string
          version: number
          withdrawal_policy: string | null
        }
        Insert: {
          agreed_at?: string | null
          amount_per_student?: number | null
          billing_cycle?: string
          billing_model: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deposit_amount?: number | null
          effective_from?: string | null
          effective_to?: string | null
          fixed_package_price?: number | null
          id?: string
          minimum_students?: number | null
          notes?: string | null
          rillcod_share_percent?: number | null
          school_id: string
          school_share_percent?: number | null
          settlement_days?: number | null
          settlement_trigger?: string | null
          status?: string
          supersedes_id?: string | null
          tiers?: Json | null
          updated_at?: string
          version?: number
          withdrawal_policy?: string | null
        }
        Update: {
          agreed_at?: string | null
          amount_per_student?: number | null
          billing_cycle?: string
          billing_model?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deposit_amount?: number | null
          effective_from?: string | null
          effective_to?: string | null
          fixed_package_price?: number | null
          id?: string
          minimum_students?: number | null
          notes?: string | null
          rillcod_share_percent?: number | null
          school_id?: string
          school_share_percent?: number | null
          settlement_days?: number | null
          settlement_trigger?: string | null
          status?: string
          supersedes_id?: string | null
          tiers?: Json | null
          updated_at?: string
          version?: number
          withdrawal_policy?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partnership_terms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "partnership_terms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partnership_terms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partnership_terms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "partnership_terms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partnership_terms_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "partnership_terms"
            referencedColumns: ["id"]
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "payment_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
      payment_allocations: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          id: string
          invoice_id: string
          payment_transaction_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          invoice_id: string
          payment_transaction_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          invoice_id?: string
          payment_transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "payment_allocations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "finance_ledger"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "finance_ledger"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
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
            referencedRelation: "finance_ledger"
            referencedColumns: ["invoice_id"]
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "payment_transactions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
      platform_syllabus_week_template: {
        Row: {
          catalog_version: string
          created_at: string
          grade_key: string
          grade_label: string
          id: string
          lane_index: number
          metadata: Json
          program_id: string
          subtopics: Json
          syllabus_phase: string
          term_number: number
          topic: string
          track: string
          week_index: number
          week_number: number
          year_number: number
        }
        Insert: {
          catalog_version?: string
          created_at?: string
          grade_key: string
          grade_label: string
          id?: string
          lane_index: number
          metadata?: Json
          program_id: string
          subtopics?: Json
          syllabus_phase: string
          term_number: number
          topic: string
          track: string
          week_index: number
          week_number: number
          year_number: number
        }
        Update: {
          catalog_version?: string
          created_at?: string
          grade_key?: string
          grade_label?: string
          id?: string
          lane_index?: number
          metadata?: Json
          program_id?: string
          subtopics?: Json
          syllabus_phase?: string
          term_number?: number
          topic?: string
          track?: string
          week_index?: number
          week_number?: number
          year_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "platform_syllabus_week_template_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "point_transactions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
          class_arm: string | null
          class_id: string | null
          created_at: string | null
          created_by: string | null
          current_module: string | null
          date_of_birth: string | null
          duplicate_name_exception_approved_at: string | null
          duplicate_name_exception_approved_by: string | null
          duplicate_name_exception_key: string | null
          duplicate_name_exception_reason: string | null
          email: string
          email_verified: boolean | null
          enrollment_type: string | null
          full_name: string
          gender: string | null
          grade: string | null
          id: string
          is_active: boolean | null
          is_deleted: boolean | null
          is_direct_enrollment: boolean | null
          last_login: string | null
          metadata: Json | null
          phone: string | null
          photo_url: string | null
          portfolio_share_token: string | null
          portfolio_share_token_expires_at: string | null
          primary_teacher_id: string | null
          profile_image_url: string | null
          reputation_score: number | null
          role: string
          school_id: string | null
          school_name: string | null
          section_class: string | null
          student_id: string | null
          updated_at: string | null
          whatsapp_opt_in: boolean | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          class_arm?: string | null
          class_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_module?: string | null
          date_of_birth?: string | null
          duplicate_name_exception_approved_at?: string | null
          duplicate_name_exception_approved_by?: string | null
          duplicate_name_exception_key?: string | null
          duplicate_name_exception_reason?: string | null
          email: string
          email_verified?: boolean | null
          enrollment_type?: string | null
          full_name: string
          gender?: string | null
          grade?: string | null
          id?: string
          is_active?: boolean | null
          is_deleted?: boolean | null
          is_direct_enrollment?: boolean | null
          last_login?: string | null
          metadata?: Json | null
          phone?: string | null
          photo_url?: string | null
          portfolio_share_token?: string | null
          portfolio_share_token_expires_at?: string | null
          primary_teacher_id?: string | null
          profile_image_url?: string | null
          reputation_score?: number | null
          role: string
          school_id?: string | null
          school_name?: string | null
          section_class?: string | null
          student_id?: string | null
          updated_at?: string | null
          whatsapp_opt_in?: boolean | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          class_arm?: string | null
          class_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_module?: string | null
          date_of_birth?: string | null
          duplicate_name_exception_approved_at?: string | null
          duplicate_name_exception_approved_by?: string | null
          duplicate_name_exception_key?: string | null
          duplicate_name_exception_reason?: string | null
          email?: string
          email_verified?: boolean | null
          enrollment_type?: string | null
          full_name?: string
          gender?: string | null
          grade?: string | null
          id?: string
          is_active?: boolean | null
          is_deleted?: boolean | null
          is_direct_enrollment?: boolean | null
          last_login?: string | null
          metadata?: Json | null
          phone?: string | null
          photo_url?: string | null
          portfolio_share_token?: string | null
          portfolio_share_token_expires_at?: string | null
          primary_teacher_id?: string | null
          profile_image_url?: string | null
          reputation_score?: number | null
          role?: string
          school_id?: string | null
          school_name?: string | null
          section_class?: string | null
          student_id?: string | null
          updated_at?: string | null
          whatsapp_opt_in?: boolean | null
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "portal_users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
            foreignKeyName: "portal_users_duplicate_name_exception_approved_by_fkey"
            columns: ["duplicate_name_exception_approved_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "portal_users_duplicate_name_exception_approved_by_fkey"
            columns: ["duplicate_name_exception_approved_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_users_duplicate_name_exception_approved_by_fkey"
            columns: ["duplicate_name_exception_approved_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_users_duplicate_name_exception_approved_by_fkey"
            columns: ["duplicate_name_exception_approved_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "portal_users_primary_teacher_id_fkey"
            columns: ["primary_teacher_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "portal_users_primary_teacher_id_fkey"
            columns: ["primary_teacher_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_users_primary_teacher_id_fkey"
            columns: ["primary_teacher_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_users_primary_teacher_id_fkey"
            columns: ["primary_teacher_id"]
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "portfolio_projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
          default_currency: string
          delivery_type: string
          description: string | null
          difficulty_level: string | null
          duration_weeks: number | null
          id: string
          instalments_enabled: boolean
          is_active: boolean | null
          max_students: number | null
          name: string
          price: number | null
          program_scope: string
          progression_policy: Json
          school_id: string | null
          school_progression_enabled: boolean
          session_frequency_per_week: number
          updated_at: string | null
          visible_to_students: boolean
          visible_to_teachers: boolean
        }
        Insert: {
          created_at?: string | null
          default_currency?: string
          delivery_type?: string
          description?: string | null
          difficulty_level?: string | null
          duration_weeks?: number | null
          id?: string
          instalments_enabled?: boolean
          is_active?: boolean | null
          max_students?: number | null
          name: string
          price?: number | null
          program_scope?: string
          progression_policy?: Json
          school_id?: string | null
          school_progression_enabled?: boolean
          session_frequency_per_week?: number
          updated_at?: string | null
          visible_to_students?: boolean
          visible_to_teachers?: boolean
        }
        Update: {
          created_at?: string | null
          default_currency?: string
          delivery_type?: string
          description?: string | null
          difficulty_level?: string | null
          duration_weeks?: number | null
          id?: string
          instalments_enabled?: boolean
          is_active?: boolean | null
          max_students?: number | null
          name?: string
          price?: number | null
          program_scope?: string
          progression_policy?: Json
          school_id?: string | null
          school_progression_enabled?: boolean
          session_frequency_per_week?: number
          updated_at?: string | null
          visible_to_students?: boolean
          visible_to_teachers?: boolean
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
      progression_override_audit: {
        Row: {
          action_type: string
          actor_id: string | null
          actor_role: string | null
          after_state: Json
          before_state: Json
          created_at: string
          id: string
          lesson_plan_id: string
          reason: string | null
          school_id: string | null
          term_number: number | null
          week_number: number | null
          year_number: number | null
        }
        Insert: {
          action_type: string
          actor_id?: string | null
          actor_role?: string | null
          after_state?: Json
          before_state?: Json
          created_at?: string
          id?: string
          lesson_plan_id: string
          reason?: string | null
          school_id?: string | null
          term_number?: number | null
          week_number?: number | null
          year_number?: number | null
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          actor_role?: string | null
          after_state?: Json
          before_state?: Json
          created_at?: string
          id?: string
          lesson_plan_id?: string
          reason?: string | null
          school_id?: string | null
          term_number?: number | null
          week_number?: number | null
          year_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "progression_override_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "progression_override_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progression_override_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progression_override_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "progression_override_audit_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "academic_lesson_plan_source_issues"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "progression_override_audit_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "class_term_teaching_progress"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "progression_override_audit_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progression_override_audit_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      progression_path_visibility: {
        Row: {
          class_id: string | null
          id: string
          mode: string
          student_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          class_id?: string | null
          id?: string
          mode?: string
          student_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          class_id?: string | null
          id?: string
          mode?: string
          student_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "progression_path_visibility_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progression_path_visibility_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "progression_path_visibility_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progression_path_visibility_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progression_path_visibility_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "progression_path_visibility_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "progression_path_visibility_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progression_path_visibility_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progression_path_visibility_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      project_engagement: {
        Row: {
          assignment_id: string | null
          created_at: string
          curriculum_id: string | null
          event_type: string
          feedback: string | null
          has_nigerian_context: boolean | null
          id: string
          is_showcase: boolean | null
          school_id: string | null
          score: number | null
          student_id: string
          term_number: number | null
          used_ai_tools: boolean | null
          week_number: number | null
        }
        Insert: {
          assignment_id?: string | null
          created_at?: string
          curriculum_id?: string | null
          event_type: string
          feedback?: string | null
          has_nigerian_context?: boolean | null
          id?: string
          is_showcase?: boolean | null
          school_id?: string | null
          score?: number | null
          student_id: string
          term_number?: number | null
          used_ai_tools?: boolean | null
          week_number?: number | null
        }
        Update: {
          assignment_id?: string | null
          created_at?: string
          curriculum_id?: string | null
          event_type?: string
          feedback?: string | null
          has_nigerian_context?: boolean | null
          id?: string
          is_showcase?: boolean | null
          school_id?: string | null
          score?: number | null
          student_id?: string
          term_number?: number | null
          used_ai_tools?: boolean | null
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_engagement_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_engagement_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "project_engagement_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_engagement_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_engagement_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "project_group_members_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "project_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
          stream: string
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
          stream?: string
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
          stream?: string
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "receipts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
            referencedRelation: "finance_ledger"
            referencedColumns: ["transaction_id"]
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
          class_arm: string | null
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
          class_arm?: string | null
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
          class_arm?: string | null
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
          class_arm: string | null
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
          class_arm?: string | null
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
          class_arm?: string | null
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "report_settings_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
      result_access_codes: {
        Row: {
          access_code: string
          code_source: string
          created_at: string
          id: string
          school_id: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          access_code: string
          code_source?: string
          created_at?: string
          id?: string
          school_id?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          access_code?: string
          code_source?: string
          created_at?: string
          id?: string
          school_id?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "result_access_codes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_access_codes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "result_access_codes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_access_codes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_access_codes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      safeguarding_incidents: {
        Row: {
          actions_taken: string | null
          case_id: string
          created_at: string
          id: string
          incident_type: string
          owner_id: string | null
          resolved_at: string | null
          risk_level: string
          status: string
          summary: string
          updated_at: string
        }
        Insert: {
          actions_taken?: string | null
          case_id: string
          created_at?: string
          id?: string
          incident_type: string
          owner_id?: string | null
          resolved_at?: string | null
          risk_level?: string
          status?: string
          summary: string
          updated_at?: string
        }
        Update: {
          actions_taken?: string | null
          case_id?: string
          created_at?: string
          id?: string
          incident_type?: string
          owner_id?: string | null
          resolved_at?: string | null
          risk_level?: string
          status?: string
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "safeguarding_incidents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "communication_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safeguarding_incidents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "safeguarding_incidents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safeguarding_incidents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safeguarding_incidents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      school_gallery_media: {
        Row: {
          academic_term_id: string | null
          category: string
          created_at: string
          id: string
          is_capstone_demo: boolean
          media_type: string
          r2_key: string | null
          school_id: string
          share_token: string
          thumbnail_url: string | null
          title: string
          uploaded_by: string | null
          url: string
        }
        Insert: {
          academic_term_id?: string | null
          category?: string
          created_at?: string
          id?: string
          is_capstone_demo?: boolean
          media_type?: string
          r2_key?: string | null
          school_id: string
          share_token?: string
          thumbnail_url?: string | null
          title?: string
          uploaded_by?: string | null
          url: string
        }
        Update: {
          academic_term_id?: string | null
          category?: string
          created_at?: string
          id?: string
          is_capstone_demo?: boolean
          media_type?: string
          r2_key?: string | null
          school_id?: string
          share_token?: string
          thumbnail_url?: string | null
          title?: string
          uploaded_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_gallery_media_academic_term_id_fkey"
            columns: ["academic_term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_gallery_media_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_gallery_media_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "school_gallery_media_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_gallery_media_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_gallery_media_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      school_performance_reports: {
        Row: {
          academic_term_id: string | null
          academic_year: string
          acknowledged_at: string | null
          acknowledged_by: string | null
          acknowledgement_name: string | null
          acknowledgement_note: string | null
          created_at: string
          created_by: string
          curriculum_end_term: number
          curriculum_end_week: number
          curriculum_start_term: number
          curriculum_start_week: number
          design: Json
          id: string
          lock_version: number
          narrative: Json
          period_end: string
          period_start: string
          published_at: string | null
          published_by: string | null
          published_revision_number: number | null
          school_id: string
          snapshot: Json
          status: string
          term_label: string
          title: string
          updated_at: string
          verification_code: string | null
          working_revision_number: number | null
        }
        Insert: {
          academic_term_id?: string | null
          academic_year: string
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          acknowledgement_name?: string | null
          acknowledgement_note?: string | null
          created_at?: string
          created_by: string
          curriculum_end_term?: number
          curriculum_end_week?: number
          curriculum_start_term?: number
          curriculum_start_week?: number
          design?: Json
          id?: string
          lock_version?: number
          narrative?: Json
          period_end: string
          period_start: string
          published_at?: string | null
          published_by?: string | null
          published_revision_number?: number | null
          school_id: string
          snapshot?: Json
          status?: string
          term_label: string
          title: string
          updated_at?: string
          verification_code?: string | null
          working_revision_number?: number | null
        }
        Update: {
          academic_term_id?: string | null
          academic_year?: string
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          acknowledgement_name?: string | null
          acknowledgement_note?: string | null
          created_at?: string
          created_by?: string
          curriculum_end_term?: number
          curriculum_end_week?: number
          curriculum_start_term?: number
          curriculum_start_week?: number
          design?: Json
          id?: string
          lock_version?: number
          narrative?: Json
          period_end?: string
          period_start?: string
          published_at?: string | null
          published_by?: string | null
          published_revision_number?: number | null
          school_id?: string
          snapshot?: Json
          status?: string
          term_label?: string
          title?: string
          updated_at?: string
          verification_code?: string | null
          working_revision_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "school_performance_reports_academic_term_id_fkey"
            columns: ["academic_term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_performance_reports_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "school_performance_reports_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_performance_reports_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_performance_reports_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "school_performance_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "school_performance_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_performance_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_performance_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "school_performance_reports_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "school_performance_reports_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_performance_reports_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_performance_reports_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "school_performance_reports_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_report_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          report_id: string
          revision_id: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          report_id: string
          revision_id?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          report_id?: string
          revision_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_report_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "school_report_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_report_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_report_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "school_report_comments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "school_performance_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_report_comments_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "school_report_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      school_report_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          report_id: string
          revision_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          report_id: string
          revision_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          report_id?: string
          revision_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_report_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "school_report_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_report_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_report_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "school_report_events_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "school_performance_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_report_events_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "school_report_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      school_report_readiness_log: {
        Row: {
          academic_term_id: string | null
          checked_at: string
          id: string
          notified_at: string | null
          payload: Json
          report_id: string
          school_id: string
          status: string
        }
        Insert: {
          academic_term_id?: string | null
          checked_at?: string
          id?: string
          notified_at?: string | null
          payload?: Json
          report_id: string
          school_id: string
          status: string
        }
        Update: {
          academic_term_id?: string | null
          checked_at?: string
          id?: string
          notified_at?: string | null
          payload?: Json
          report_id?: string
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_report_readiness_log_academic_term_id_fkey"
            columns: ["academic_term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_report_readiness_log_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "school_performance_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_report_readiness_log_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_report_revisions: {
        Row: {
          change_reason: string | null
          created_at: string
          created_by: string
          data_sources: Json | null
          design: Json | null
          force_publish_override: Json | null
          id: string
          narrative: Json
          pdf_hash: string | null
          published_at: string | null
          published_by: string | null
          report_id: string
          revision_number: number
          snapshot: Json
          status: string
          updated_at: string
        }
        Insert: {
          change_reason?: string | null
          created_at?: string
          created_by: string
          data_sources?: Json | null
          design?: Json | null
          force_publish_override?: Json | null
          id?: string
          narrative?: Json
          pdf_hash?: string | null
          published_at?: string | null
          published_by?: string | null
          report_id: string
          revision_number: number
          snapshot?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          change_reason?: string | null
          created_at?: string
          created_by?: string
          data_sources?: Json | null
          design?: Json | null
          force_publish_override?: Json | null
          id?: string
          narrative?: Json
          pdf_hash?: string | null
          published_at?: string | null
          published_by?: string | null
          report_id?: string
          revision_number?: number
          snapshot?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_report_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "school_report_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_report_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_report_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "school_report_revisions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "school_report_revisions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_report_revisions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_report_revisions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "school_report_revisions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "school_performance_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      school_settlements: {
        Row: {
          amount: number
          billing_cycle_id: string | null
          created_at: string
          currency: string
          id: string
          metadata: Json
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          reference: string | null
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          billing_cycle_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          reference?: string | null
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          billing_cycle_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          reference?: string | null
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_settlements_billing_cycle_id_fkey"
            columns: ["billing_cycle_id"]
            isOneToOne: false
            referencedRelation: "billing_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_settlements_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "school_settlements_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_settlements_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_settlements_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "school_settlements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_teacher_conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_archived: boolean
          school_id: string
          subject: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_archived?: boolean
          school_id: string
          subject: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_archived?: boolean
          school_id?: string
          subject?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_teacher_conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "school_teacher_conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_teacher_conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_teacher_conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "school_teacher_conversations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_teacher_conversations_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "school_teacher_conversations_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_teacher_conversations_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_teacher_conversations_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      school_teacher_messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          is_read: boolean
          sender_id: string
          updated_at: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          sender_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          sender_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_teacher_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "school_teacher_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_teacher_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "school_teacher_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_teacher_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_teacher_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      school_whatsapp_settings: {
        Row: {
          created_at: string | null
          custom_rules: Json | null
          human_takeover_timeout_minutes: number | null
          is_enabled: boolean | null
          school_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          custom_rules?: Json | null
          human_takeover_timeout_minutes?: number | null
          is_enabled?: boolean | null
          school_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          custom_rules?: Json | null
          human_takeover_timeout_minutes?: number | null
          is_enabled?: boolean | null
          school_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_whatsapp_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          address: string | null
          city: string | null
          commission_rate: number
          contact_person: string | null
          created_at: string | null
          default_band_granularity: string | null
          email: string | null
          enrollment_types: string[] | null
          exam_capture: string
          id: string
          is_active: boolean | null
          is_deleted: boolean | null
          lga: string | null
          logo_url: string | null
          name: string
          phone: string | null
          program_interest: string[] | null
          programme_standing: string
          public_enrollment_open: boolean
          rillcod_quota_percent: number | null
          school_type: string | null
          sessions_per_week: number
          state: string | null
          status: string | null
          student_count: number | null
          test_capture: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          commission_rate?: number
          contact_person?: string | null
          created_at?: string | null
          default_band_granularity?: string | null
          email?: string | null
          enrollment_types?: string[] | null
          exam_capture?: string
          id?: string
          is_active?: boolean | null
          is_deleted?: boolean | null
          lga?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          program_interest?: string[] | null
          programme_standing?: string
          public_enrollment_open?: boolean
          rillcod_quota_percent?: number | null
          school_type?: string | null
          sessions_per_week?: number
          state?: string | null
          status?: string | null
          student_count?: number | null
          test_capture?: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          commission_rate?: number
          contact_person?: string | null
          created_at?: string | null
          default_band_granularity?: string | null
          email?: string | null
          enrollment_types?: string[] | null
          exam_capture?: string
          id?: string
          is_active?: boolean | null
          is_deleted?: boolean | null
          lga?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          program_interest?: string[] | null
          programme_standing?: string
          public_enrollment_open?: boolean
          rillcod_quota_percent?: number | null
          school_type?: string | null
          sessions_per_week?: number
          state?: string | null
          status?: string | null
          student_count?: number | null
          test_capture?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      security_observations: {
        Row: {
          blocked_origin: string | null
          column_number: number | null
          disposition: string | null
          document_path: string | null
          effective_directive: string | null
          id: string
          kind: string
          line_number: number | null
          observed_at: string
          source_path: string | null
          status_code: number | null
          violated_directive: string | null
        }
        Insert: {
          blocked_origin?: string | null
          column_number?: number | null
          disposition?: string | null
          document_path?: string | null
          effective_directive?: string | null
          id?: string
          kind: string
          line_number?: number | null
          observed_at?: string
          source_path?: string | null
          status_code?: number | null
          violated_directive?: string | null
        }
        Update: {
          blocked_origin?: string | null
          column_number?: number | null
          disposition?: string | null
          document_path?: string | null
          effective_directive?: string | null
          id?: string
          kind?: string
          line_number?: number | null
          observed_at?: string
          source_path?: string | null
          status_code?: number | null
          violated_directive?: string | null
        }
        Relationships: []
      }
      session_recordings: {
        Row: {
          class_id: string | null
          created_at: string
          duration_seconds: number | null
          egress_id: string | null
          ended_at: string | null
          error: string | null
          id: string
          lesson_id: string | null
          program_id: string | null
          r2_key: string | null
          school_id: string | null
          session_id: string
          size_bytes: number | null
          started_at: string
          started_by: string | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          egress_id?: string | null
          ended_at?: string | null
          error?: string | null
          id?: string
          lesson_id?: string | null
          program_id?: string | null
          r2_key?: string | null
          school_id?: string | null
          session_id: string
          size_bytes?: number | null
          started_at?: string
          started_by?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          egress_id?: string | null
          ended_at?: string | null
          error?: string | null
          id?: string
          lesson_id?: string | null
          program_id?: string | null
          r2_key?: string | null
          school_id?: string | null
          session_id?: string
          size_bytes?: number | null
          started_at?: string
          started_by?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_recordings_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_recordings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_recordings_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "session_recordings_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_recordings_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_recordings_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      showcase_items: {
        Row: {
          academic_year: string
          assignment_id: string | null
          course_name: string | null
          created_at: string
          description: string | null
          file_url: string | null
          id: string
          is_pinned: boolean
          is_published: boolean
          item_type: string
          pinned_by: string | null
          school_id: string | null
          student_id: string
          teacher_note: string | null
          term_number: number | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          views: number
        }
        Insert: {
          academic_year?: string
          assignment_id?: string | null
          course_name?: string | null
          created_at?: string
          description?: string | null
          file_url?: string | null
          id?: string
          is_pinned?: boolean
          is_published?: boolean
          item_type?: string
          pinned_by?: string | null
          school_id?: string | null
          student_id: string
          teacher_note?: string | null
          term_number?: number | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          views?: number
        }
        Update: {
          academic_year?: string
          assignment_id?: string | null
          course_name?: string | null
          created_at?: string
          description?: string | null
          file_url?: string | null
          id?: string
          is_pinned?: boolean
          is_published?: boolean
          item_type?: string
          pinned_by?: string | null
          school_id?: string | null
          student_id?: string
          teacher_note?: string | null
          term_number?: number | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "showcase_items_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "showcase_items_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "showcase_items_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "showcase_items_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "showcase_items_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "showcase_items_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "showcase_items_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "showcase_items_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "showcase_items_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      special_program_pages: {
        Row: {
          academic_offering_id: string | null
          button_label: string
          content: Json
          created_at: string
          deposit_percent: number
          ends_on: string | null
          id: string
          is_featured: boolean
          is_published: boolean
          online_fee: number
          onsite_fee: number
          program_id: string | null
          registration_deadline: string | null
          slug: string
          starts_on: string | null
          title: string
          updated_at: string
        }
        Insert: {
          academic_offering_id?: string | null
          button_label?: string
          content?: Json
          created_at?: string
          deposit_percent?: number
          ends_on?: string | null
          id?: string
          is_featured?: boolean
          is_published?: boolean
          online_fee?: number
          onsite_fee?: number
          program_id?: string | null
          registration_deadline?: string | null
          slug: string
          starts_on?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          academic_offering_id?: string | null
          button_label?: string
          content?: Json
          created_at?: string
          deposit_percent?: number
          ends_on?: string | null
          id?: string
          is_featured?: boolean
          is_published?: boolean
          online_fee?: number
          onsite_fee?: number
          program_id?: string | null
          registration_deadline?: string | null
          slug?: string
          starts_on?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "special_program_pages_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["academic_offering_id"]
          },
          {
            foreignKeyName: "special_program_pages_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_program_pages_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      student_assignment_engagement: {
        Row: {
          academic_year: string
          course_id: string | null
          id: string
          last_submission: string | null
          late_count: number
          on_time_count: number
          school_id: string | null
          student_id: string
          submission_pct: number | null
          term_number: number
          total_assigned: number
          total_submitted: number
          updated_at: string
        }
        Insert: {
          academic_year?: string
          course_id?: string | null
          id?: string
          last_submission?: string | null
          late_count?: number
          on_time_count?: number
          school_id?: string | null
          student_id: string
          submission_pct?: number | null
          term_number: number
          total_assigned?: number
          total_submitted?: number
          updated_at?: string
        }
        Update: {
          academic_year?: string
          course_id?: string | null
          id?: string
          last_submission?: string | null
          late_count?: number
          on_time_count?: number
          school_id?: string | null
          student_id?: string
          submission_pct?: number | null
          term_number?: number
          total_assigned?: number
          total_submitted?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_assignment_engagement_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_assignment_engagement_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_assignment_engagement_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_assignment_engagement_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_assignment_engagement_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      student_badges: {
        Row: {
          badge_icon: string
          badge_key: string
          badge_label: string
          earned_at: string
          id: string
          ref_id: string | null
          school_id: string | null
          student_id: string
        }
        Insert: {
          badge_icon?: string
          badge_key: string
          badge_label: string
          earned_at?: string
          id?: string
          ref_id?: string | null
          school_id?: string | null
          student_id: string
        }
        Update: {
          badge_icon?: string
          badge_key?: string
          badge_label?: string
          earned_at?: string
          id?: string
          ref_id?: string | null
          school_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_badges_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_badges_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_badges_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_badges_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_badges_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
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
      student_level_decision_audit: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          course_id: string | null
          created_at: string
          decision: string
          enrollment_id: string | null
          id: string
          previous_status: string
          previous_term_label: string
          resulting_course_id: string | null
          resulting_enrollment_id: string | null
          resulting_status: string
          resulting_term_label: string | null
          school_id: string | null
          student_id: string
          teacher_notes: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          course_id?: string | null
          created_at?: string
          decision: string
          enrollment_id?: string | null
          id?: string
          previous_status: string
          previous_term_label: string
          resulting_course_id?: string | null
          resulting_enrollment_id?: string | null
          resulting_status: string
          resulting_term_label?: string | null
          school_id?: string | null
          student_id: string
          teacher_notes?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          course_id?: string | null
          created_at?: string
          decision?: string
          enrollment_id?: string | null
          id?: string
          previous_status?: string
          previous_term_label?: string
          resulting_course_id?: string | null
          resulting_enrollment_id?: string | null
          resulting_status?: string
          resulting_term_label?: string | null
          school_id?: string | null
          student_id?: string
          teacher_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_level_decision_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_level_decision_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_level_decision_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_level_decision_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_level_decision_audit_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_level_decision_audit_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "student_level_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_level_decision_audit_resulting_course_id_fkey"
            columns: ["resulting_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_level_decision_audit_resulting_enrollment_id_fkey"
            columns: ["resulting_enrollment_id"]
            isOneToOne: false
            referencedRelation: "student_level_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_level_decision_audit_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_level_decision_audit_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_level_decision_audit_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_level_decision_audit_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_level_decision_audit_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      student_level_enrollments: {
        Row: {
          cohort_year: number
          course_id: string
          created_at: string
          id: string
          module_name: string | null
          program_id: string | null
          promoted_to: string | null
          school_id: string | null
          start_week: number
          status: string
          student_id: string
          term_label: string
          updated_at: string
        }
        Insert: {
          cohort_year?: number
          course_id: string
          created_at?: string
          id?: string
          module_name?: string | null
          program_id?: string | null
          promoted_to?: string | null
          school_id?: string | null
          start_week?: number
          status?: string
          student_id: string
          term_label: string
          updated_at?: string
        }
        Update: {
          cohort_year?: number
          course_id?: string
          created_at?: string
          id?: string
          module_name?: string | null
          program_id?: string | null
          promoted_to?: string | null
          school_id?: string | null
          start_week?: number
          status?: string
          student_id?: string
          term_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_level_enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_level_enrollments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_level_enrollments_promoted_to_fkey"
            columns: ["promoted_to"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_level_enrollments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_level_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_level_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_level_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_level_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_progress_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
          academic_offering_id: string | null
          academic_qa_checked_at: string | null
          academic_qa_issues: Json
          academic_qa_status: string
          academic_trace_status: string
          areas_for_growth: string | null
          assignments_grade: string | null
          attendance_score: number | null
          calculated_at: string | null
          calculation_mode: string
          calculation_snapshot: Json
          certificate_text: string | null
          class_id: string | null
          course_completed: string | null
          course_duration: string | null
          course_id: string | null
          course_name: string | null
          created_at: string | null
          current_module: string | null
          curriculum_coverage: number | null
          curriculum_release_id: string | null
          engagement_metrics: Json | null
          enrollment_type_snapshot: string | null
          evidence_manifest: Json
          fee_amount: string | null
          fee_label: string | null
          fee_status: string | null
          gender: string | null
          has_certificate: boolean | null
          homework_grade: string | null
          id: string
          instructor_assessment: string | null
          instructor_name: string | null
          is_published: boolean | null
          key_strengths: string | null
          learning_milestones: string[] | null
          next_module: string | null
          offering_period_id: string | null
          overall_grade: string | null
          overall_score: number | null
          participation_grade: string | null
          participation_score: number | null
          photo_url: string | null
          practical_score: number | null
          proficiency_level: string | null
          program_id: string | null
          projects_grade: string | null
          published_at: string | null
          report_date: string | null
          report_period: string | null
          report_term: string | null
          school_id: string | null
          school_name: string | null
          school_section: string | null
          section_class: string | null
          show_payment_notice: boolean
          student_grade: string | null
          student_id: string
          student_name: string | null
          teacher_id: string | null
          teaching_delivery_pct: number | null
          term_id: string | null
          theory_score: number | null
          updated_at: string | null
          verification_code: string | null
        }
        Insert: {
          academic_offering_id?: string | null
          academic_qa_checked_at?: string | null
          academic_qa_issues?: Json
          academic_qa_status?: string
          academic_trace_status?: string
          areas_for_growth?: string | null
          assignments_grade?: string | null
          attendance_score?: number | null
          calculated_at?: string | null
          calculation_mode?: string
          calculation_snapshot?: Json
          certificate_text?: string | null
          class_id?: string | null
          course_completed?: string | null
          course_duration?: string | null
          course_id?: string | null
          course_name?: string | null
          created_at?: string | null
          current_module?: string | null
          curriculum_coverage?: number | null
          curriculum_release_id?: string | null
          engagement_metrics?: Json | null
          enrollment_type_snapshot?: string | null
          evidence_manifest?: Json
          fee_amount?: string | null
          fee_label?: string | null
          fee_status?: string | null
          gender?: string | null
          has_certificate?: boolean | null
          homework_grade?: string | null
          id?: string
          instructor_assessment?: string | null
          instructor_name?: string | null
          is_published?: boolean | null
          key_strengths?: string | null
          learning_milestones?: string[] | null
          next_module?: string | null
          offering_period_id?: string | null
          overall_grade?: string | null
          overall_score?: number | null
          participation_grade?: string | null
          participation_score?: number | null
          photo_url?: string | null
          practical_score?: number | null
          proficiency_level?: string | null
          program_id?: string | null
          projects_grade?: string | null
          published_at?: string | null
          report_date?: string | null
          report_period?: string | null
          report_term?: string | null
          school_id?: string | null
          school_name?: string | null
          school_section?: string | null
          section_class?: string | null
          show_payment_notice?: boolean
          student_grade?: string | null
          student_id: string
          student_name?: string | null
          teacher_id?: string | null
          teaching_delivery_pct?: number | null
          term_id?: string | null
          theory_score?: number | null
          updated_at?: string | null
          verification_code?: string | null
        }
        Update: {
          academic_offering_id?: string | null
          academic_qa_checked_at?: string | null
          academic_qa_issues?: Json
          academic_qa_status?: string
          academic_trace_status?: string
          areas_for_growth?: string | null
          assignments_grade?: string | null
          attendance_score?: number | null
          calculated_at?: string | null
          calculation_mode?: string
          calculation_snapshot?: Json
          certificate_text?: string | null
          class_id?: string | null
          course_completed?: string | null
          course_duration?: string | null
          course_id?: string | null
          course_name?: string | null
          created_at?: string | null
          current_module?: string | null
          curriculum_coverage?: number | null
          curriculum_release_id?: string | null
          engagement_metrics?: Json | null
          enrollment_type_snapshot?: string | null
          evidence_manifest?: Json
          fee_amount?: string | null
          fee_label?: string | null
          fee_status?: string | null
          gender?: string | null
          has_certificate?: boolean | null
          homework_grade?: string | null
          id?: string
          instructor_assessment?: string | null
          instructor_name?: string | null
          is_published?: boolean | null
          key_strengths?: string | null
          learning_milestones?: string[] | null
          next_module?: string | null
          offering_period_id?: string | null
          overall_grade?: string | null
          overall_score?: number | null
          participation_grade?: string | null
          participation_score?: number | null
          photo_url?: string | null
          practical_score?: number | null
          proficiency_level?: string | null
          program_id?: string | null
          projects_grade?: string | null
          published_at?: string | null
          report_date?: string | null
          report_period?: string | null
          report_term?: string | null
          school_id?: string | null
          school_name?: string | null
          school_section?: string | null
          section_class?: string | null
          show_payment_notice?: boolean
          student_grade?: string | null
          student_id?: string
          student_name?: string | null
          teacher_id?: string | null
          teaching_delivery_pct?: number | null
          term_id?: string | null
          theory_score?: number | null
          updated_at?: string | null
          verification_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_progress_reports_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["academic_offering_id"]
          },
          {
            foreignKeyName: "student_progress_reports_academic_offering_id_fkey"
            columns: ["academic_offering_id"]
            isOneToOne: false
            referencedRelation: "academic_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_progress_reports_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_progress_reports_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_progress_reports_curriculum_release_id_fkey"
            columns: ["curriculum_release_id"]
            isOneToOne: false
            referencedRelation: "academic_curriculum_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_progress_reports_offering_period_id_fkey"
            columns: ["offering_period_id"]
            isOneToOne: false
            referencedRelation: "academic_offering_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_progress_reports_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_progress_reports_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_progress_reports_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
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
          {
            foreignKeyName: "student_progress_reports_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      student_streaks: {
        Row: {
          current_streak: number
          last_active_week: string | null
          longest_streak: number
          student_id: string
          total_active_weeks: number
          updated_at: string
        }
        Insert: {
          current_streak?: number
          last_active_week?: string | null
          longest_streak?: number
          student_id: string
          total_active_weeks?: number
          updated_at?: string
        }
        Update: {
          current_streak?: number
          last_active_week?: string | null
          longest_streak?: number
          student_id?: string
          total_active_weeks?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_streaks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_streaks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_streaks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_streaks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      student_teacher_messages: {
        Row: {
          body: string
          id: string
          is_read: boolean | null
          sender_id: string
          sent_at: string | null
          thread_id: string
        }
        Insert: {
          body: string
          id?: string
          is_read?: boolean | null
          sender_id: string
          sent_at?: string | null
          thread_id: string
        }
        Update: {
          body?: string
          id?: string
          is_read?: boolean | null
          sender_id?: string
          sent_at?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_teacher_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_teacher_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_teacher_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_teacher_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_teacher_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "student_teacher_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      student_teacher_threads: {
        Row: {
          created_at: string | null
          id: string
          student_id: string
          subject: string | null
          teacher_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          student_id: string
          subject?: string | null
          teacher_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          student_id?: string
          subject?: string | null
          teacher_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_teacher_threads_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_teacher_threads_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_teacher_threads_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_teacher_threads_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_teacher_threads_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_teacher_threads_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_teacher_threads_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_teacher_threads_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      student_transfer_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          from_class_id: string
          from_teacher_id: string
          id: string
          reason: string
          requested_by: string
          school_id: string
          status: string
          student_id: string
          to_class_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          from_class_id: string
          from_teacher_id: string
          id?: string
          reason: string
          requested_by: string
          school_id: string
          status?: string
          student_id: string
          to_class_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          from_class_id?: string
          from_teacher_id?: string
          id?: string
          reason?: string
          requested_by?: string
          school_id?: string
          status?: string
          student_id?: string
          to_class_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_transfer_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_transfer_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_transfer_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_transfer_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_transfer_requests_from_class_id_fkey"
            columns: ["from_class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_transfer_requests_from_teacher_id_fkey"
            columns: ["from_teacher_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_transfer_requests_from_teacher_id_fkey"
            columns: ["from_teacher_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_transfer_requests_from_teacher_id_fkey"
            columns: ["from_teacher_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_transfer_requests_from_teacher_id_fkey"
            columns: ["from_teacher_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_transfer_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_transfer_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_transfer_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_transfer_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_transfer_requests_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_transfer_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_transfer_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_transfer_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_transfer_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_transfer_requests_to_class_id_fkey"
            columns: ["to_class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      student_xp_ledger: {
        Row: {
          created_at: string
          event_key: string
          event_label: string
          id: string
          metadata: Json | null
          ref_id: string | null
          ref_type: string | null
          school_id: string | null
          student_id: string
          term_number: number | null
          xp: number
        }
        Insert: {
          created_at?: string
          event_key: string
          event_label: string
          id?: string
          metadata?: Json | null
          ref_id?: string | null
          ref_type?: string | null
          school_id?: string | null
          student_id: string
          term_number?: number | null
          xp?: number
        }
        Update: {
          created_at?: string
          event_key?: string
          event_label?: string
          id?: string
          metadata?: Json | null
          ref_id?: string | null
          ref_type?: string | null
          school_id?: string | null
          student_id?: string
          term_number?: number | null
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "student_xp_ledger_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_xp_ledger_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_xp_ledger_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_xp_ledger_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_xp_ledger_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      student_xp_summary: {
        Row: {
          last_updated: string
          level: number
          student_id: string
          this_term_xp: number
          total_xp: number
        }
        Insert: {
          last_updated?: string
          level?: number
          student_id: string
          this_term_xp?: number
          total_xp?: number
        }
        Update: {
          last_updated?: string
          level?: number
          student_id?: string
          this_term_xp?: number
          total_xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "student_xp_summary_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_xp_summary_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_xp_summary_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_xp_summary_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
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
          class_arm: string | null
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
          partner_program_track: string | null
          payment_plan: string
          phone: string | null
          preferred_schedule: string | null
          previous_programming_experience: string | null
          prospect_id: string | null
          rc_code: string | null
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
          class_arm?: string | null
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
          partner_program_track?: string | null
          payment_plan?: string
          phone?: string | null
          preferred_schedule?: string | null
          previous_programming_experience?: string | null
          prospect_id?: string | null
          rc_code?: string | null
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
          class_arm?: string | null
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
          partner_program_track?: string | null
          payment_plan?: string
          phone?: string | null
          preferred_schedule?: string | null
          previous_programming_experience?: string | null
          prospect_id?: string | null
          rc_code?: string | null
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "students_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "students_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
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
            foreignKeyName: "students_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospective_students"
            referencedColumns: ["id"]
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "students_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
      study_group_members: {
        Row: {
          group_id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          user_id: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "study_group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      study_group_messages: {
        Row: {
          content: string
          created_at: string
          group_id: string
          id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          group_id: string
          id?: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          group_id?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_group_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "study_group_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_group_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_group_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      study_groups: {
        Row: {
          code_content: string | null
          course_id: string | null
          created_at: string
          created_by: string
          id: string
          name: string
          school_id: string
          status: string
        }
        Insert: {
          code_content?: string | null
          course_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
          school_id: string
          status?: string
        }
        Update: {
          code_content?: string | null
          course_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_groups_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "study_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "study_groups_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount: number
          auto_rollover: boolean
          billing_channel: string | null
          billing_cycle: string | null
          course_id: string | null
          created_at: string | null
          currency: string | null
          current_period_end: string | null
          current_period_start: string | null
          end_date: string | null
          external_subscription_id: string | null
          features: Json
          fixed_amount: number | null
          id: string
          max_students: number | null
          max_teachers: number | null
          owner_type: string
          plan_name: string | null
          plan_type: string | null
          portal_user_id: string | null
          price_per_student: number | null
          pricing_model: string
          school_id: string | null
          start_date: string | null
          status: string | null
          subscription_plan: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          auto_rollover?: boolean
          billing_channel?: string | null
          billing_cycle?: string | null
          course_id?: string | null
          created_at?: string | null
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          end_date?: string | null
          external_subscription_id?: string | null
          features?: Json
          fixed_amount?: number | null
          id?: string
          max_students?: number | null
          max_teachers?: number | null
          owner_type?: string
          plan_name?: string | null
          plan_type?: string | null
          portal_user_id?: string | null
          price_per_student?: number | null
          pricing_model?: string
          school_id?: string | null
          start_date?: string | null
          status?: string | null
          subscription_plan?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          auto_rollover?: boolean
          billing_channel?: string | null
          billing_cycle?: string | null
          course_id?: string | null
          created_at?: string | null
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          end_date?: string | null
          external_subscription_id?: string | null
          features?: Json
          fixed_amount?: number | null
          id?: string
          max_students?: number | null
          max_teachers?: number | null
          owner_type?: string
          plan_name?: string | null
          plan_type?: string | null
          portal_user_id?: string | null
          price_per_student?: number | null
          pricing_model?: string
          school_id?: string | null
          start_date?: string | null
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "subscriptions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
          {
            foreignKeyName: "subscriptions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          admin_reply: string | null
          assigned_to: string | null
          category: string
          created_at: string
          follow_up: string | null
          id: string
          invoice_id: string | null
          message: string
          priority: string
          resolved_at: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_reply?: string | null
          assigned_to?: string | null
          category?: string
          created_at?: string
          follow_up?: string | null
          id?: string
          invoice_id?: string | null
          message: string
          priority?: string
          resolved_at?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_reply?: string | null
          assigned_to?: string | null
          category?: string
          created_at?: string
          follow_up?: string | null
          id?: string
          invoice_id?: string | null
          message?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "support_tickets_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "finance_ledger"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "support_tickets_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
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
      teacher_delivery_patterns: {
        Row: {
          content: Json
          created_at: string
          description: string | null
          id: string
          name: string
          status: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          content?: Json
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
          teacher_id?: string
          updated_at?: string
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "teacher_schools_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "teacher_schools_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "teachers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
      teaching_generation_runs: {
        Row: {
          by_type: Json
          class_id: string | null
          completed_at: string | null
          curriculum_week_number: number
          error_summary: string | null
          failed_types: string[]
          generated_count: number
          id: string
          last_heartbeat_at: string
          lesson_plan_id: string
          requested_types: string[]
          retry_of: string | null
          session_number: number
          skipped_count: number
          source: string
          started_at: string
          started_by: string | null
          status: string
        }
        Insert: {
          by_type?: Json
          class_id?: string | null
          completed_at?: string | null
          curriculum_week_number: number
          error_summary?: string | null
          failed_types?: string[]
          generated_count?: number
          id?: string
          last_heartbeat_at?: string
          lesson_plan_id: string
          requested_types?: string[]
          retry_of?: string | null
          session_number?: number
          skipped_count?: number
          source: string
          started_at?: string
          started_by?: string | null
          status?: string
        }
        Update: {
          by_type?: Json
          class_id?: string | null
          completed_at?: string | null
          curriculum_week_number?: number
          error_summary?: string | null
          failed_types?: string[]
          generated_count?: number
          id?: string
          last_heartbeat_at?: string
          lesson_plan_id?: string
          requested_types?: string[]
          retry_of?: string | null
          session_number?: number
          skipped_count?: number
          source?: string
          started_at?: string
          started_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "teaching_generation_runs_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_generation_runs_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "academic_lesson_plan_source_issues"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "teaching_generation_runs_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "class_term_teaching_progress"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "teaching_generation_runs_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_generation_runs_retry_of_fkey"
            columns: ["retry_of"]
            isOneToOne: false
            referencedRelation: "teaching_generation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_generation_runs_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "teaching_generation_runs_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_generation_runs_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_generation_runs_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      term_schedules: {
        Row: {
          cadence_days: number
          created_at: string
          current_week: number
          id: string
          is_active: boolean
          lesson_plan_id: string
          school_id: string
          term_start: string
          updated_at: string
        }
        Insert: {
          cadence_days?: number
          created_at?: string
          current_week?: number
          id?: string
          is_active?: boolean
          lesson_plan_id: string
          school_id: string
          term_start: string
          updated_at?: string
        }
        Update: {
          cadence_days?: number
          created_at?: string
          current_week?: number
          id?: string
          is_active?: boolean
          lesson_plan_id?: string
          school_id?: string
          term_start?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "term_schedules_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "academic_lesson_plan_source_issues"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "term_schedules_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "class_term_teaching_progress"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "term_schedules_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "term_schedules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_slots: {
        Row: {
          class_id: string | null
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
          class_id?: string | null
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
          class_id?: string | null
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
            foreignKeyName: "timetable_slots_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "timetable_slots_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
          term_id: string | null
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
          term_id?: string | null
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
          term_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetables_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "timetables_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "timetables_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "topic_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "user_badges_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "user_points_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: true
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "user_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "vault_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
      web_push_subscriptions: {
        Row: {
          created_at: string
          device_hint: string | null
          endpoint: string
          id: string
          portal_user_id: string
          subscription_json: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_hint?: string | null
          endpoint: string
          id?: string
          portal_user_id: string
          subscription_json: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_hint?: string | null
          endpoint?: string
          id?: string
          portal_user_id?: string
          subscription_json?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_push_subscriptions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "web_push_subscriptions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "web_push_subscriptions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "web_push_subscriptions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          assigned_staff_id: string | null
          contact_name: string | null
          created_at: string | null
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          opted_in_at: string | null
          opted_out: boolean | null
          opted_out_at: string | null
          phone_number: string
          portal_user_id: string | null
          school_name: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_staff_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          opted_in_at?: string | null
          opted_out?: boolean | null
          opted_out_at?: string | null
          phone_number: string
          portal_user_id?: string | null
          school_name?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_staff_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          opted_in_at?: string | null
          opted_out?: boolean | null
          opted_out_at?: string | null
          phone_number?: string
          portal_user_id?: string | null
          school_name?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      whatsapp_group_broadcasts: {
        Row: {
          group_id: string | null
          group_name: string | null
          id: string
          message: string
          school_id: string | null
          school_name: string | null
          sent_at: string
          sent_by: string | null
          sent_by_name: string | null
        }
        Insert: {
          group_id?: string | null
          group_name?: string | null
          id?: string
          message: string
          school_id?: string | null
          school_name?: string | null
          sent_at?: string
          sent_by?: string | null
          sent_by_name?: string | null
        }
        Update: {
          group_id?: string | null
          group_name?: string | null
          id?: string
          message?: string
          school_id?: string | null
          school_name?: string | null
          sent_at?: string
          sent_by?: string | null
          sent_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_group_broadcasts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_group_broadcasts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_group_broadcasts_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "whatsapp_group_broadcasts_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_group_broadcasts_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_group_broadcasts_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
        ]
      }
      whatsapp_groups: {
        Row: {
          class_id: string | null
          class_name: string | null
          created_at: string
          created_by: string | null
          description: string | null
          group_type: string
          id: string
          last_broadcast_at: string | null
          link: string
          member_count: number | null
          name: string
          owner_teacher_id: string | null
          school_id: string | null
          school_name: string | null
          status: string
          term: string | null
        }
        Insert: {
          class_id?: string | null
          class_name?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          group_type?: string
          id?: string
          last_broadcast_at?: string | null
          link: string
          member_count?: number | null
          name: string
          owner_teacher_id?: string | null
          school_id?: string | null
          school_name?: string | null
          status?: string
          term?: string | null
        }
        Update: {
          class_id?: string | null
          class_name?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          group_type?: string
          id?: string
          last_broadcast_at?: string | null
          link?: string
          member_count?: number | null
          name?: string
          owner_teacher_id?: string | null
          school_id?: string | null
          school_name?: string | null
          status?: string
          term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_groups_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "whatsapp_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "whatsapp_groups_owner_teacher_id_fkey"
            columns: ["owner_teacher_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "whatsapp_groups_owner_teacher_id_fkey"
            columns: ["owner_teacher_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_groups_owner_teacher_id_fkey"
            columns: ["owner_teacher_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_groups_owner_teacher_id_fkey"
            columns: ["owner_teacher_id"]
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
      whatsapp_messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string | null
          direction: string
          id: string
          media_url: string | null
          message_type: string | null
          meta_message_id: string | null
          metadata: Json | null
          status: string | null
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string | null
          direction: string
          id?: string
          media_url?: string | null
          message_type?: string | null
          meta_message_id?: string | null
          metadata?: Json | null
          status?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string | null
          direction?: string
          id?: string
          media_url?: string | null
          message_type?: string | null
          meta_message_id?: string | null
          metadata?: Json | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_outbox: {
        Row: {
          attempts: number
          class_id: string | null
          created_at: string
          created_by: string | null
          delivery_log_id: string | null
          id: string
          idempotency_key: string | null
          last_error: string | null
          max_attempts: number
          message_body: string
          meta_message_id: string | null
          next_attempt_at: string
          phone: string
          recipient_user_id: string | null
          school_id: string | null
          sent_at: string | null
          source_id: string | null
          source_type: string | null
          status: string
          template_language: string
          template_name: string | null
          template_variables: Json
          updated_at: string
        }
        Insert: {
          attempts?: number
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          delivery_log_id?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          max_attempts?: number
          message_body: string
          meta_message_id?: string | null
          next_attempt_at?: string
          phone: string
          recipient_user_id?: string | null
          school_id?: string | null
          sent_at?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          template_language?: string
          template_name?: string | null
          template_variables?: Json
          updated_at?: string
        }
        Update: {
          attempts?: number
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          delivery_log_id?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          max_attempts?: number
          message_body?: string
          meta_message_id?: string | null
          next_attempt_at?: string
          phone?: string
          recipient_user_id?: string | null
          school_id?: string | null
          sent_at?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          template_language?: string
          template_name?: string | null
          template_variables?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_outbox_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_delivery_log_id_fkey"
            columns: ["delivery_log_id"]
            isOneToOne: false
            referencedRelation: "communication_delivery_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "student_performance_summary"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      academic_enrollment_pathway_issues: {
        Row: {
          academic_offering_id: string | null
          class_id: string | null
          enrollment_type: string | null
          expected_enrollment_type: string | null
          full_name: string | null
          issue: string | null
          offering_title: string | null
          student_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_users_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_lesson_plan_source_issues: {
        Row: {
          class_id: string | null
          course_id: string | null
          curriculum_release_id: string | null
          curriculum_version_id: string | null
          issue: string | null
          lesson_plan_id: string | null
          school_id: string | null
          term_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_lesson_plans_curriculum"
            columns: ["curriculum_version_id"]
            isOneToOne: false
            referencedRelation: "course_curricula"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_curriculum_release_id_fkey"
            columns: ["curriculum_release_id"]
            isOneToOne: false
            referencedRelation: "academic_curriculum_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      accountability_coverage_mv: {
        Row: {
          data: Json | null
          is_current: boolean | null
        }
        Relationships: []
      }
      accountability_people_mv: {
        Row: {
          class_from_roster: string | null
          class_on_profile: string | null
          email: string | null
          enrollment_type: string | null
          flags: string[] | null
          full_name: string | null
          has_parent_contact: boolean | null
          has_parent_email: boolean | null
          id: string | null
          is_active: boolean | null
          reports_draft: number | null
          reports_published: number | null
          reports_total: number | null
          role: string | null
          roster_status: string | null
          school_name: string | null
        }
        Relationships: []
      }
      admin_dashboard_stats: {
        Row: {
          active_schools: number | null
          graded_assignments: number | null
          graded_cbt: number | null
          last_updated: string | null
          total_partners: number | null
          total_schools: number | null
          total_students: number | null
          total_teachers: number | null
        }
        Relationships: []
      }
      class_term_teaching_progress: {
        Row: {
          academic_term_id: string | null
          class_id: string | null
          course_id: string | null
          curriculum_version_id: string | null
          delivered_count: number | null
          delivered_weeks: number | null
          last_delivered_at: string | null
          latest_delivered_week: number | null
          lesson_count: number | null
          lesson_plan_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_lesson_plans_curriculum"
            columns: ["curriculum_version_id"]
            isOneToOne: false
            referencedRelation: "course_curricula"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_term_id_fkey"
            columns: ["academic_term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_ledger: {
        Row: {
          amount: number | null
          commission_rate: number | null
          currency: string | null
          invoice_id: string | null
          invoice_number: string | null
          method: string | null
          paid_at: string | null
          portal_user_id: string | null
          receipt_id: string | null
          receipt_number: string | null
          receipt_url: string | null
          reference: string | null
          school_id: string | null
          status: string | null
          stream: string | null
          transacted_at: string | null
          transaction_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "academic_enrollment_pathway_issues"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "payment_transactions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "accountability_people_mv"
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
      academic_term_id_for_ts: { Args: { p_ts: string }; Returns: string }
      active_class_student_count: {
        Args: { p_class_id: string }
        Returns: number
      }
      actor_may_manage_class: {
        Args: { p_actor_id: string; p_class_id: string }
        Returns: boolean
      }
      admin_inspect_teaching_orphans: { Args: never; Returns: Json }
      admin_purge_curriculum_releases: {
        Args: { p_release_ids: string[] }
        Returns: Json
      }
      admin_purge_teaching_orphans: { Args: never; Returns: Json }
      allocate_payment_to_invoice: {
        Args: {
          p_actor_id?: string
          p_amount: number
          p_invoice_id: string
          p_transaction_id: string
        }
        Returns: Json
      }
      assignment_matches_term: {
        Args: { p_assignment_term_id: string; p_term_id: string }
        Returns: boolean
      }
      canonical_academic_enrollment_type: {
        Args: { p_value: string }
        Returns: string
      }
      canonical_grade: { Args: { input: string }; Returns: string }
      cbt_session_matches_term: {
        Args: {
          p_end_time: string
          p_exam_term_id?: string
          p_metadata: Json
          p_term_id: string
        }
        Returns: boolean
      }
      check_constraint_allowed_values: {
        Args: never
        Returns: {
          allowed_value: string
          column_name: string
          table_name: string
        }[]
      }
      check_course_completion: {
        Args: { p_course_id: string; p_user_id: string }
        Returns: boolean
      }
      check_timetable_conflicts: { Args: { p_slot: Json }; Returns: Json }
      claim_cron_job_run: {
        Args: { p_job_name: string; p_lease_seconds?: number; p_run_id: string }
        Returns: boolean
      }
      claim_whatsapp_outbox: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          class_id: string | null
          created_at: string
          created_by: string | null
          delivery_log_id: string | null
          id: string
          idempotency_key: string | null
          last_error: string | null
          max_attempts: number
          message_body: string
          meta_message_id: string | null
          next_attempt_at: string
          phone: string
          recipient_user_id: string | null
          school_id: string | null
          sent_at: string | null
          source_id: string | null
          source_type: string | null
          status: string
          template_language: string
          template_name: string | null
          template_variables: Json
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "whatsapp_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      class_active_for_term: {
        Args: { p_class_term_id: string; p_term_id: string }
        Returns: boolean
      }
      class_qa_path_offset: {
        Args: { p_class_id: string; p_school_id: string }
        Returns: number
      }
      consume_communication_rate_limit: {
        Args: {
          p_day_bucket: string
          p_sender_id: string
          p_sender_role: string
        }
        Returns: {
          daily_count: number
          last_message_at: string
        }[]
      }
      create_billing_cycle_with_invoice: {
        Args: {
          p_actor_id?: string
          p_amount_due: number
          p_currency?: string
          p_due_date: string
          p_items?: Json
          p_owner_school_id: string
          p_owner_type: string
          p_owner_user_id: string
          p_status?: string
          p_subscription_id?: string
          p_term_label: string
          p_term_start_date: string
        }
        Returns: Json
      }
      create_independent_academic_pathway: {
        Args: {
          p_actor_id: string
          p_ends_on: string
          p_pathway: string
          p_programme_id: string
          p_school_id: string
          p_starts_on: string
          p_title: string
        }
        Returns: string
      }
      create_independent_academic_pathway_v2: {
        Args: {
          p_actor_id: string
          p_ends_on: string
          p_pathway: string
          p_programme_id: string
          p_school_id: string
          p_starts_on: string
          p_title: string
        }
        Returns: string
      }
      create_invoice_atomic: {
        Args: {
          p_amount: number
          p_billing_cycle_id: string
          p_currency: string
          p_due_date: string
          p_invoice_number: string
          p_items: Json
          p_metadata: Json
          p_notes: string
          p_portal_user_id: string
          p_school_id: string
          p_status: string
          p_stream: string
        }
        Returns: Json
      }
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
      create_school_term_invoice_atomic: {
        Args: {
          p_academic_term_id: string
          p_actor_id?: string
          p_amount: number
          p_currency: string
          p_due_date: string
          p_invoice_number: string
          p_items: Json
          p_metadata: Json
          p_notes: string
          p_school_id: string
          p_status: string
        }
        Returns: Json
      }
      current_academic_term: { Args: never; Returns: string }
      current_user_email: { Args: never; Returns: string }
      current_user_role: { Args: never; Returns: string }
      curriculum_project_shape: { Args: { prompt: string }; Returns: string }
      curriculum_project_shapes: {
        Args: { p_program?: string; p_track?: string }
        Returns: {
          avg_length: number
          rows: number
          sample_prompt: string
          sample_title: string
          shape: string
          tracks: string[]
        }[]
      }
      curriculum_release_quality_report: {
        Args: { p_content: Json }
        Returns: Json
      }
      decide_student_transfer_request: {
        Args: {
          p_actor_id: string
          p_approve: boolean
          p_note?: string
          p_request_id: string
        }
        Returns: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          from_class_id: string
          from_teacher_id: string
          id: string
          reason: string
          requested_by: string
          school_id: string
          status: string
          student_id: string
          to_class_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "student_transfer_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_lesson_plan_preserving_learner_work: {
        Args: { p_actor_id: string; p_plan_id: string }
        Returns: Json
      }
      delete_rebuildable_class: {
        Args: { p_actor_id: string; p_class_id: string }
        Returns: Json
      }
      discard_partnership_agreement: { Args: { p_id: string }; Returns: Json }
      discard_withdrawn_partnership_agreements: {
        Args: { p_school_id: string }
        Returns: Json
      }
      enqueue_whatsapp_delivery: {
        Args: {
          p_class_id: string
          p_created_by: string
          p_idempotency_key: string
          p_message_body: string
          p_phone: string
          p_recipient_user_id: string
          p_school_id: string
          p_source_id: string
          p_source_type: string
          p_template_language: string
          p_template_name: string
          p_template_variables: Json
        }
        Returns: {
          delivery_id: string
          outbox_id: string
        }[]
      }
      ensure_class_academic_pathway: {
        Args: {
          p_actor_id?: string
          p_class_id: string
          p_enrollment_type: string
          p_preferred_offering_id?: string
        }
        Returns: Json
      }
      ensure_class_teaching_plan: {
        Args: {
          p_academic_term_id?: string
          p_actor_id: string
          p_class_id: string
          p_course_id: string
          p_curriculum_version_id: string
          p_offering_period_id?: string
          p_sessions_per_week?: number
        }
        Returns: Json
      }
      ensure_settled_invoice_atomic: {
        Args: {
          p_amount: number
          p_currency: string
          p_invoice_number: string
          p_items: Json
          p_metadata: Json
          p_portal_user_id: string
          p_school_id: string
          p_stream: string
          p_transaction_id: string
        }
        Returns: Json
      }
      evaluate_progress_report_academic_qa: {
        Args: { p_report_id: string }
        Returns: Json
      }
      finalize_full_refund_atomic: {
        Args: {
          p_actor_id?: string
          p_gateway_refund?: Json
          p_reason: string
          p_transaction_id: string
        }
        Returns: Json
      }
      find_school_student_name_conflicts: {
        Args: {
          p_name_keys: string[]
          p_school_id: string
          p_school_name: string
        }
        Returns: {
          email: string
          full_name: string
          id: string
          name_key: string
        }[]
      }
      get_academic_coverage: { Args: never; Returns: Json }
      get_admin_session_graded_counts: {
        Args: { term_uuid?: string }
        Returns: Json
      }
      get_at_risk_students: {
        Args: { p_class_id?: string; p_school_id: string }
        Returns: {
          full_name: string
          portal_user_id: string
          triggered_signals: Json
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
      get_dashboard_activity: {
        Args: { activity_limit?: number; user_role: string; user_uuid: string }
        Returns: {
          color_class: string
          created_at: string
          description: string
          icon_type: string
          id: string
          time_ago: string
          title: string
        }[]
      }
      get_due_flashcards: {
        Args: { p_deck_id?: string; p_student_id: string }
        Returns: {
          back: string
          back_image_url: string
          card_id: string
          deck_id: string
          difficulty_level: string
          ease_factor: number
          front: string
          front_image_url: string
          next_review_at: string
          repetitions: number
          template: string
        }[]
      }
      get_my_role: { Args: never; Returns: string }
      get_my_school_id: { Args: never; Returns: string }
      get_or_create_inbox_conversation: {
        Args: {
          p_contact_name: string
          p_phone_number: string
          p_portal_user_id: string
        }
        Returns: Json
      }
      get_parent_child_user_ids: { Args: never; Returns: string[] }
      get_parent_student_ids: { Args: never; Returns: string[] }
      get_people_accountability: {
        Args: never
        Returns: {
          class_from_roster: string
          class_on_profile: string
          email: string
          enrollment_type: string
          flags: string[]
          full_name: string
          has_parent_contact: boolean
          has_parent_email: boolean
          id: string
          is_active: boolean
          reports_draft: number
          reports_published: number
          reports_total: number
          role: string
          roster_status: string
          school_name: string
        }[]
      }
      get_report_backlog: { Args: never; Returns: Json }
      get_school_dashboard_stats: {
        Args: {
          school_name_param?: string
          school_uuid: string
          term_uuid?: string
        }
        Returns: Json
      }
      get_student_dashboard_stats: {
        Args: { student_uuid: string; term_uuid?: string }
        Returns: Json
      }
      get_teacher_dashboard_stats: {
        Args: { teacher_uuid: string; term_uuid?: string }
        Returns: Json
      }
      get_timetable_ids_by_school: {
        Args: { p_school_id: string }
        Returns: string[]
      }
      handover_primary_duty: {
        Args: {
          p_created_by: string
          p_duty_kind: string
          p_ends_at: string
          p_is_primary?: boolean
          p_staff_id: string
          p_starts_at: string
        }
        Returns: Json
      }
      hard_delete_portal_user: { Args: { p_id: string }; Returns: Json }
      hard_delete_school: { Args: { p_school: string }; Returns: Json }
      increment_download_count: {
        Args: { file_id: string }
        Returns: undefined
      }
      increment_question_upvotes: {
        Args: { question_id: string }
        Returns: undefined
      }
      is_active_admin: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_teacher: { Args: never; Returns: boolean }
      is_parent: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      issue_verified_academic_certificate: {
        Args: {
          p_actor_id?: string
          p_class_id?: string
          p_course_id: string
          p_student_id: string
        }
        Returns: Json
      }
      live_academic_session_label: {
        Args: { p_now?: string }
        Returns: {
          period_label: string
          term_label: string
        }[]
      }
      live_academic_term_id: { Args: { p_now?: string }; Returns: string }
      live_session_series_weekdays_valid: {
        Args: { days: number[] }
        Returns: boolean
      }
      merge_duplicate_classes: {
        Args: {
          p_actor_id: string
          p_section_label?: string
          p_source_class_id: string
          p_survivor_class_id: string
        }
        Returns: Json
      }
      merge_my_metadata: {
        Args: { increment_keys?: string[]; patch?: Json; stamp_login?: boolean }
        Returns: Json
      }
      normalize_contact_book_phone: { Args: { raw: string }; Returns: string }
      process_payment_atomic: {
        Args: { p_amount: number; p_invoice_id: string; p_reference: string }
        Returns: Json
      }
      process_student_level_decision: {
        Args: {
          p_actor_id: string
          p_decision: string
          p_enrollment_id: string
          p_next_term_label: string
          p_teacher_notes?: string
        }
        Returns: Json
      }
      publish_academic_assessment_scheme: {
        Args: {
          p_academic_term_id?: string
          p_actor_id: string
          p_components: Json
          p_course_id?: string
          p_name: string
          p_school_ids?: string[]
        }
        Returns: {
          academic_offering_id: string | null
          academic_term_id: string | null
          approved_by: string | null
          components: Json
          course_id: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          school_id: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "academic_assessment_schemes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      publish_offering_curriculum_direction: {
        Args: {
          p_academic_offering_id: string
          p_actor_id: string
          p_course_id: string
          p_release_id: string
        }
        Returns: string
      }
      publish_school_report_revision_atomic: {
        Args: {
          p_actor_user_id: string
          p_change_reason: string
          p_data_sources: Json
          p_design: Json
          p_expected_lock_version: number
          p_force_override: Json
          p_narrative: Json
          p_pdf_hash: string
          p_report_id: string
          p_snapshot: Json
          p_title: string
          p_verification_code: string
        }
        Returns: {
          change_reason: string | null
          created_at: string
          created_by: string
          data_sources: Json | null
          design: Json | null
          force_publish_override: Json | null
          id: string
          narrative: Json
          pdf_hash: string | null
          published_at: string | null
          published_by: string | null
          report_id: string
          revision_number: number
          snapshot: Json
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "school_report_revisions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      qa_build_explicit_topic: {
        Args: { p_lane: number; p_week: number }
        Returns: string
      }
      recalculate_academic_result: {
        Args: { p_actor_id?: string; p_report_id: string }
        Returns: Json
      }
      recalculate_academic_result_guarded: {
        Args: {
          p_actor_id: string
          p_expected_updated_at: string
          p_report_id: string
        }
        Returns: Json
      }
      recalculate_traceable_progress_report: {
        Args: { p_actor_id?: string; p_report_id: string }
        Returns: Json
      }
      recompute_invoice_balances_atomic: {
        Args: { p_invoice_id: string }
        Returns: Json
      }
      record_class_lesson_delivery: {
        Args: {
          p_actor_id: string
          p_class_session_id?: string
          p_lesson_id: string
          p_lesson_plan_id: string
          p_notes?: string
          p_session_number?: number
          p_status: string
          p_week_number: number
        }
        Returns: Json
      }
      record_communication_delivery_event: {
        Args: {
          p_channel: string
          p_delivery_id: string
          p_error?: string
          p_event_key: string
          p_metadata?: Json
          p_occurred_at?: string
          p_provider?: string
          p_provider_message_id?: string
          p_provider_status?: string
          p_status: string
        }
        Returns: {
          current_status: string
          delivery_id: string
          event_inserted: boolean
        }[]
      }
      refresh_accountability_cache: { Args: never; Returns: string }
      refresh_dashboard_stats: { Args: never; Returns: undefined }
      release_cron_job_run: {
        Args: { p_job_name: string; p_run_id: string }
        Returns: boolean
      }
      hold_prepared_week_atomic: {
        Args: {
          p_held_at?: string
          p_lesson_plan_id: string
          p_session_number: number
          p_week_number: number
        }
        Returns: Json
      }
      release_prepared_week_atomic: {
        Args: {
          p_lesson_plan_id: string
          p_released_at?: string
          p_session_number: number
          p_week_number: number
        }
        Returns: Json
      }
      replace_live_partnership_documents: {
        Args: { p_keep_id: string; p_kind: string; p_school_id: string }
        Returns: number
      }
      repoint_contact_book_dupe: {
        Args: { dupe_id: string; keep_id: string }
        Returns: undefined
      }
      resolve_academic_term: {
        Args: { p_term: string; p_year: string }
        Returns: string
      }
      rewrite_curriculum_project_shape: {
        Args: {
          p_program?: string
          p_prompt: string
          p_shape: string
          p_track?: string
        }
        Returns: number
      }
      safe_assessment_weight: { Args: { p_metadata: Json }; Returns: number }
      school_protected_evidence: { Args: { p_school: string }; Returns: Json }
      settle_billing_cycle_payment_atomic: {
        Args: {
          p_actor_id?: string
          p_billing_cycle_id: string
          p_transaction_id: string
        }
        Returns: Json
      }
      sole_published_special_scope: {
        Args: never
        Returns: {
          academic_offering_id: string
          offering_period_id: string
        }[]
      }
      staff_can_access_assignment: {
        Args: { a: Database["public"]["Tables"]["assignments"]["Row"] }
        Returns: boolean
      }
      student_duplicate_name_key: {
        Args: { raw_name: string }
        Returns: string
      }
      supersede_pending_payment_attempts: {
        Args: { p_match: Json; p_reason?: string; p_replaced_by?: string }
        Returns: number
      }
      sync_academic_terms_is_current: {
        Args: { p_now?: string }
        Returns: string
      }
      term_id_for_date: { Args: { p_date: string }; Returns: string }
      unlink_parent_from_student: {
        Args: { target_student_id: string }
        Returns: undefined
      }
      update_billing_cycle_with_invoice: {
        Args: {
          p_amount_due: number
          p_currency: string
          p_cycle_id: string
          p_due_date: string
          p_items?: Json
          p_metadata?: Json
          p_notes?: string
          p_status: string
          p_term_label: string
          p_term_start_date: string
        }
        Returns: Json
      }
      update_platform_configuration: {
        Args: { p_actor_id: string; p_changes: Json }
        Returns: {
          setting_key: string
          updated_at: string
        }[]
      }
      upsert_enrollment_term_grade: {
        Args: {
          p_enrollment_id: string
          p_grade: string
          p_notes?: string
          p_term_id?: string
        }
        Returns: {
          class_id: string | null
          course_id: string | null
          created_at: string
          curriculum_release_id: string | null
          enrollment_id: string
          evidence_manifest: Json
          grade: string | null
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_status: string
          notes: string | null
          school_id: string | null
          term_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "enrollment_term_grades"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      valid_academic_assessment_components: {
        Args: { p_components: Json }
        Returns: boolean
      }
      withdraw_receipt_atomic: {
        Args: { p_actor_id: string; p_reason: string; p_receipt_id: string }
        Returns: Json
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
