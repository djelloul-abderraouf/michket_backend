ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS duplicate_review text,
  ADD COLUMN IF NOT EXISTS duplicate_reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duplicate_reviewed_at timestamptz;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_duplicate_review_valid;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_duplicate_review_valid
  CHECK (
    duplicate_review IS NULL
    OR duplicate_review IN ('unique', 'verifie')
  );
