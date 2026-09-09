import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { categories } from './categories';

export const productBadgeEnum = pgEnum('product_badge', [
  'BEST_SELLER',
  'NOUVEAU',
  'PROMO',
  'PERSONNALISABLE',
  'ENVOI_GRATUIT',
]);

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    shortDescription: text('short_description'),

    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id),

    priceCents: integer('price_cents').notNull(),
    compareAtPriceCents: integer('compare_at_price_cents'),
    currency: text('currency').notNull().default('DZD'),

    badge: productBadgeEnum('badge'),
    occasions: text('occasions').array(),
    isActive: boolean('is_active').notNull().default(true),

    isPersonalizable: boolean('is_personalizable')
      .notNull()
      .default(false),
    personalizationPrompt: text('personalization_prompt'),
    personalizationConfig: jsonb('personalization_config'),

    metaTitle: text('meta_title'),
    metaDescription: text('meta_description'),

    ratingAvg: numeric('rating_avg', { precision: 3, scale: 2 }),
    ratingCount: integer('rating_count').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('products_category_idx').on(table.categoryId),
    index('products_active_idx').on(table.isActive),
    check('products_price_nonnegative', sql`${table.priceCents} >= 0`),
    check(
      'products_compare_price_nonnegative',
      sql`${table.compareAtPriceCents} IS NULL OR ${table.compareAtPriceCents} >= 0`,
    ),
    check('products_rating_count_nonnegative', sql`${table.ratingCount} >= 0`),
  ],
);

export const productImages = pgTable(
  'product_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),

    url: text('url').notNull(),

    // Exact object path in Supabase Storage.
    // Example: products/2026/09/489d7ecb-....png
    storagePath: text('storage_path'),

    altText: text('alt_text'),
    sortOrder: integer('sort_order').notNull().default(0),
    isPrimary: boolean('is_primary').notNull().default(false),

    variantId: uuid('variant_id').references(
      () => productVariants.id,
      { onDelete: 'set null' },
    ),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('product_images_product_idx').on(table.productId),

    index('product_images_product_sort_idx').on(
      table.productId,
      table.sortOrder,
    ),

    index('product_images_variant_idx').on(table.variantId),

    uniqueIndex('product_images_storage_path_unique_idx')
      .on(table.storagePath)
      .where(sql`${table.storagePath} IS NOT NULL`),

    uniqueIndex('product_images_one_primary_per_product_idx')
      .on(table.productId)
      .where(sql`${table.isPrimary} = true`),
  ],
);

export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    sku: text('sku').unique(),
    colorName: text('color_name'),
    colorHex: text('color_hex'),
    priceCents: integer('price_cents'),
    options: jsonb('options'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('product_variants_product_idx').on(table.productId),
    index('product_variants_product_active_idx').on(
      table.productId,
      table.isActive,
    ),
    check(
      'product_variants_price_nonnegative',
      sql`${table.priceCents} IS NULL OR ${table.priceCents} >= 0`,
    ),
  ],
);

export const inventory = pgTable(
  'inventory',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),

    variantId: uuid('variant_id').references(() => productVariants.id, {
      onDelete: 'cascade',
    }),

    quantity: integer('quantity').notNull().default(0),
    reserved: integer('reserved').notNull().default(0),
    lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
    trackInventory: boolean('track_inventory').notNull().default(true),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('inventory_product_idx').on(table.productId),

    uniqueIndex('inventory_variant_unique_idx')
      .on(table.variantId)
      .where(sql`${table.variantId} IS NOT NULL`),

    uniqueIndex('inventory_product_no_variant_unique_idx')
      .on(table.productId)
      .where(sql`${table.variantId} IS NULL`),

    check('inventory_quantity_nonnegative', sql`${table.quantity} >= 0`),
    check('inventory_reserved_nonnegative', sql`${table.reserved} >= 0`),
    check(
      'inventory_reserved_lte_quantity',
      sql`${table.reserved} <= ${table.quantity}`,
    ),
    check(
      'inventory_low_stock_threshold_nonnegative',
      sql`${table.lowStockThreshold} >= 0`,
    ),
  ],
);
