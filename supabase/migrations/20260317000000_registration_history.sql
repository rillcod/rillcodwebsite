-- Create registration_batches table
CREATE TABLE IF NOT EXISTS "public"."registration_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid" REFERENCES auth.users(id),
    "school_id" "uuid",
    "school_name" "text",
    "program_id" "uuid",
    "class_id" "uuid",
    "class_name" "text",
    "student_count" integer DEFAULT 0,
    CONSTRAINT "registration_batches_pkey" PRIMARY KEY ("id")
);

-- Create registration_results table
CREATE TABLE IF NOT EXISTS "public"."registration_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "password" "text" NOT NULL,
    "class_name" "text",
    "status" "text" NOT NULL,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "registration_results_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "registration_results_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."registration_batches"("id") ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE "public"."registration_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."registration_results" ENABLE ROW LEVEL SECURITY;

-- Policies for registration_batches
CREATE POLICY "Users can view their own batches or admin can view all" 
ON "public"."registration_batches" FOR SELECT
USING (auth.uid() = created_by OR current_user_role() = 'admin');

CREATE POLICY "Admins and teachers can insert batches" 
ON "public"."registration_batches" FOR INSERT
WITH CHECK (current_user_role() IN ('admin', 'teacher'));

-- Policies for registration_results
CREATE POLICY "Users can view results for batches they can see" 
ON "public"."registration_results" FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.registration_batches 
    WHERE id = batch_id 
    AND (created_by = auth.uid() OR current_user_role() = 'admin')
));

CREATE POLICY "Admins and teachers can insert results" 
ON "public"."registration_results" FOR INSERT
WITH CHECK (current_user_role() IN ('admin', 'teacher'));
