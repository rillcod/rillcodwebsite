# Implementation Plan: LMS System Completion

## Overview

This implementation plan breaks down the completion of the multi-school Learning Management System into actionable coding tasks. The system is built on Next.js 15, React 18, TypeScript, and Supabase, with an existing foundation that we'll extend with 15 major feature areas.

The implementation follows a phased approach over 20 weeks, building incrementally from foundational infrastructure through core features to production readiness. Each task references specific requirements for traceability.

## Tasks

### Phase 1: Foundation & Infrastructure (Weeks 1-2)

- [x] 1. Set up enhanced middleware layer
  - [x] 1.1 Create tenant context middleware
    - Implement middleware to extract and set tenant (school_id) from authenticated user
    - Store tenant context in request headers for downstream services
    - Add tenant validation to ensure user belongs to valid school
    - _Requirements: 3.2, 3.3_
  
  - [x] 1.2 Create rate limiting middleware
    - Implement rate limiter using sliding window algorithm (100 requests per 60 seconds per user)
    - Add Redis integration for distributed rate limiting
    - Return 429 status code when limit exceeded
    - Add rate limit headers (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset)
    - _Requirements: 1.16, 15.17_
  
  - [x] 1.3 Create request validation middleware
    - Implement Zod schema validation wrapper for API routes
    - Return 400 status with descriptive errors for validation failures
    - Add request ID generation for tracing
    - _Requirements: 1.11, 1.12_
  
  - [x] 1.4 Create logging middleware
    - Implement structured logging with timestamp, user_id, endpoint, response_status
    - Integrate with logging service (console in dev, external service in prod)
    - Log slow queries (>1000ms) separately
    - _Requirements: 1.17, 15.1, 15.5_

- [x] 2. Implement error handling framework
  - [x] 2.1 Create custom error classes
    - Implement AppError base class with statusCode and isOperational properties
    - Create specific error classes (ValidationError, AuthenticationError, AuthorizationError, NotFoundError, etc.)
    - Add error serialization for API responses
    - _Requirements: 1.12, 1.13, 1.14, 15.10_

  - [x] 2.2 Create global error handler
    - Implement errorHandler function for API routes
    - Format errors consistently with success, error, statusCode, requestId, timestamp
    - Integrate with Sentry for error tracking in production
    - Handle both operational and unexpected errors
    - _Requirements: 15.1, 15.2, 15.10_
  
  - [x] 2.3 Implement circuit breaker pattern
    - Create CircuitBreaker class with CLOSED, OPEN, HALF_OPEN states
    - Configure failure threshold (5 failures) and reset timeout (60 seconds)
    - Apply to external service calls (S3, Stripe, SendGrid, Twilio, Zoom)
    - _Requirements: 15.11_
  
  - [x] 2.4 Implement retry logic with exponential backoff
    - Create retryWithBackoff utility function
    - Configure max attempts (3), initial delay (1s), max delay (4s), backoff multiplier (2)
    - Apply to notification sending and external API calls
    - _Requirements: 5.10, 15.11_

- [x] 3. Run database migrations for new tables
  - [x] 3.1 Create exam and CBT tables
    - Create exams table with course_id, duration, scoring configuration
    - Create exam_questions table with question types and correct answers
    - Create exam_attempts table with answers, scores, and cheating detection fields
    - Add indexes on course_id, portal_user_id, exam_id
    - _Requirements: 6.1, 6.2, 6.7_
  
  - [x] 3.2 Create file management tables
    - Create files table with storage metadata, virus scan status, download counts
    - Add indexes on school_id, uploaded_by, file_type
    - Add foreign key constraints to schools and portal_users
    - _Requirements: 2.1, 2.4, 2.13_
  
  - [x] 3.3 Create payment and subscription tables
    - Create payment_transactions table with amount, currency, status, gateway response
    - Create subscriptions table with billing cycle, period dates, external IDs
    - Add indexes on portal_user_id, course_id, transaction_reference
    - _Requirements: 4.7, 4.8, 4.9_

  - [x] 3.4 Create notification tables
    - Extend notifications table with notification_channel, sent_at, delivery_status, retry_count
    - Create notification_preferences table with user preferences for email, SMS, push
    - Add indexes on user_id, delivery_status, created_at
    - _Requirements: 5.1, 5.2, 5.8, 5.11_
  
  - [x] 3.5 Create discussion forum tables
    - Create discussion_topics table with course_id, title, content, pinned, locked, resolved flags
    - Create discussion_replies table with parent_reply_id for threading
    - Create discussion_attachments table linking to files
    - Add indexes on course_id, created_by, topic_id
    - _Requirements: 8.1, 8.3, 8.7_
  
  - [x] 3.6 Create certificates and badges tables
    - Create certificates table with verification_code, certificate_number, pdf_url
    - Create badges table with criteria (JSONB), points_value, icon_url
    - Create user_badges table linking users to earned badges
    - Add unique constraints on verification_code, certificate_number
    - _Requirements: 9.1, 9.2, 9.8, 9.10_
  
  - [x] 3.7 Create gamification tables
    - Create user_points table with total_points, current_streak, longest_streak, achievement_level
    - Create point_transactions table with activity_type, points, reference_id
    - Create leaderboards table with course_id, portal_user_id, points, rank, period dates
    - Add indexes on portal_user_id, course_id, period dates
    - _Requirements: 13.1, 13.4, 13.5, 13.7_
  
  - [x] 3.8 Create content library tables
    - Create content_library table with title, content_type, tags, rating, usage_count, approval status
    - Create content_ratings table with rating (1-5), review text
    - Add indexes on school_id, content_type, tags, is_approved
    - _Requirements: 12.1, 12.2, 12.7, 12.9_
  
  - [x] 3.9 Create video conferencing tables
    - Create live_sessions table with meeting_url, meeting_id, provider, recording_url, status
    - Create live_session_attendance table with joined_at, left_at, duration_minutes
    - Add indexes on course_id, instructor_id, scheduled_start
    - _Requirements: 11.2, 11.6, 11.8, 11.13_

  - [x] 3.10 Create lesson progress and announcement tables
    - Create lessons table (if not exists) with lesson_type, duration, video_url, order_index
    - Create lesson_progress table with status, progress_percentage, time_spent_minutes
    - Create announcements table (if not exists) with priority, target_audience, published_at
    - Add indexes on course_id, portal_user_id, lesson_id
    - _Requirements: 1.3, 1.8_
  
  - [x] 3.11 Add school_id to existing tables for multi-tenancy
    - Add school_id column to portal_users, programs, courses, classes tables
    - Backfill school_id from existing relationships
    - Add NOT NULL constraint after backfill
    - Add foreign key constraints to schools table
    - _Requirements: 3.1, 3.5_

- [x] 4. Implement Row Level Security (RLS) policies
  - [x] 4.1 Create RLS policies for exam tables
    - Enable RLS on exams, exam_questions, exam_attempts tables
    - Create policy: users can only view exams for courses they're enrolled in or teaching
    - Create policy: users can only view their own exam attempts
    - Create policy: instructors can view all attempts for their courses
    - _Requirements: 3.1, 3.4_
  
  - [x] 4.2 Create RLS policies for file tables
    - Enable RLS on files table
    - Create policy: users can only access files from their school (school_id match)
    - Create policy: users can only delete files they uploaded (or admins)
    - _Requirements: 3.1, 3.4, 3.6_
  
  - [x] 4.3 Create RLS policies for payment tables
    - Enable RLS on payment_transactions, subscriptions tables
    - Create policy: users can only view their own transactions
    - Create policy: school admins can view all transactions for their school
    - _Requirements: 3.1, 3.4_

  - [x] 4.4 Create RLS policies for discussion tables
    - Enable RLS on discussion_topics, discussion_replies, discussion_attachments tables
    - Create policy: users can only view discussions for courses they're enrolled in
    - Create policy: users can edit/delete their own posts
    - Create policy: instructors can moderate all posts in their courses
    - _Requirements: 3.1, 3.4, 8.14_
  
  - [x] 4.5 Create RLS policies for remaining tables
    - Enable RLS on certificates, badges, user_badges, user_points, point_transactions, leaderboards
    - Enable RLS on content_library, content_ratings, live_sessions, live_session_attendance
    - Enable RLS on lessons, lesson_progress, announcements, notifications
    - Create policies ensuring school_id isolation for all tables
    - _Requirements: 3.1, 3.4, 3.11_

- [x] 5. Set up configuration management
  - [x] 5.1 Create environment configuration types
    - Create TypeScript interfaces for FileStorageConfig, PaymentConfig, NotificationConfig, VideoConferencingConfig
    - Create interfaces for RateLimitConfig, CacheConfig
    - Add validation for required environment variables
    - _Requirements: 2.1, 4.1, 5.1, 11.1_
  
  - [x] 5.2 Implement feature flags system
    - Create feature flags configuration (ENABLE_PAYMENTS, ENABLE_VIDEO_CONFERENCING, ENABLE_GAMIFICATION)
    - Implement feature flag checking utility
    - Add feature flag middleware for protected routes
    - _Requirements: 15.12_
  
  - [x] 5.3 Set up Redis connection and caching utilities
    - Configure Redis client with connection pooling
    - Create cache utility functions (get, set, delete, clear)
    - Implement cache key namespacing by tenant
    - Configure TTL defaults and cache invalidation strategies
    - _Requirements: 15.13_

