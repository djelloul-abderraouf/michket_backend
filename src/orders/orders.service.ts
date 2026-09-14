import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  and,
  desc,
  eq,
  isNull,
  lte,
  sql,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { ConfigService } from '@nestjs/config';

import * as schema from '../database/schema';
import {
  idempotencyKeys,
  inventory,
  orderItems,
  orders,
  orderStatusHistory,
  productImages,
  products,
  productVariants,
} from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import { DeliveryService } from '../delivery/delivery.service';
import { OrderExpirationQueueService } from '../queue/order-expiration.queue';
import { PromotionsService } from '../promotions/promotions.service';

type DbTransaction = Parameters<
  Parameters<
    NodePgDatabase<typeof schema>['transaction']
  >[0]
>[0];

type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export type CreateOrderInput = {
  userId?: string;

  items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
    personalization?: unknown;
  }>;

  firstName: string;
  lastName: string;
  phone: string;
  email?: string;

  addressLine1: string;
  addressLine2?: string;

  wilayaCode: number;
  communeId: number;
  commune: string;

  deliveryType: 'home' | 'office';

  notes?: string;
  promoCode?: string;
};

export type OrderIdempotencyContext = {
  key: string;
  sessionId?: string;
};

type SafeOrderResponse = Omit<
  typeof orders.$inferSelect,
  'guestAccessTokenHash'
>;

type CreateOrderResponse = SafeOrderResponse & {
  guestAccessToken?: string;
};

const MAX_ITEM_QUANTITY = 99;
const MAX_PERSONALIZATION_BYTES = 10_000;
const IDEMPOTENCY_SCOPE = 'create_order';
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

const ALLOWED_STATUS_TRANSITIONS: Record<
  OrderStatus,
  readonly OrderStatus[]
> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'shipped', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};

