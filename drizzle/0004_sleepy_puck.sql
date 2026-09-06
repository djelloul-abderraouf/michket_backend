ALTER TABLE "order_items" DROP CONSTRAINT "order_items_quantity_positive";--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_range" CHECK ("order_items"."quantity" >= 1 AND "order_items"."quantity" <= 99);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_type_valid" CHECK ("orders"."delivery_type" IN ('home', 'office'));