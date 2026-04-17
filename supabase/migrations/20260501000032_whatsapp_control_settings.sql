-- Migration: Add control settings for WhatsApp Auto-Responder
-- Allows heavy control by Admins and Teachers at the school level

CREATE TABLE IF NOT EXISTS public.school_whatsapp_settings (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  is_enabled boolean DEFAULT true,
  human_takeover_timeout_minutes int DEFAULT 30, -- AI stays silent if human replied recently
  custom_rules jsonb DEFAULT '[]'::jsonb, -- Future support for school-specific keywords
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Basic RLS
ALTER TABLE public.school_whatsapp_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/Staff can manage school WA settings" ON public.school_whatsapp_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM portal_users 
      WHERE id = auth.uid() 
      AND (role IN ('admin', 'school')) -- Main school admins
      AND (school_id = school_whatsapp_settings.school_id OR role = 'admin')
    )
  );

-- Function to automatically create settings row when a new school is added
CREATE OR REPLACE FUNCTION public.handle_new_school_wa_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.school_whatsapp_settings (school_id)
  VALUES (NEW.id)
  ON CONFLICT (school_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_new_school_wa_settings ON public.schools;
CREATE TRIGGER tr_new_school_wa_settings
  AFTER INSERT ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_school_wa_settings();

-- Populate existing schools
INSERT INTO public.school_whatsapp_settings (school_id)
SELECT id FROM public.schools
ON CONFLICT (school_id) DO NOTHING;
