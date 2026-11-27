-- Revoca la richiesta di rientro: chi l'ha mandata può ritirarla finché è in attesa (stato 'cancelled').
ALTER TABLE public.project_join_requests DROP CONSTRAINT IF EXISTS project_join_requests_status_check;
ALTER TABLE public.project_join_requests ADD CONSTRAINT project_join_requests_status_check
  CHECK (status IN ('pending', 'accepted', 'denied', 'cancelled'));

CREATE OR REPLACE FUNCTION public.cancel_join_request(req uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  UPDATE public.project_join_requests SET status = 'cancelled', answered_at = now()
    WHERE id = req AND user_id = auth.uid() AND status = 'pending';
END $$;

REVOKE EXECUTE ON FUNCTION public.cancel_join_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_join_request(uuid) TO authenticated;