- [x] 6. Checkpoint - Verify foundation setup
  - Ensure all tests pass, ask the user if questions arise.

### Phase 2: Core API Layer (Weeks 3-5)

- [x] 7. Implement Programs API
  - [x] 7.1 Create program service layer
    - Implement createProgram, getProgram, updateProgram, deleteProgram, listPrograms methods
    - Add tenant isolation filtering by school_id
    - Implement pagination with default 20 items per page
    - Add caching for program lists with 5-minute TTL
    - _Requirements: 1.1, 1.15, 1.18_

  - [x] 7.2 Create program API routes
    - Create /app/api/programs/route.ts with GET (list) and POST (create) handlers
    - Create /app/api/programs/[id]/route.ts with GET, PUT, DELETE handlers
    - Apply validation middleware with createProgramSchema and updateProgramSchema
    - Apply rate limiting, tenant context, and logging middleware
    - Return consistent API responses with success, data, pagination metadata
    - _Requirements: 1.1, 1.11, 1.16, 1.17_
  
  - [x]* 7.3 Write property test for program API validation
    - **Property 1: API Request Validation**
    - **Validates: Requirements 1.11, 1.12**
  
  - [x]* 7.4 Write unit tests for program service
    - Test createProgram with valid data
    - Test tenant isolation in listPrograms
    - Test pagination logic
    - Test error handling for invalid program IDs
    - _Requirements: 1.1, 1.15, 1.18_

- [x] 8. Implement Courses API
  - [x] 8.1 Create course service layer
    - Implement createCourse, getCourse, updateCourse, deleteCourse, listCourses methods
    - Implement enrollCourse and unenrollCourse methods
    - Add validation for enrollment (check payment if course is paid)
    - Add tenant isolation and pagination
    - _Requirements: 1.2, 1.15, 1.18_
  
  - [x] 8.2 Create course API routes
    - Create /app/api/courses/route.ts with GET and POST handlers
    - Create /app/api/courses/[id]/route.ts with GET, PUT, DELETE handlers
    - Create /app/api/courses/[id]/enroll/route.ts for enrollment
    - Create /app/api/courses/[id]/unenroll/route.ts for unenrollment
    - Apply all middleware (validation, rate limiting, tenant context, logging)
    - _Requirements: 1.2, 1.11, 1.16, 1.17_
  
  - [x]* 8.3 Write property test for tenant isolation
    - **Property 2: Tenant Isolation in API**
    - **Validates: Requirements 1.15, 3.3, 3.4**
  
  - [x]* 8.4 Write unit tests for course service
    - Test course enrollment flow
    - Test unenrollment logic
    - Test access control for paid courses
    - _Requirements: 1.2_

- [x] 9. Implement Lessons API
  - [x] 9.1 Create lesson service layer
    - Implement createLesson, getLesson, updateLesson, deleteLesson, listLessons methods
    - Implement markLessonComplete method to update lesson_progress
    - Track time_spent_minutes and progress_percentage
    - Award points for lesson completion via gamification service
    - _Requirements: 1.3, 13.1_
  
  - [x] 9.2 Create lesson API routes
    - Create /app/api/lessons/route.ts with GET and POST handlers
    - Create /app/api/lessons/[id]/route.ts with GET, PUT, DELETE handlers
    - Create /app/api/lessons/[id]/complete/route.ts for marking completion
    - Apply all middleware
    - _Requirements: 1.3, 1.11, 1.16, 1.17_
  
  - [x]* 9.3 Write unit tests for lesson service
    - Test lesson completion tracking
    - Test progress percentage calculation
    - Test points award on completion
    - _Requirements: 1.3, 13.1_

- [x] 10. Implement Assignments API
  - [x] 10.1 Create assignment service layer
    - Implement createAssignment, getAssignment, updateAssignment, deleteAssignment, listAssignments methods
    - Implement submitAssignment method to create submission records
    - Implement gradeAssignment method to update grades and send notifications
    - Check due dates and calculate late submissions
    - _Requirements: 1.4, 5.6_
  
  - [x] 10.2 Create assignment API routes
    - Create /app/api/assignments/route.ts with GET and POST handlers
    - Create /app/api/assignments/[id]/route.ts with GET, PUT, DELETE handlers
    - Create /app/api/assignments/[id]/submit/route.ts for submissions
    - Create /app/api/assignments/[id]/grade/route.ts for grading
    - Apply all middleware
    - _Requirements: 1.4, 1.11, 1.16, 1.17_
  
  - [x]* 10.3 Write unit tests for assignment service
    - Test assignment submission flow
    - Test grading logic
    - Test late submission detection
    - Test notification on grade publish
    - _Requirements: 1.4, 5.6_

- [x] 11. Implement Attendance API
  - [x] 11.1 Create attendance service layer
    - Implement createAttendance, getAttendance, updateAttendance, listAttendance methods
    - Implement markPresent and markAbsent methods
    - Calculate attendance percentages per student per course
    - _Requirements: 1.6_

  - [x] 11.2 Create attendance API routes
    - Create /app/api/attendance/route.ts with GET and POST handlers
    - Create /app/api/attendance/[id]/route.ts with GET and PUT handlers
    - Create /app/api/attendance/[id]/mark-present/route.ts
    - Create /app/api/attendance/[id]/mark-absent/route.ts
    - Apply all middleware
    - _Requirements: 1.6, 1.11, 1.16, 1.17_
  
  - [x]* 11.3 Write unit tests for attendance service
    - Test attendance marking
    - Test attendance percentage calculation
    - _Requirements: 1.6_

- [x] 12. Implement Grades API
  - [x] 12.1 Create grades service layer
    - Implement createGrade, getGrade, updateGrade, listGrades methods
    - Implement calculateGPA method using weighted average
    - Send notification when grade is published
    - _Requirements: 1.7, 5.5_
  
  - [x] 12.2 Create grades API routes
    - Create /app/api/grades/route.ts with GET and POST handlers
    - Create /app/api/grades/calculate-gpa/route.ts for GPA calculation
    - Apply all middleware
    - _Requirements: 1.7, 1.11, 1.16, 1.17_
  
  - [x]* 12.3 Write unit tests for grades service
    - Test GPA calculation with various grade weights
    - Test grade notification sending
    - _Requirements: 1.7, 5.5_

- [x] 13. Implement Announcements API
  - [x] 13.1 Create announcements service layer
    - Implement createAnnouncement, getAnnouncement, updateAnnouncement, deleteAnnouncement, listAnnouncements methods
    - Send notifications to all enrolled learners when announcement is published
    - Filter by target_audience (all, students, teachers, course_specific)
    - _Requirements: 1.8, 5.4_
  
  - [x] 13.2 Create announcements API routes
    - Create /app/api/announcements/route.ts with GET and POST handlers
    - Create /app/api/announcements/[id]/route.ts with GET, PUT, DELETE handlers
    - Apply all middleware
    - _Requirements: 1.8, 1.11, 1.16, 1.17_
  
  - [x]* 13.3 Write unit tests for announcements service
    - Test announcement creation and notification sending
    - Test target audience filtering
    - _Requirements: 1.8, 5.4_

- [x] 14. Checkpoint - Verify core API layer
  - Ensure all tests pass, ask the user if questions arise.

### Phase 3: File Management (Week 6)

- [x] 15. Implement file storage service
  - [x] 15.1 Create file service with S3/Cloudinary integration
    - Implement uploadFile method with multipart upload support
    - Validate file type against allowed types (pdf, doc, docx, ppt, pptx, mp4, mp3, jpg, png, zip)
    - Validate file size (max 500MB)
    - Generate unique filename and storage path with tenant prefix
    - Store file metadata in files table
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.6_
  
  - [x] 15.2 Implement resumable uploads for large files
    - Add support for multipart upload for files > 50MB
    - Track upload progress and allow resume on failure
    - Store upload session state in Redis
    - _Requirements: 2.6_
  
  - [x] 15.3 Implement virus scanning integration
    - Integrate with ClamAV or cloud-based virus scanning service
    - Scan files before making them available
    - Update is_virus_scanned and virus_scan_result fields
    - Quarantine infected files
    - _Requirements: 2.9_
  
  - [x] 15.4 Implement signed URL generation
    - Create generateSignedUrl method with 1-hour expiration
    - Use S3 presigned URLs or Cloudinary signed URLs
    - Track download counts when URLs are accessed
    - _Requirements: 2.7, 2.13_
  
  - [x]* 15.5 Write property test for file type validation
    - **Property 5: File Type Validation**
    - **Validates: Requirements 2.2**
  
  - [x]* 15.6 Write property test for file size validation
    - **Property 6: File Size Validation**
    - **Validates: Requirements 2.3**
  
  - [x]* 15.7 Write property test for signed URL expiration
    - **Property 7: Signed URL Expiration**
    - **Validates: Requirements 2.7**

