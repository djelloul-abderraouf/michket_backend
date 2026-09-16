import {
  Injectable,
  Inject,
} from '@nestjs/common';
import {
  eq,
  and,
  sql,
  gte,
  lte,
  ne,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../database/schema';
import {
  orders,
  crmDeals,
  crmTasks,
  crmProductionJobs,
  crmActivities,
} from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import { CrmBaseService } from '../crm-base/crm-base.service';
import { centsToDzd, toCrmOrderStatus } from '../crm-base/crm-status';

@Injectable()
export class CrmDashboardService extends CrmBaseService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    db: NodePgDatabase<typeof schema>,
  ) {
    super(db);
  }

  async getSummary() {
    const ordersByStatusRows = await this.db
      .select({
        status: orders.status,
        count: sql<number>`count(*)::int`,
      })
      .from(orders)
      .groupBy(orders.status);

    const [totalRevenue] = await this.db
      .select({
        total: sql<number>`coalesce(sum(total_cents), 0)::int`,
      })
      .from(orders)
      .where(eq(orders.status, 'delivered'));

    const [pipelineAmount] = await this.db
      .select({
        total: sql<number>`coalesce(sum(estimated_amount), 0)::numeric`,
      })
      .from(crmDeals);

    const [activeTasks] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(crmTasks)
      .where(eq(crmTasks.done, false));

    const [activeProductionJobs] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(crmProductionJobs)
      .where(eq(crmProductionJobs.status, 'en_cours'));

    const recentActivities = await this.db
      .select()
      .from(crmActivities)
      .orderBy(sql`${crmActivities.createdAt} DESC`)
      .limit(10);

    const ordersByStatus = Object.fromEntries(
      ordersByStatusRows.map((row) => [
        toCrmOrderStatus(row.status),
        row.count,
      ]),
    );

    return {
      ordersByStatus,
      totalRevenue: centsToDzd(totalRevenue?.total ?? 0),
      pipelineAmount: this.toNumber(pipelineAmount?.total),
      activeTasks: activeTasks?.count ?? 0,
      activeProductionJobs: activeProductionJobs?.count ?? 0,
      recentActivities,
    };
  }

  async getDealStatistics() {
    return this.db
      .select({
        stage: crmDeals.stage,
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(estimated_amount), 0)::numeric`,
      })
      .from(crmDeals)
      .groupBy(crmDeals.stage);
  }

  async getProductionStatistics() {
    return this.db
      .select({
        status: crmProductionJobs.status,
        count: sql<number>`count(*)::int`,
      })
      .from(crmProductionJobs)
      .groupBy(crmProductionJobs.status);
  }

  async getTaskStatistics() {
    return this.db
      .select({
        done: crmTasks.done,
        count: sql<number>`count(*)::int`,
      })
      .from(crmTasks)
      .groupBy(crmTasks.done);
  }

  async getEnhancedStats(filters: {
    from?: string;
    to?: string;
    wilaya?: string;
  } = {}) {
    const where = this.buildOrderWhere(filters);

    const [revenueMetrics] = await this.db
      .select({
        totalRevenue: sql<number>`coalesce(sum(total_cents) filter (where ${orders.status} = 'delivered'), 0)::int`,
        gmv: sql<number>`coalesce(sum(total_cents) filter (where ${orders.status} not in ('cancelled', 'refunded')), 0)::int`,
        avgOrderValue: sql<number>`coalesce(avg(total_cents) filter (where ${orders.status} = 'delivered'), 0)::int`,
        totalOrders: sql<number>`count(*)::int`,
        deliveredOrders: sql<number>`count(*) filter (where ${orders.status} = 'delivered')::int`,
        pendingOrders: sql<number>`count(*) filter (where ${orders.status} = 'pending')::int`,
        confirmedOrders: sql<number>`count(*) filter (where ${orders.status} = 'confirmed')::int`,
        processingOrders: sql<number>`count(*) filter (where ${orders.status} = 'processing')::int`,
        shippedOrders: sql<number>`count(*) filter (where ${orders.status} = 'shipped')::int`,
        cancelledOrders: sql<number>`count(*) filter (where ${orders.status} in ('cancelled', 'refunded'))::int`,
        deliveryFee: sql<number>`coalesce(sum(delivery_fee_cents), 0)::int`,
        discount: sql<number>`coalesce(sum(discount_cents), 0)::int`,
      })
      .from(orders)
      .where(where);

    const orderStatusBreakdown = await this.db
      .select({
        status: orders.status,
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(total_cents), 0)::int`,
      })
      .from(orders)
      .where(where)
      .groupBy(orders.status);

    const paymentBreakdown = await this.db
      .select({
        paymentStatus: orders.paymentStatus,
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(total_cents), 0)::int`,
      })
      .from(orders)
      .where(where)
      .groupBy(orders.paymentStatus);

    const deliveryTypeBreakdown = await this.db
      .select({
        deliveryType: orders.deliveryType,
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(total_cents), 0)::int`,
      })
      .from(orders)
      .where(where)
      .groupBy(orders.deliveryType);

    const topWilayas = await this.db
      .select({
        wilaya: orders.wilayaName,
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(total_cents), 0)::int`,
      })
      .from(orders)
      .where(where)
      .groupBy(orders.wilayaName)
      .orderBy(sql`count(*) DESC`)
      .limit(12);

    const wilayas = await this.db
      .selectDistinct({ wilaya: orders.wilayaName })
      .from(orders)
      .orderBy(orders.wilayaName);

    const trendWhere = this.buildOrderWhere({
      ...filters,
      from: filters.from === 'all' ? this.isoDaysAgo(90) : filters.from,
    });

    const revenueTrends = await this.db
      .select({
        date: sql<string>`date(${orders.createdAt})`,
        revenue: sql<number>`coalesce(sum(total_cents) filter (where ${orders.status} = 'delivered'), 0)::int`,
        gmv: sql<number>`coalesce(sum(total_cents) filter (where ${orders.status} not in ('cancelled', 'refunded')), 0)::int`,
        orders: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(trendWhere)
      .groupBy(sql`date(${orders.createdAt})`)
      .orderBy(sql`date(${orders.createdAt})`);

    const productionQueue = await this.db
      .select({
        status: crmProductionJobs.status,
        count: sql<number>`count(*)::int`,
      })
      .from(crmProductionJobs)
      .groupBy(crmProductionJobs.status);

    const dealsPipeline = await this.db
      .select({
        stage: crmDeals.stage,
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(estimated_amount), 0)::numeric`,
      })
      .from(crmDeals)
      .groupBy(crmDeals.stage);

    const recentOrders = await this.db
      .select()
      .from(orders)
      .where(where)
      .orderBy(sql`${orders.createdAt} DESC`)
      .limit(10);

    const totalOrders = revenueMetrics?.totalOrders ?? 0;
    const deliveredOrders = revenueMetrics?.deliveredOrders ?? 0;
    const confirmedLike =
      (revenueMetrics?.confirmedOrders ?? 0) +
      (revenueMetrics?.processingOrders ?? 0) +
      (revenueMetrics?.shippedOrders ?? 0) +
      deliveredOrders;

    return {
      filters: {
        from: filters.from || null,
        to: filters.to || null,
        wilaya: filters.wilaya || 'all',
      },
      wilayas: wilayas.map((row) => row.wilaya).filter(Boolean),
      revenue: {
        total: centsToDzd(revenueMetrics?.totalRevenue ?? 0),
        gmv: centsToDzd(revenueMetrics?.gmv ?? 0),
        avgOrderValue: centsToDzd(revenueMetrics?.avgOrderValue ?? 0),
        totalOrders,
        deliveredOrders,
        deliveryFee: centsToDzd(revenueMetrics?.deliveryFee ?? 0),
        discount: centsToDzd(revenueMetrics?.discount ?? 0),
      },
      funnel: {
        pending: revenueMetrics?.pendingOrders ?? 0,
        confirmed: revenueMetrics?.confirmedOrders ?? 0,
        processing: revenueMetrics?.processingOrders ?? 0,
        shipped: revenueMetrics?.shippedOrders ?? 0,
        delivered: deliveredOrders,
        cancelled: revenueMetrics?.cancelledOrders ?? 0,
        confirmationRate:
          totalOrders > 0
            ? Math.round((confirmedLike / totalOrders) * 10000) / 100
            : 0,
        deliveryRate:
          totalOrders > 0
            ? Math.round((deliveredOrders / totalOrders) * 10000) / 100
            : 0,
        cancelRate:
          totalOrders > 0
            ? Math.round(
                ((revenueMetrics?.cancelledOrders ?? 0) / totalOrders) * 10000,
              ) / 100
            : 0,
      },
      orderStatusBreakdown: orderStatusBreakdown.map((item) => ({
        status: toCrmOrderStatus(item.status),
        count: item.count,
        total: centsToDzd(item.total),
      })),
      paymentBreakdown: paymentBreakdown.map((item) => ({
        status: item.paymentStatus,
        count: item.count,
        total: centsToDzd(item.total),
      })),
      deliveryTypeBreakdown: deliveryTypeBreakdown.map((item) => ({
        type: item.deliveryType === 'office' ? 'Stop desk' : 'Domicile',
        count: item.count,
        total: centsToDzd(item.total),
      })),
      topWilayas: topWilayas.map((item) => ({
        ...item,
        total: centsToDzd(item.total),
      })),
      revenueTrends: revenueTrends.map((item) => ({
        date: item.date,
        revenue: centsToDzd(item.revenue),
        gmv: centsToDzd(item.gmv),
        orders: item.orders,
      })),
      productionQueue,
      dealsPipeline: dealsPipeline.map((item) => ({
        stage: item.stage,
        count: item.count,
        total: this.toNumber(item.total),
      })),
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        reference: order.reference,
        status: toCrmOrderStatus(order.status),
        total: centsToDzd(order.totalCents),
        clientName: `${order.firstName} ${order.lastName}`.trim(),
        phone: order.phone,
        wilaya: order.wilayaName,
        commune: order.commune,
        createdAt: this.toIso(order.createdAt),
      })),
    };
  }

  async getKPIs(filters: { from?: string; to?: string; wilaya?: string } = {}) {
    const where = this.buildOrderWhere(filters);
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

    const [currentMonthRevenue] = await this.db
      .select({
        total: sql<number>`coalesce(sum(total_cents), 0)::int`,
      })
      .from(orders)
      .where(
        and(
          gte(orders.createdAt, startOfMonth),
          eq(orders.status, 'delivered'),
          filters.wilaya && filters.wilaya !== 'all'
            ? eq(orders.wilayaName, filters.wilaya)
            : undefined,
        ),
      );

    const [lastMonthRevenue] = await this.db
      .select({
        total: sql<number>`coalesce(sum(total_cents), 0)::int`,
      })
      .from(orders)
      .where(
        and(
          gte(orders.createdAt, startOfLastMonth),
          lte(orders.createdAt, endOfLastMonth),
          eq(orders.status, 'delivered'),
          filters.wilaya && filters.wilaya !== 'all'
            ? eq(orders.wilayaName, filters.wilaya)
            : undefined,
        ),
      );

    const [periodMetrics] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
        gmv: sql<number>`coalesce(sum(total_cents) filter (where ${orders.status} not in ('cancelled', 'refunded')), 0)::int`,
        delivered: sql<number>`count(*) filter (where ${orders.status} = 'delivered')::int`,
        pending: sql<number>`count(*) filter (where ${orders.status} = 'pending')::int`,
        confirmed: sql<number>`count(*) filter (where ${orders.status} in ('confirmed', 'processing', 'shipped', 'delivered'))::int`,
        cancelled: sql<number>`count(*) filter (where ${orders.status} in ('cancelled', 'refunded'))::int`,
        avg: sql<number>`coalesce(avg(total_cents), 0)::int`,
      })
      .from(orders)
      .where(where);

    const [inProduction] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(crmProductionJobs)
      .where(eq(crmProductionJobs.status, 'en_cours'));

    const [openTasks] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(crmTasks)
      .where(eq(crmTasks.done, false));

    const [pipelineAmount] = await this.db
      .select({
        total: sql<number>`coalesce(sum(estimated_amount), 0)::numeric`,
      })
      .from(crmDeals)
      .where(ne(crmDeals.stage, 'perdue'));

    const lastMonth = lastMonthRevenue?.total ?? 0;
    const currentMonth = currentMonthRevenue?.total ?? 0;
    const growthRate =
      lastMonth > 0 ? ((currentMonth - lastMonth) / lastMonth) * 100 : 0;
    const total = periodMetrics?.count ?? 0;

    return {
      revenue: {
        currentMonth: centsToDzd(currentMonth),
        lastMonth: centsToDzd(lastMonth),
        growthRate: Math.round(growthRate * 100) / 100,
        gmv: centsToDzd(periodMetrics?.gmv ?? 0),
      },
      orders: {
        currentMonth: periodMetrics?.count ?? 0,
        pending: periodMetrics?.pending ?? 0,
        cancelled: periodMetrics?.cancelled ?? 0,
        confirmationRate:
          total > 0
            ? Math.round(((periodMetrics?.confirmed ?? 0) / total) * 10000) / 100
            : 0,
        deliveryRate:
          total > 0
            ? Math.round(((periodMetrics?.delivered ?? 0) / total) * 10000) / 100
            : 0,
        avgOrderValue: centsToDzd(periodMetrics?.avg ?? 0),
      },
      production: {
        inProgress: inProduction?.count ?? 0,
      },
      sales: {
        pipelineAmount: this.toNumber(pipelineAmount?.total),
      },
      tasks: {
        open: openTasks?.count ?? 0,
      },
    };
  }

  private buildOrderWhere(filters: {
    from?: string;
    to?: string;
    wilaya?: string;
  }) {
    const conditions = [];
    const range = this.parseRange(filters.from, filters.to);

    if (range) {
      conditions.push(gte(orders.createdAt, range.fromDate));
      conditions.push(lte(orders.createdAt, range.toDate));
    }

    if (filters.wilaya && filters.wilaya !== 'all') {
      conditions.push(eq(orders.wilayaName, filters.wilaya));
    }

    return conditions.length ? and(...conditions) : undefined;
  }

  private parseRange(from?: string, to?: string) {
    if (from === 'all' || (!from && !to)) {
      return null;
    }

    const toDate = to ? new Date(to) : new Date();
    if (Number.isNaN(toDate.getTime())) {
      return null;
    }
    toDate.setHours(23, 59, 59, 999);

    const fromDate = from ? new Date(from) : new Date(this.isoDaysAgo(30));
    if (Number.isNaN(fromDate.getTime())) {
      return null;
    }
    fromDate.setHours(0, 0, 0, 0);

    return { fromDate, toDate };
  }

  private isoDaysAgo(days: number) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
  }
}
