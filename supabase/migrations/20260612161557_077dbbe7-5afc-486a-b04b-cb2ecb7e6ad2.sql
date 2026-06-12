
-- 1. assignments adjustments
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS frequency text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.assignments
  DROP CONSTRAINT IF EXISTS assignments_frequency_check;
ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_frequency_check
  CHECK (frequency IN ('once','daily','2x_week','3x_week','weekly','open'));

DROP TRIGGER IF EXISTS assignments_touch ON public.assignments;
CREATE TRIGGER assignments_touch BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. interest_options
CREATE TABLE IF NOT EXISTS public.interest_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  emoji_or_icon_key text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);

GRANT SELECT ON public.interest_options TO authenticated;
GRANT ALL ON public.interest_options TO service_role;

ALTER TABLE public.interest_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read interest_options" ON public.interest_options;
CREATE POLICY "Authenticated read interest_options" ON public.interest_options
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.interest_options (key, label, emoji_or_icon_key, sort_order) VALUES
  ('dinosaurs','Dinosaurs','🦖',1),
  ('space','Space','🚀',2),
  ('ocean','Ocean','🌊',3),
  ('horses','Horses','🐴',4),
  ('dogs','Dogs','🐶',5),
  ('cats','Cats','🐱',6),
  ('drawing','Drawing','🎨',7),
  ('building','Building','🧱',8),
  ('music','Music','🎵',9),
  ('sports','Sports','⚽',10),
  ('dance','Dance','💃',11),
  ('bugs','Bugs','🐞',12),
  ('robots','Robots','🤖',13),
  ('cooking','Cooking','🍳',14),
  ('nature','Nature','🌿',15),
  ('superheroes','Superheroes','🦸',16)
ON CONFLICT (key) DO NOTHING;

-- 3. Enforce: only assign activities enabled on the therapist's island
CREATE OR REPLACE FUNCTION public.enforce_assignment_on_island()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _enabled boolean;
BEGIN
  SELECT (NEW.activity_id = ANY(enabled_activity_ids))
    INTO _enabled
    FROM public.islands
    WHERE owner_profile_id = NEW.assigned_by_profile_id;
  IF _enabled IS NULL OR NOT _enabled THEN
    RAISE EXCEPTION 'Activity is not enabled on this therapist''s island' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assignments_enforce_island ON public.assignments;
CREATE TRIGGER assignments_enforce_island
  BEFORE INSERT OR UPDATE OF activity_id ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_assignment_on_island();
