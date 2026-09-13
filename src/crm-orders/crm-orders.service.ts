import {
  Injectable,
  Inject,
} from '@nestjs/common';
import {
  eq,
  desc,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../database/schema';
import {
  crmOrders,
  crmOrderStatusHistory,
} from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import { CrmBaseService } from '../crm-base/crm-base.service';
import {
  CreateCrmOrderDto,
  UpdateCrmOrderDto,
  UpdateOrderStatusDto,
} from './dto/crm-orders.dto';

@Injectable()
export class CrmOrdersService extends CrmBaseService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    db: NodePgDatabase<typeof schema>,
  ) {
    super(db);
  }

  async findAll() {
    return this.findAll(crmOrders);
  }

  async findById(id: string) {
    return this.findById(crmOrders, id, 'Order');
  }

  async create(dto: CreateCrmOrderDto) {
    const [order] = await this.db
      .insert(crmOrders)
      .values({
        id: dto.id,
        source: dto.source,
        clientName: dto.clientName,
        phone: dto.phone,
        wilaya: dto.wilaya,
        status: dto.status,
        items: dto.items as any,
        total: dto.total,
        notes: dto.notes,
        confirmationReason: dto.confirmationReason,
        reminderAt: dto.reminderAt ? new Date(dto.reminderAt) : null,
      })
      .returning();

    return order;
  }

  async update(id: string, dto: UpdateCrmOrderDto) {
    await this.findById(id);

    const [updatedOrder] = await this.db
      .update(crmOrders)
      .set({
        ...dto,
        deliveredAt: dto.deliveredAt ? new Date(dto.deliveredAt) : undefined,
        shippedAt: dto.shippedAt ? new Date(dto.shippedAt) : undefined,
        reminderAt: dto.reminderAt ? new Date(dto.reminderAt) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(crmOrders.id, id))
      .returning();

    return updatedOrder;
  }

  async updateOrderStatus(id: string, dto: UpdateOrderStatusDto, authorId: string) {
    const order = await this.findById(id);

    // Update order status
    const [updatedOrder] = await this.db
      .update(crmOrders)
      .set({
        status: dto.to,
        updatedAt: new Date(),
      })
      .where(eq(crmOrders.id, id))
      .returning();

    // Create status history entry
    await this.db.insert(crmOrderStatusHistory).values({
      id: `hst-${id}-${Date.now()}`,
      orderId: id,
      fromStatus: order.status,
      toStatus: dto.to,
      authorId,
      note: dto.note,
    });

    return updatedOrder;
  }

  async delete(id: string) {
    await this.findById(id);
    await this.deleteById(crmOrders, id);
  }

  async findByStatus(status: string) {
    return this.db
      .select()
      .from(crmOrders)
      .where(eq(crmOrders.status, status))
      .orderBy(desc(crmOrders.createdAt));
  }

  async findByWilaya(wilaya: string) {
    return this.db
      .select()
      .from(crmOrders)
      .where(eq(crmOrders.wilaya, wilaya))
      .orderBy(desc(crmOrders.createdAt));
  }

  async getStatusHistory(orderId: string) {
    return this.db
      .select()
      .from(crmOrderStatusHistory)
      .where(eq(crmOrderStatusHistory.orderId, orderId))
      .orderBy(desc(crmOrderStatusHistory.createdAt));
  }
}
