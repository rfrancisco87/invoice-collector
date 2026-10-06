-- Pin search_path on SECURITY DEFINER functions.
--
-- is_admin() (011) and update_sender_reputation() (031) run with the owner's
-- privileges but resolve unqualified names (profiles, sender_reputation)
-- through the caller's search_path. Anyone able to create objects in a schema
-- earlier in that path could shadow those tables and run code as the owner.
-- Fixing the path to public (plus pg_temp last, so temp objects can't shadow
-- anything) closes that. Defense in depth: the app talks to the database with
-- the service-role key, but RLS policies call is_admin() for every role.

ALTER FUNCTION public.is_admin() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_sender_reputation() SET search_path = public, pg_temp;
