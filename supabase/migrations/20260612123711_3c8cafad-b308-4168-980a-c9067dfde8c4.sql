
-- ============= ENUMS =============
CREATE TYPE public.app_role AS ENUM ('admin', 'therapist', 'parent', 'child');
CREATE TYPE public.resident_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE public.assignment_status AS ENUM ('assigned', 'completed', 'expired');
CREATE TYPE public.actor_type AS ENUM ('therapist', 'resident', 'system');

-- ============= PRACTICES =============
CREATE TABLE public.practices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.practices TO authenticated;
GRANT ALL ON public.practices TO service_role;
ALTER TABLE public.practices ENABLE ROW LEVEL SECURITY;

INSERT INTO public.practices (id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Croton Children and Family Counseling');

-- ============= PROFILES =============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  role public.app_role NOT NULL DEFAULT 'therapist',
  practice_id uuid REFERENCES public.practices(id) ON DELETE SET NULL,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============= USER ROLES =============
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============= HELPER FUNCTIONS =============
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.current_practice_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT practice_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_approved()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT approved FROM public.profiles WHERE id = auth.uid()), false)
$$;

-- profile policies
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR (public.has_role(auth.uid(), 'admin') AND practice_id = public.current_practice_id()));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Admins update profiles in practice" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND practice_id = public.current_practice_id())
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND practice_id = public.current_practice_id());

-- user_roles policies
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ============= SIGNUP TRIGGER =============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _is_first boolean;
  _role public.app_role;
  _practice uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO _is_first;
  IF _is_first THEN _role := 'admin'; ELSE _role := 'therapist'; END IF;

  INSERT INTO public.profiles (id, full_name, role, practice_id, approved)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
          _role, _practice, _is_first);

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);
  IF _is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'therapist');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- practices policy (after has_role exists)
CREATE POLICY "Users view their practice" ON public.practices FOR SELECT TO authenticated
  USING (id = public.current_practice_id());

-- ============= REFERENCE: theme_packs =============
CREATE TABLE public.theme_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  age_band_label text NOT NULL,
  description text NOT NULL,
  palette jsonb NOT NULL DEFAULT '{}'::jsonb,
  tileset_key text,
  audio_key text,
  companion_register jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_available boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.theme_packs TO authenticated;
GRANT ALL ON public.theme_packs TO service_role;
ALTER TABLE public.theme_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read theme_packs" ON public.theme_packs FOR SELECT TO authenticated USING (true);

INSERT INTO public.theme_packs (key, display_name, age_band_label, description, palette, tileset_key, audio_key, companion_register, is_available) VALUES
  ('sprout', 'Sprout', 'Ages 5–8', 'Whimsical, gentle and curious. Soft pastels, rounded shapes, playful creatures.',
   '{"primary":"#f4a99c","secondary":"#9cc7b3","accent":"#f5d774","background":"#fef6ef","ink":"#3a3a3a"}'::jsonb,
   'sprout_v1', 'sprout_ambient',
   '{"tone":"warm, playful, simple","examples":["wonder","tickle","peek"]}'::jsonb, true),
  ('explorer', 'Explorer', 'Ages 9–12', 'Adventure-cozy. Earthy palette, field-guide details, sense of discovery.',
   '{"primary":"#c47b58","secondary":"#6d8e7a","accent":"#e8c468","background":"#f5efe4","ink":"#2c2a26"}'::jsonb,
   'explorer_v1', 'explorer_ambient',
   '{"tone":"curious, capable, plainspoken","examples":["chart","scout","note"]}'::jsonb, true),
  ('drift', 'Drift', 'Ages 13+', 'Cozy-indie. Muted twilight palette, ambient sound, low-pressure.',
   '{"primary":"#7c8aa6","secondary":"#bfa5c9","accent":"#e0b97d","background":"#1f2333","ink":"#e8e6df"}'::jsonb,
   'drift_v1', 'drift_ambient',
   '{"tone":"low-key, thoughtful, dry","examples":["drift","note","still"]}'::jsonb, false);

-- ============= REFERENCE: zones =============
CREATE TABLE public.zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.zones TO authenticated;
GRANT ALL ON public.zones TO service_role;
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read zones" ON public.zones FOR SELECT TO authenticated USING (true);

INSERT INTO public.zones (key, display_name, description, sort_order) VALUES
  ('calm_cove', 'Calm Cove', 'Regulation and breathing. A quiet shore for grounding.', 1),
  ('build_beach', 'Build Beach', 'Creative sandbox. Make, arrange, and rearrange.', 2),
  ('campfire', 'Campfire', 'Storytelling and narrative. Share what happened.', 3),
  ('worry_hollow', 'Worry Hollow', 'Externalize worries. A safe place to set them down.', 4),
  ('garden', 'Garden', 'Nurture and care. Tend to living things.', 5),
  ('field_guide_meadow', 'Field Guide Meadow', 'Collect feelings. Notice and name them.', 6);

