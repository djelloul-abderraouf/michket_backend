ALTER TABLE "category_images" ADD COLUMN "mobile_url" text;--> statement-breakpoint
ALTER TABLE "category_images" ADD COLUMN "mobile_storage_path" text;--> statement-breakpoint
CREATE UNIQUE INDEX "category_images_mobile_storage_path_unique_idx" ON "category_images" USING btree ("mobile_storage_path") WHERE "category_images"."mobile_storage_path" IS NOT NULL;