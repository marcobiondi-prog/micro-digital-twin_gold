-- Progetti condivisi · fasi 0 e 1: ogni piazza o vigneto ha il suo posto nel cloud (projects), le persone che ci
-- lavorano (project_members: owner | editor | viewer) e gli inviti (project_invites).
-- Vede un progetto chi ne è membro; lo modifica owner o editor; solo l'owner invita, cambia i ruoli e toglie persone.
-- Applicata il 27/11/2026 (strumento Supabase).

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('piazza', 'vigneto')),
  name text NOT NULL DEFAULT '' CHECK (length(name) <= 200),
  place jsonb NOT NULL DEFAULT '{}'::jsonb,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS projects_owner_idx ON public.projects (owner, kind, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.project_members (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS project_members_user_idx ON public.project_members (user_id);

CREATE TABLE IF NOT EXISTS public.project_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (length(email) <= 320),
  role text NOT NULL CHECK (role IN ('editor', 'viewer')),
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  invited_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS project_invites_project_idx ON public.project_invites (project_id);

-- Ruolo della persona nel progetto (security definer: le regole non si richiamano a vicenda).
CREATE OR REPLACE FUNCTION public.project_role(p uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.project_members WHERE project_id = p AND user_id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION public.project_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_role(uuid) TO authenticated;

-- Chi crea il progetto ne è l'owner; ogni modifica segna quando e chi.
CREATE OR REPLACE FUNCTION public.projects_after_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.project_members (project_id, user_id, role) VALUES (NEW.id, NEW.owner, 'owner') ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS projects_owner_member ON public.projects;
CREATE TRIGGER projects_owner_member AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.projects_after_insert();

CREATE OR REPLACE FUNCTION public.projects_before_update() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  NEW.owner := OLD.owner;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS projects_touch ON public.projects;
CREATE TRIGGER projects_touch BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.projects_before_update();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_invites TO authenticated;
GRANT ALL ON public.projects, public.project_members, public.project_invites TO service_role;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read projects" ON public.projects FOR SELECT TO authenticated USING (public.project_role(id) IS NOT NULL OR owner = auth.uid());
CREATE POLICY "create own projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (owner = auth.uid());
CREATE POLICY "editors update projects" ON public.projects FOR UPDATE TO authenticated USING (public.project_role(id) IN ('owner', 'editor')) WITH CHECK (public.project_role(id) IN ('owner', 'editor'));
CREATE POLICY "owner deletes projects" ON public.projects FOR DELETE TO authenticated USING (owner = auth.uid());

CREATE POLICY "members read members" ON public.project_members FOR SELECT TO authenticated USING (public.project_role(project_id) IS NOT NULL);
CREATE POLICY "owner adds members" ON public.project_members FOR INSERT TO authenticated WITH CHECK (public.project_role(project_id) = 'owner');
CREATE POLICY "owner changes roles" ON public.project_members FOR UPDATE TO authenticated USING (public.project_role(project_id) = 'owner') WITH CHECK (public.project_role(project_id) = 'owner' AND role <> 'owner');
CREATE POLICY "owner removes, anyone leaves" ON public.project_members FOR DELETE TO authenticated USING ((public.project_role(project_id) = 'owner' AND role <> 'owner') OR (user_id = auth.uid() AND role <> 'owner'));

CREATE POLICY "owner reads invites" ON public.project_invites FOR SELECT TO authenticated USING (public.project_role(project_id) = 'owner');
CREATE POLICY "owner invites" ON public.project_invites FOR INSERT TO authenticated WITH CHECK (public.project_role(project_id) = 'owner' AND invited_by = auth.uid());
CREATE POLICY "owner cancels invites" ON public.project_invites FOR DELETE TO authenticated USING (public.project_role(project_id) = 'owner');

-- Accettare un invito: con il token, la persona entra nel progetto con il ruolo dell'invito (una volta sola).
CREATE OR REPLACE FUNCTION public.accept_project_invite(t text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv public.project_invites;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  SELECT * INTO inv FROM public.project_invites WHERE token = t;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite not found'; END IF;
  IF inv.accepted_at IS NOT NULL AND inv.accepted_by <> auth.uid() THEN RAISE EXCEPTION 'invite already used'; END IF;
  INSERT INTO public.project_members (project_id, user_id, role) VALUES (inv.project_id, auth.uid(), inv.role)
    ON CONFLICT (project_id, user_id) DO NOTHING;
  UPDATE public.project_invites SET accepted_at = now(), accepted_by = auth.uid() WHERE id = inv.id;
  RETURN inv.project_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.accept_project_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_project_invite(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.projects_after_insert() FROM PUBLIC, anon, authenticated;

-- In diretta (fase 3): le modifiche ai progetti arrivano agli altri membri.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
EXCEPTION WHEN others THEN NULL; END $$;
