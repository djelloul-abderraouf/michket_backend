import {
  boolean,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { products } from './products';
import { users } from './users';

export const stockItemTypes = ['matiere', 'composant', 'semi_fini', 'produit_fini'] as const;
export type StockItemType = (typeof stockItemTypes)[number];

export const stockMovementTypes = [
  'restock',
  'manufacturing_consumption',
  'manufacturing_production',
  'sale',
  'adjustment',
  'return',
  'loss',
  'reversal',
] as const;
export type StockMovementType = (typeof stockMovementTypes)[number];

export const recipeKinds = ['manufacturing', 'sales'] as const;
export type RecipeKind = (typeof recipeKinds)[number];

export const manufacturingStatuses = ['completed', 'cancelled'] as const;
export type ManufacturingStatus = (typeof manufacturingStatuses)[number];

export const stockItems = pgTable('crm_stock_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  category: text('category').notNull().default(''),
  itemType: text('item_type').$type<StockItemType>().notNull(),
  usage: text('usage').$type<'alimentation' | 'vente' | 'les_deux'>().notNull().default('alimentation'),
  unit: text('unit').notNull().default('pcs'),
  minQuantity: numeric('min_quantity', { precision: 12, scale: 3 }).notNull().default('0'),
  catalogProductId: uuid('catalog_product_id').references(() => products.id, { onDelete: 'set null' }),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('crm_stock_items_name_unique').on(table.name),
  uniqueIndex('crm_stock_items_catalog_product_unique').on(table.catalogProductId),
  index('crm_stock_items_type_idx').on(table.itemType),
]);

export const stockMovements = pgTable('crm_stock_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  itemId: uuid('item_id').notNull().references(() => stockItems.id, { onDelete: 'restrict' }),
  movementType: text('movement_type').$type<StockMovementType>().notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  quantityDelta: numeric('quantity_delta', { precision: 12, scale: 3 }).notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  sourceType: text('source_type').notNull().default('manual'),
  sourceId: text('source_id'),
  sourceRef: text('source_ref'),
  note: text('note'),
  idempotencyKey: text('idempotency_key'),
  reversesMovementId: uuid('reverses_movement_id'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdByName: text('created_by_name').notNull().default('Équipe'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('crm_stock_movements_idempotency_unique').on(table.idempotencyKey),
  uniqueIndex('crm_stock_movements_reversal_unique').on(table.reversesMovementId),
  index('crm_stock_movements_item_idx').on(table.itemId, table.occurredAt),
  index('crm_stock_movements_source_idx').on(table.sourceType, table.sourceId),
]);

export const stockRecipes = pgTable('crm_stock_recipes', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').$type<RecipeKind>().notNull(),
  outputItemId: uuid('output_item_id').notNull().references(() => stockItems.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('crm_stock_recipes_output_kind_unique').on(table.kind, table.outputItemId),
]);

export const stockRecipeLines = pgTable('crm_stock_recipe_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  recipeId: uuid('recipe_id').notNull().references(() => stockRecipes.id, { onDelete: 'cascade' }),
  componentItemId: uuid('component_item_id').notNull().references(() => stockItems.id, { onDelete: 'restrict' }),
  quantityPerUnit: numeric('quantity_per_unit', { precision: 12, scale: 3 }).notNull(),
}, (table) => [
  uniqueIndex('crm_stock_recipe_lines_unique').on(table.recipeId, table.componentItemId),
]);

export const stockManufacturingOrders = pgTable('crm_stock_manufacturing_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: text('reference').notNull(),
  outputItemId: uuid('output_item_id').notNull().references(() => stockItems.id, { onDelete: 'restrict' }),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  status: text('status').$type<ManufacturingStatus>().notNull().default('completed'),
  note: text('note'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdByName: text('created_by_name').notNull().default('Équipe'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('crm_stock_manufacturing_reference_unique').on(table.reference),
  index('crm_stock_manufacturing_output_idx').on(table.outputItemId),
]);
