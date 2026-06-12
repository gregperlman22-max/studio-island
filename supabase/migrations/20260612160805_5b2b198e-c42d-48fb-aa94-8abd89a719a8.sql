
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_first boolean;
  _role public.app_role;
  _practice_id uuid;
  _practice_name text := 'Croton Children and Family Counseling';
BEGIN
  BEGIN
    SELECT id INTO _practice_id FROM public.practices WHERE name = _practice_name LIMIT 1;
    IF _practice_id IS NULL THEN
      INSERT INTO public.practices (id, name)
      VALUES ('11111111-1111-1111-1111-111111111111', _practice_name)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
      RETURNING id INTO _practice_id;
    END IF;

    SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO _is_first;
    IF _is_first THEN _role := 'admin'; ELSE _role := 'therapist'; END IF;

    INSERT INTO public.profiles (id, full_name, role, practice_id, approved)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      _role,
      _practice_id,
      _is_first
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;

    IF _is_first THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, 'therapist')
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.event_log (practice_id, actor_type, actor_id, event_type, payload)
      VALUES (
        COALESCE(_practice_id, '11111111-1111-1111-1111-111111111111'),
        'system',
        NEW.id,
        'handle_new_user_failed',
        jsonb_build_object('sqlstate', SQLSTATE, 'message', SQLERRM)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG 'handle_new_user failed and event_log insert also failed for %: % %', NEW.id, SQLSTATE, SQLERRM;
    END;
  END;
  RETURN NEW;
END;
$$;
