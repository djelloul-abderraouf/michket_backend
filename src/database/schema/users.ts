import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const userRoleEnum = pgEnum('user_role', [
  'customer',
  'admin',
  'commercial',
  'fabrication',
  'preparation',
  'livraison',
  'confirmation',
  'super_admin',
]);

export const users = pgTable('users', {
  // Same UUID as Supabase Auth user id (JWT "sub")
  id: uuid('id').primaryKey(),

  email: text('email').notNull().unique(),

  firstName: text('first_name'),
  lastName: text('last_name'),
  phone: text('phone'),

  // Primary business role. Extra CRM roles live in staffRoles.
  role: userRoleEnum('role').notNull().default('customer'),

  staffRoles: text('staff_roles').array().notNull().default(sql`'{}'::text[]`),

  isActive: boolean('is_active').notNull().default(true),

  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),

  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
