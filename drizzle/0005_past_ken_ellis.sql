CREATE TYPE "public"."promotion_discount_type" AS ENUM('percentage', 'fixed');--> statement-breakpoint
CREATE TABLE "promotions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "code" text NOT NULL,
        "description" text,
        "discount_type" "promotion_discount_type" NOT NULL,
        "discount_value" integer NOT NULL,
        "min_subtotal_cents" integer DEFAULT 0 NOT NULL,
        "max_discount_cents" integer,
        "starts_at" timestamp with time zone,
        "ends_at" timestamp with time zone,
        "is_active" boolean DEFAULT true NOT NULL,
        "usage_limit" integer,
        "usage_count" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "promotions_code_unique" UNIQUE("code"),
        CONSTRAINT "promotions_discount_value_positive" CHECK ("promotions"."discount_value" > 0),
        CONSTRAINT "promotions_percentage_value_valid" CHECK ("promotions"."discount_type" <> 'percentage' OR "promotions"."discount_value" BETWEEN 1 AND 100),
        CONSTRAINT "promotions_min_subtotal_nonnegative" CHECK ("promotions"."min_subtotal_cents" >= 0),
        CONSTRAINT "promotions_max_discount_nonnegative" CHECK ("promotions"."max_discount_cents" IS NULL OR "promotions"."max_discount_cents" >= 0),
        CONSTRAINT "promotions_usage_limit_positive" CHECK ("promotions"."usage_limit" IS NULL OR "promotions"."usage_limit" > 0),
        CONSTRAINT "promotions_usage_count_nonnegative" CHECK ("promotions"."usage_count" >= 0),
        CONSTRAINT "promotions_usage_within_limit" CHECK ("promotions"."usage_limit" IS NULL OR "promotions"."usage_count" <= "promotions"."usage_limit"),
        CONSTRAINT "promotions_valid_date_range" CHECK ("promotions"."starts_at" IS NULL OR "promotions"."ends_at" IS NULL OR "promotions"."ends_at" > "promotions"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "promotions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE INDEX "promotions_active_idx" ON "promotions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "promotions_validity_idx" ON "promotions" USING btree ("starts_at","ends_at");
