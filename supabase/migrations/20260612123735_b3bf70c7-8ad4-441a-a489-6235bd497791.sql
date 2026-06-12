
ALTER FUNCTION public.touch_updated_at() SET search_path = public;
ALTER FUNCTION public.generate_resident_code() SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_practice_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_approved() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_resident_code() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_practice_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_approved() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_resident_code() TO authenticated, service_role;
