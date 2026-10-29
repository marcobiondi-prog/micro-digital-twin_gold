-- "Riapri" nella cronologia: gli interventi registrati (alberi, prato, ombra · irrigazione, teli, frangivento per zona)
-- per rimetterli nella simulazione. Facoltativo: senza questa colonna le voci si salvano lo stesso, senza "Riapri".
-- Si applica incollandola nel SQL Editor di Supabase, dopo 20261028000000_intervention_history.sql.
ALTER TABLE public.intervention_history ADD COLUMN IF NOT EXISTS mix jsonb;
