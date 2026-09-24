import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
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

export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'paid',
  'failed',
  'refunded',
]);

export const shipmentStatusEnum = pgEnum('shipment_status', [
  'pending',
  'created',
  'in_transit',
  'delivered',
  'failed',
  'cancelled',
]);

export const orderSourceEnum = pgEnum('order_source', [
  'ecom',
  'whatsapp',
  'facebook',
  'instagram',
]);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    reference: text('reference').notNull().unique(),

    // Checkout inserts omit this field and get ecom via the DB default.
    source: orderSourceEnum('source').notNull().default('ecom'),

    // Null for guest checkout.
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    status: orderStatusEnum('status').notNull().default('pending'),

    // Money snapshots.
    subtotalCents: integer('subtotal_cents').notNull(),
    deliveryFeeCents: integer('delivery_fee_cents').notNull(),
    discountCents: integer('discount_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),
    currency: text('currency').notNull().default('DZD'),

    // Customer + shipping snapshot.
    fullName: text('full_name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),

    addressLine1: text('address_line_1').notNull(),
    addressLine2: text('address_line_2'),

    wilayaCode: integer('wilaya_code').notNull(),
    wilayaName: text('wilaya_name').notNull(),
    commune: text('commune').notNull(),

    // Expected values will be validated by the DTO/service:
    // "home" or "office".
    deliveryType: text('delivery_type').notNull(),

    // Reserved for future carrier/CRM stop-desk integration.
    deliveryOfficeId: text('delivery_office_id'),
    deliveryOfficeName: text('delivery_office_name'),

    notes: text('notes'),

    // Promo snapshot.
    promoCode: text('promo_code'),

    // COD for now. Kept as text so another payment method can be added later.
    paymentMethod: text('payment_method').notNull().default('cod'),
    paymentStatus: paymentStatusEnum('payment_status')
      .notNull()
      .default('pending'),

    // Hash of a random guest-access token.
    // This will later let us protect GET /orders/:reference without exposing
    // guest order PII to anyone who guesses a reference.
    guestAccessTokenHash: text('guest_access_token_hash'),

    paidAt: timestamp('paid_at', { withTimezone: true }),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),

    cancelReason: text('cancel_reason'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('orders_user_idx').on(table.userId),
    index('orders_status_idx').on(table.status),
    index('orders_created_at_idx').on(table.createdAt),
    index('orders_phone_idx').on(table.phone),

    check(
      'orders_subtotal_nonnegative',
      sql`${table.subtotalCents} >= 0`,
    ),
    check(
      'orders_delivery_fee_nonnegative',
      sql`${table.deliveryFeeCents} >= 0`,
    ),
    check(
      'orders_discount_nonnegative',
      sql`${table.discountCents} >= 0`,
    ),
    check(
      'orders_total_nonnegative',
      sql`${table.totalCents} >= 0`,
    ),
    check(
      'orders_total_consistent',
      sql`${table.totalCents} = ${table.subtotalCents} + ${table.deliveryFeeCents} - ${table.discountCents}`,
    ),
    check(
      'orders_wilaya_code_valid',
      sql`${table.wilayaCode} BETWEEN 1 AND 58`,
    ),
    check(
      'orders_delivery_type_valid',
      sql`${table.deliveryType} IN ('home', 'office')`,
    ),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    // References are useful internally, but all customer-visible values below
    // are immutable snapshots so old orders survive catalogue changes.
    productId: uuid('product_id').references(() => products.id, {
      onDelete: 'set null',
    }),

    variantId: uuid('variant_id').references(() => productVariants.id, {
      onDelete: 'set null',
    }),

    // Immutable product snapshots.
    productName: text('product_name').notNull(),
    productSlug: text('product_slug').notNull(),
    productImageUrl: text('product_image_url'),

    // Immutable variant snapshots.
    variantName: text('variant_name'),
    variantSku: text('variant_sku'),
    colorName: text('color_name'),
    colorHex: text('color_hex'),

    quantity: integer('quantity').notNull(),

    unitPriceCents: integer('unit_price_cents').notNull(),
    totalPriceCents: integer('total_price_cents').notNull(),

    // Personalization belongs to this exact ordered line.
    personalization: jsonb('personalization'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('order_items_order_idx').on(table.orderId),
    index('order_items_product_idx').on(table.productId),
    index('order_items_variant_idx').on(table.variantId),

    check(
      'order_items_quantity_range',
      sql`${table.quantity} >= 1 AND ${table.quantity} <= 99`,
    ),
    check(
      'order_items_unit_price_nonnegative',
      sql`${table.unitPriceCents} >= 0`,
    ),
    check(
      'order_items_total_price_nonnegative',
      sql`${table.totalPriceCents} >= 0`,
    ),
    check(
      'order_items_total_price_consistent',
      sql`${table.totalPriceCents} = ${table.unitPriceCents} * ${table.quantity}`,
    ),
  ],
);

/**
 * Immutable audit trail for every order status change.
 * This will later be useful for the admin panel, CRM and delivery sync.
 */
export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    fromStatus: orderStatusEnum('from_status'),
    toStatus: orderStatusEnum('to_status').notNull(),

    // Null when changed automatically by the system/webhook.
    changedByUserId: uuid('changed_by_user_id').references(
      () => users.id,
      { onDelete: 'set null' },
    ),

    reason: text('reason'),
    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('order_status_history_order_idx').on(table.orderId),
    index('order_status_history_created_at_idx').on(table.createdAt),
  ],
);

/**
 * Future carrier/CRM synchronization.
 * No Yalidine-specific tariff logic is stored here.
 */
export const shipments = pgTable(
  'shipments',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    provider: text('provider'),
    externalShipmentId: text('external_shipment_id'),
    trackingNumber: text('tracking_number'),

    status: shipmentStatusEnum('status').notNull().default('pending'),

    stopDeskId: text('stop_desk_id'),
    stopDeskName: text('stop_desk_name'),

    metadata: jsonb('metadata'),

    syncedAt: timestamp('synced_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('shipments_order_unique_idx').on(table.orderId),
    index('shipments_tracking_number_idx').on(table.trackingNumber),

    uniqueIndex('shipments_provider_external_unique_idx')
      .on(table.provider, table.externalShipmentId)
      .where(sql`${table.externalShipmentId} IS NOT NULL`),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    provider: text('provider').notNull(),
    providerPaymentId: text('provider_payment_id'),

    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('DZD'),

    status: paymentStatusEnum('payment_status').notNull(),

    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('payments_order_idx').on(table.orderId),

    uniqueIndex('payments_provider_payment_unique_idx')
      .on(table.provider, table.providerPaymentId)
      .where(sql`${table.providerPaymentId} IS NOT NULL`),

    check(
      'payments_amount_nonnegative',
      sql`${table.amountCents} >= 0`,
    ),
  ],
);

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    source: text('source').notNull(),
    eventType: text('event_type').notNull(),

    // Provider event id, when available, prevents duplicate processing.
    externalEventId: text('external_event_id'),

    payload: jsonb('payload').notNull(),

    processed: boolean('processed').notNull().default(false),
    processedAt: timestamp('processed_at', { withTimezone: true }),

    error: text('error'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('webhook_events_source_idx').on(table.source),
    index('webhook_events_processed_idx').on(table.processed),

    uniqueIndex('webhook_events_source_external_unique_idx')
      .on(table.source, table.externalEventId)
      .where(sql`${table.externalEventId} IS NOT NULL`),
  ],
);
