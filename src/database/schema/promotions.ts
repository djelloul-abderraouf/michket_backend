import {
  pgEnum,
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const promotionDiscountTypeEnum = pgEnum(
  'promotion_discount_type',
  [
    'percentage',
    'fixed',
  ],
);

export const promotions = pgTable(
  'promotions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Stored normalized by the service (uppercase + trimmed).
    code: text('code').notNull().unique(),

    description: text('description'),

    discountType:
      promotionDiscountTypeEnum(
        'discount_type',
      ).notNull(),

    // percentage => integer from 1 to 100
    // fixed      => amount in centimes
    discountValue:
      integer('discount_value').notNull(),

    // Optional minimum cart subtotal before delivery.
    minSubtotalCents:
      integer('min_subtotal_cents')
        .notNull()
        .default(0),

    // Optional cap, mainly useful for percentage discounts.
    maxDiscountCents:
      integer('max_discount_cents'),

    startsAt: timestamp('starts_at', {
      withTimezone: true,
    }),

    endsAt: timestamp('ends_at', {
      withTimezone: true,
    }),

    isActive: boolean('is_active')
      .notNull()
      .default(true),

    // Null = unlimited uses.
    usageLimit: integer('usage_limit'),

    // Incremented atomically when a checkout using the code succeeds.
    usageCount: integer('usage_count')
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
    index('promotions_active_idx').on(
      table.isActive,
    ),

    index('promotions_validity_idx').on(
      table.startsAt,
      table.endsAt,
    ),

    check(
      'promotions_discount_value_positive',
      sql`${table.discountValue} > 0`,
    ),

    check(
      'promotions_percentage_value_valid',
      sql`${table.discountType} <> 'percentage' OR ${table.discountValue} BETWEEN 1 AND 100`,
    ),

    check(
      'promotions_min_subtotal_nonnegative',
      sql`${table.minSubtotalCents} >= 0`,
    ),

    check(
      'promotions_max_discount_nonnegative',
      sql`${table.maxDiscountCents} IS NULL OR ${table.maxDiscountCents} >= 0`,
    ),

    check(
      'promotions_usage_limit_positive',
      sql`${table.usageLimit} IS NULL OR ${table.usageLimit} > 0`,
    ),

    check(
      'promotions_usage_count_nonnegative',
      sql`${table.usageCount} >= 0`,
    ),

    check(
      'promotions_usage_within_limit',
      sql`${table.usageLimit} IS NULL OR ${table.usageCount} <= ${table.usageLimit}`,
    ),

    check(
      'promotions_valid_date_range',
      sql`${table.startsAt} IS NULL OR ${table.endsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`,
    ),
  ],
);
