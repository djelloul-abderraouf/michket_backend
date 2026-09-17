CREATE TABLE "client_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"image_url" text NOT NULL,
	"image_storage_path" text NOT NULL,
	"alt_text" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "client_references_active_sort_idx" ON "client_references" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "client_references_image_storage_path_unique_idx" ON "client_references" USING btree ("image_storage_path") WHERE "client_references"."image_storage_path" IS NOT NULL;