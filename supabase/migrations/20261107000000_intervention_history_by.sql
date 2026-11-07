-- Cronologia: chi ha registrato l'intervento della piazza (Comune, ufficio e ruolo del funzionario in quel momento).
-- Facoltativo: senza questa colonna le voci si salvano lo stesso, e per quelle con gli interventi una copia resta in mix.by.
-- Si applica incollandola nel SQL Editor di Supabase, dopo 20261029010000_intervention_history_when.sql.
ALTER TABLE public.intervention_history ADD COLUMN IF NOT EXISTS "by" jsonb;
