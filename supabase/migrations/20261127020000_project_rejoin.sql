-- Progetti condivisi: uscire da un progetto e chiedere di rientrare (il proprietario accetta o nega, in app).
-- Chi esce è ricordato (project_left, con il ruolo che aveva); può chiedere di rientrare una volta per volta
-- (project_join_requests, in attesa → accettata / negata); solo il proprietario risponde.

CREATE TABLE IF NOT EXISTS public.project_left (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('editor', 'viewer')),
  left_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
ALTER TABLE public.project_left ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own left rows" ON public.project_left FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.project_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  avatar text,
  role text NOT NULL CHECK (role IN ('editor', 'viewer')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'denied')),
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS project_join_requests_pending ON public.project_join_requests (project_id, user_id) WHERE status = 'pending';
ALTER TABLE public.project_join_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "requester or owner reads" ON public.project_join_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.project_role(project_id) = 'owner');

-- Esci dal progetto: tolto dai membri e ricordato, per poter chiedere di rientrare.
CREATE OR REPLACE FUNCTION public.leave_project(p uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  SELECT role INTO r FROM public.project_members WHERE project_id = p AND user_id = auth.uid();
  IF r IS NULL THEN RETURN; END IF;
  IF r = 'owner' THEN RAISE EXCEPTION 'owner cannot leave'; END IF;
  DELETE FROM public.project_members WHERE project_id = p AND user_id = auth.uid();
  INSERT INTO public.project_left (project_id, user_id, role) VALUES (p, auth.uid(), r)
    ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role, left_at = now();
END $$;

-- Chiedi di rientrare: solo chi ne era membro; una richiesta in attesa alla volta.
CREATE OR REPLACE FUNCTION public.request_rejoin(p uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text; u auth.users; rid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF EXISTS (SELECT 1 FROM public.project_members WHERE project_id = p AND user_id = auth.uid()) THEN RAISE EXCEPTION 'already member'; END IF;
  SELECT role INTO r FROM public.project_left WHERE project_id = p AND user_id = auth.uid();
  IF r IS NULL THEN RAISE EXCEPTION 'never a member'; END IF;
  SELECT id INTO rid FROM public.project_join_requests WHERE project_id = p AND user_id = auth.uid() AND status = 'pending';
  IF rid IS NOT NULL THEN RETURN rid; END IF;
  SELECT * INTO u FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.project_join_requests (project_id, user_id, name, email, avatar, role)
    VALUES (p, auth.uid(), coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), ''), coalesce(u.email, ''), u.raw_user_meta_data->>'avatar_url', r)
    RETURNING id INTO rid;
  RETURN rid;
END $$;

-- Il proprietario accetta (torna membro con il ruolo di prima) o nega.
CREATE OR REPLACE FUNCTION public.answer_join_request(req uuid, accept boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q public.project_join_requests;
BEGIN
  SELECT * INTO q FROM public.project_join_requests WHERE id = req;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF public.project_role(q.project_id) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'only the owner answers'; END IF;
  IF q.status <> 'pending' THEN RETURN; END IF;
  IF accept THEN
    INSERT INTO public.project_members (project_id, user_id, role) VALUES (q.project_id, q.user_id, q.role)
      ON CONFLICT (project_id, user_id) DO NOTHING;
    DELETE FROM public.project_left WHERE project_id = q.project_id AND user_id = q.user_id;
  END IF;
  UPDATE public.project_join_requests SET status = CASE WHEN accept THEN 'accepted' ELSE 'denied' END, answered_at = now() WHERE id = req;
END $$;

-- Il nome del progetto e del proprietario per chi ne è uscito (la richiesta mostra a chi chiede).
CREATE OR REPLACE FUNCTION public.left_project_info(p uuid) RETURNS TABLE (name text, kind text, owner_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pr.name, pr.kind, coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1))
  FROM public.projects pr JOIN auth.users u ON u.id = pr.owner
  WHERE pr.id = p AND EXISTS (SELECT 1 FROM public.project_left l WHERE l.project_id = p AND l.user_id = auth.uid())
$$;

REVOKE EXECUTE ON FUNCTION public.leave_project(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.request_rejoin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.answer_join_request(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.left_project_info(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_rejoin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.answer_join_request(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.left_project_info(uuid) TO authenticated;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.project_join_requests;
EXCEPTION WHEN others THEN NULL; END $$;
