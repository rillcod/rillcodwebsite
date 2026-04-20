-- Further expand the allowed lesson types for the lessons table
-- This ensures and reinforces the previously attempted fix
ALTER TABLE "public"."lessons" DROP CONSTRAINT IF EXISTS "lessons_lesson_type_check";

ALTER TABLE "public"."lessons" ADD CONSTRAINT "lessons_lesson_type_check" 
CHECK (("lesson_type" = ANY (ARRAY[
  'video'::"text", 
  'interactive'::"text", 
  'hands-on'::"text", 
  'hands_on'::"text",
  'workshop'::"text", 
  'coding'::"text", 
  'reading'::"text",
  'quiz'::"text",
  'assignment'::"text",
  'article'::"text",
  'project'::"text",
  'lab'::"text",
  'live'::"text",
  'practice'::"text",
  'checkpoint'::"text",
  'robotics'::"text",
  'electronics'::"text",
  'mechanics'::"text",
  'design'::"text",
  'iot'::"text",
  'ai'::"text"
])));