- [x] 16. Implement media processing
  - [x] 16.1 Create thumbnail generation service
    - Generate thumbnails for image files (jpg, png) within 30 seconds
    - Store thumbnail URLs in files table
    - Use Sharp library for image processing
    - _Requirements: 2.10_
  
  - [x] 16.2 Create video processing service
    - Generate preview images for video files within 2 minutes
    - Transcode videos to multiple resolutions (360p, 720p, 1080p)
    - Use FFmpeg or cloud-based transcoding service
    - Store transcoded video URLs in metadata JSONB field
    - _Requirements: 2.11, 2.12_

  - [x]* 16.3 Write unit tests for media processing
    - Test thumbnail generation for images
    - Test video transcoding
    - Test error handling for corrupt files
    - _Requirements: 2.10, 2.11, 2.12_

- [x] 17. Implement file deduplication
  - [x] 17.1 Add content hash calculation
    - Calculate SHA-256 hash for uploaded files
    - Check for existing files with same hash before uploading
    - Create reference records instead of duplicate storage
    - _Requirements: 2.14_
  
  - [x]* 17.2 Write property test for file deduplication
    - **Property 8: File Deduplication**
    - **Validates: Requirements 2.14**

- [x] 18. Create file API routes
  - [x] 18.1 Create file upload and management endpoints
    - Create /app/api/files/upload/route.ts for file uploads
    - Create /app/api/files/[id]/route.ts for GET and DELETE
    - Create /app/api/files/signed-url/route.ts for generating signed URLs
    - Apply all middleware including file size validation
    - _Requirements: 2.1, 2.2, 2.3, 2.7, 2.8_
  
  - [x]* 18.2 Write unit tests for file API
    - Test file upload flow
    - Test file deletion (storage and database)
    - Test signed URL generation
    - _Requirements: 2.1, 2.7, 2.8_

- [x] 19. Checkpoint - Verify file management
  - Ensure all tests pass, ask the user if questions arise.

### Phase 4: Payment Integration (Week 7)

- [x] 20. Implement payment service
  - [x] 20.1 Create Stripe integration
    - Implement createCheckoutSession for Stripe
    - Configure Stripe with public and secret keys
    - Create checkout session with course details and pricing
    - Store transaction record with status 'pending'
    - _Requirements: 4.1, 4.2_
  
  - [x] 20.2 Create Paystack integration
    - Implement createCheckoutSession for Paystack
    - Configure Paystack with public and secret keys
    - Initialize transaction and get authorization URL
    - Store transaction record with status 'pending'
    - _Requirements: 4.1, 4.2_
  
  - [x] 20.3 Implement webhook handler
    - Create webhook verification using HMAC signature
    - Parse webhook payload for payment events
    - Update transaction status based on webhook event
    - Grant course access on successful payment within 5 seconds
    - Send payment confirmation notification
    - _Requirements: 4.3, 4.4, 4.5, 4.6_

  - [x]* 20.4 Write property test for webhook signature verification
    - **Property 11: Payment Webhook Signature Verification**
    - **Validates: Requirements 4.4**
  
  - [x]* 20.5 Write property test for course access grant
    - **Property 12: Course Access Grant After Payment**
    - **Validates: Requirements 4.5**

- [x] 21. Implement subscription management
  - [x] 21.1 Create subscription service
    - Implement createSubscription for recurring payments
    - Handle subscription webhook events (created, renewed, cancelled, expired)
    - Revoke course access within 24 hours of subscription expiration
    - _Requirements: 4.8, 4.9_
  
  - [x]* 21.2 Write unit tests for subscription service
    - Test subscription creation
    - Test access revocation on expiration
    - _Requirements: 4.8, 4.9_

- [x] 22. Implement refund processing
  - [x] 22.1 Create refund service
    - Implement processRefund method calling payment gateway
    - Update transaction status to 'refunded'
    - Revoke course access immediately on refund
    - Send refund confirmation notification
    - _Requirements: 4.10, 4.11_
  
  - [x]* 22.2 Write property test for access revocation on refund
    - **Property 13: Course Access Revocation After Refund**
    - **Validates: Requirements 4.11**

- [x] 23. Implement payment receipts and analytics
  - [x] 23.1 Create receipt generation service
    - Generate PDF receipts with transaction details
    - Include school branding and logo
    - Store receipt URL in transaction record
    - _Requirements: 4.12_
  
  - [x] 23.2 Create revenue analytics dashboard
    - Calculate total revenue, revenue by course, revenue by period
    - Display payment success/failure rates
    - Show subscription metrics (active, cancelled, churned)
    - _Requirements: 4.13_
  
  - [x]* 23.3 Write unit tests for receipt generation
    - Test PDF generation with transaction data
    - Test receipt storage and retrieval
    - _Requirements: 4.12_

- [x] 24. Create payment API routes
  - [x] 24.1 Create payment endpoints
    - Create /app/api/payments/checkout/route.ts for initiating payments
    - Create /app/api/payments/webhook/route.ts for webhook handling
    - Create /app/api/payments/[id]/route.ts for transaction details
    - Apply validation and logging middleware (skip rate limiting for webhooks)
    - _Requirements: 4.2, 4.3, 4.7_
  
  - [x]* 24.2 Write integration tests for payment flow
    - Test full checkout to enrollment flow
    - Test webhook processing
    - Test refund flow
    - _Requirements: 4.2, 4.5, 4.11_

- [x] 25. Checkpoint - Verify payment integration
  - Ensure all tests pass, ask the user if questions arise.

### Phase 5: Notification System (Week 8)

- [x] 26. Implement email and SMS notification service with SendPulse
  - [x] 26.1 Create SendPulse integration
    - Configure SendPulse client with API ID and Secret
    - Implement sendEmail method using SendPulse SMTP/REST API
    - Implement sendSMS method using SendPulse SMS API
    - Add retry logic with exponential backoff (3 attempts)
    - Log delivery status and update notifications table
    - _Requirements: 5.1, 5.2, 5.10, 5.11_
  
  - [x]* 26.2 Write property test for notification retry logic
    - **Property 15: Notification Retry Logic**
    - **Validates: Requirements 5.10**

- [x] 28. Implement notification templates
  - [x] 28.1 Create email templates
    - Create templates for assignment reminders, grade notifications, announcements, course availability
    - Implement variable substitution ({{student_name}}, {{course_title}}, etc.)
    - Support tenant-specific branding (logo, colors)
    - _Requirements: 5.12, 5.13_
  
  - [x] 28.2 Create SMS templates
    - Create concise SMS templates for key notifications
    - Implement variable substitution
    - Keep messages under 160 characters
    - _Requirements: 5.12_

- [x] 29. Implement notification queue and processing
  - [x] 29.1 Create notification queue service
    - Implement queueNotification method to add to Redis queue
    - Create background worker to process queue asynchronously
    - Process notifications in batches for efficiency
    - _Requirements: 5.9_
  
  - [x] 29.2 Implement notification triggers
    - Trigger assignment due date reminders (24 hours before)
    - Trigger announcement notifications (within 5 minutes)
    - Trigger grade publication notifications (immediately)
    - Trigger course availability notifications
    - Trigger discussion reply notifications
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x]* 29.3 Write property test for assignment reminders
    - **Property 14: Assignment Due Date Reminders**
    - **Validates: Requirements 5.3**

- [x] 30. Implement notification preferences
  - [x] 30.1 Create notification preferences service
    - Implement getUserPreferences and updatePreferences methods
    - Check preferences before sending notifications
    - Respect opt-out for marketing notifications
    - _Requirements: 5.8, 5.14_
  
  - [x] 30.2 Create notification preferences API
    - Create /app/api/notifications/preferences/route.ts for GET and PUT
    - Allow users to configure email, SMS, push, in-app preferences
    - _Requirements: 5.8_
  
  - [x]* 30.3 Write unit tests for notification preferences
    - Test preference checking before sending
    - Test opt-out functionality
    - _Requirements: 5.8, 5.14_

- [x] 31. Implement notification tracking
  - [x] 31.1 Add open rate and click-through tracking
    - Embed tracking pixels in emails for open tracking
    - Use tracked links for click-through tracking
    - Store metrics in notifications table
    - _Requirements: 5.15_
  
  - [x]* 31.2 Write unit tests for notification tracking
    - Test tracking pixel generation
    - Test link tracking
    - _Requirements: 5.15_

- [x] 32. Create notifications API routes
  - [x] 32.1 Create notification endpoints
    - Create /app/api/notifications/route.ts for listing user notifications
    - Create /app/api/notifications/[id]/route.ts for GET
    - Create /app/api/notifications/[id]/mark-read/route.ts for marking as read
    - Apply all middleware
    - _Requirements: 1.17_
  
  - [x]* 32.2 Write integration tests for notification flow
    - Test end-to-end notification sending
    - Test retry on failure
    - Test preference checking
    - _Requirements: 5.3, 5.8, 5.10_

