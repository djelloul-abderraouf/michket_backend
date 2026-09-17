ALTER TABLE "product_variants"
ADD COLUMN IF NOT EXISTS "is_multicolor" boolean DEFAULT false NOT NULL;--> statement-breakpoint

ALTER TABLE "products"
ADD COLUMN IF NOT EXISTS "subcategory_id" uuid;--> statement-breakpoint

ALTER TABLE "products"
ADD COLUMN IF NOT EXISTS "subsubcategory_id" uuid;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_subcategory_id_categories_id_fk'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE "products"
      ADD CONSTRAINT "products_subcategory_id_categories_id_fk"
      FOREIGN KEY ("subcategory_id")
      REFERENCES "public"."categories"("id")
      ON DELETE NO ACTION
      ON UPDATE NO ACTION;
  END IF;
END
$$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_subsubcategory_id_categories_id_fk'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE "products"
      ADD CONSTRAINT "products_subsubcategory_id_categories_id_fk"
      FOREIGN KEY ("subsubcategory_id")
      REFERENCES "public"."categories"("id")
      ON DELETE NO ACTION
      ON UPDATE NO ACTION;
  END IF;
END
$$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "products_subcategory_idx"
ON "products" USING btree ("subcategory_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "products_subsubcategory_idx"
ON "products" USING btree ("subsubcategory_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "products_category_subcategory_idx"
ON "products" USING btree ("category_id", "subcategory_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "products_category_subcategory_subsubcategory_idx"
ON "products" USING btree ("category_id", "subcategory_id", "subsubcategory_id");--> statement-breakpoint

ALTER TABLE "orders"
ADD COLUMN "full_name" text;--> statement-breakpoint

UPDATE "orders"
SET "full_name" = btrim(concat_ws(' ', "first_name", "last_name"))
WHERE "full_name" IS NULL;--> statement-breakpoint

ALTER TABLE "orders"
ALTER COLUMN "full_name" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "orders"
DROP COLUMN "first_name";--> statement-breakpoint

ALTER TABLE "orders"
DROP COLUMN "last_name";
