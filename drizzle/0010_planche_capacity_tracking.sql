ALTER TABLE public.crm_planches DROP CONSTRAINT IF EXISTS crm_planches_capacity_valid;
ALTER TABLE public.crm_planches DROP CONSTRAINT IF EXISTS crm_planches_capacity_range;
ALTER TABLE public.crm_planches
  ADD CONSTRAINT crm_planches_capacity_range CHECK (capacity BETWEEN 1 AND 100);

CREATE TABLE IF NOT EXISTS public.crm_planche_events (
  id text PRIMARY KEY,
  planche_id text NOT NULL REFERENCES public.crm_planches(id) ON DELETE CASCADE,
  action text NOT NULL,
  from_status text,
  to_status text,
  note text,
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_planche_events_action_valid CHECK (
    action IN ('created', 'status', 'orders_added', 'orders_removed', 'capacity')
  )
);

CREATE INDEX IF NOT EXISTS crm_planche_events_planche_idx
  ON public.crm_planche_events (planche_id, created_at DESC);

ALTER TABLE public.crm_planche_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view planche events" ON public.crm_planche_events;
CREATE POLICY "Users can view planche events" ON public.crm_planche_events
  FOR SELECT TO authenticated USING (true);
