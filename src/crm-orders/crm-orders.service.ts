import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { randomBytes } from 'crypto';

import * as schema from '../database/schema';
import {
  crmProductionJobs,
  crmContacts,
  orderItems,
  orders,
  orderStatusHistory,
  productImages,
  products,
  shipments,
  users,
} from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import { CrmBaseService } from '../crm-base/crm-base.service';
import {
  centsToDzd,
  isCrmOrderStatus,
  toCrmOrderStatus,
  toDbOrderStatus,
} from '../crm-base/crm-status';
import { CreateCrmOrderDto } from './dto/crm-orders.dto';

type CrmUserContext = {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
};

@Injectable()
export class CrmOrdersService extends CrmBaseService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    db: NodePgDatabase<typeof schema>,
  ) {
    super(db);
  }

  async findAll(filters: {
    status?: string;
    wilaya?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 50));
    const offset = (page - 1) * limit;

    const conditions = [];

    if (filters.status && filters.status !== 'all') {
      const dbStatus = toDbOrderStatus(filters.status);
      conditions.push(eq(orders.status, dbStatus));
    }

    if (filters.wilaya && filters.wilaya !== 'all') {
      conditions.push(eq(orders.wilayaName, filters.wilaya));
    }

    if (filters.search?.trim()) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(
        or(
          ilike(orders.reference, term),
          ilike(orders.firstName, term),
          ilike(orders.lastName, term),
          ilike(orders.phone, term),
        ),
      );
    }

    const where = conditions.length ? and(...conditions) : undefined;

    const data = await this.db
      .select()
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(where);

    const mapped = await this.attachOrderDetails(data, { includeHistory: false });

    return {
      data: mapped,
      total: totalResult?.count || 0,
      page,
      limit,
      totalPages: Math.ceil((totalResult?.count || 0) / limit),
    };
  }

  async findById(id: string) {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);

    if (!order) {
      throw new NotFoundException('Order with ID ' + id + ' not found');
    }

    const [mapped] = await this.attachOrderDetails([order]);
    return mapped;
  }

  async updateStatus(
    id: string,
    newStatus: string,
    note?: string,
    user?: CrmUserContext,
  ) {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);

    if (!order) {
      throw new NotFoundException('Order with ID ' + id + ' not found');
    }

    const crmStatus = isCrmOrderStatus(newStatus)
      ? newStatus
      : toCrmOrderStatus(newStatus);
    const dbStatus = toDbOrderStatus(crmStatus);

    if (crmStatus === 'en_preparation') {
      await this.completeProductionJobs(order.id);
    }

    if (crmStatus === 'en_fabrication') {
      await this.ensureProductionJob(order);
    }

    if (dbStatus === 'confirmed') {
      await this.ensurePendingShipment(order);
    }

    const updateData: Record<string, unknown> = {
      status: dbStatus,
      updatedAt: new Date(),
    };

    if (note) {
      updateData.notes = order.notes
        ? `${order.notes}\n${note}`
        : note;
    }

    if (dbStatus === 'shipped' && !order.shippedAt) {
      updateData.shippedAt = new Date();
    }

    if (dbStatus === 'delivered' && !order.deliveredAt) {
      updateData.deliveredAt = new Date();
    }

    if (dbStatus === 'cancelled' && !order.cancelledAt) {
      updateData.cancelledAt = new Date();
      updateData.cancelReason = note ?? order.cancelReason;
    }

    if (order.status !== dbStatus) {
      await this.db.insert(orderStatusHistory).values({
        orderId: id,
        fromStatus: order.status,
        toStatus: dbStatus,
        changedByUserId: user?.id,
        reason: note,
        createdAt: new Date(),
      });
    }

    const [updatedOrder] = await this.db
      .update(orders)
      .set(updateData)
      .where(eq(orders.id, id))
      .returning();

    const [mapped] = await this.attachOrderDetails([updatedOrder]);
    return mapped;
  }

  async create(dto: CreateCrmOrderDto, user?: CrmUserContext) {
    let firstName = dto.firstName.trim();
    let lastName = (dto.lastName ?? '').trim();
    let phone = dto.phone.trim();
    let email = dto.email?.trim() || null;
    let wilayaName = dto.wilayaName?.trim() || 'Alger';
    let wilayaCode =
      dto.wilayaCode && dto.wilayaCode >= 1 && dto.wilayaCode <= 58
        ? dto.wilayaCode
        : 16;
    const quantity = dto.quantity && dto.quantity > 0 ? dto.quantity : 1;

    if (dto.contactId) {
      const [contact] = await this.db
        .select()
        .from(crmContacts)
        .where(eq(crmContacts.id, dto.contactId))
        .limit(1);

      if (!contact) {
        throw new BadRequestException('Contact introuvable');
      }

      firstName = contact.firstName;
      lastName = contact.lastName;
      phone = contact.phone;
      email = contact.email || email;
      wilayaName = contact.wilaya || wilayaName;
    }

    let productName = 'Commande CRM';
    let productSlug = 'commande-crm';
    let productImageUrl: string | null = null;
    let unitPriceCents = 0;
    let productId: string | null = dto.productId ?? null;

    if (dto.productId) {
      const [product] = await this.db
        .select()
        .from(products)
        .where(eq(products.id, dto.productId))
        .limit(1);

      if (!product) {
        throw new BadRequestException('Produit introuvable');
      }

      productName = product.name;
      productSlug = product.slug;
      unitPriceCents = product.priceCents;
      productId = product.id;

      const [image] = await this.db
        .select({ url: productImages.url })
        .from(productImages)
        .where(eq(productImages.productId, product.id))
        .orderBy(desc(productImages.isPrimary))
        .limit(1);

      productImageUrl = image?.url ?? null;
    }

    const subtotalCents = unitPriceCents * quantity;
    const deliveryFeeCents = 0;
    const discountCents = 0;
    const totalCents = subtotalCents + deliveryFeeCents - discountCents;

    const [newOrder] = await this.db
      .insert(orders)
      .values({
        reference: this.generateReference(),
        status: 'pending',
        subtotalCents,
        deliveryFeeCents,
        discountCents,
        totalCents,
        firstName,
        lastName: lastName || firstName,
        phone,
        email,
        addressLine1: dto.addressLine1?.trim() || 'Adresse a confirmer',
        wilayaCode,
        wilayaName,
        commune: dto.commune?.trim() || 'Centre',
        deliveryType: 'home',
        notes: dto.notes,
        paymentMethod: 'cod',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    if (productId && unitPriceCents >= 0) {
      await this.db.insert(orderItems).values({
        orderId: newOrder.id,
        productId,
        productName,
        productSlug,
        productImageUrl,
        quantity,
        unitPriceCents,
        totalPriceCents: unitPriceCents * quantity,
      });
    }

    await this.db.insert(orderStatusHistory).values({
      orderId: newOrder.id,
      fromStatus: null,
      toStatus: 'pending',
      changedByUserId: user?.id,
      reason: 'Commande creee depuis le CRM',
      createdAt: new Date(),
    });

    const [mapped] = await this.attachOrderDetails([newOrder]);
    return mapped;
  }

  private async attachOrderDetails(
    orderRows: (typeof orders.$inferSelect)[],
    options?: { includeHistory?: boolean },
  ) {
    if (orderRows.length === 0) {
      return [];
    }

    const includeHistory = options?.includeHistory !== false;
    const orderIds = orderRows.map((order) => order.id);

    const [itemRows, historyRows, jobRows, shipmentRows] = await Promise.all([
      this.db
        .select({
          orderId: orderItems.orderId,
          productId: orderItems.productId,
          productName: orderItems.productName,
          productSlug: orderItems.productSlug,
          variantName: orderItems.variantName,
          colorName: orderItems.colorName,
          quantity: orderItems.quantity,
          unitPriceCents: orderItems.unitPriceCents,
          totalPriceCents: orderItems.totalPriceCents,
          personalization: orderItems.personalization,
        })
        .from(orderItems)
        .where(inArray(orderItems.orderId, orderIds)),
      includeHistory
        ? this.db
            .select()
            .from(orderStatusHistory)
            .where(inArray(orderStatusHistory.orderId, orderIds))
            .orderBy(desc(orderStatusHistory.createdAt))
        : Promise.resolve([]),
      this.db
        .select({
          orderId: crmProductionJobs.orderId,
          status: crmProductionJobs.status,
        })
        .from(crmProductionJobs)
        .where(inArray(crmProductionJobs.orderId, orderIds)),
      this.db
        .select()
        .from(shipments)
        .where(inArray(shipments.orderId, orderIds)),
    ]);
    const shipmentByOrder = new Map(
      shipmentRows.map((row) => [row.orderId, row]),
    );

    const authorIds = [
      ...new Set(
        historyRows
          .map((row) => row.changedByUserId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];

    const authorRows = authorIds.length
      ? await this.db
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
          })
          .from(users)
          .where(inArray(users.id, authorIds))
      : [];

    const authors = new Map(
      authorRows.map((author) => [
        author.id,
        `${author.firstName || ''} ${author.lastName || ''}`.trim() ||
          author.email,
      ]),
    );

    return orderRows.map((order) => {
      const items = itemRows.filter((item) => item.orderId === order.id);
      const history = historyRows.filter((item) => item.orderId === order.id);
      const jobs = jobRows.filter((item) => item.orderId === order.id);
      const shipment = shipmentByOrder.get(order.id);
      const productionComplete =
        jobs.length > 0 && jobs.every((job) => job.status === 'termine');

      return {
        id: order.id,
        reference: order.reference,
        source: 'directe' as const,
        clientName: `${order.firstName} ${order.lastName}`.trim(),
        firstName: order.firstName,
        lastName: order.lastName,
        phone: order.phone,
        email: order.email,
        wilaya: order.wilayaName,
        wilayaName: order.wilayaName,
        wilayaCode: order.wilayaCode,
        commune: order.commune,
        addressLine1: order.addressLine1,
        addressLine2: order.addressLine2,
        deliveryType: order.deliveryType,
        deliveryOfficeId: order.deliveryOfficeId,
        deliveryOfficeName: order.deliveryOfficeName,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        promoCode: order.promoCode,
        subtotal: centsToDzd(order.subtotalCents),
        deliveryFee: centsToDzd(order.deliveryFeeCents),
        discount: centsToDzd(order.discountCents),
        currency: order.currency,
        status: toCrmOrderStatus(order.status, productionComplete),
        dbStatus: order.status,
        items: items.map((item) => ({
          productId: item.productId ?? '',
          productName: item.productName,
          productSlug: item.productSlug,
          variantName: item.variantName,
          colorName: item.colorName,
          quantity: item.quantity,
          unitPrice: centsToDzd(item.unitPriceCents),
          lineTotal: centsToDzd(item.totalPriceCents),
          personalization: item.personalization,
        })),
        total: centsToDzd(order.totalCents),
        totalCents: order.totalCents,
        notes: order.notes,
        cancelReason: order.cancelReason,
        trackingNumber: shipment?.trackingNumber ?? null,
        carrier: shipment?.provider ?? null,
        carrierStatus: shipment?.status ?? null,
        shipmentId: shipment?.id ?? null,
        labelUrl: this.extractShipmentLabel(shipment?.metadata),
        deliveredAt: this.toIso(order.deliveredAt),
        shippedAt: this.toIso(order.shippedAt),
        cancelledAt: this.toIso(order.cancelledAt),
        paidAt: this.toIso(order.paidAt),
        createdAt: this.toIso(order.createdAt) ?? new Date().toISOString(),
        updatedAt: this.toIso(order.updatedAt),
        history: history.map((event) => ({
          id: event.id,
          from: event.fromStatus
            ? toCrmOrderStatus(event.fromStatus)
            : undefined,
          to: toCrmOrderStatus(event.toStatus),
          authorId: event.changedByUserId ?? '',
          authorName: event.changedByUserId
            ? authors.get(event.changedByUserId) ?? 'Systeme'
            : 'Systeme',
          createdAt: this.toIso(event.createdAt) ?? new Date().toISOString(),
          note: event.reason ?? undefined,
        })),
      };
    });
  }

  private async ensurePendingShipment(order: typeof orders.$inferSelect) {
    const [existing] = await this.db
      .select({ id: shipments.id })
      .from(shipments)
      .where(eq(shipments.orderId, order.id))
      .limit(1);

    if (existing) {
      return;
    }

    await this.db.insert(shipments).values({
      orderId: order.id,
      provider: 'yalidine',
      status: 'pending',
      stopDeskId: order.deliveryOfficeId,
      stopDeskName: order.deliveryOfficeName,
    });
  }

  private async ensureProductionJob(order: typeof orders.$inferSelect) {
    const existing = await this.db
      .select({ id: crmProductionJobs.id })
      .from(crmProductionJobs)
      .where(eq(crmProductionJobs.orderId, order.id))
      .limit(1);

    if (existing.length > 0) {
      return;
    }

    const items = await this.db
      .select({
        productName: orderItems.productName,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    const productSummary =
      items.length > 0
        ? items.map((item) => `${item.quantity}x ${item.productName}`).join(', ')
        : 'Commande';

    await this.db.insert(crmProductionJobs).values({
      id: this.newId(),
      orderId: order.id,
      orderRef: order.reference,
      clientName: `${order.firstName} ${order.lastName}`.trim(),
      productSummary,
      status: 'en_attente',
    });
  }

  private async completeProductionJobs(orderId: string) {
    await this.db
      .update(crmProductionJobs)
      .set({
        status: 'termine',
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(crmProductionJobs.orderId, orderId));
  }

  private generateReference(): string {
    const timePart = Date.now().toString(36).toUpperCase();
    const randomPart = randomBytes(4).toString('hex').toUpperCase();
    return `CRM-${timePart}-${randomPart}`;
  }

  private extractShipmentLabel(metadata: unknown) {
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }
    const record = metadata as Record<string, unknown>;
    const value = record.label || record.label_url || record.labelUrl;
    return typeof value === 'string' ? value : null;
  }
}
