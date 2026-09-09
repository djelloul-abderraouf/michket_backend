CREATE TABLE "category_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"url" text NOT NULL,
	"storage_path" text NOT NULL,
	"alt_text" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category_images" ADD CONSTRAINT "category_images_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_images_category_idx" ON "category_images" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "category_images_category_sort_idx" ON "category_images" USING btree ("category_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "category_images_storage_path_unique_idx" ON "category_images" USING btree ("storage_path") WHERE "category_images"."storage_path" IS NOT NULL;