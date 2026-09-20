import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { categories } from './categories';

export const categoryImages = pgTable(
  'category_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, {
        onDelete: 'cascade',
      }),

    // Image Hero desktop existante.
    // On la conserve telle quelle pour ne rien casser.
    url: text('url').notNull(),

    storagePath: text('storage_path').notNull(),

    // Image mobile optionnelle du même slide Hero.
    // Les anciennes lignes peuvent rester null.
    mobileUrl: text('mobile_url'),

    mobileStoragePath: text('mobile_storage_path'),

    altText: text('alt_text'),

    sortOrder: integer('sort_order')
      .notNull()
      .default(0),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('category_images_category_idx').on(
      table.categoryId,
    ),

    index(
      'category_images_category_sort_idx',
    ).on(table.categoryId, table.sortOrder),

    uniqueIndex(
      'category_images_storage_path_unique_idx',
    )
      .on(table.storagePath)
      .where(sql`${table.storagePath} IS NOT NULL`),

    uniqueIndex(
      'category_images_mobile_storage_path_unique_idx',
    )
      .on(table.mobileStoragePath)
      .where(
        sql`${table.mobileStoragePath} IS NOT NULL`,
      ),
  ],
);
