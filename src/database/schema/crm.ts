import {
  pgTable,
  text,
  boolean,
  timestamp,
  numeric,
  jsonb,
  uuid,
  pgEnum,
} from 'drizzle-orm/pg-core';

// Enums
export const crmOrderStatusEnum = pgEnum('crm_order_status', [
  'pas_confirme',
  'confirme',
  'en_fabrication',
  'en_preparation',
  'en_livraison',
  'livre',
  'retour_echec',
]);

export const crmContactTypeEnum = pgEnum('crm_contact_type', [
  'particulier',
  'professionnel',
]);

export const crmProductCategoryEnum = pgEnum('crm_product_category', [
  'lampe',
  'trophee',
  'carte',
  'neon',
]);

export const crmDealStageEnum = pgEnum('crm_deal_stage', [
  'prospection',
  'qualification',
  'devis_envoye',
  'negociation',
  'gagnee',
  'perdue',
]);

export const crmProposalStatusEnum = pgEnum('crm_proposal_status', [
  'brouillon',
  'envoyee',
  'acceptee',
  'refusee',
]);

export const crmProductionStatusEnum = pgEnum('crm_production_status', [
  'en_attente',
  'en_cours',
  'termine',
]);

export const crmProjectStatusEnum = pgEnum('crm_project_status', [
  'actif',
  'termine',
]);

export const crmActivityTypeEnum = pgEnum('crm_activity_type', [
  'appel',
  'message',
  'visite',
]);

export const crmPriorityEnum = pgEnum('crm_priority', [
  'basse',
  'normale',
  'haute',
  'urgente',
]);

export const crmConfirmationReasonEnum = pgEnum('crm_confirmation_reason', [
  'injoignable',
  'refus',
  'a_rappeler',
]);

// Tables
export const crmUsers = pgTable('crm_users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  roles: text('roles').array().notNull(),
  active: boolean('active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const crmCompanies = pgTable('crm_companies', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sector: text('sector').notNull(),
  commercialTerms: text('commercial_terms'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const crmProjects = pgTable('crm_projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  status: crmProjectStatusEnum('status').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const crmContacts = pgTable('crm_contacts', {
  id: text('id').primaryKey(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  wilaya: text('wilaya').notNull(),
  type: crmContactTypeEnum('type').notNull(),
  companyId: text('company_id').references(() => crmCompanies.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const crmProducts = pgTable('crm_products', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: crmProductCategoryEnum('category').notNull(),
  price: numeric('price').notNull(),
  photoUrl: text('photo_url').notNull(),
  averageBuildHours: numeric('average_build_hours').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const crmDeals = pgTable('crm_deals', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  contactId: text('contact_id').references(() => crmContacts.id),
  companyId: text('company_id').references(() => crmCompanies.id),
  estimatedAmount: numeric('estimated_amount').notNull(),
  stage: crmDealStageEnum('stage').notNull(),
  ownerId: text('owner_id').notNull().references(() => crmUsers.id),
  expectedCloseAt: timestamp('expected_close_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const crmProposals = pgTable('crm_proposals', {
  id: text('id').primaryKey(),
  dealId: text('deal_id').notNull().references(() => crmDeals.id),
  status: crmProposalStatusEnum('status').notNull(),
  items: jsonb('items').notNull(),
  total: numeric('total').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const crmOrders = pgTable('crm_orders', {
  id: text('id').primaryKey(),
  source: text('source').notNull(), // 'directe' | 'affaire'
  clientName: text('client_name').notNull(),
  phone: text('phone').notNull(),
  wilaya: text('wilaya').notNull(),
  status: crmOrderStatusEnum('status').notNull(),
  items: jsonb('items').notNull(),
  total: numeric('total').notNull(),
  notes: text('notes'),
  confirmationReason: crmConfirmationReasonEnum('confirmation_reason'),
  reminderAt: timestamp('reminder_at'),
  trackingNumber: text('tracking_number'),
  carrierStatus: text('carrier_status'),
  deliveredAt: timestamp('delivered_at'),
  shippedAt: timestamp('shipped_at'),
  returnReason: text('return_reason'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const crmOrderStatusHistory = pgTable('crm_order_status_history', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull().references(() => crmOrders.id),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  authorId: text('author_id').notNull().references(() => crmUsers.id),
  note: text('note'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const crmProductionJobs = pgTable('crm_production_jobs', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull().references(() => crmOrders.id),
  orderRef: text('order_ref').notNull(),
  clientName: text('client_name').notNull(),
  productSummary: text('product_summary').notNull(),
  status: crmProductionStatusEnum('status').notNull(),
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const crmTasks = pgTable('crm_tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  assigneeId: text('assignee_id').notNull().references(() => crmUsers.id),
  assigneeName: text('assignee_name').notNull(),
  projectId: text('project_id').references(() => crmProjects.id),
  dueAt: timestamp('due_at').notNull(),
  priority: crmPriorityEnum('priority').notNull(),
  done: boolean('done').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const crmActivities = pgTable('crm_activities', {
  id: text('id').primaryKey(),
  type: crmActivityTypeEnum('type').notNull(),
  target: text('target').notNull(),
  ownerId: text('owner_id').notNull().references(() => crmUsers.id),
  description: text('description').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const crmLoginAudit = pgTable('crm_login_audit', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  loggedAt: timestamp('logged_at').notNull().defaultNow(),
});
