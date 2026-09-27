import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { products } from './products';
import { users } from './users';

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  publicTitle: text('public_title').notNull(),
  slug: text('slug').notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const campaignItems = pgTable(
  'campaign_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    variantIds: uuid('variant_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
  },
  (table) => [
    index('campaign_items_campaign_idx').on(
      table.campaignId,
      table.sortOrder,
    ),
  ],
);
