import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { desc, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../database/schema';
import {
  orderItems,
  orders,
  orderStatusHistory,
  shipments,
} from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import { CrmBaseService } from '../crm-base/crm-base.service';
import { centsToDzd } from '../crm-base/crm-status';
import { splitOrderName } from '../crm-base/order-name';
import { DeliveryService } from '../delivery/delivery.service';
import { CrmOrdersService } from '../crm-orders/crm-orders.service';
import { buildBordereauPdf, type BordereauData } from './bordereau-pdf';

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
    const fromWilayaCode = this.configService.get<number>('delivery.fromWilaya') || 16;
    const fromWilayaName = this.deliveryService.getWilayaName(fromWilayaCode);
    const isStopdesk = order.deliveryType === 'office';
    const price = centsToDzd(order.totalCents);
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
        freeshipping: order.deliveryFeeCents === 0,
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

    if (order.status === 'confirmed' || order.status === 'processing') {
      await this.db.insert(orderStatusHistory).values({
        orderId: order.id,
        fromStatus: order.status,
        toStatus: 'shipped',
        changedByUserId: user?.id,
        reason: `Colis Yalidine ${tracking}`,
        createdAt: new Date(),
      });

      await this.db
        .update(orders)
        .set({
          status: 'shipped',
          shippedAt: order.shippedAt || new Date(),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));
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

  async getYalidineLabelUrl(orderId: string) {
    const [shipment] = await this.db
      .select()
      .from(shipments)
      .where(eq(shipments.orderId, orderId))
      .limit(1);

    const metadata = (shipment?.metadata || {}) as Record<string, unknown>;
    const stored = this.extractLabelUrl(metadata);
    if (stored) {
      return { url: stored, tracking: shipment?.trackingNumber || null };
    }

    if (!shipment?.trackingNumber) {
      throw new BadRequestException('Creez d abord le colis Yalidine');
    }

    const parcel = await this.yalidineRequest(
      'GET',
      `/parcels/${encodeURIComponent(shipment.trackingNumber)}`,
    );
    const first = Array.isArray(parcel?.data) ? parcel.data[0] : parcel;
    const url = this.extractLabelUrl(first);
    if (!url) {
      throw new NotFoundException('Yalidine n a pas renvoye d etiquette pour ce colis');
    }

    await this.db
      .update(shipments)
      .set({
        metadata: { ...(metadata || {}), ...first, label: url },
        syncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, shipment.id));

    return { url, tracking: shipment.trackingNumber };
  }

  async buildBordereau(orderId: string) {
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
        'Le bordereau est disponible apres confirmation de la commande',
      );
    }

    const items = await this.db
      .select({
        productName: orderItems.productName,
        quantity: orderItems.quantity,
        unitPriceCents: orderItems.unitPriceCents,
        totalPriceCents: orderItems.totalPriceCents,
        variantName: orderItems.variantName,
        colorName: orderItems.colorName,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    const [shipment] = await this.db
      .select()
      .from(shipments)
      .where(eq(shipments.orderId, order.id))
      .limit(1);

    const payload: BordereauData = {
      reference: order.reference,
      createdAt: order.createdAt instanceof Date
        ? order.createdAt.toISOString()
        : String(order.createdAt),
      clientName: splitOrderName(order.fullName).clientName,
      phone: order.phone,
      email: order.email,
      addressLine1: order.addressLine1,
      addressLine2: order.addressLine2,
      commune: order.commune,
      wilaya: order.wilayaName,
      deliveryType: order.deliveryType,
      deliveryOfficeName: order.deliveryOfficeName,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      items: items.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: centsToDzd(item.unitPriceCents),
        lineTotal: centsToDzd(item.totalPriceCents),
        variantName: item.variantName,
        colorName: item.colorName,
      })),
      subtotal: centsToDzd(order.subtotalCents),
      deliveryFee: centsToDzd(order.deliveryFeeCents),
      discount: centsToDzd(order.discountCents),
      total: centsToDzd(order.totalCents),
      notes: order.notes,
      trackingNumber: shipment?.trackingNumber,
      carrier: shipment?.provider,
    };

    return {
      filename: `bordereau-${order.reference}.pdf`,
      buffer: buildBordereauPdf(payload),
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
    const apiId = this.configService.get<string>('delivery.yalidineId');
    const apiToken = this.configService.get<string>('delivery.yalidineToken');
    if (!apiId || !apiToken) {
      throw new ServiceUnavailableException(
        'Yalidine n est pas configure (YALIDINE_API_ID / YALIDINE_API_TOKEN)',
      );
    }
    return { apiId, apiToken };
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
    const value =
      payload.label ||
      payload.label_url ||
      payload.labelUrl ||
      payload.labels?.pdf ||
      payload.data?.label;
    return typeof value === 'string' && value.startsWith('http') ? value : null;
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

  private async yalidineRequest(method: 'GET' | 'POST', path: string, body?: unknown) {
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
