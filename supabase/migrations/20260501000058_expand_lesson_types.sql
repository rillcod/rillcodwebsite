-- Expand the allowed lesson types for the lessons table
ALTER TABLE "public"."lessons" DROP CONSTRAINT IF EXISTS "lessons_lesson_type_check";

ALTER TABLE "public"."lessons" ADD CONSTRAINT "lessons_lesson_type_check" 
CHECK (("lesson_type" = ANY (ARRAY[
  'video'::"text", 
  'interactive'::"text", 
  'hands-on'::"text", 
  'workshop'::"text", 
  'coding'::"text", 
  'reading'::"text",
  'quiz'::"text",
  'assignment'::"text",
  'article'::"text",
  'project'::"text",
  'lab'::"text",
  'live'::"text"
])));
