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

    // Main title displayed on the category/subcategory page.
    // Example: "Lampes 3D personnalisées"
    pageTitle: text('page_title'),

    // Heading displayed above the products list.
    // Example: "Une lumière unique pour chaque histoire"
    productsTitle: text('products_title'),

    // Label used for the category product filter.
    // Example: "Filtrer : Toutes les lampes"
    filterLabel: text('filter_label'),

    // Profile / presentation image for the category or subcategory.
    imageUrl: text('image_url'),

    // Exact object path in Supabase Storage for imageUrl.
    // Allows safe replacement/deletion of the image later.
    imageStoragePath: text('image_storage_path'),

    href: text('href'),

    // Self-reference:
    // parentId = null -> top-level category
    // parentId = category id -> subcategory
    parentId: uuid('parent_id').references(
      (): AnyPgColumn => categories.id,
      { onDelete: 'set null' },
    ),

    isActive: boolean('is_active').notNull().default(true),

    sortOrder: integer('sort_order').notNull().default(0),

    metaTitle: text('meta_title'),

    metaDescription: text('meta_description'),

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
