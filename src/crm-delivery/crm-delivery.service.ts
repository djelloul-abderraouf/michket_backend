import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { desc, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../database/schema';
import {
  orderItems,
  orderStatusHistory,
  orders,
  shipments,
} from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import { CrmBaseService } from '../crm-base/crm-base.service';
import { centsToDzd, type DbOrderStatus } from '../crm-base/crm-status';
import { splitOrderName } from '../crm-base/order-name';
import { personalizationText } from '../crm-base/personalization';
import { DeliveryService } from '../delivery/delivery.service';
import { CrmOrdersService } from '../crm-orders/crm-orders.service';
import {
  canApplyYalidineStatus,
  extractYalidineStatus,
  mapYalidineLastStatus,
} from './yalidine-status';

const YALIDINE_BASE = 'https://api.yalidine.app/v1';

type CrmUserContext = {
  id: string;
};

export type YalidineCenter = {
  centerId: number;
  name: string;
  address: string;
  commune: string;
  wilaya: string;
};

@Injectable()
export class CrmDeliveryService extends CrmBaseService {
  private readonly logger = new Logger(CrmDeliveryService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    db: NodePgDatabase<typeof schema>,
    private readonly configService: ConfigService,
    private readonly deliveryService: DeliveryService,
    @Inject(forwardRef(() => CrmOrdersService))
    private readonly crmOrdersService: CrmOrdersService,
  ) {
    super(db);
  }

  async listYalidineCenters(wilayaCode?: number): Promise<YalidineCenter[]> {
    const query = wilayaCode
      ? `/centers/?wilaya_id=${wilayaCode}&page_size=100`
      : '/centers/?page_size=100';
    const payload = await this.yalidineRequest('GET', query);
    const rows: Array<Record<string, unknown>> = Array.isArray(payload?.data)
      ? payload.data
      : [];

    return rows
      .map((row) => {
        const centerId = Number(row.center_id ?? row.id);
        return {
          centerId,
          name: String(row.name || '').trim(),
          address: String(row.address || '').trim(),
          commune: String(row.commune_name || row.commune || '').trim(),
          wilaya: String(row.wilaya_name || '').trim(),
        };
      })
      .filter((row) => Number.isFinite(row.centerId) && row.centerId > 0 && row.name);
  }

  async createYalidineParcel(orderId: string, user?: CrmUserContext) {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      throw new NotFoundException('Commande introuvable');
    }

    if (order.status === 'pending') {
      throw new BadRequestException(
        'Confirmez la commande avant de creer un colis Yalidine',
      );
    }

    const [existing] = await this.db
      .select()
      .from(shipments)
      .where(eq(shipments.orderId, order.id))
      .limit(1);

    if (existing?.trackingNumber) {
      await this.correctYalidineCodIfPossible(existing.trackingNumber, order);
      return this.crmOrdersService.findById(order.id);
    }

    const items = await this.db
      .select({
        productName: orderItems.productName,
        quantity: orderItems.quantity,
        colorName: orderItems.colorName,
        personalization: orderItems.personalization,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    const communeName = await this.resolveCommuneName(
      order.wilayaCode,
      order.commune,
    );
    const fromWilayaCode =
      this.configService.get<number>('DELIVERY_FROM_WILAYA') ||
      this.configService.get<number>('delivery.fromWilaya') ||
      16;
    const fromWilayaName = this.deliveryService.getWilayaName(fromWilayaCode);
    const isStopdesk = order.deliveryType === 'office';
    const stopdesk = isStopdesk ? await this.resolveStopdesk(order) : null;

    if (stopdesk) {
      await this.db
        .update(orders)
        .set({
          deliveryOfficeId: String(stopdesk.centerId),
          deliveryOfficeName: stopdesk.name || order.deliveryOfficeName,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));
    }

    const price = this.parcelProductPrice(order);
    const productList = this.formatProductList(items);
    const address = isStopdesk
      ? stopdesk?.address ||
        stopdesk?.name ||
        order.deliveryOfficeName ||
        communeName
      : [order.addressLine1, order.addressLine2].filter(Boolean).join(', ') ||
        communeName;

    const names = splitOrderName(order.fullName);
    const payload = [
      {
        order_id: order.reference,
        from_wilaya_name: fromWilayaName,
        firstname: names.firstName,
        familyname: names.lastName || names.firstName,
        contact_phone: order.phone.replace(/\s+/g, ''),
        address,
        to_commune_name: communeName,
        to_wilaya_name: order.wilayaName,
        product_list: productList,
        price,
        declared_value: price,
        freeshipping: false,
        is_stopdesk: isStopdesk,
        stopdesk_id: stopdesk?.centerId,
        has_exchange: false,
      },
    ];

    const result = await this.yalidineRequest('POST', '/parcels/', payload);
    const created = this.unwrapParcelResult(result, order.reference);
    const tracking = this.extractTracking(created);
    const labelUrl = this.extractLabelUrl(created);

    if (!created || created.success === false || !tracking) {
      this.logger.warn(`Yalidine parcel failed for ${order.reference}: ${JSON.stringify(result)}`);
      throw new BadRequestException(
        created?.message ||
          created?.error ||
          'Yalidine n a pas renvoye de numero de suivi',
      );
    }

    const lastStatus = extractYalidineStatus(created) || 'Cree';
    const shipmentValues = {
      provider: 'yalidine',
      externalShipmentId: String(created.import_id || created.id || tracking),
      trackingNumber: String(tracking),
      status: 'created' as const,
      stopDeskId: stopdesk ? String(stopdesk.centerId) : order.deliveryOfficeId,
      stopDeskName: stopdesk?.name || order.deliveryOfficeName,
      metadata: { ...created, last_status: lastStatus, label: labelUrl },
      syncedAt: new Date(),
      updatedAt: new Date(),
    };

    if (existing) {
      await this.db
        .update(shipments)
        .set(shipmentValues)
        .where(eq(shipments.id, existing.id));
    } else {
      await this.db.insert(shipments).values({
        orderId: order.id,
        ...shipmentValues,
      });
    }

    await this.db.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: order.status,
      toStatus: order.status,
      changedByUserId: user?.id,
      reason: `Colis Yalidine cree (${tracking}) — ${isStopdesk ? 'Bureau' : 'Domicile'}`,
      metadata: {
        tracking,
        last_status: lastStatus,
        deliveryType: isStopdesk ? 'office' : 'home',
      },
      createdAt: new Date(),
    });

    return this.crmOrdersService.findById(order.id);
  }

  async syncYalidineParcel(orderId: string, user?: CrmUserContext) {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      throw new NotFoundException('Commande introuvable');
    }

    const [shipment] = await this.db
      .select()
      .from(shipments)
      .where(eq(shipments.orderId, orderId))
      .limit(1);

    if (!shipment?.trackingNumber) {
      throw new BadRequestException('Aucun suivi Yalidine pour cette commande');
    }

    const result = await this.yalidineRequest(
      'GET',
      `/parcels/${encodeURIComponent(shipment.trackingNumber)}`,
    );
    const parcel = Array.isArray(result?.data) ? result.data[0] : result;
    const lastStatus =
      extractYalidineStatus(parcel) ||
      String(parcel?.status || '').trim();
    const previousStatus = extractYalidineStatus(shipment.metadata);
    const mappedOrderStatus = lastStatus
      ? mapYalidineLastStatus(lastStatus)
      : null;

    let nextShipmentStatus: (typeof shipments.$inferSelect)['status'] =
      shipment.status;
    if (mappedOrderStatus === 'delivered') {
      nextShipmentStatus = 'delivered';
    } else if (mappedOrderStatus === 'refunded') {
      nextShipmentStatus = 'failed';
    } else if (mappedOrderStatus === 'shipped') {
      nextShipmentStatus = 'in_transit';
    }

    const previousMetadata =
      shipment.metadata && typeof shipment.metadata === 'object'
        ? (shipment.metadata as Record<string, unknown>)
        : {};

    await this.db
      .update(shipments)
      .set({
        status: nextShipmentStatus,
        metadata: {
          ...previousMetadata,
          ...(parcel || {}),
          last_status: lastStatus || previousStatus,
        },
        syncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, shipment.id));

    if (lastStatus && lastStatus !== previousStatus) {
      await this.applyYalidineOrderStatus(
        order,
        lastStatus,
        mappedOrderStatus,
        shipment.trackingNumber,
        user,
      );
    }

    return this.crmOrdersService.findById(orderId);
  }

  async getYalidineHealth() {
    const payload = await this.yalidineRequest('GET', '/wilayas/');
    const total = payload?.total_data ?? payload?.data?.length ?? 0;
    return {
      ok: true,
      provider: 'yalidine',
      wilayas: total,
    };
  }

  async getYalidineLabelUrl(orderId: string, options?: { createIfMissing?: boolean }) {
    const createIfMissing = options?.createIfMissing !== false;
    let [shipment] = await this.db
      .select()
      .from(shipments)
      .where(eq(shipments.orderId, orderId))
      .limit(1);

    if (!shipment?.trackingNumber && createIfMissing) {
      await this.createYalidineParcel(orderId);
      [shipment] = await this.db
        .select()
        .from(shipments)
        .where(eq(shipments.orderId, orderId))
        .limit(1);
    }

    if (!shipment?.trackingNumber) {
      throw new BadRequestException(
        'Cette commande n a pas encore de colis Yalidine',
      );
    }

    const parcel = await this.fetchParcelByTracking(shipment.trackingNumber);
    const url =
      this.extractLabelUrl(parcel) ||
      this.extractLabelUrl(shipment.metadata);
    if (!url) {
      throw new NotFoundException(
        'Yalidine n a pas renvoye de bordereau pour ce colis',
      );
    }

    const metadata = (shipment.metadata || {}) as Record<string, unknown>;
    await this.db
      .update(shipments)
      .set({
        metadata: { ...metadata, ...(parcel || {}), label: url },
        syncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, shipment.id));

    return { url, tracking: shipment.trackingNumber };
  }

  async downloadYalidineBordereau(orderId: string) {
    const { url, tracking } = await this.getYalidineLabelUrl(orderId, {
      createIfMissing: true,
    });

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 MichketCRM',
        Accept: 'text/html,application/pdf,application/octet-stream,*/*',
      },
    });
    if (!response.ok) {
      throw new BadRequestException(
        'Impossible de recuperer le bordereau officiel Yalidine',
      );
    }

    const contentType =
      response.headers.get('content-type') || 'text/html; charset=utf-8';
    const buffer = Buffer.from(await response.arrayBuffer());
    const extension = contentType.toLowerCase().includes('pdf') ? 'pdf' : 'html';

    return {
      filename: `bordereau-yalidine-${tracking}.${extension}`,
      contentType,
      buffer,
    };
  }

  async listRecentShipments() {
    return this.db
      .select()
      .from(shipments)
      .orderBy(desc(shipments.updatedAt))
      .limit(100);
  }

  private async applyYalidineOrderStatus(
    order: typeof orders.$inferSelect,
    lastStatus: string,
    mappedStatus: DbOrderStatus | null,
    tracking: string,
    user?: CrmUserContext,
  ) {
    const shouldUpdate =
      Boolean(mappedStatus) &&
      canApplyYalidineStatus(order.status, mappedStatus as DbOrderStatus);
    const nextStatus = shouldUpdate ? (mappedStatus as DbOrderStatus) : order.status;
    const reason = `Yalidine: ${lastStatus}`;

    if (shouldUpdate) {
      const updateData: Record<string, unknown> = {
        status: nextStatus,
        updatedAt: new Date(),
      };
      if (nextStatus === 'shipped' && !order.shippedAt) {
        updateData.shippedAt = new Date();
      }
      if (nextStatus === 'delivered' && !order.deliveredAt) {
        updateData.deliveredAt = new Date();
      }
      if (nextStatus === 'refunded' && !order.cancelledAt) {
        updateData.cancelledAt = new Date();
        updateData.cancelReason = reason;
      }

      await this.db.update(orders).set(updateData).where(eq(orders.id, order.id));
    }

    await this.db.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: order.status,
      toStatus: nextStatus,
      changedByUserId: user?.id,
      reason,
      metadata: {
        tracking,
        last_status: lastStatus,
        provider: 'yalidine',
      },
      createdAt: new Date(),
    });
  }

  private async resolveStopdesk(order: typeof orders.$inferSelect) {
    const existingId = Number(order.deliveryOfficeId);
    if (Number.isFinite(existingId) && existingId > 0) {
      return {
        centerId: existingId,
        name: order.deliveryOfficeName || '',
        address: '',
        commune: order.commune || '',
        wilaya: order.wilayaName,
      };
    }

    const centers = await this.listYalidineCenters(order.wilayaCode);
    if (centers.length === 0) {
      throw new BadRequestException(
        `Aucun bureau Yalidine pour ${order.wilayaName}`,
      );
    }

    const wantedName = (order.deliveryOfficeName || '').trim().toLowerCase();
    const wantedCommune = (order.commune || '').trim().toLowerCase();
    const exactName = centers.find(
      (center) => center.name.toLowerCase() === wantedName,
    );
    const partialName = centers.find(
      (center) =>
        wantedName &&
        (center.name.toLowerCase().includes(wantedName) ||
          wantedName.includes(center.name.toLowerCase())),
    );
    const communeMatch = centers.find(
      (center) =>
        wantedCommune && center.commune.toLowerCase() === wantedCommune,
    );
    const match =
      exactName ||
      partialName ||
      communeMatch ||
      (centers.length === 1 ? centers[0] : undefined);

    if (!match) {
      throw new BadRequestException(
        `Bureau Yalidine introuvable pour ${order.wilayaName}. Choisissez un centre Yalidine.`,
      );
    }

    return match;
  }

  private formatProductList(
    items: Array<{
      productName: string;
      quantity: number;
      colorName: string | null;
      personalization: unknown;
    }>,
  ) {
    if (items.length === 0) {
      return 'Commande Michket';
    }

    return items
      .map((item) => {
        const extras = [
          item.colorName,
          personalizationText(item.personalization),
        ].filter(Boolean);
        const name = extras.length
          ? `${item.productName} (${extras.join(', ')})`
          : item.productName;
        return `${item.quantity}x ${name}`;
      })
      .join(', ');
  }

  private credentials() {
    const apiId = (
      this.configService.get<string>('YALIDINE_API_ID') ||
      this.configService.get<string>('delivery.yalidineId') ||
      ''
    ).trim();
    const apiToken = (
      this.configService.get<string>('YALIDINE_API_TOKEN') ||
      this.configService.get<string>('delivery.yalidineToken') ||
      ''
    ).trim();
    if (!apiId || !apiToken) {
      throw new ServiceUnavailableException(
        'Yalidine n est pas configure (YALIDINE_API_ID / YALIDINE_API_TOKEN)',
      );
    }
    return { apiId, apiToken };
  }

  private parcelProductPrice(order: typeof orders.$inferSelect) {
    return Math.max(
      0,
      centsToDzd(order.subtotalCents) - centsToDzd(order.discountCents),
    );
  }

  private async correctYalidineCodIfPossible(
    tracking: string,
    order: typeof orders.$inferSelect,
  ) {
    const price = this.parcelProductPrice(order);
    try {
      await this.yalidineRequest(
        'PATCH',
        `/parcels/${encodeURIComponent(tracking)}`,
        { price, freeshipping: false, declared_value: price },
      );
    } catch (error) {
      this.logger.warn(
        `Could not update Yalidine COD for ${tracking}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async fetchParcelByTracking(tracking: string) {
    const encoded = encodeURIComponent(tracking);
    const paths = [
      `/parcels/?tracking=${encoded}&fields=tracking,label,labels,last_status`,
      `/parcels/${encoded}`,
    ];

    for (const path of paths) {
      try {
        const payload = await this.yalidineRequest('GET', path);
        const first = Array.isArray(payload?.data) ? payload.data[0] : payload;
        if (first && (first.tracking || first.label || first.labels)) {
          return first;
        }
      } catch (error) {
        this.logger.warn(
          `Yalidine parcel lookup failed (${path}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return null;
  }

  private unwrapParcelResult(result: any, reference: string) {
    return result?.[reference] || result?.data?.[reference] || result?.[0] || result;
  }

  private extractTracking(created: any) {
    return (
      created?.tracking ||
      created?.tracking_number ||
      created?.data?.tracking ||
      null
    );
  }

  private extractLabelUrl(payload: any): string | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    const candidates = [
      payload.label,
      payload.label_url,
      payload.labelUrl,
      typeof payload.labels === 'string' ? payload.labels : payload.labels?.pdf,
      payload.data?.label,
    ];
    const value = candidates.find(
      (item) => typeof item === 'string' && item.startsWith('http'),
    );
    return value || null;
  }

  private async resolveCommuneName(wilayaCode: number, commune: string) {
    try {
      const payload = await this.yalidineRequest(
        'GET',
        `/communes/?wilaya_id=${wilayaCode}`,
      );
      const rows: Array<{ name?: string; is_deliverable?: number }> = payload?.data || [];
      const wanted = commune.trim().toLowerCase();
      const exact = rows.find(
        (row) => String(row.name || '').trim().toLowerCase() === wanted,
      );
      if (exact?.name) {
        return exact.name;
      }
      const partial = rows.find((row) =>
        String(row.name || '').toLowerCase().includes(wanted),
      );
      if (partial?.name) {
        return partial.name;
      }
      const deliverable = rows.find((row) => row.is_deliverable);
      return deliverable?.name || commune;
    } catch {
      this.logger.warn(`Yalidine communes lookup failed for wilaya ${wilayaCode}`);
      return commune;
    }
  }

  private async yalidineRequest(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
  ) {
    const { apiId, apiToken } = this.credentials();
    const response = await fetch(`${YALIDINE_BASE}${path}`, {
      method,
      headers: {
        'X-API-ID': apiId,
        'X-API-TOKEN': apiToken,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      this.logger.error(`Yalidine ${method} ${path} failed: ${response.status}`);
      const message =
        payload?.message ||
        payload?.error ||
        (typeof payload === 'object' && payload
          ? JSON.stringify(payload).slice(0, 280)
          : `Erreur Yalidine (${response.status})`);
      throw new BadRequestException(message);
    }
    return payload;
  }
}