- [x] 33. Checkpoint - Verify notification system
  - Ensure all tests pass, ask the user if questions arise.

### Phase 6: CBT Engine (Weeks 9-10)

- [x] 34. Implement exam management service
  - [x] 34.1 Create exam service
    - Implement createExam, getExam, updateExam, deleteExam, listExams methods
    - Validate exam configuration (duration, scoring, attempts)
    - Add tenant isolation
    - _Requirements: 6.1_

  - [x] 34.2 Create question bank service
    - Implement createQuestion, getQuestion, updateQuestion, deleteQuestion methods
    - Support multiple question types (multiple_choice, true_false, short_answer, essay, matching, fill_in_blank)
    - Store correct answers and explanations
    - _Requirements: 6.1, 6.11_
  
  - [x]* 34.3 Write unit tests for exam service
    - Test exam creation with various configurations
    - Test question bank management
    - _Requirements: 6.1, 6.11_

- [x] 35. Implement exam taking flow
  - [x] 35.1 Create exam start service
    - Implement startExam method to create exam_attempts record
    - Randomize question order if randomize_questions is enabled
    - Randomize answer options if randomize_options is enabled
    - Record start time
    - _Requirements: 6.2, 6.5, 6.6_
  
  - [x] 35.2 Implement auto-save functionality
    - Save exam answers to exam_attempts.answers JSONB field every 30 seconds
    - Use optimistic updates on client side
    - Handle concurrent save conflicts
    - _Requirements: 6.4_
  
  - [x] 35.3 Implement exam timer and auto-submit
    - Track elapsed time on server side
    - Auto-submit exam when duration_minutes is reached
    - Handle edge cases (browser close, network disconnect)
    - _Requirements: 6.3_
  
  - [x]* 35.4 Write property test for exam auto-submission
    - **Property 16: Exam Auto-Submission on Timeout**
    - **Validates: Requirements 6.3**
  
  - [x]* 35.5 Write property test for question randomization
    - **Property 17: Exam Question Randomization**
    - **Validates: Requirements 6.5**

- [x] 36. Implement cheating detection
  - [x] 36.1 Add browser control and monitoring
    - Prevent browser back button during exam (client-side)
    - Detect tab switching using visibility API
    - Increment tab_switches counter in exam_attempts
    - Log suspicious activity
    - _Requirements: 6.9, 6.10_
  
  - [x]* 36.2 Write unit tests for cheating detection
    - Test tab switch detection
    - Test suspicious activity logging
    - _Requirements: 6.9, 6.10_

- [x] 37. Implement automatic grading
  - [x] 37.1 Create grading service for objective questions
    - Implement gradeExam method for automatic grading
    - Grade multiple_choice by comparing selected option to correct_answer
    - Grade true_false by direct comparison
    - Grade matching by comparing pairs
    - Grade fill_in_blank by string comparison (case-insensitive, trimmed)
    - Calculate total score and percentage
    - _Requirements: 6.7_

  - [x] 37.2 Implement manual grading interface
    - Flag essay and short_answer questions for manual grading
    - Create instructor interface to review and grade subjective questions
    - Support partial credit assignment
    - Allow instructors to override automatic grades
    - _Requirements: 6.8, 6.14, 6.15_
  
  - [x]* 37.3 Write property test for automatic grading
    - **Property 18: Automatic Grading of Objective Questions**
    - **Validates: Requirements 6.7**

- [x] 38. Implement exam attempts and retakes
  - [x] 38.1 Create attempt tracking service
    - Track attempt_number for each exam submission
    - Enforce max_attempts limit
    - Record highest score across all attempts
    - _Requirements: 6.16, 6.17_
  
  - [x]* 38.2 Write property test for highest score recording
    - **Property 19: Highest Score Recording**
    - **Validates: Requirements 6.17**

- [x] 39. Implement exam analytics
  - [x] 39.1 Create exam statistics service
    - Calculate average score, pass rate per exam
    - Calculate question difficulty (percentage of correct answers)
    - Generate detailed score reports for students
    - _Requirements: 6.12, 6.13_
  
  - [x]* 39.2 Write unit tests for exam analytics
    - Test average score calculation
    - Test pass rate calculation
    - Test question difficulty analysis
    - _Requirements: 6.12_

- [x] 40. Create exam API routes
  - [x] 40.1 Create exam management endpoints
    - Create /app/api/exams/route.ts for GET and POST
    - Create /app/api/exams/[id]/route.ts for GET, PUT, DELETE
    - Create /app/api/exams/[id]/start/route.ts for starting exam
    - Create /app/api/exams/[id]/submit/route.ts for submitting exam
    - Create /app/api/exams/[id]/grade/route.ts for manual grading
    - Apply all middleware
    - _Requirements: 1.5_
  
  - [x]* 40.2 Write integration tests for exam flow
    - Test complete exam taking flow (start, answer, submit, grade)
    - Test auto-submit on timeout
    - Test attempt limits
    - _Requirements: 6.2, 6.3, 6.16_

- [x] 41. Checkpoint - Verify CBT engine
  - Ensure all tests pass, ask the user if questions arise.

### Phase 7: Real-Time Features (Week 11)

- [x] 42. Set up WebSocket server
  - [x] 42.1 Configure WebSocket server
    - Set up Socket.io or native WebSocket server
    - Configure CORS and connection limits
    - Implement connection pooling
    - _Requirements: 7.1_

  - [x] 42.2 Implement WebSocket authentication
    - Verify JWT token on connection attempt
    - Reject connections without valid token
    - Extract user_id and school_id from token
    - _Requirements: 7.13_
  
  - [x]* 42.3 Write property test for WebSocket authentication
    - **Property 21: WebSocket Authentication**
    - **Validates: Requirements 7.13**

- [x] 43. Implement real-time notification delivery
  - [x] 43.1 Create notification push service
    - Establish WebSocket connection on user login
    - Push notifications to connected users within 1 second
    - Handle offline users by storing notifications in database
    - _Requirements: 7.2, 7.3_
  
  - [x] 43.2 Implement connection management
    - Handle connection drops with exponential backoff reconnection
    - Maintain connection state across page navigation
    - Clean up stale connections
    - _Requirements: 7.5, 7.12_
  
  - [x]* 43.3 Write property test for real-time notification delivery
    - **Property 20: Real-Time Notification Delivery**
    - **Validates: Requirements 7.3**

- [x] 44. Implement presence detection
  - [x] 44.1 Create presence service
    - Track online/offline status for users
    - Mark users as away after 5 minutes of inactivity
    - Broadcast presence changes to relevant users
    - _Requirements: 7.6, 7.8, 7.9_
  
  - [x]* 44.2 Write unit tests for presence detection
    - Test online/offline status tracking
    - Test away status after inactivity
    - _Requirements: 7.6, 7.9_

- [x] 45. Implement real-time messaging
  - [x] 45.1 Create messaging service
    - Deliver messages in real-time to recipients
    - Show typing indicators
    - Store message history in database
    - _Requirements: 7.4, 7.7_
  
  - [x]* 45.2 Write unit tests for messaging
    - Test message delivery
    - Test typing indicators
    - _Requirements: 7.4, 7.7_

- [x] 46. Implement tenant isolation for real-time events
  - [x] 46.1 Add tenant filtering to WebSocket events
    - Filter events by school_id before broadcasting
    - Ensure users only receive events from their tenant
    - _Requirements: 7.14_
  
  - [x]* 46.2 Write property test for real-time tenant isolation
    - **Property 22: Real-Time Tenant Isolation**
    - **Validates: Requirements 7.14**

- [x] 47. Implement live quiz results broadcasting
  - [x] 47.1 Create live quiz service
    - Broadcast quiz results in real-time during class sessions
    - Show leaderboard updates as students submit answers
    - _Requirements: 7.10_
  
  - [x]* 47.2 Write unit tests for live quiz broadcasting
    - Test result broadcasting
    - Test leaderboard updates
    - _Requirements: 7.10_

- [x] 48. Checkpoint - Verify real-time features
  - Ensure all tests pass, ask the user if questions arise.

### Phase 8: Discussion Forums (Week 12)

- [x] 49. Implement discussion forum service
  - [x] 49.1 Create discussion topic service
    - Implement createTopic, getTopic, updateTopic, deleteTopic, listTopics methods
    - Send notifications to all course participants when topic is created
    - Support pinning and locking topics (instructor only)
    - Track view counts
    - _Requirements: 8.1, 8.2, 8.9, 8.10_
  
  - [x] 49.2 Create discussion reply service
    - Implement createReply, getReply, updateReply, deleteReply methods
    - Support threaded replies with parent_reply_id
    - Send notification to original poster on reply
    - _Requirements: 8.3, 8.7_
  
  - [x]* 49.3 Write unit tests for discussion service
    - Test topic creation and notification
    - Test threaded replies
    - Test pinning and locking
    - _Requirements: 8.1, 8.2, 8.9, 8.10_

