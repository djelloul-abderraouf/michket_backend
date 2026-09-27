ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'social_media';

CREATE TABLE IF NOT EXISTS "campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "public_title" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "campaign_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
  "title" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "variant_ids" uuid[] NOT NULL DEFAULT '{}',
  CONSTRAINT "campaign_items_title_len" CHECK (char_length("title") BETWEEN 1 AND 120),
  CONSTRAINT "campaign_items_sort_nonnegative" CHECK ("sort_order" >= 0)
);

CREATE INDEX IF NOT EXISTS "campaign_items_campaign_idx"
  ON "campaign_items" ("campaign_id", "sort_order");

ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaign_items" ENABLE ROW LEVEL SECURITY;
