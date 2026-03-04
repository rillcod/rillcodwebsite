

-- ============================================================
-- prospective_students  (summer school / public registrations)
-- ============================================================

CREATE TABLE IF NOT EXISTS "public"."prospective_students" (
    "id"                 "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name"          "text" NOT NULL,
    "email"              "text" NOT NULL,
    "parent_name"        "text",
    "parent_phone"       "text",
    "parent_email"       "text",
    "grade"              "text",
    "age"                integer,
    "gender"             "text",
    "school_id"          "uuid" REFERENCES "public"."schools"("id") ON DELETE SET NULL,
    "school_name"        "text",
    "course_interest"    "text",
    "preferred_schedule" "text",
    "hear_about_us"      "text",
    "status"             "text" NOT NULL DEFAULT 'pending',
    "is_active"          boolean NOT NULL DEFAULT false,
    "is_deleted"         boolean NOT NULL DEFAULT false,
    "notes"              "text",
    "created_at"         timestamp with time zone DEFAULT "now"(),
    "updated_at"         timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "prospective_students_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."prospective_students" OWNER TO "postgres";

ALTER TABLE "public"."prospective_students" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert"
    ON "public"."prospective_students"
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY "Allow authenticated read"
    ON "public"."prospective_students"
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated update"
    ON "public"."prospective_students"
    FOR UPDATE
    TO authenticated
    USING (true);

CREATE INDEX IF NOT EXISTS "idx_prospective_students_email"
    ON "public"."prospective_students"("email");

CREATE INDEX IF NOT EXISTS "idx_prospective_students_status"
    ON "public"."prospective_students"("status");
