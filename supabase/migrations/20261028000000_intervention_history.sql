-- Cronologia degli interventi (pagina Benvenuto): per chi ha l'account vive qui, per gli altri sul dispositivo.
-- Si applica incollandola nel SQL Editor di Supabase.
CREATE TABLE public.intervention_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  flow text NOT NULL CHECK (flow IN ('piazza', 'vigneto')),
  place text NOT NULL DEFAULT '' CHECK (length(place) <= 200),
  text text NOT NULL CHECK (length(text) BETWEEN 1 AND 300)
);
CREATE INDEX intervention_history_user_idx ON public.intervention_history (user_id, at DESC);
GRANT SELECT, INSERT, DELETE ON public.intervention_history TO authenticated;
GRANT ALL ON public.intervention_history TO service_role;
ALTER TABLE public.intervention_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own history select" ON public.intervention_history FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own history insert" ON public.intervention_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own history delete" ON public.intervention_history FOR DELETE TO authenticated USING (auth.uid() = user_id);
