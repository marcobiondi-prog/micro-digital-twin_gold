-- Progetti condivisi: chi c'è in un progetto (nome, email, foto dell'account) per i suoi membri, e cosa dice un invito
-- a chi lo apre. Le tabelle degli utenti non sono leggibili dall'app: queste due funzioni rispondono solo il necessario.
-- Applicata il 27/11/2026 (strumento Supabase).

CREATE OR REPLACE FUNCTION public.project_people(p uuid)
RETURNS TABLE (user_id uuid, role text, email text, name text, avatar text, added_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id, m.role, u.email::text,
         coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
         coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture'),
         m.added_at
  FROM public.project_members m JOIN auth.users u ON u.id = m.user_id
  WHERE m.project_id = p AND public.project_role(p) IS NOT NULL
  ORDER BY (m.role = 'owner') DESC, m.added_at
$$;
REVOKE EXECUTE ON FUNCTION public.project_people(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_people(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.invite_info(t text)
RETURNS TABLE (project_id uuid, kind text, name text, role text, inviter text, accepted boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.kind, p.name, i.role,
         coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
         i.accepted_at IS NOT NULL
  FROM public.project_invites i
  JOIN public.projects p ON p.id = i.project_id
  JOIN auth.users u ON u.id = i.invited_by
  WHERE i.token = t AND auth.uid() IS NOT NULL
$$;
REVOKE EXECUTE ON FUNCTION public.invite_info(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_info(text) TO authenticated;
