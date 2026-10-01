import {
  boolean,
  check,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { users } from './users';

export const trackingPixels = pgTable(
  'tracking_pixels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    platform: text('platform').notNull(),
    pixelId: text('pixel_id').notNull(),
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
  },
  (table) => [
    uniqueIndex('tracking_pixels_platform_pixel_idx').on(
      table.platform,
      table.pixelId,
    ),
    check(
      'tracking_pixels_platform_valid',
      sql`${table.platform} in ('meta', 'tiktok')`,
    ),
  ],
);
