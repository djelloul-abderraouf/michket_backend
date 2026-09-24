DO $$ BEGIN
  CREATE TYPE order_source AS ENUM ('ecom', 'whatsapp', 'facebook', 'instagram');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source order_source NOT NULL DEFAULT 'ecom';

COMMENT ON COLUMN public.orders.source IS
  'Where the order came from. Checkout inserts default to ecom so the live storefront needs no change.';

UPDATE public.orders
SET source = 'whatsapp'
WHERE source = 'ecom'
  AND reference LIKE 'CRM-%';