- [x] 50. Implement discussion voting and resolution
  - [x] 50.1 Create voting service
    - Implement upvote and downvote functionality for topics and replies
    - Track upvote counts
    - Calculate user reputation scores based on upvotes received
    - _Requirements: 8.4, 8.12_
  
  - [x] 50.2 Implement resolution marking
    - Allow users to mark topics as resolved
    - Allow instructors to mark replies as accepted answers
    - _Requirements: 8.5_
  
  - [x]* 50.3 Write unit tests for voting and resolution
    - Test upvoting logic
    - Test reputation calculation
    - Test resolution marking
    - _Requirements: 8.4, 8.5, 8.12_

- [x] 51. Implement rich text support
  - [x] 51.1 Add rich text editor integration
    - Integrate Tiptap or similar rich text editor
    - Support bold, italic, lists, links, code blocks
    - Sanitize HTML to prevent XSS attacks
    - _Requirements: 8.6_
  
  - [x] 51.2 Implement file attachments
    - Allow file attachments up to 10MB in discussion posts
    - Link attachments to discussion_attachments table
    - Display attachments with download links
    - _Requirements: 8.7_
  
  - [x]* 51.3 Write property test for rich text preservation
    - **Property 23: Rich Text Preservation**
    - **Validates: Requirements 8.6**

- [x] 52. Implement discussion features
  - [x] 52.1 Add @mentions functionality
    - Parse @username mentions in post content
    - Send notifications to mentioned users
    - Highlight mentions in UI
    - _Requirements: 8.8_
  
  - [x] 52.2 Implement discussion search
    - Add full-text search across topics and replies
    - Support filtering by course, author, date range
    - _Requirements: 8.11_

  - [x] 52.3 Implement subscription to topics
    - Allow users to subscribe to topics for notifications
    - Send notifications on new replies to subscribed topics
    - _Requirements: 8.13_
  
  - [x]* 52.4 Write unit tests for discussion features
    - Test @mentions and notifications
    - Test search functionality
    - Test topic subscriptions
    - _Requirements: 8.8, 8.11, 8.13_

- [x] 53. Implement moderation features
  - [x] 53.1 Create moderation service
    - Allow instructors to edit any post in their courses
    - Allow instructors to delete inappropriate posts
    - Implement flagging system for inappropriate content
    - Log all moderation actions
    - _Requirements: 8.14_
  
  - [x]* 53.2 Write unit tests for moderation
    - Test instructor edit permissions
    - Test post deletion
    - Test flagging system
    - _Requirements: 8.14_

- [x] 54. Create discussion API routes
  - [x] 54.1 Create discussion endpoints
    - Create /app/api/discussions/route.ts for GET and POST
    - Create /app/api/discussions/[id]/route.ts for GET, PUT, DELETE
    - Create /app/api/discussions/[id]/reply/route.ts for posting replies
    - Apply all middleware
    - _Requirements: 1.9_
  
  - [x]* 54.2 Write integration tests for discussion flow
    - Test topic creation and reply flow
    - Test voting and resolution
    - Test moderation actions
    - _Requirements: 8.1, 8.3, 8.4, 8.14_

- [x] 55. Implement discussion dashboard widget
  - [x] 55.1 Create most active topics widget
    - Display top 5 most active topics on course dashboard
    - Sort by reply count and recent activity
    - _Requirements: 8.15_

- [x] 56. Checkpoint - Verify discussion forums
  - Ensure all tests pass, ask the user if questions arise.

### Phase 9: Certificates & Gamification (Week 13)

- [x] 57. Implement certificate generation
  - [x] 57.1 Create certificate service
    - Detect course completion (all lessons, assignments, exams completed with passing grades)
    - Generate unique certificate_number and verification_code
    - Create certificate record in database
    - _Requirements: 9.1, 9.2_
  
  - [x] 57.2 Implement PDF generation
    - Use PDFKit or similar library to generate certificate PDFs
    - Include learner name, course name, completion date, instructor signature
    - Support tenant-specific templates with custom branding
    - Store PDF URL in certificates table
    - _Requirements: 9.2, 9.3, 9.5_

  - [x] 57.3 Implement digital signatures
    - Add cryptographic signature to certificates for authenticity
    - Store signature in certificate metadata
    - _Requirements: 9.13_
  
  - [x]* 57.4 Write property test for automatic certificate issuance
    - **Property 24: Automatic Certificate Issuance**
    - **Validates: Requirements 9.1**

- [x] 58. Implement certificate verification
  - [x] 58.1 Create public verification page
    - Create public endpoint /verify/[verification_code]
    - Display certificate details (learner name, course, date) for valid codes
    - Return 404 for invalid codes
    - _Requirements: 9.4_
  
  - [x]* 58.2 Write property test for certificate verification
    - **Property 25: Certificate Verification**
    - **Validates: Requirements 9.4**

- [x] 59. Implement certificate sharing
  - [x] 59.1 Add download and sharing features
    - Allow learners to download certificates from profile
    - Generate social media share links (LinkedIn, Twitter, Facebook)
    - Include Open Graph meta tags for rich previews
    - _Requirements: 9.6, 9.7_
  
  - [x]* 59.2 Write unit tests for certificate sharing
    - Test download functionality
    - Test social share link generation
    - _Requirements: 9.6, 9.7_

- [x] 60. Implement badge system
  - [x] 60.1 Create badge service
    - Implement createBadge, getBadge, updateBadge, listBadges methods
    - Support custom badge creation by school admins
    - Define badge criteria in JSONB (e.g., {type: 'first_course_complete'})
    - _Requirements: 9.8, 9.10_
  
  - [x] 60.2 Implement badge awarding logic
    - Check badge criteria on relevant events (course complete, quiz perfect score, etc.)
    - Award badges automatically when criteria met
    - Create user_badges record
    - Send congratulatory notification
    - _Requirements: 9.8, 9.12_
  
  - [x] 60.3 Implement badge progress tracking
    - Calculate progress toward badge criteria
    - Display progress percentage on learner profile
    - _Requirements: 9.11_
  
  - [x]* 60.4 Write unit tests for badge system
    - Test badge awarding logic
    - Test progress calculation
    - Test notification sending
    - _Requirements: 9.8, 9.11, 9.12_

- [x] 61. Implement gamification points system
  - [x] 61.1 Create points service
    - Award points for lesson completion, assignment submission, discussion participation
    - Award bonus points for early assignment submission
    - Track points in user_points table
    - Create point_transactions for audit trail
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 61.2 Implement achievement levels
    - Define achievement levels (Bronze, Silver, Gold, Platinum) with point thresholds
    - Update achievement_level when thresholds reached
    - Send notification on level up
    - _Requirements: 13.6, 13.11_

- [x] 62. Implement leaderboards
  - [x] 62.1 Create leaderboard service
    - Calculate leaderboard rankings per course
    - Update leaderboards in real-time as points are earned
    - Support configurable reset periods (weekly, monthly, semester)
    - _Requirements: 13.4, 13.13_
  
  - [x] 62.2 Implement leaderboard display
    - Display top point earners on course dashboard
    - Show learner's rank and total points on profile
    - Allow opt-out from public leaderboard display
    - _Requirements: 13.4, 13.5, 13.12_
  
  - [x] 62.3 Award leaderboard badges
    - Award special badges for top 3 positions
    - Award at end of leaderboard period
    - _Requirements: 13.14_
  
  - [x]* 62.4 Write unit tests for leaderboards
    - Test ranking calculation
    - Test leaderboard reset
    - Test opt-out functionality
    - _Requirements: 13.4, 13.12, 13.13_

- [x] 63. Implement streak tracking
  - [x] 63.1 Create streak service
    - Track consecutive daily logins
    - Increment current_streak on daily login
    - Update longest_streak if current exceeds it
    - Reset current_streak if login gap > 1 day
    - Award streak bonuses at milestones (7, 30, 100 days)
    - _Requirements: 13.7_
  
  - [x]* 63.2 Write property test for login streak calculation
    - **Property 31: Login Streak Calculation**
    - **Validates: Requirements 13.7**

- [x] 64. Implement team competitions
  - [x] 64.1 Create team competition service
    - Support team-based competitions with combined scores
    - Calculate team rankings
    - Display team leaderboards
    - _Requirements: 13.10_
  
  - [x]* 64.2 Write unit tests for team competitions
    - Test team score calculation
    - Test team rankings
    - _Requirements: 13.10_

- [x] 65. Create certificates and gamification API routes
  - [x] 65.1 Create certificate endpoints
    - Create /app/api/certificates/route.ts for GET (list)
    - Create /app/api/certificates/[id]/route.ts for GET
    - Create /app/api/certificates/generate/route.ts for manual generation
    - Apply all middleware
    - _Requirements: 1.10_

  - [x] 65.2 Create gamification endpoints
    - Create /app/api/gamification/points/route.ts for points history
    - Create /app/api/gamification/leaderboard/route.ts for leaderboard data
    - Create /app/api/gamification/badges/route.ts for badge management
    - Apply all middleware
  
  - [x]* 65.3 Write integration tests for certificates and gamification
    - Test certificate generation on course completion
    - Test points award on activity completion
    - Test leaderboard updates
    - _Requirements: 9.1, 13.1, 13.4_

