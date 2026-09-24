import {
  AnyPgColumn,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    name: text('name').notNull(),

    slug: text('slug').notNull().unique(),

    description: text('description'),

    imageUrl: text('image_url'),

    imageStoragePath: text('image_storage_path'),

    href: text('href'),

    // Self-reference: a category can optionally belong to another category.
    parentId: uuid('parent_id').references(
      (): AnyPgColumn => categories.id,
      { onDelete: 'set null' },
    ),

    isActive: boolean('is_active').notNull().default(true),

    sortOrder: integer('sort_order').notNull().default(0),

    metaTitle: text('meta_title'),

    metaDescription: text('meta_description'),

    pageTitle: text('page_title'),

    productsTitle: text('products_title'),

    filterLabel: text('filter_label'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('categories_parent_idx').on(table.parentId),
    index('categories_active_sort_idx').on(
      table.isActive,
      table.sortOrder,
    ),
  ],
);
