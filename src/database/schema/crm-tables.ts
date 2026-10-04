import {
  pgTable,
  text,
  boolean,
  timestamp,
  numeric,
  jsonb,
  uuid,
  integer,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { users } from './users';
import { orders } from './orders';

export type CrmContactType = 'particulier' | 'professionnel';
export type CrmDealStage =
  | 'prospection'
  | 'qualification'
  | 'devis_envoye'
  | 'negociation'
  | 'gagnee'
  | 'perdue';
export type CrmProposalStatus =
  | 'brouillon'
  | 'envoyee'
  | 'acceptee'
  | 'refusee';
export type CrmProductionStatus = 'en_attente' | 'en_cours' | 'termine';
export type CrmProjectStatus = 'actif' | 'termine';
export type CrmActivityType = 'appel' | 'message' | 'visite';
export type CrmPriority = 'basse' | 'normale' | 'haute' | 'urgente';

export const crmCompanies = pgTable('crm_companies', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sector: text('sector').notNull(),
  commercialTerms: text('commercial_terms'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const crmProjects = pgTable('crm_projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  status: text('status').$type<CrmProjectStatus>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const crmContacts = pgTable('crm_contacts', {
  id: text('id').primaryKey(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  wilaya: text('wilaya').notNull(),
  type: text('type').$type<CrmContactType>().notNull(),
  companyId: text('company_id').references(() => crmCompanies.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const crmDeals = pgTable('crm_deals', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  contactId: text('contact_id').references(() => crmContacts.id),
  companyId: text('company_id').references(() => crmCompanies.id),
  estimatedAmount: numeric('estimated_amount').notNull(),
  stage: text('stage').$type<CrmDealStage>().notNull(),
  ownerId: text('owner_id').notNull(),
  expectedCloseAt: timestamp('expected_close_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const crmProposals = pgTable('crm_proposals', {
  id: text('id').primaryKey(),
  dealId: text('deal_id')
    .notNull()
    .references(() => crmDeals.id),
  status: text('status').$type<CrmProposalStatus>().notNull(),
  items: jsonb('items').notNull(),
  total: numeric('total').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const plancheStatuses = ['en_attente', 'lancee', 'terminee'] as const;
export type CrmPlancheStatus = (typeof plancheStatuses)[number];

export const crmPlanches = pgTable('crm_planches', {
  id: text('id').primaryKey(),
  reference: text('reference').notNull().unique(),
  capacity: integer('capacity').notNull(),
  status: text('status').$type<CrmPlancheStatus>().notNull().default('en_attente'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdByName: text('created_by_name'),
  launchedAt: timestamp('launched_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const crmPlancheOrders = pgTable(
  'crm_planche_orders',
  {
    id: text('id').primaryKey(),
    plancheId: text('planche_id')
      .notNull()
      .references(() => crmPlanches.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('crm_planche_orders_order_unique').on(table.orderId),
  ],
);

export const crmPlancheEvents = pgTable('crm_planche_events', {
  id: text('id').primaryKey(),
  plancheId: text('planche_id')
    .notNull()
    .references(() => crmPlanches.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  note: text('note'),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  actorName: text('actor_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const crmProductionJobs = pgTable('crm_production_jobs', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull(),
  orderRef: text('order_ref').notNull(),
  clientName: text('client_name').notNull(),
  productSummary: text('product_summary').notNull(),
  status: text('status').$type<CrmProductionStatus>().notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const crmTasks = pgTable('crm_tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  assigneeId: text('assignee_id').notNull(),
  assigneeName: text('assignee_name').notNull(),
  projectId: text('project_id').references(() => crmProjects.id),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  priority: text('priority').$type<CrmPriority>().notNull(),
  done: boolean('done').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const crmActivities = pgTable('crm_activities', {
  id: text('id').primaryKey(),
  type: text('type').$type<CrmActivityType>().notNull(),
  target: text('target').notNull(),
  ownerId: text('owner_id').notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const crmLoginAudit = pgTable('crm_login_audit', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  loggedAt: timestamp('logged_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
