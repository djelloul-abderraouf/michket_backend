import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const clientReferences = pgTable(
  'client_references',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Nom de l'entreprise / organisme affiché dans l'admin
    // et utilisé comme texte alternatif si nécessaire.
    name: text('name').notNull(),

    // URL publique du logo / visuel dans Supabase Storage.
    imageUrl: text('image_url').notNull(),

    // Chemin exact de l'objet dans Supabase Storage.
    // Permet de remplacer / supprimer proprement le fichier.
    imageStoragePath: text('image_storage_path').notNull(),

    // Texte alternatif facultatif pour l'accessibilité.
    altText: text('alt_text'),

    // Permet de masquer une référence sans la supprimer.
    isActive: boolean('is_active').notNull().default(true),

    // Ordre d'affichage dans le carrousel de la homepage.
    sortOrder: integer('sort_order').notNull().default(0),

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
    index('client_references_active_sort_idx').on(
      table.isActive,
      table.sortOrder,
    ),

    uniqueIndex(
      'client_references_image_storage_path_unique_idx',
    )
      .on(table.imageStoragePath)
      .where(sql`${table.imageStoragePath} IS NOT NULL`),
  ],
);