- [x] 66. Checkpoint - Verify certificates and gamification
  - Ensure all tests pass, ask the user if questions arise.

### Phase 10: Analytics & Reporting (Week 14)

- [x] 67. Implement engagement tracking
  - [x] 67.1 Create analytics tracking service
    - Track login frequency and session duration
    - Track content consumption (videos watched, documents read, time per lesson)
    - Store analytics data in dedicated tables or time-series database
    - _Requirements: 10.1, 10.2_
  
  - [x] 67.2 Implement video engagement tracking
    - Track video play events, completion percentage, drop-off points
    - Store engagement data in lesson_progress or separate analytics table
    - _Requirements: 10.13_
  
  - [x]* 67.3 Write property test for video engagement tracking
    - **Property 26: Video Engagement Tracking**
    - **Validates: Requirements 10.13**

- [x] 68. Implement performance analytics
  - [x] 68.1 Create performance analytics service
    - Calculate course completion rates per cohort
    - Calculate assignment submission rates and average grades
    - Calculate average time to complete each lesson
    - Identify difficult content based on learner performance
    - _Requirements: 10.3, 10.7, 10.8, 10.9_
  
  - [x]* 68.2 Write unit tests for performance analytics
    - Test completion rate calculation
    - Test average grade calculation
    - Test difficult content identification
    - _Requirements: 10.3, 10.7, 10.8_

- [x] 69. Implement at-risk learner detection
  - [x] 69.1 Create at-risk detection service
    - Define at-risk criteria (low engagement, poor performance, missed deadlines)
    - Calculate risk scores for learners
    - Flag at-risk learners for instructor attention
    - _Requirements: 10.4_
  
  - [x]* 69.2 Write unit tests for at-risk detection
    - Test risk score calculation
    - Test flagging logic
    - _Requirements: 10.4_

- [x] 70. Implement analytics dashboards
  - [x] 70.1 Create instructor analytics dashboard
    - Display key metrics (enrollment, completion rate, average grade)
    - Show at-risk learners list
    - Display content difficulty heatmap
    - Show activity heatmap (when learners are most active)
    - _Requirements: 10.4, 10.5, 10.6, 10.8_

  - [x] 70.2 Create learner analytics dashboard
    - Display individual progress and performance
    - Show comparative analytics (class average vs individual)
    - Display time spent per lesson
    - Show achievement progress
    - _Requirements: 10.2, 10.9, 10.10_
  
  - [x] 70.3 Create real-time dashboard widgets
    - Implement real-time updates for key metrics
    - Use WebSocket for live data updates
    - _Requirements: 10.12_

- [x] 71. Implement analytics reports
  - [x] 71.1 Create report generation service
    - Generate weekly progress reports for instructors
    - Generate exportable reports in CSV and PDF formats
    - Support custom date range filtering
    - _Requirements: 10.5, 10.11, 10.14_
  
  - [x]* 71.2 Write unit tests for report generation
    - Test CSV export
    - Test PDF export
    - Test date range filtering
    - _Requirements: 10.11, 10.14_

- [x] 72. Implement predictive analytics
  - [x] 72.1 Create predictive analytics service
    - Use historical data to predict course completion likelihood
    - Calculate probability based on engagement patterns
    - Display predictions on instructor dashboard
    - _Requirements: 10.15_
  
  - [x]* 72.2 Write unit tests for predictive analytics
    - Test completion likelihood calculation
    - Test prediction accuracy
    - _Requirements: 10.15_

- [x] 73. Create analytics API routes
  - [x] 73.1 Create analytics endpoints
    - Create /app/api/analytics/overview/route.ts for dashboard data
    - Create /app/api/analytics/student/[id]/route.ts for individual analytics
    - Create /app/api/analytics/course/[id]/route.ts for course analytics
    - Apply all middleware
  
  - [x]* 73.2 Write integration tests for analytics
    - Test analytics data collection
    - Test dashboard data retrieval
    - Test report generation
    - _Requirements: 10.1, 10.5, 10.11_

- [x] 74. Checkpoint - Verify analytics and reporting
  - Ensure all tests pass, ask the user if questions arise.

### Phase 11: Video Conferencing (Week 15)

- [ ] 75. Implement video conferencing integration
  - [ ] 75.1 Create Zoom integration
    - Configure Zoom API client with credentials
    - Implement createMeeting method to create Zoom meetings
    - Store meeting_url, meeting_id, meeting_password in live_sessions table
    - _Requirements: 11.1, 11.2_

  - [ ] 75.2 Create Google Meet integration
    - Configure Google Meet API client
    - Implement createMeeting method for Google Meet
    - Store meeting details
    - _Requirements: 11.1, 11.2_
  
  - [ ] 75.3 Create Microsoft Teams integration
    - Configure Microsoft Teams API client
    - Implement createMeeting method for Teams
    - Store meeting details
    - _Requirements: 11.1, 11.2_
  
  - [ ]* 75.4 Write property test for meeting creation
    - **Property 27: Live Session Meeting Creation**
    - **Validates: Requirements 11.2**

- [ ] 76. Implement live session scheduling
  - [ ] 76.1 Create live session service
    - Implement scheduleLiveSession method
    - Create meeting with video conferencing provider
    - Send calendar invitations to enrolled learners
    - Store session details in live_sessions table
    - _Requirements: 11.2, 11.3_
  
  - [x] 76.2 Implement session reminders
    - Send reminder notifications 15 minutes before session starts
    - Display upcoming sessions on course dashboard
    - _Requirements: 11.4, 11.14_
  
  - [ ]* 76.3 Write unit tests for session scheduling
    - Test meeting creation
    - Test calendar invitation sending
    - Test reminder notifications
    - _Requirements: 11.2, 11.3, 11.14_

- [ ] 77. Implement live session joining
  - [x] 77.1 Create join session interface
    - Display join button when session is live
    - Launch video conference in new window or embedded iframe
    - Record attendance when user joins
    - _Requirements: 11.5, 11.6_
  
  - [ ]* 77.2 Write unit tests for session joining
    - Test join button display logic
    - Test attendance recording
    - _Requirements: 11.5, 11.6_

- [ ] 78. Implement session recording
  - [ ] 78.1 Create recording management service
    - Enable automatic recording for sessions
    - Retrieve recording URL from provider after session ends
    - Store recording_url in live_sessions table
    - Make recording available within 1 hour
    - Display recordings in course content library
    - _Requirements: 11.7, 11.8, 11.9_
  
  - [ ]* 78.2 Write unit tests for recording management
    - Test recording retrieval
    - Test recording availability
    - _Requirements: 11.7, 11.8_

- [ ] 79. Implement advanced session features
  - [x] 79.1 Add breakout rooms support
    - Configure breakout rooms for group activities
    - Manage breakout room assignments
    - _Requirements: 11.10_

  - [ ] 79.2 Add screen sharing support
    - Enable screen sharing during sessions
    - Configure permissions
    - _Requirements: 11.11_
  
  - [ ] 79.3 Add live polls and quizzes
    - Integrate polling functionality during sessions
    - Display results in real-time
    - _Requirements: 11.12_

- [ ] 80. Implement attendance tracking
  - [x] 80.1 Create attendance tracking service
    - Record joined_at timestamp when user joins
    - Record left_at timestamp when user leaves
    - Calculate duration_minutes
    - Store in live_session_attendance table
    - _Requirements: 11.6, 11.13_
  
  - [ ]* 80.2 Write unit tests for attendance tracking
    - Test join/leave timestamp recording
    - Test duration calculation
    - _Requirements: 11.6, 11.13_

- [ ] 81. Create video conferencing API routes
  - [x] 81.1 Create live session endpoints
    - Create /app/api/live-sessions/route.ts for GET and POST
    - Create /app/api/live-sessions/[id]/route.ts for GET, PUT, DELETE
    - Create /app/api/live-sessions/[id]/join/route.ts for joining
    - Apply all middleware
  
  - [ ]* 81.2 Write integration tests for video conferencing
    - Test session scheduling flow
    - Test meeting creation
    - Test attendance tracking
    - _Requirements: 11.2, 11.6_

- [ ] 82. Checkpoint - Verify video conferencing
  - Ensure all tests pass, ask the user if questions arise.

### Phase 12: Content Library (Week 16)

- [ ] 83. Implement content library service
  - [x] 83.1 Create content library management
    - Implement createContent, getContent, updateContent, deleteContent, listContent methods
    - Support categorization by subject, grade level, content type
    - Add tenant isolation (school_id)
    - _Requirements: 12.1, 12.2_
  
  - [x] 83.2 Implement content upload
    - Allow instructors to upload content to library
    - Link to files table for storage
    - Store metadata (title, description, tags, category)
    - _Requirements: 12.3_
  
  - [ ]* 83.3 Write unit tests for content library
    - Test content creation
    - Test categorization
    - Test tenant isolation
    - _Requirements: 12.1, 12.2_

