-- Dispositivi collegati: i telefoni e i computer da cui si è entrati con l'account, visibili solo al suo proprietario.
-- Si applica incollandola nel SQL Editor di Supabase.
CREATE TABLE IF NOT EXISTS public.account_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL CHECK (length(device_id) BETWEEN 8 AND 64),
  label text NOT NULL DEFAULT '' CHECK (length(label) <= 120),
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);
CREATE INDEX IF NOT EXISTS account_devices_user_idx ON public.account_devices (user_id, last_seen DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_devices TO authenticated;
GRANT ALL ON public.account_devices TO service_role;
ALTER TABLE public.account_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own devices select" ON public.account_devices FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own devices insert" ON public.account_devices FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own devices update" ON public.account_devices FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own devices delete" ON public.account_devices FOR DELETE TO authenticated USING (auth.uid() = user_id);
