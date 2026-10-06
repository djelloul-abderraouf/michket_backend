ALTER TABLE public.crm_stock_items
  ADD COLUMN IF NOT EXISTS usage text NOT NULL DEFAULT 'alimentation';

UPDATE public.crm_stock_items
SET usage = 'vente'
WHERE item_type = 'produit_fini' AND usage = 'alimentation';

ALTER TABLE public.crm_stock_items
  DROP CONSTRAINT IF EXISTS crm_stock_items_usage_check;

ALTER TABLE public.crm_stock_items
  ADD CONSTRAINT crm_stock_items_usage_check
  CHECK (usage IN ('alimentation', 'vente', 'les_deux'));
