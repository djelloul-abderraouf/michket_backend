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
  orders,
  shipments,
} from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import { CrmBaseService } from '../crm-base/crm-base.service';
import { centsToDzd } from '../crm-base/crm-status';
import { splitOrderName } from '../crm-base/order-name';
import { DeliveryService } from '../delivery/delivery.service';
import { CrmOrdersService } from '../crm-orders/crm-orders.service';

const YALIDINE_BASE = 'https://api.yalidine.app/v1';

type CrmUserContext = {
  id: string;
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
    // Yalidine `price` is COD for the products only. It then adds its own
    // wilaya delivery fee unless freeshipping is true. Sending our total
    // (already including livraison) with freeshipping=false billed shipping twice.
    const price = this.parcelProductPrice(order);
    const productList =
      items.length > 0
        ? items.map((item) => `${item.quantity}x ${item.productName}`).join(', ')
        : 'Commande Michket';

    const names = splitOrderName(order.fullName);
    const payload = [
      {
        order_id: order.reference,
        from_wilaya_name: fromWilayaName,
        firstname: names.firstName,
        familyname: names.lastName || names.firstName,
        contact_phone: order.phone.replace(/\s+/g, ''),
        address: [order.addressLine1, order.addressLine2].filter(Boolean).join(', ') || order.commune,
        to_commune_name: communeName,
        to_wilaya_name: order.wilayaName,
        product_list: productList,
        price,
        declared_value: price,
        freeshipping: false,
        is_stopdesk: isStopdesk,
        stopdesk_id: isStopdesk && order.deliveryOfficeId
          ? Number(order.deliveryOfficeId) || undefined
          : undefined,
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

    const shipmentValues = {
      provider: 'yalidine',
      externalShipmentId: String(created.import_id || created.id || tracking),
      trackingNumber: String(tracking),
      status: 'created' as const,
      stopDeskId: order.deliveryOfficeId,
      stopDeskName: order.deliveryOfficeName,
      metadata: { ...created, label: labelUrl },
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

    return this.crmOrdersService.findById(order.id);
  }

  async syncYalidineParcel(orderId: string) {
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
    const lastStatus = String(parcel?.last_status || parcel?.status || '').toLowerCase();

    let nextStatus: (typeof shipments.$inferSelect)['status'] = shipment.status;
    if (lastStatus.includes('livr')) {
      nextStatus = 'delivered';
    } else if (lastStatus.includes('retour') || lastStatus.includes('echec') || lastStatus.includes('échec')) {
      nextStatus = 'failed';
    } else if (lastStatus.includes('transit') || lastStatus.includes('expédi') || lastStatus.includes('en cours')) {
      nextStatus = 'in_transit';
    }

    await this.db
      .update(shipments)
      .set({
        status: nextStatus,
        metadata: parcel,
        syncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, shipment.id));

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
    } catch (error) {
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
