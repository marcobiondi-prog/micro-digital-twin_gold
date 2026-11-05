-- I sensori dell'utente (termici e non solo) e le loro letture. Ogni sensore ha una chiave segreta: il dispositivo la
-- usa per inviare le letture a /api/public/sensor-readings; qui se ne conserva solo l'impronta (sha-256).
-- Si applica incollandola nel SQL Editor di Supabase.
CREATE TABLE public.sensors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  flow text NOT NULL CHECK (flow IN ('piazza', 'vigneto')),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  kind text NOT NULL CHECK (kind IN ('temperatura', 'superficie', 'umidita_aria', 'umidita_suolo', 'vento', 'pioggia')),
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  zone smallint CHECK (zone BETWEEN 0 AND 9),
  token_hash text NOT NULL UNIQUE,
  last_seen_at timestamptz
);
CREATE INDEX sensors_user_idx ON public.sensors (user_id, flow);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sensors TO authenticated;
GRANT ALL ON public.sensors TO service_role;
ALTER TABLE public.sensors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sensors select" ON public.sensors FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own sensors insert" ON public.sensors FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own sensors update" ON public.sensors FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own sensors delete" ON public.sensors FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.sensor_readings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sensor_id uuid NOT NULL REFERENCES public.sensors(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('temperatura', 'superficie', 'umidita_aria', 'umidita_suolo', 'vento', 'pioggia')),
  value double precision NOT NULL
);
CREATE INDEX sensor_readings_sensor_idx ON public.sensor_readings (sensor_id, at DESC);
CREATE INDEX sensor_readings_user_idx ON public.sensor_readings (user_id, at DESC);
GRANT SELECT, INSERT, DELETE ON public.sensor_readings TO authenticated;
GRANT ALL ON public.sensor_readings TO service_role;
ALTER TABLE public.sensor_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own readings select" ON public.sensor_readings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own readings insert" ON public.sensor_readings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.sensors s WHERE s.id = sensor_id AND s.user_id = auth.uid()));
CREATE POLICY "own readings delete" ON public.sensor_readings FOR DELETE TO authenticated USING (auth.uid() = user_id);
