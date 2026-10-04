CREATE UNIQUE INDEX IF NOT EXISTS crm_stock_items_catalog_product_unique
  ON public.crm_stock_items (catalog_product_id);

UPDATE public.crm_planches
SET capacity = 100
WHERE capacity <> 100;