@Injectable()
export class OrdersService {
  private readonly orderAccessSecret: string;

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly deliveryService: DeliveryService,
    private readonly orderExpirationQueue: OrderExpirationQueueService,
    private readonly promotionsService: PromotionsService,
    configService: ConfigService,
  ) {
    this.orderAccessSecret =
      configService.getOrThrow<string>(
        'ORDER_ACCESS_SECRET',
      );
  }

  /**
   * Idempotent checkout.
   *
   * The idempotency record and the order are committed in the SAME
   * PostgreSQL transaction. That means:
   * - if checkout fails, the idempotency row is rolled back too;
   * - two simultaneous requests with the same key cannot create two orders;
   * - a completed duplicate request receives the stored first response.
   */
  async createIdempotent(
    orderData: CreateOrderInput,
    context: OrderIdempotencyContext,
  ) {
    this.validateOrderInput(orderData);
    this.validateIdempotencyContext(orderData, context);

    const [yalidineWilayas, yalidineCommunes] =
      await Promise.all([
        this.deliveryService.getWilayas(),
        this.deliveryService.getCommunes(
          orderData.wilayaCode,
        ),
      ]);

    const authoritativeWilaya = yalidineWilayas.find(
      (wilaya) =>
        wilaya.code === orderData.wilayaCode,
    );

    if (!authoritativeWilaya) {
      throw new BadRequestException(
        'Selected wilaya is not recognized by Yalidine',
      );
    }

    if (!authoritativeWilaya.available) {
      throw new ServiceUnavailableException(
        'Delivery is not available for the selected wilaya',
      );
    }

    const authoritativeCommune =
      yalidineCommunes.find(
        (commune) =>
          commune.id === orderData.communeId,
      );

    if (!authoritativeCommune) {
      throw new BadRequestException(
        'Selected commune does not belong to the selected wilaya',
      );
    }

    if (!authoritativeCommune.available) {
      throw new ServiceUnavailableException(
        'Delivery is not available for the selected commune',
      );
    }

    if (
      orderData.deliveryType === 'office' &&
      !authoritativeCommune.hasStopDesk
    ) {
      throw new ServiceUnavailableException(
        'Stop-desk delivery is not available for the selected commune',
      );
    }

    const deliveryRate =
      await this.deliveryService.calculateRate(
        orderData.wilayaCode,
        orderData.deliveryType,
        orderData.communeId,
      );

    const normalizedPromoCode =
      orderData.promoCode?.trim().toUpperCase() ||
      undefined;

    const normalizedOrderData = {
      ...orderData,
      promoCode: normalizedPromoCode,
      wilayaName: authoritativeWilaya.name,
      commune: authoritativeCommune.name,
      deliveryFeeCents: deliveryRate.amountCents,
    };

    const requestHash = this.hashRequest(normalizedOrderData);

    const result = await this.db.transaction(async (tx) => {
      const expiresAt = new Date(
        Date.now() + IDEMPOTENCY_TTL_MS,
      );

      let [inserted] = await tx
        .insert(idempotencyKeys)
        .values({
          key: context.key,
          scope: IDEMPOTENCY_SCOPE,

          userId: orderData.userId ?? null,
          sessionId: orderData.userId
            ? null
            : context.sessionId ?? null,

          requestHash,
          status: 'processing',
          expiresAt,
        })
        .onConflictDoNothing()
        .returning({
          id: idempotencyKeys.id,
        });

      if (!inserted) {
        const ownerCondition = orderData.userId
          ? eq(idempotencyKeys.userId, orderData.userId)
          : eq(
              idempotencyKeys.sessionId,
              context.sessionId!,
            );

        // An expired key must not block a new checkout forever.
        // Delete only the expired row for this exact owner/scope/key,
        // then retry the insert. The unique indexes still protect
        // concurrent requests: at most one retry can win.
        const [expired] = await tx
          .delete(idempotencyKeys)
          .where(
            and(
              ownerCondition,
              eq(idempotencyKeys.scope, IDEMPOTENCY_SCOPE),
              eq(idempotencyKeys.key, context.key),
              lte(idempotencyKeys.expiresAt, new Date()),
            ),
          )
          .returning({
            id: idempotencyKeys.id,
          });

        if (expired) {
          [inserted] = await tx
            .insert(idempotencyKeys)
            .values({
              key: context.key,
              scope: IDEMPOTENCY_SCOPE,

              userId: orderData.userId ?? null,
              sessionId: orderData.userId
                ? null
                : context.sessionId ?? null,

              requestHash,
              status: 'processing',
              expiresAt,
            })
            .onConflictDoNothing()
            .returning({
              id: idempotencyKeys.id,
            });
        }

        if (!inserted) {
          const [existing] = await tx
            .select()
            .from(idempotencyKeys)
            .where(
              and(
                ownerCondition,
                eq(idempotencyKeys.scope, IDEMPOTENCY_SCOPE),
                eq(idempotencyKeys.key, context.key),
              ),
            )
            .limit(1);

          if (!existing) {
            throw new ConflictException(
              'Unable to resolve idempotency key',
            );
          }

          if (existing.requestHash !== requestHash) {
            throw new ConflictException(
              'This Idempotency-Key was already used with different checkout data',
            );
          }

          if (
            existing.status === 'completed' &&
            existing.responseBody
          ) {
            return this.restoreIdempotentResponse(
              existing.responseBody,
              !orderData.userId,
            );
          }

          throw new ConflictException(
            'A checkout with this Idempotency-Key is already being processed',
          );
        }
      }

      const result = await this.createOrderInTransaction(
        tx,
        normalizedOrderData,
      );

      const storedResponse =
        this.removeGuestAccessToken(result);

      await tx
        .update(idempotencyKeys)
        .set({
          status: 'completed',
          responseStatus: 201,
          responseBody: storedResponse,
          resourceId: result.id,
          updatedAt: new Date(),
        })
        .where(eq(idempotencyKeys.id, inserted.id));

      return result;
    });

    await this.schedulePendingOrderExpiration(result.id);

    return result;
  }

  async findByReference(
    reference: string,
    userId?: string,
    guestAccessToken?: string,
  ) {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.reference, reference))
      .limit(1);

    if (!order) {
      throw new NotFoundException(
        `Order "${reference}" not found`,
      );
    }

    const ownedByUser =
      Boolean(userId) && order.userId === userId;

    const validGuestToken =
      !order.userId &&
      Boolean(order.guestAccessTokenHash) &&
      Boolean(guestAccessToken) &&
      this.verifyGuestAccessToken(
        guestAccessToken!,
        order.guestAccessTokenHash!,
      );

    if (!ownedByUser && !validGuestToken) {
      throw new UnauthorizedException(
        'You are not allowed to access this order',
      );
    }

    const items = await this.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    const {
      guestAccessTokenHash: _guestAccessTokenHash,
      ...safeOrder
    } = order;

    return {
      ...safeOrder,
      items,
    };
  }

  async findByUserId(
    userId: string,
    page = 1,
    limit = 10,
  ) {
    const safePage =
      Number.isInteger(page) && page > 0 ? page : 1;

    const safeLimit =
      Number.isInteger(limit) && limit > 0
        ? Math.min(limit, 100)
        : 10;

    const offset = (safePage - 1) * safeLimit;

    const [countResult] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(eq(orders.userId, userId));

    const orderList = await this.db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(safeLimit)
      .offset(offset);

    const data = orderList.map(
      ({
        guestAccessTokenHash: _guestAccessTokenHash,
        ...order
      }) => order,
    );

    return {
      data,
      meta: {
        page: safePage,
        limit: safeLimit,
        total: countResult?.count ?? 0,
        totalPages: Math.ceil(
          (countResult?.count ?? 0) / safeLimit,
        ),
      },
    };
  }

  async updateStatus(
    orderId: string,
    status: string,
    reason?: string,
    changedByUserId?: string,
  ) {
    if (!this.isOrderStatus(status)) {
      throw new BadRequestException(
        `Invalid order status "${status}"`,
      );
    }

    const result = await this.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for('update')
        .limit(1);

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      const currentStatus = order.status;

      if (currentStatus === status) {
        return {
          order: this.sanitizeOrder(order),
          leftPending: false,
        };
      }

      const allowed =
        ALLOWED_STATUS_TRANSITIONS[currentStatus];

      if (!allowed.includes(status)) {
        throw new BadRequestException(
          `Cannot change order status from "${currentStatus}" to "${status}"`,
        );
      }

      const items = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));

      if (status === 'cancelled') {
        await this.releaseReservedStock(tx, items);

        if (order.promoCode) {
          await this.promotionsService.releaseForCancelledOrder(
            tx,
            order.promoCode,
          );
        }
      }

      if (status === 'delivered') {
        await this.confirmReservedStock(tx, items);
      }

      const now = new Date();

      const updateData: Partial<typeof orders.$inferInsert> = {
        status,
        updatedAt: now,
      };

      if (status === 'shipped') {
        updateData.shippedAt = now;
      }

      if (status === 'delivered') {
        updateData.deliveredAt = now;

        // COD: cash is considered collected only when
        // the order is actually delivered.
        updateData.paymentStatus = 'paid';
        updateData.paidAt = now;
      }

      if (status === 'refunded') {
        updateData.paymentStatus = 'refunded';
      }

      if (status === 'cancelled') {
        updateData.cancelledAt = now;
        updateData.cancelReason = reason?.trim() || null;
      }

      const [updated] = await tx
        .update(orders)
        .set(updateData)
        .where(eq(orders.id, orderId))
        .returning();

      await tx.insert(orderStatusHistory).values({
        orderId: order.id,
        fromStatus: currentStatus,
        toStatus: status,
        changedByUserId: changedByUserId ?? null,
        reason: reason?.trim() || null,
      });

      return {
        order: this.sanitizeOrder(updated),
        leftPending:
          currentStatus === 'pending' &&
          status !== 'pending',
      };
    });

    if (result.leftPending) {
      await this.removePendingOrderExpiration(orderId);
    }

    return result.order;
  }

  async expirePendingOrder(
    orderId: string,
    reason = 'Pending order expired',
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for('update')
        .limit(1);

      if (!order || order.status !== 'pending') {
        return false;
      }

      const items = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));

      await this.releaseReservedStock(tx, items);

      if (order.promoCode) {
        await this.promotionsService.releaseForCancelledOrder(
          tx,
          order.promoCode,
        );
      }

      const now = new Date();
      const cleanReason =
        reason.trim() || 'Pending order expired';

      await tx
        .update(orders)
        .set({
          status: 'cancelled',
          cancelledAt: now,
          cancelReason: cleanReason,
          updatedAt: now,
        })
        .where(eq(orders.id, order.id));

      await tx.insert(orderStatusHistory).values({
        orderId: order.id,
        fromStatus: 'pending',
        toStatus: 'cancelled',
        changedByUserId: null,
        reason: cleanReason,
      });

      return true;
    });
  }

  private async createOrderInTransaction(
    tx: DbTransaction,
    orderData: CreateOrderInput & {
      wilayaName: string;
      deliveryFeeCents: number;
    },
  ): Promise<CreateOrderResponse> {
    const reference = this.generateReference();

    const guestAccessToken = orderData.userId
      ? undefined
      : this.createGuestAccessToken(reference);

    const guestAccessTokenHash = guestAccessToken
      ? this.hashGuestAccessToken(guestAccessToken)
      : null;

    let subtotalCents = 0;

    const preparedItems: Array<{
      productId: string;
      variantId: string | null;

      productName: string;
      productSlug: string;
      productImageUrl: string | null;

      variantName: string | null;
      variantSku: string | null;
      colorName: string | null;
      colorHex: string | null;

      quantity: number;
      unitPriceCents: number;
      totalPriceCents: number;

      personalization: unknown | null;
    }> = [];

    for (const item of orderData.items) {
      this.validateItemQuantity(item.quantity);
      this.validatePersonalization(
        item.personalization,
      );

      const [product] = await tx
        .select()
        .from(products)
        .where(
          and(
            eq(products.id, item.productId),
            eq(products.isActive, true),
          ),
        )
        .limit(1);

      if (!product) {
        throw new NotFoundException(
          `Product ${item.productId} not found or unavailable`,
        );
      }

      if (
        item.personalization !== undefined &&
        item.personalization !== null &&
        !product.isPersonalizable
      ) {
        throw new BadRequestException(
          `Product "${product.name}" is not personalizable`,
        );
      }

      let variant:
        | typeof productVariants.$inferSelect
        | undefined;

      if (item.variantId) {
        [variant] = await tx
          .select()
          .from(productVariants)
          .where(
            and(
              eq(productVariants.id, item.variantId),
              eq(productVariants.productId, product.id),
              eq(productVariants.isActive, true),
            ),
          )
          .limit(1);

        if (!variant) {
          throw new BadRequestException(
            `Selected variant is invalid for "${product.name}"`,
          );
        }
      } else {
        const [activeVariant] = await tx
          .select({ id: productVariants.id })
          .from(productVariants)
          .where(
            and(
              eq(productVariants.productId, product.id),
              eq(productVariants.isActive, true),
            ),
          )
          .limit(1);

        if (activeVariant) {
          throw new BadRequestException(
            `A variant must be selected for "${product.name}"`,
          );
        }
      }

      const inventoryCondition = variant
        ? and(
            eq(inventory.productId, product.id),
            eq(inventory.variantId, variant.id),
          )
        : and(
            eq(inventory.productId, product.id),
            isNull(inventory.variantId),
          );

      const [stock] = await tx
        .select()
        .from(inventory)
        .where(inventoryCondition)
        .for('update')
        .limit(1);

      if (stock?.trackInventory) {
        const available = stock.quantity - stock.reserved;

        if (available < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for "${product.name}"${
              variant ? ` (${variant.name})` : ''
            }`,
          );
        }

        await tx
          .update(inventory)
          .set({
            reserved: stock.reserved + item.quantity,
            updatedAt: new Date(),
          })
          .where(eq(inventory.id, stock.id));
      }

      const [image] = await tx
        .select({
          url: productImages.url,
        })
        .from(productImages)
        .where(eq(productImages.productId, product.id))
        .orderBy(
          desc(productImages.isPrimary),
          productImages.sortOrder,
        )
        .limit(1);

      const unitPriceCents =
        variant?.priceCents ?? product.priceCents;

      const totalPriceCents =
        unitPriceCents * item.quantity;

      subtotalCents += totalPriceCents;

      preparedItems.push({
        productId: product.id,
        variantId: variant?.id ?? null,

        productName: product.name,
        productSlug: product.slug,
        productImageUrl: image?.url ?? null,

        variantName: variant?.name ?? null,
        variantSku: variant?.sku ?? null,
        colorName: variant?.colorName ?? null,
        colorHex: variant?.colorHex ?? null,

        quantity: item.quantity,
        unitPriceCents,
        totalPriceCents,

        personalization: item.personalization ?? null,
      });
    }

    let promoCode: string | null = null;
    let discountCents = 0;

    if (orderData.promoCode) {
      const promotion =
        await this.promotionsService.consumeForCheckout(
          tx,
          orderData.promoCode,
          subtotalCents,
        );

      promoCode = promotion.code;
      discountCents =
        promotion.discountCents;
    }

    const totalCents =
      subtotalCents +
      orderData.deliveryFeeCents -
      discountCents;

    if (totalCents < 0) {
      throw new BadRequestException(
        'Discount cannot exceed the order total',
      );
    }

    const [order] = await tx
      .insert(orders)
      .values({
        reference,
        userId: orderData.userId ?? null,

        status: 'pending',

        subtotalCents,
        deliveryFeeCents: orderData.deliveryFeeCents,
        discountCents,
        totalCents,
        currency: 'DZD',

        firstName: orderData.firstName.trim(),
        lastName: orderData.lastName.trim(),
        phone: orderData.phone.trim(),
        email: orderData.email?.trim() || null,

        addressLine1: orderData.addressLine1.trim(),
        addressLine2:
          orderData.addressLine2?.trim() || null,

        wilayaCode: orderData.wilayaCode,
        wilayaName: orderData.wilayaName.trim(),
        commune: orderData.commune.trim(),

        deliveryType: orderData.deliveryType,

        notes: orderData.notes?.trim() || null,
        promoCode,

        paymentMethod: 'cod',
        paymentStatus: 'pending',

        guestAccessTokenHash,
      })
      .returning();

    await tx.insert(orderItems).values(
      preparedItems.map((item) => ({
        orderId: order.id,
        ...item,
      })),
    );

    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: null,
      toStatus: 'pending',
      reason: 'Order created',
    });

    const safeOrder = this.sanitizeOrder(order);

    return {
      ...safeOrder,

      // Capability returned to the guest client.
      // It is NOT stored in plaintext in orders or idempotency_keys.
      guestAccessToken,
    };
  }

  private async releaseReservedStock(
    tx: DbTransaction,
    items: Array<typeof orderItems.$inferSelect>,
  ): Promise<void> {
    for (const item of items) {
      if (!item.productId) {
        continue;
      }

      const condition = item.variantId
        ? and(
            eq(inventory.productId, item.productId),
            eq(inventory.variantId, item.variantId),
          )
        : and(
            eq(inventory.productId, item.productId),
            isNull(inventory.variantId),
          );

      const [stock] = await tx
        .select()
        .from(inventory)
        .where(condition)
        .for('update')
        .limit(1);

      if (!stock?.trackInventory) {
        continue;
      }

      if (stock.reserved < item.quantity) {
        throw new BadRequestException(
          `Inventory reservation is inconsistent for order item ${item.id}`,
        );
      }

      await tx
        .update(inventory)
        .set({
          reserved: stock.reserved - item.quantity,
          updatedAt: new Date(),
        })
        .where(eq(inventory.id, stock.id));
    }
  }

  private async confirmReservedStock(
    tx: DbTransaction,
    items: Array<typeof orderItems.$inferSelect>,
  ): Promise<void> {
    for (const item of items) {
      if (!item.productId) {
        continue;
      }

      const condition = item.variantId
        ? and(
            eq(inventory.productId, item.productId),
            eq(inventory.variantId, item.variantId),
          )
        : and(
            eq(inventory.productId, item.productId),
            isNull(inventory.variantId),
          );

      const [stock] = await tx
        .select()
        .from(inventory)
        .where(condition)
        .for('update')
        .limit(1);

      if (!stock?.trackInventory) {
        continue;
      }

      if (
        stock.reserved < item.quantity ||
        stock.quantity < item.quantity
      ) {
        throw new BadRequestException(
          `Inventory is inconsistent for order item ${item.id}`,
        );
      }

      await tx
        .update(inventory)
        .set({
          quantity: stock.quantity - item.quantity,
          reserved: stock.reserved - item.quantity,
          updatedAt: new Date(),
        })
        .where(eq(inventory.id, stock.id));
    }
  }

  private validateOrderInput(
    orderData: CreateOrderInput,
  ): void {
    if (
      !Array.isArray(orderData.items) ||
      orderData.items.length === 0
    ) {
      throw new BadRequestException(
        'Order must contain at least one item',
      );
    }

    if (
      !Number.isInteger(orderData.wilayaCode) ||
      orderData.wilayaCode < 1 ||
      orderData.wilayaCode > 58
    ) {
      throw new BadRequestException(
        'Wilaya code must be between 1 and 58',
      );
    }

    if (
      !Number.isInteger(orderData.communeId) ||
      orderData.communeId <= 0
    ) {
      throw new BadRequestException(
        'Commune id must be a positive integer',
      );
    }

    if (
      orderData.deliveryType !== 'home' &&
      orderData.deliveryType !== 'office'
    ) {
      throw new BadRequestException(
        'Delivery type must be "home" or "office"',
      );
    }
  }

  private validateItemQuantity(quantity: number): void {
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_ITEM_QUANTITY
    ) {
      throw new BadRequestException(
        `Quantity must be an integer between 1 and ${MAX_ITEM_QUANTITY}`,
      );
    }
  }

  private validatePersonalization(
    personalization: unknown,
  ): void {
    if (
      personalization === undefined ||
      personalization === null
    ) {
      return;
    }

    const normalized =
      this.stableStringify(
        personalization,
      );

    const bytes = Buffer.byteLength(
      normalized,
      'utf8',
    );

    if (
      bytes >
      MAX_PERSONALIZATION_BYTES
    ) {
      throw new BadRequestException(
        'Personalization data is too large',
      );
    }
  }

  private validateIdempotencyContext(
    orderData: CreateOrderInput,
    context: OrderIdempotencyContext,
  ): void {
    const key = context.key?.trim();

    if (
      !key ||
      key.length < 16 ||
      key.length > 128
    ) {
      throw new BadRequestException(
        'Idempotency-Key must contain between 16 and 128 characters',
      );
    }

    if (!orderData.userId && !context.sessionId) {
      throw new BadRequestException(
        'Guest checkout requires X-Session-Id',
      );
    }
  }

  private hashRequest(
    orderData: unknown,
  ): string {
    return createHash('sha256')
      .update(this.stableStringify(orderData))
      .digest('hex');
  }

  private stableStringify(value: unknown): string {
    if (
      value === null ||
      typeof value !== 'object'
    ) {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value
        .map((item) => this.stableStringify(item))
        .join(',')}]`;
    }

    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();

    return `{${keys
      .map(
        (key) =>
          `${JSON.stringify(key)}:${this.stableStringify(
            record[key],
          )}`,
      )
      .join(',')}}`;
  }

  private generateReference(): string {
    const timePart = Date.now()
      .toString(36)
      .toUpperCase();

    const randomPart = randomBytes(5)
      .toString('hex')
      .toUpperCase();

    return `MICH-${timePart}-${randomPart}`;
  }

  private async schedulePendingOrderExpiration(
    orderId: string,
  ): Promise<void> {
    try {
      const [order] = await this.db
        .select({
          status: orders.status,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      if (!order || order.status !== 'pending') {
        return;
      }

      await this.orderExpirationQueue.schedule(orderId);
    } catch (error) {
      // The order is already safely committed in PostgreSQL.
      // Do not fail checkout only because the background queue is temporarily unavailable.
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      console.error(
        `Unable to schedule pending-order expiration for ${orderId}: ${message}`,
      );
    }
  }

  private async removePendingOrderExpiration(
    orderId: string,
  ): Promise<void> {
    try {
      await this.orderExpirationQueue.remove(orderId);
    } catch (error) {
      // PostgreSQL remains the source of truth. Even if Redis is
      // temporarily unavailable, the worker re-checks the order
      // status before attempting any automatic cancellation.
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      console.error(
        `Unable to remove pending-order expiration for ${orderId}: ${message}`,
      );
    }
  }

  private sanitizeOrder(
    order: typeof orders.$inferSelect,
  ): SafeOrderResponse {
    const {
      guestAccessTokenHash: _guestAccessTokenHash,
      ...safeOrder
    } = order;

    return safeOrder;
  }

  private createGuestAccessToken(
    reference: string,
  ): string {
    return createHmac(
      'sha256',
      this.orderAccessSecret,
    )
      .update(
        `michket:guest-order:${reference}`,
      )
      .digest('base64url');
  }

  private removeGuestAccessToken(
    response: CreateOrderResponse,
  ): SafeOrderResponse {
    const {
      guestAccessToken: _guestAccessToken,
      ...safeResponse
    } = response;

    return safeResponse;
  }

  private restoreIdempotentResponse(
    responseBody: unknown,
    isGuest: boolean,
  ): CreateOrderResponse {
    const safeResponse =
      responseBody as SafeOrderResponse;

    if (!isGuest) {
      return safeResponse;
    }

    if (
      !safeResponse ||
      typeof safeResponse.reference !== 'string'
    ) {
      throw new ConflictException(
        'Stored idempotency response is invalid',
      );
    }

    return {
      ...safeResponse,
      guestAccessToken:
        this.createGuestAccessToken(
          safeResponse.reference,
        ),
    };
  }

  private hashGuestAccessToken(token: string): string {
    return createHash('sha256')
      .update(token)
      .digest('hex');
  }

  private verifyGuestAccessToken(
    token: string,
    expectedHash: string,
  ): boolean {
    const actual = Buffer.from(
      this.hashGuestAccessToken(token),
      'hex',
    );

    const expected = Buffer.from(expectedHash, 'hex');

    if (actual.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(actual, expected);
  }

  private isOrderStatus(
    status: string,
  ): status is OrderStatus {
    return status in ALLOWED_STATUS_TRANSITIONS;
  }
}
