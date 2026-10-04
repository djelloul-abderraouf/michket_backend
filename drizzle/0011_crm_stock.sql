CREATE TABLE IF NOT EXISTS public.crm_stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT '',
  item_type text NOT NULL,
  unit text NOT NULL DEFAULT 'pcs',
  min_quantity numeric(12, 3) NOT NULL DEFAULT 0,
  catalog_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_stock_items_type_valid CHECK (
    item_type IN ('matiere', 'composant', 'semi_fini', 'produit_fini')
  ),
  CONSTRAINT crm_stock_items_min_nonnegative CHECK (min_quantity >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_stock_items_name_unique ON public.crm_stock_items (name);
CREATE INDEX IF NOT EXISTS crm_stock_items_type_idx ON public.crm_stock_items (item_type);

CREATE TABLE IF NOT EXISTS public.crm_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.crm_stock_items(id) ON DELETE RESTRICT,
  movement_type text NOT NULL,
  quantity numeric(12, 3) NOT NULL,
  quantity_delta numeric(12, 3) NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source_type text NOT NULL DEFAULT 'manual',
  source_id text,
  source_ref text,
  note text,
  idempotency_key text,
  reverses_movement_id uuid,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_by_name text NOT NULL DEFAULT 'Équipe',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_stock_movements_type_valid CHECK (
    movement_type IN (
      'restock',
      'manufacturing_consumption',
      'manufacturing_production',
      'sale',
      'adjustment',
      'return',
      'loss',
      'reversal'
    )
  ),
  CONSTRAINT crm_stock_movements_quantity_positive CHECK (quantity > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_stock_movements_idempotency_unique
  ON public.crm_stock_movements (idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS crm_stock_movements_reversal_unique
  ON public.crm_stock_movements (reverses_movement_id);
CREATE INDEX IF NOT EXISTS crm_stock_movements_item_idx
  ON public.crm_stock_movements (item_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS crm_stock_movements_source_idx
  ON public.crm_stock_movements (source_type, source_id);

CREATE TABLE IF NOT EXISTS public.crm_stock_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  output_item_id uuid NOT NULL REFERENCES public.crm_stock_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_stock_recipes_kind_valid CHECK (kind IN ('manufacturing', 'sales'))
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_stock_recipes_output_kind_unique
  ON public.crm_stock_recipes (kind, output_item_id);

CREATE TABLE IF NOT EXISTS public.crm_stock_recipe_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.crm_stock_recipes(id) ON DELETE CASCADE,
  component_item_id uuid NOT NULL REFERENCES public.crm_stock_items(id) ON DELETE RESTRICT,
  quantity_per_unit numeric(12, 3) NOT NULL,
  CONSTRAINT crm_stock_recipe_lines_qty_positive CHECK (quantity_per_unit > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_stock_recipe_lines_unique
  ON public.crm_stock_recipe_lines (recipe_id, component_item_id);

CREATE TABLE IF NOT EXISTS public.crm_stock_manufacturing_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL,
  output_item_id uuid NOT NULL REFERENCES public.crm_stock_items(id) ON DELETE RESTRICT,
  quantity numeric(12, 3) NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  note text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_by_name text NOT NULL DEFAULT 'Équipe',
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  CONSTRAINT crm_stock_manufacturing_status_valid CHECK (status IN ('completed', 'cancelled')),
  CONSTRAINT crm_stock_manufacturing_qty_positive CHECK (quantity > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_stock_manufacturing_reference_unique
  ON public.crm_stock_manufacturing_orders (reference);
CREATE INDEX IF NOT EXISTS crm_stock_manufacturing_output_idx
  ON public.crm_stock_manufacturing_orders (output_item_id);

ALTER TABLE public.crm_stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_stock_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_stock_recipe_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_stock_manufacturing_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view stock items" ON public.crm_stock_items;
CREATE POLICY "Users can view stock items" ON public.crm_stock_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can view stock movements" ON public.crm_stock_movements;
CREATE POLICY "Users can view stock movements" ON public.crm_stock_movements
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can view stock recipes" ON public.crm_stock_recipes;
CREATE POLICY "Users can view stock recipes" ON public.crm_stock_recipes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can view stock recipe lines" ON public.crm_stock_recipe_lines;
CREATE POLICY "Users can view stock recipe lines" ON public.crm_stock_recipe_lines
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can view manufacturing orders" ON public.crm_stock_manufacturing_orders;
CREATE POLICY "Users can view manufacturing orders" ON public.crm_stock_manufacturing_orders
  FOR SELECT TO authenticated USING (true);
