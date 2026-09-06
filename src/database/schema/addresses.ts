import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { users } from './users';

export const addresses = pgTable(
  'addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    label: text('label'),

    firstName: text('first_name').notNull(),

    lastName: text('last_name').notNull(),

    phone: text('phone').notNull(),

    addressLine1: text('address_line_1').notNull(),

    addressLine2: text('address_line_2'),

    wilayaCode: integer('wilaya_code').notNull(),

    wilayaName: text('wilaya_name').notNull(),

    commune: text('commune').notNull(),

    isDefault: boolean('is_default').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('addresses_one_default_per_user_idx')
      .on(table.userId)
      .where(sql`${table.isDefault} = true`),
  ],
);