-- ============= REFERENCE: zone_skins =============
CREATE TABLE public.zone_skins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES public.zones(id) ON DELETE CASCADE,
  theme_pack_id uuid NOT NULL REFERENCES public.theme_packs(id) ON DELETE CASCADE,
  skin_name text NOT NULL,
  skin_description text NOT NULL,
  UNIQUE(zone_id, theme_pack_id)
);
GRANT SELECT ON public.zone_skins TO authenticated;
GRANT ALL ON public.zone_skins TO service_role;
ALTER TABLE public.zone_skins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read zone_skins" ON public.zone_skins FOR SELECT TO authenticated USING (true);

INSERT INTO public.zone_skins (zone_id, theme_pack_id, skin_name, skin_description)
SELECT z.id, t.id, s.skin_name, s.skin_description
FROM public.zones z
JOIN public.theme_packs t ON true
JOIN (VALUES
  ('calm_cove','sprout','Bubble Lagoon','A gentle lagoon where breaths become floating bubbles.'),
  ('calm_cove','explorer','Dawn Fishing Point','A still pier at first light. The water keeps time.'),
  ('calm_cove','drift','Lo-fi Shoreline','A quiet shoreline at dusk. Slow tide, slow breath.'),
  ('build_beach','sprout','Sandcastle Shore','Wet sand and bright shovels. Build, knock down, rebuild.'),
  ('build_beach','explorer','Driftwood Workshop','A workbench of bleached driftwood and twine.'),
  ('build_beach','drift','Studio Beach','A loose practice space with crates and salvaged wood.'),
  ('campfire','sprout','Marshmallow Camp','Glowing embers and a cozy log circle.'),
  ('campfire','explorer','Stoneheart Camp','A ring of river stones at the edge of the trees.'),
  ('campfire','drift','Coalpit Lounge','Low chairs around a slow-burning fire.'),
  ('worry_hollow','sprout','Whispering Hollow','A friendly burrow where worries can be tucked away.'),
  ('worry_hollow','explorer','Lantern Hollow','A hollow tree lit by paper lanterns.'),
  ('worry_hollow','drift','Quiet Hollow','A still alcove in the woods.'),
  ('garden','sprout','Bunny Patch','A soft patch of clover with carrot rows.'),
  ('garden','explorer','Cottage Garden','Raised beds, hand tools, climbing beans.'),
  ('garden','drift','Window Garden','Pots on a sunlit ledge.'),
  ('field_guide_meadow','sprout','Butterfly Meadow','A bright meadow full of flutters to catch and name.'),
  ('field_guide_meadow','explorer','Tracker Meadow','Tall grass with a notebook and sketching kit.'),
  ('field_guide_meadow','drift','Slow Meadow','A long meadow at golden hour.')
) AS s(zone_key, pack_key, skin_name, skin_description)
  ON s.zone_key = z.key AND s.pack_key = t.key;

