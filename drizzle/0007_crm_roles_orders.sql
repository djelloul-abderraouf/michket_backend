ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "staff_roles" text[] NOT NULL DEFAULT '{}'::text[];

UPDATE "users"
SET "staff_roles" = ARRAY["role"]::text[]
WHERE "staff_roles" = '{}'::text[]
  AND "role" <> 'customer';

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "order_kind" text;

ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_order_kind_valid";
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_order_kind_valid"
  CHECK (
    "order_kind" IS NULL
    OR "order_kind" IN (
      'urgent',
      'propre',
      'refabrication_0',
      'correction_interne',
      'recupe'
    )
  );

CREATE TABLE IF NOT EXISTS "order_remarks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "author_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "order_remarks_order_idx" ON "order_remarks" ("order_id");

CREATE TABLE IF NOT EXISTS "order_contact_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "attempt_number" integer NOT NULL,
  "notes" text NOT NULL,
  "employee_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "order_contact_attempts_number_range" CHECK ("attempt_number" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX IF NOT EXISTS "order_contact_attempts_order_number_idx"
  ON "order_contact_attempts" ("order_id", "attempt_number");

CREATE INDEX IF NOT EXISTS "order_contact_attempts_order_idx"
  ON "order_contact_attempts" ("order_id");
