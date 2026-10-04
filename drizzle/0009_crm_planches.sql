CREATE TABLE IF NOT EXISTS public.crm_planches (
  id text PRIMARY KEY,
  reference text NOT NULL UNIQUE,
  capacity integer NOT NULL,
  status text NOT NULL DEFAULT 'en_attente',
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_by_name text,
  launched_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_planches_capacity_valid CHECK (capacity IN (5, 10, 15)),
  CONSTRAINT crm_planches_status_valid CHECK (status IN ('en_attente', 'lancee', 'terminee'))
);

CREATE TABLE IF NOT EXISTS public.crm_planche_orders (
  id text PRIMARY KEY,
  planche_id text NOT NULL REFERENCES public.crm_planches(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_planche_orders_order_unique UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS crm_planche_orders_planche_idx
  ON public.crm_planche_orders (planche_id);

ALTER TABLE public.crm_planches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_planche_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view planches" ON public.crm_planches;
CREATE POLICY "Users can view planches" ON public.crm_planches
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can view planche orders" ON public.crm_planche_orders;
CREATE POLICY "Users can view planche orders" ON public.crm_planche_orders
  FOR SELECT TO authenticated USING (true);
