import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', [
  'customer',
  'admin',
  'super_admin',
]);

export const users = pgTable('users', {
  // Same UUID as Supabase Auth user id (JWT "sub")
  id: uuid('id').primaryKey(),

  email: text('email').notNull().unique(),

  firstName: text('first_name'),
  lastName: text('last_name'),
  phone: text('phone'),

  // Business role for Michket. Never trust the public request body for this field.
  role: userRoleEnum('role').notNull().default('customer'),

  isActive: boolean('is_active').notNull().default(true),

  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),

  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
