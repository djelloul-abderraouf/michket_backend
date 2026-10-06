ALTER TABLE public.order_contact_attempts
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS checked boolean NOT NULL DEFAULT false;

ALTER TABLE public.order_contact_attempts
  DROP CONSTRAINT IF EXISTS order_contact_attempts_outcome_check;

ALTER TABLE public.order_contact_attempts
  ADD CONSTRAINT order_contact_attempts_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('pas_de_reponse', 'confirme', 'annule'));
