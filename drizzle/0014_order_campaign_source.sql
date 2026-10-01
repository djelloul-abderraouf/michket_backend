ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE SET NULL;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "campaign_slug" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "campaign_title" text;
