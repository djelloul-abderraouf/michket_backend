import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { users } from './users';

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Value sent by the client in the Idempotency-Key header.
    key: text('key').notNull(),

    // Example: "create_order".
    scope: text('scope').notNull(),

    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),

    // Guest owner, normally the same X-Session-Id used by the cart.
    sessionId: text('session_id'),

    // SHA-256 of the normalized request payload.
    requestHash: text('request_hash').notNull(),

    // Kept as text + CHECK instead of a PostgreSQL enum.
    // This avoids migration-order issues while still enforcing valid states.
    status: text('status').notNull().default('processing'),

    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),

    resourceId: uuid('resource_id'),

    errorCode: text('error_code'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    expiresAt: timestamp('expires_at', { withTimezone: true })
      .notNull(),
  },
  (table) => [
    index('idempotency_expires_at_idx').on(table.expiresAt),
    index('idempotency_status_idx').on(table.status),

    uniqueIndex('idempotency_user_scope_key_unique_idx')
      .on(table.userId, table.scope, table.key)
      .where(sql`${table.userId} IS NOT NULL`),

    uniqueIndex('idempotency_session_scope_key_unique_idx')
      .on(table.sessionId, table.scope, table.key)
      .where(sql`${table.sessionId} IS NOT NULL`),

    check(
      'idempotency_owner_required',
      sql`${table.userId} IS NOT NULL OR ${table.sessionId} IS NOT NULL`,
    ),

    check(
      'idempotency_status_valid',
      sql`${table.status} IN ('processing', 'completed', 'failed')`,
    ),

    check(
      'idempotency_response_status_valid',
      sql`${table.responseStatus} IS NULL OR (${table.responseStatus} >= 100 AND ${table.responseStatus} <= 599)`,
    ),
  ],
);