- [ ] 84. Implement content search and discovery
  - [x] 84.1 Create content search service
    - Implement full-text search by keywords
    - Support filtering by tags, subject, grade level, content type
    - Sort by relevance, rating, usage count
    - _Requirements: 12.4_

  - [x] 84.2 Implement content preview
    - Allow instructors to preview content before adding to courses
    - Display content metadata and file preview
    - _Requirements: 12.5_
  
  - [ ]* 84.3 Write unit tests for content search
    - Test keyword search
    - Test filtering
    - Test sorting
    - _Requirements: 12.4_

- [ ] 85. Implement content reuse
  - [x] 85.1 Create content copying service
    - Implement copyToContent method to add library items to courses
    - Create reference without duplicating file storage
    - Increment usage_count when content is copied
    - _Requirements: 12.6, 12.7_
  
  - [ ]* 85.2 Write property test for content library copying
    - **Property 28: Content Library Copying**
    - **Validates: Requirements 12.6**

- [ ] 86. Implement content versioning
  - [ ] 86.1 Create versioning service
    - Increment version number on content updates
    - Store change history in metadata
    - Allow viewing previous versions
    - _Requirements: 12.8_
  
  - [ ]* 86.2 Write property test for content versioning
    - **Property 29: Content Versioning**
    - **Validates: Requirements 12.8**

- [ ] 87. Implement content rating and reviews
  - [x] 87.1 Create rating service
    - Allow instructors to rate content (1-5 stars)
    - Allow instructors to write reviews
    - Calculate average rating
    - Display popular and highly-rated content prominently
    - _Requirements: 12.9, 12.10_
  
  - [ ]* 87.2 Write unit tests for rating system
    - Test rating submission
    - Test average rating calculation
    - Test popular content sorting
    - _Requirements: 12.9, 12.10_

- [ ] 88. Implement content licensing and attribution
  - [x] 88.1 Add licensing information
    - Store license_type and attribution in content records
    - Display licensing information on content details
    - _Requirements: 12.11_

- [ ] 89. Implement content approval workflow
  - [x] 89.1 Create approval service
    - Require school admin approval before content appears in library
    - Implement approveContent and rejectContent methods
    - Send notification to content creator on approval/rejection
    - _Requirements: 12.14_
  
  - [ ]* 89.2 Write unit tests for approval workflow
    - Test approval process
    - Test rejection process
    - Test notification sending
    - _Requirements: 12.14_

- [ ] 90. Implement bulk content import
  - [ ] 90.1 Create bulk import service
    - Support CSV or JSON file upload with content metadata
    - Validate and import multiple content items
    - Link to existing files or upload new ones
    - _Requirements: 12.12_

  - [ ]* 90.2 Write unit tests for bulk import
    - Test CSV parsing
    - Test validation
    - Test import process
    - _Requirements: 12.12_

- [ ] 91. Implement content collections
  - [ ] 91.1 Create collections service
    - Allow creating curated collections of related content
    - Support adding/removing items from collections
    - Display collections on library homepage
    - _Requirements: 12.13_
  
  - [ ]* 91.2 Write unit tests for collections
    - Test collection creation
    - Test item management
    - _Requirements: 12.13_

- [ ] 92. Create content library API routes
  - [x] 92.1 Create content library endpoints
    - Create /app/api/content-library/route.ts for GET and POST
    - Create /app/api/content-library/[id]/route.ts for GET, PUT, DELETE
    - Create /app/api/content-library/[id]/copy/route.ts for copying to courses
    - Create /app/api/content-library/[id]/rate/route.ts for rating
    - Apply all middleware
  
  - [ ]* 92.2 Write integration tests for content library
    - Test content upload and search
    - Test copying to courses
    - Test rating and approval
    - _Requirements: 12.3, 12.4, 12.6, 12.9, 12.14_

- [ ] 93. Checkpoint - Verify content library
  - Ensure all tests pass, ask the user if questions arise.

### Phase 13: Mobile Optimization (Week 17)

- [ ] 94. Implement responsive layouts
  - [x] 94.1 Optimize all pages for mobile
    - Ensure all pages render correctly from 320px to 2560px width
    - Use responsive Tailwind CSS classes
    - Test on various devices and screen sizes
    - _Requirements: 14.1_
  
  - [x] 94.2 Support orientation changes
    - Adapt layouts for portrait and landscape orientations
    - Test rotation handling
    - _Requirements: 14.2_
  
  - [ ]* 94.3 Write unit tests for responsive layouts
    - Test breakpoint behavior
    - Test orientation handling
    - _Requirements: 14.1, 14.2_

- [ ] 95. Implement touch-friendly UI
  - [x] 95.1 Optimize touch targets
    - Ensure all interactive elements have minimum 44px tap targets
    - Add appropriate spacing between touch elements
    - Test on touch devices
    - _Requirements: 14.3_
  
  - [x] 95.2 Add swipe gestures
    - Implement swipe navigation for mobile devices
    - Add swipe to dismiss for modals
    - _Requirements: 14.7_
  
  - [ ]* 95.3 Write unit tests for touch interactions
    - Test tap target sizes
    - Test swipe gestures
    - _Requirements: 14.3, 14.7_

- [ ] 96. Implement image optimization
  - [x] 96.1 Add responsive image loading
    - Use Next.js Image component for automatic optimization
    - Serve appropriately sized images based on device
    - Implement lazy loading for below-the-fold images
    - _Requirements: 14.4, 14.8_
  
  - [ ]* 96.2 Write property test for responsive image serving
    - **Property 32: Responsive Image Serving**
    - **Validates: Requirements 14.4**

- [ ] 97. Implement mobile video player
  - [x] 97.1 Create mobile-optimized video player
    - Use adaptive bitrate streaming
    - Support fullscreen mode
    - Add playback controls optimized for touch
    - _Requirements: 14.6_
  
  - [ ]* 97.2 Write unit tests for video player
    - Test adaptive bitrate switching
    - Test fullscreen functionality
    - _Requirements: 14.6_

- [ ] 98. Implement offline support
  - [x] 98.1 Add offline content viewing
    - Implement service worker for offline caching
    - Allow downloading materials for offline access
    - Sync progress when connection restored
    - _Requirements: 14.5_
  
  - [ ]* 98.2 Write unit tests for offline support
    - Test offline caching
    - Test sync on reconnection
    - _Requirements: 14.5_

- [ ] 99. Implement Progressive Web App (PWA)
  - [x] 99.1 Configure PWA
    - Create manifest.json with app metadata
    - Add service worker for offline functionality
    - Implement install prompts
    - Add app icons for various sizes
    - _Requirements: 14.9_
  
  - [x] 99.2 Add push notifications
    - Implement web push notifications for mobile devices
    - Request notification permissions
    - Handle notification clicks
    - _Requirements: 14.10_
  
  - [ ]* 99.3 Write unit tests for PWA
    - Test manifest configuration
    - Test install prompt
    - Test push notifications
    - _Requirements: 14.9, 14.10_

- [ ] 100. Implement mobile-specific optimizations
  - [x] 100.1 Optimize form inputs for mobile
    - Use appropriate input types (email, number, date)
    - Add mobile-friendly date pickers
    - Optimize keyboard display
    - _Requirements: 14.12_
  
  - [x] 100.2 Create mobile navigation
    - Implement hamburger menu for mobile
    - Add bottom navigation bar for key actions
    - _Requirements: 14.13_
  
  - [x] 100.3 Maintain session across devices
    - Ensure session state persists when switching devices
    - Sync user progress across devices
    - _Requirements: 14.11_

  - [ ]* 100.4 Write unit tests for mobile optimizations
    - Test form input types
    - Test navigation menu
    - Test session persistence
    - _Requirements: 14.11, 14.12, 14.13_

- [ ] 101. Perform mobile performance testing
  - [x] 101.1 Run Lighthouse mobile audits
    - Achieve mobile performance score above 80
    - Optimize based on Lighthouse recommendations
    - Test on real mobile devices
    - _Requirements: 14.14_
  
  - [x]* 101.2 Write performance tests
    - Test page load times on mobile
    - Test bundle size
    - _Requirements: 14.14_

- [x] 102. Checkpoint - Verify mobile responsiveness
  - Ensure all tests pass, ask the user if questions arise.

### Phase 14: Production Readiness (Week 18)

- [ ] 103. Implement comprehensive logging
  - [x] 103.1 Set up structured logging
    - Implement Logger class with debug, info, warn, error, fatal levels
    - Log all errors with stack traces, user context, timestamp
    - Log authentication attempts with success/failure status
    - Log slow queries (>1000ms) with query text and execution time
    - Log administrative actions for audit trails
    - _Requirements: 15.1, 15.4, 15.5, 15.18_
  
  - [ ]* 103.2 Write property test for error logging
    - **Property 33: Error Logging Completeness**
    - **Validates: Requirements 15.1**
  
  - [ ]* 103.3 Write property test for slow query logging
    - **Property 34: Slow Query Logging**
    - **Validates: Requirements 15.5**

