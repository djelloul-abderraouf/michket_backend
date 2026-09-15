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

  async getEnhancedStats() {
    const [revenueMetrics] = await this.db
      .select({
        totalRevenue: sql<number>`coalesce(sum(total_cents), 0)::int`,
        avgOrderValue: sql<number>`coalesce(avg(total_cents), 0)::int`,
        totalOrders: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(eq(orders.status, 'delivered'));

    const orderStatusBreakdown = await this.db
      .select({
        status: orders.status,
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(total_cents), 0)::int`,
      })
      .from(orders)
      .groupBy(orders.status);

    const topWilayas = await this.db
      .select({
        wilaya: orders.wilayaName,
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(total_cents), 0)::int`,
      })
      .from(orders)
      .groupBy(orders.wilayaName)
      .orderBy(sql`count(*) DESC`)
      .limit(10);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const revenueTrends = await this.db
      .select({
        date: sql<string>`date(${orders.createdAt})`,
        revenue: sql<number>`coalesce(sum(total_cents), 0)::int`,
        orders: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(
        and(
          gte(orders.createdAt, thirtyDaysAgo),
          eq(orders.status, 'delivered'),
        ),
      )
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
      .orderBy(sql`${orders.createdAt} DESC`)
      .limit(10);

    return {
      revenue: {
        total: centsToDzd(revenueMetrics?.totalRevenue ?? 0),
        avgOrderValue: centsToDzd(revenueMetrics?.avgOrderValue ?? 0),
        totalOrders: revenueMetrics?.totalOrders ?? 0,
      },
      orderStatusBreakdown: orderStatusBreakdown.map((item) => ({
        status: toCrmOrderStatus(item.status),
        count: item.count,
        total: centsToDzd(item.total),
      })),
      topWilayas: topWilayas.map((item) => ({
        ...item,
        total: centsToDzd(item.total),
      })),
      revenueTrends: revenueTrends.map((item) => ({
        ...item,
        revenue: centsToDzd(item.revenue),
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
        createdAt: this.toIso(order.createdAt),
      })),
    };
  }

  async getKPIs() {
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
        ),
      );

    const [currentMonthOrders] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(gte(orders.createdAt, startOfMonth));

    const [confirmedOrders] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(eq(orders.status, 'confirmed'));

    const [totalOrders] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(orders);

    const confirmationRate =
      totalOrders?.count > 0
        ? ((confirmedOrders?.count ?? 0) / totalOrders.count) * 100
        : 0;

    const [deliveredOrders] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(eq(orders.status, 'delivered'));

    const deliveryRate =
      totalOrders?.count > 0
        ? ((deliveredOrders?.count ?? 0) / totalOrders.count) * 100
        : 0;

    const [inProduction] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(crmProductionJobs)
      .where(eq(crmProductionJobs.status, 'en_cours'));

    const [pipelineAmount] = await this.db
      .select({
        total: sql<number>`coalesce(sum(estimated_amount), 0)::numeric`,
      })
      .from(crmDeals);

    const lastMonth = lastMonthRevenue?.total ?? 0;
    const currentMonth = currentMonthRevenue?.total ?? 0;
    const growthRate =
      lastMonth > 0 ? ((currentMonth - lastMonth) / lastMonth) * 100 : 0;

    return {
      revenue: {
        currentMonth: centsToDzd(currentMonth),
        lastMonth: centsToDzd(lastMonth),
        growthRate: Math.round(growthRate * 100) / 100,
      },
      orders: {
        currentMonth: currentMonthOrders?.count ?? 0,
        confirmationRate: Math.round(confirmationRate * 100) / 100,
        deliveryRate: Math.round(deliveryRate * 100) / 100,
      },
      production: {
        inProgress: inProduction?.count ?? 0,
      },
      sales: {
        pipelineAmount: this.toNumber(pipelineAmount?.total),
      },
    };
  }
}
