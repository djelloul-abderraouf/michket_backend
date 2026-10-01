CREATE TABLE IF NOT EXISTS "tracking_pixels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "platform" text NOT NULL,
  "pixel_id" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tracking_pixels_platform_valid" CHECK ("platform" in ('meta', 'tiktok'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "tracking_pixels_platform_pixel_idx"
  ON "tracking_pixels" ("platform", "pixel_id");

ALTER TABLE "campaigns"
  ADD COLUMN IF NOT EXISTS "meta_pixel_id" uuid REFERENCES "tracking_pixels"("id") ON DELETE SET NULL;

ALTER TABLE "campaigns"
  ADD COLUMN IF NOT EXISTS "tiktok_pixel_id" uuid REFERENCES "tracking_pixels"("id") ON DELETE SET NULL;

ALTER TABLE "tracking_pixels" ENABLE ROW LEVEL SECURITY;