-- ============= REFERENCE: activities =============
CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES public.zones(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  therapeutic_targets text[] NOT NULL DEFAULT '{}',
  modalities text[] NOT NULL DEFAULT '{}',
  engagement_loop text NOT NULL,
  age_bands text[] NOT NULL DEFAULT '{}',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.activities TO authenticated;
GRANT ALL ON public.activities TO service_role;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read activities" ON public.activities FOR SELECT TO authenticated USING (true);

INSERT INTO public.activities (zone_id, title, description, therapeutic_targets, modalities, engagement_loop, age_bands)
SELECT z.id, a.title, a.description, a.targets, a.modalities, a.loop, a.bands
FROM public.zones z
JOIN (VALUES
  ('calm_cove','Bubble Breathing','Match your breath to floating bubbles to settle the body.', ARRAY['anxiety'], ARRAY['mindfulness'], 'discover', ARRAY['sprout','explorer']),
  ('calm_cove','Tide Counting','Count slow waves in and out to lengthen the exhale.', ARRAY['anxiety','anger_regulation'], ARRAY['mindfulness'], 'discover', ARRAY['explorer','drift']),
  ('worry_hollow','Worry Burial','Name a worry, then bury it in the hollow to externalize it.', ARRAY['anxiety','trauma'], ARRAY['cbpt'], 'nurture', ARRAY['sprout','explorer']),
  ('worry_hollow','Lantern Letter','Write the worry on a paper lantern and let it dim.', ARRAY['anxiety'], ARRAY['cbpt','tf_cbt_informed'], 'share', ARRAY['explorer','drift']),
  ('garden','Creature Care','Look after a small creature: feed, water, and check in.', ARRAY['self_esteem','social_skills'], ARRAY['cbpt'], 'nurture', ARRAY['sprout','explorer']),
  ('garden','Seedling Streak','Plant and tend a seedling across sessions.', ARRAY['self_esteem'], ARRAY['pcit_style'], 'nurture', ARRAY['sprout','explorer','drift']),
  ('field_guide_meadow','Feelings Field Guide','Catch and name a feeling. Add it to your field guide.', ARRAY['emotional_awareness'], ARRAY['mindfulness','cbpt'], 'collect', ARRAY['sprout','explorer','drift']),
  ('build_beach','Sandcastle Plan','Plan, build, and revise a small structure.', ARRAY['self_esteem','anger_regulation'], ARRAY['cbpt'], 'build', ARRAY['sprout','explorer']),
  ('campfire','One Small Story','Tell one small thing that happened today.', ARRAY['trauma','social_skills'], ARRAY['tf_cbt_informed'], 'share', ARRAY['explorer','drift']),
  ('campfire','Funny Embers','Share something that made you laugh this week.', ARRAY['social_skills','self_esteem'], ARRAY['cbpt'], 'humor', ARRAY['sprout','explorer','drift'])
) AS a(zone_key, title, description, targets, modalities, loop, bands)
  ON a.zone_key = z.key;

-- ============= ISLANDS =============
CREATE TABLE public.islands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  theme_pack_id uuid REFERENCES public.theme_packs(id),
  enabled_activity_ids uuid[] NOT NULL DEFAULT '{}',
  layout_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  avatar_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.islands TO authenticated;
GRANT ALL ON public.islands TO service_role;
ALTER TABLE public.islands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access to island" ON public.islands FOR ALL TO authenticated
  USING (owner_profile_id = auth.uid()) WITH CHECK (owner_profile_id = auth.uid());
CREATE POLICY "Admins read islands in practice" ON public.islands FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = owner_profile_id AND p.practice_id = public.current_practice_id()));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER islands_touch BEFORE UPDATE ON public.islands FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============= RESIDENT CODE GENERATION =============
CREATE OR REPLACE FUNCTION public.generate_resident_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  adj text[] := ARRAY['pebble','river','maple','juniper','willow','sunny','quiet','breezy','cozy','sandy','foggy','clover','amber','dusk','spruce','meadow','linen','tide'];
  noun text[] := ARRAY['otter','fox','heron','badger','wren','newt','moth','crane','vole','marten','quail','finch','sparrow','minnow','beetle','toad','snail','hare'];
BEGIN
  RETURN adj[1 + floor(random()*array_length(adj,1))::int]
    || '-' || noun[1 + floor(random()*array_length(noun,1))::int]
    || '-' || floor(random()*90+10)::int;
END; $$;

-- ============= RESIDENTS (NO IDENTIFIERS) =============
CREATE TABLE public.residents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  resident_code text NOT NULL UNIQUE DEFAULT public.generate_resident_code(),
  age_band text NOT NULL CHECK (age_band IN ('sprout','explorer','drift')),
  interests text[] NOT NULL DEFAULT '{}',
  status public.resident_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.residents TO authenticated;
GRANT ALL ON public.residents TO service_role;
ALTER TABLE public.residents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Therapist manages own residents" ON public.residents FOR ALL TO authenticated
  USING (created_by_profile_id = auth.uid() AND practice_id = public.current_practice_id())
  WITH CHECK (created_by_profile_id = auth.uid() AND practice_id = public.current_practice_id());
CREATE POLICY "Admins read residents in practice" ON public.residents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND practice_id = public.current_practice_id());

-- ============= ASSIGNMENTS =============
CREATE TABLE public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id uuid NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  assigned_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  frequency_note text,
  status public.assignment_status NOT NULL DEFAULT 'assigned',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignments TO authenticated;
GRANT ALL ON public.assignments TO service_role;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Therapist manages own assignments" ON public.assignments FOR ALL TO authenticated
  USING (assigned_by_profile_id = auth.uid()) WITH CHECK (assigned_by_profile_id = auth.uid());
CREATE POLICY "Admins read assignments in practice" ON public.assignments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin')
    AND EXISTS (SELECT 1 FROM public.residents r WHERE r.id = resident_id AND r.practice_id = public.current_practice_id()));

-- ============= EVENT LOG (append-only) =============
CREATE TABLE public.event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  actor_type public.actor_type NOT NULL,
  actor_id uuid,
  event_type text NOT NULL,
  zone_key text,
  activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
-- INSERT + SELECT only; no UPDATE/DELETE grants
GRANT SELECT, INSERT ON public.event_log TO authenticated;
GRANT ALL ON public.event_log TO service_role;
ALTER TABLE public.event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated insert events in practice" ON public.event_log FOR INSERT TO authenticated
  WITH CHECK (practice_id = public.current_practice_id());
CREATE POLICY "Admins read practice events" ON public.event_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND practice_id = public.current_practice_id());
CREATE POLICY "Therapists read own events" ON public.event_log FOR SELECT TO authenticated
  USING (actor_id = auth.uid() AND practice_id = public.current_practice_id());
-- Deliberately NO UPDATE or DELETE policies — append-only.
