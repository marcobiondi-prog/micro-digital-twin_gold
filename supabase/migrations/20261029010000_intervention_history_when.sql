-- Cronologia: la stagione e l'ora impostate nella simulazione quando l'intervento è stato fatto.
-- Facoltativo: senza queste colonne le voci si salvano lo stesso, senza stagione e ora.
-- Si applica incollandola nel SQL Editor di Supabase, dopo 20261029000000_intervention_history_mix.sql.
ALTER TABLE public.intervention_history ADD COLUMN IF NOT EXISTS season text CHECK (season IN ('inverno', 'primavera', 'estate', 'autunno'));
ALTER TABLE public.intervention_history ADD COLUMN IF NOT EXISTS hour smallint CHECK (hour BETWEEN 0 AND 23);
