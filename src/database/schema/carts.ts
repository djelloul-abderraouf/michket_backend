import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { users } from './users';
import { products, productVariants } from './products';

export const cartStatusEnum = pgEnum('cart_status', [
  'active',
  'converted',
  'abandoned',
]);

export const carts = pgTable(
  'carts',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Connected customer cart
    userId: uuid('user_id').references(() => users.id),

    // Guest cart. The backend generates a UUID session id.
    sessionId: text('session_id'),

    status: cartStatusEnum('status')
      .notNull()
      .default('active'),

    promoCode: text('promo_code'),

    promoDiscountCents: integer(
      'promo_discount_cents',
    )
      .notNull()
      .default(0),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('carts_user_idx').on(table.userId),
    index('carts_session_idx').on(table.sessionId),
    index('carts_status_idx').on(table.status),

    // One active cart per connected user.
    uniqueIndex('carts_active_user_unique_idx')
      .on(table.userId)
      .where(
        sql`${table.userId} IS NOT NULL AND ${table.status} = 'active'`,
      ),

    // One active cart per guest session.
    uniqueIndex('carts_active_session_unique_idx')
      .on(table.sessionId)
      .where(
        sql`${table.sessionId} IS NOT NULL AND ${table.status} = 'active'`,
      ),

    // A cart must belong to a user, a guest session,
    // or both temporarily during a future cart merge.
    check(
      'carts_owner_required',
      sql`${table.userId} IS NOT NULL OR ${table.sessionId} IS NOT NULL`,
    ),

    check(
      'carts_promo_discount_nonnegative',
      sql`${table.promoDiscountCents} >= 0`,
    ),
  ],
);

export const cartItems = pgTable(
  'cart_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    cartId: uuid('cart_id')
      .notNull()
      .references(() => carts.id, {
        onDelete: 'cascade',
      }),

    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),

    variantId: uuid('variant_id').references(
      () => productVariants.id,
    ),

    quantity: integer('quantity').notNull(),

    // Snapshot for fast cart rendering.
    // Checkout recalculates the authoritative price from DB.
    unitPriceCents: integer(
      'unit_price_cents',
    ).notNull(),

    selectedColorName: text(
      'selected_color_name',
    ),

    selectedColorHex: text(
      'selected_color_hex',
    ),

    // Customer-specific data for THIS cart line.
    personalization: jsonb('personalization'),

    // Stable SHA-256 key computed by the backend from
    // normalized personalization.
    personalizationKey: text(
      'personalization_key',
    )
      .notNull()
      .default(''),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('cart_items_cart_idx').on(
      table.cartId,
    ),

    index('cart_items_product_idx').on(
      table.productId,
    ),

    index('cart_items_variant_idx').on(
      table.variantId,
    ),

    // Variant line uniqueness.
    uniqueIndex(
      'cart_items_variant_line_unique_idx',
    )
      .on(
        table.cartId,
        table.productId,
        table.variantId,
        table.personalizationKey,
      )
      .where(
        sql`${table.variantId} IS NOT NULL`,
      ),

    // Product without variant: PostgreSQL NULL semantics
    // are handled with a separate partial unique index.
    uniqueIndex(
      'cart_items_product_line_unique_idx',
    )
      .on(
        table.cartId,
        table.productId,
        table.personalizationKey,
      )
      .where(
        sql`${table.variantId} IS NULL`,
      ),

    check(
      'cart_items_quantity_range',
      sql`${table.quantity} >= 1 AND ${table.quantity} <= 99`,
    ),

    check(
      'cart_items_unit_price_nonnegative',
      sql`${table.unitPriceCents} >= 0`,
    ),
  ],
);