- [ ] 104. Integrate error tracking
  - [ ] 104.1 Set up Sentry integration
    - Configure Sentry with DSN
    - Capture all unhandled errors
    - Add user context to error reports
    - Set up error alerting
    - _Requirements: 15.2_
  
  - [ ]* 104.2 Write unit tests for error tracking
    - Test Sentry integration
    - Test error capture
    - _Requirements: 15.2_

- [ ] 105. Implement monitoring and metrics
  - [ ] 105.1 Set up monitoring service integration
    - Integrate with Datadog, New Relic, or Prometheus
    - Expose metrics (request rate, error rate, response time, database connections)
    - Create health check endpoints
    - _Requirements: 15.6, 15.7, 15.8_
  
  - [ ] 105.2 Configure alerting
    - Set up alerts for error rate > 1%
    - Set up alerts for response time p95 > 1000ms
    - Set up alerts for database connections > 80%
    - Set up alerts for disk usage > 85%
    - Set up alerts for memory usage > 90%
  
  - [ ]* 105.3 Write unit tests for health checks
    - Test health check endpoints
    - Test metrics exposure
    - _Requirements: 15.6, 15.7_

- [ ] 106. Implement graceful degradation
  - [ ] 106.1 Add fallback handling for external services
    - Implement graceful degradation when S3 is unavailable (use local storage temporarily)
    - Implement graceful degradation when payment gateway is down (queue payments)
    - Implement graceful degradation when notification service is down (queue notifications)
    - Log degraded state
    - _Requirements: 15.9_
  
  - [ ]* 106.2 Write property test for graceful degradation
    - **Property 35: Graceful Service Degradation**
    - **Validates: Requirements 15.9**

- [ ] 107. Implement circuit breakers (already done in Phase 1, verify)
  - [ ] 107.1 Verify circuit breaker implementation
    - Ensure circuit breakers are applied to all external services
    - Test circuit breaker activation after 5 failures
    - Test circuit breaker reset after cooldown
    - _Requirements: 15.11_
  
  - [ ]* 107.2 Write property test for circuit breaker
    - **Property 36: Circuit Breaker Activation**
    - **Validates: Requirements 15.11**

- [ ] 108. Implement timeout limits
  - [ ] 108.1 Add API request timeouts
    - Set 30-second timeout for all API endpoints
    - Return 504 Gateway Timeout for exceeded requests
    - _Requirements: 15.14_
  
  - [ ] 108.2 Add database query timeouts
    - Set 10-second timeout for database queries
    - Cancel long-running queries
    - _Requirements: 15.15_
  
  - [ ]* 108.3 Write property test for API timeout
    - **Property 37: API Request Timeout**
    - **Validates: Requirements 15.14**

- [ ] 109. Implement database optimizations
  - [ ] 109.1 Set up connection pooling
    - Configure database connection pool with appropriate size
    - Monitor connection usage
    - _Requirements: 15.13_
  
  - [ ] 109.2 Set up automated backups
    - Configure daily automated backups
    - Set 30-day retention policy
    - Enable point-in-time recovery
    - Test backup restoration
    - _Requirements: 15.16_
  
  - [ ]* 109.3 Write unit tests for connection pooling
    - Test connection acquisition and release
    - Test pool exhaustion handling
    - _Requirements: 15.13_

- [ ] 110. Implement security hardening
  - [ ] 110.1 Add security headers
    - Implement Content Security Policy (CSP) headers
    - Add Strict-Transport-Security header
    - Add X-Frame-Options, X-Content-Type-Options headers
    - _Requirements: 15.19, 15.20_
  
  - [ ] 110.2 Configure CORS policies
    - Set up CORS for secure cross-origin requests
    - Whitelist allowed origins
    - _Requirements: 15.19_

  - [ ] 110.3 Verify rate limiting implementation
    - Ensure rate limiting is active per user and per IP
    - Test rate limit enforcement
    - _Requirements: 15.17_
  
  - [ ]* 110.4 Write unit tests for security headers
    - Test CSP header configuration
    - Test CORS policies
    - _Requirements: 15.19, 15.20_

- [ ] 111. Implement caching strategy
  - [ ] 111.1 Set up Redis caching
    - Implement caching for frequently accessed data (programs, courses, user profiles)
    - Set appropriate TTL values (5-15 minutes)
    - Implement cache invalidation on updates
    - _Requirements: 15.13_
  
  - [ ] 111.2 Add CDN for static assets
    - Configure CloudFlare or AWS CloudFront
    - Cache static assets (images, CSS, JS)
    - Set long cache headers for immutable assets
  
  - [ ]* 111.3 Write unit tests for caching
    - Test cache hit/miss behavior
    - Test cache invalidation
    - _Requirements: 15.13_

- [ ] 112. Perform security audit
  - [ ] 112.1 Conduct security review
    - Review authentication and authorization logic
    - Check for SQL injection vulnerabilities
    - Check for XSS vulnerabilities
    - Review file upload security
    - Review payment processing security
    - Test RLS policies
  
  - [ ] 112.2 Fix identified security issues
    - Address all critical and high-severity issues
    - Document medium and low-severity issues for future work

- [ ] 113. Checkpoint - Verify production readiness
  - Ensure all tests pass, ask the user if questions arise.

### Phase 15: Testing & Documentation (Weeks 19-20)

- [ ] 114. Complete property-based tests
  - [ ] 114.1 Verify all 37 properties have tests
    - Review property test coverage
    - Ensure all tests run minimum 100 iterations
    - Verify all tests reference design document properties
    - _Requirements: All correctness properties_
  
  - [ ] 114.2 Run full property test suite
    - Execute all property tests
    - Fix any failing tests or counterexamples
    - Document any property violations found

- [ ] 115. Complete unit tests
  - [ ] 115.1 Achieve 80% code coverage
    - Write missing unit tests for services
    - Write missing unit tests for API routes
    - Write missing unit tests for utilities
  
  - [ ] 115.2 Run full unit test suite
    - Execute all unit tests
    - Fix any failing tests
    - Generate coverage report

- [ ] 116. Complete integration tests
  - [ ] 116.1 Write integration tests for major flows
    - Test enrollment flow (browse, pay, enroll, access)
    - Test exam flow (start, answer, submit, grade, view results)
    - Test certificate flow (complete course, generate certificate, verify)
    - Test discussion flow (create topic, reply, vote, resolve)
    - Test notification flow (trigger event, queue, send, track)

  - [ ] 116.2 Run integration test suite
    - Execute all integration tests
    - Fix any failing tests
    - Verify end-to-end flows work correctly

- [ ] 117. Perform end-to-end testing
  - [ ] 117.1 Write E2E tests with Playwright
    - Test student journey (signup, browse, enroll, learn, complete)
    - Test instructor workflow (create course, add content, grade assignments)
    - Test admin operations (manage users, configure settings, view analytics)
  
  - [ ] 117.2 Run E2E test suite
    - Execute all E2E tests on staging environment
    - Fix any failing tests
    - Verify critical paths work correctly

- [ ] 118. Perform load testing
  - [ ] 118.1 Create load test scenarios with k6
    - Test concurrent user load (100, 500, 1000 users)
    - Test API endpoint performance under load
    - Test database performance under load
    - Test file upload performance
  
  - [ ] 118.2 Analyze load test results
    - Identify performance bottlenecks
    - Optimize slow endpoints
    - Verify system meets performance requirements

- [ ] 119. Create API documentation
  - [ ] 119.1 Document all API endpoints
    - Use OpenAPI/Swagger specification
    - Document request/response schemas
    - Document authentication requirements
    - Document error responses
    - Add example requests and responses
  
  - [ ] 119.2 Generate interactive API documentation
    - Set up Swagger UI or similar tool
    - Make documentation accessible to developers

- [ ] 120. Create user documentation
  - [ ] 120.1 Write user guides
    - Create student user guide
    - Create instructor user guide
    - Create admin user guide
    - Include screenshots and step-by-step instructions
  
  - [ ] 120.2 Create video tutorials
    - Record key workflow tutorials
    - Upload to video platform
    - Embed in help section

- [ ] 121. Create deployment documentation
  - [ ] 121.1 Document deployment process
    - Document environment setup
    - Document database migration process
    - Document configuration requirements
    - Document deployment steps
    - Document rollback procedures
  
  - [ ] 121.2 Create troubleshooting guide
    - Document common issues and solutions
    - Document debugging procedures
    - Document monitoring and alerting setup

- [ ] 122. Final checkpoint - Complete system verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at the end of each phase
- Property tests validate universal correctness properties with minimum 100 iterations
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end flows
- The implementation builds incrementally on the existing Next.js/Supabase codebase
- All code should be written in TypeScript following existing patterns
- External service integrations should use circuit breakers and retry logic
- All database operations should respect RLS policies for tenant isolation
