import {
  Injectable,
  Inject,
} from '@nestjs/common';
import {
  eq,
  and,
  sql,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../database/schema';
import {
  crmOrders,
  crmDeals,
  crmTasks,
  crmProductionJobs,
  crmActivities,
} from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import { CrmBaseService } from '../crm-base/crm-base.service';

@Injectable()
export class CrmDashboardService extends CrmBaseService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    db: NodePgDatabase<typeof schema>,
  ) {
    super(db);
  }

  async getSummary() {
    const [ordersByStatus] = await this.db
      .select({
        status: crmOrders.status,
        count: sql<number>`count(*)::int`,
      })
      .from(crmOrders)
      .groupBy(crmOrders.status);

    const [totalRevenue] = await this.db
      .select({
        total: sql<number>`coalesce(sum(total), 0)::int`,
      })
      .from(crmOrders)
      .where(
        and(
          eq(crmOrders.status, 'livre'),
        ),
      );

    const [pipelineAmount] = await this.db
      .select({
        total: sql<number>`coalesce(sum(estimated_amount), 0)::int`,
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

    const [recentActivities] = await this.db
      .select()
      .from(crmActivities)
      .orderBy(sql`${crmActivities.createdAt} DESC`)
      .limit(10);

    return {
      ordersByStatus,
      totalRevenue: totalRevenue?.total ?? 0,
      pipelineAmount: pipelineAmount?.total ?? 0,
      activeTasks: activeTasks?.count ?? 0,
      activeProductionJobs: activeProductionJobs?.count ?? 0,
      recentActivities,
    };
  }

  async getOrderStatistics() {
    const [ordersByStatus] = await this.db
      .select({
        status: crmOrders.status,
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(total), 0)::int`,
      })
      .from(crmOrders)
      .groupBy(crmOrders.status);

    return ordersByStatus;
  }

  async getDealStatistics() {
    const [dealsByStage] = await this.db
      .select({
        stage: crmDeals.stage,
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(estimated_amount), 0)::int`,
      })
      .from(crmDeals)
      .groupBy(crmDeals.stage);

    return dealsByStage;
  }

  async getProductionStatistics() {
    const [jobsByStatus] = await this.db
      .select({
        status: crmProductionJobs.status,
        count: sql<number>`count(*)::int`,
      })
      .from(crmProductionJobs)
      .groupBy(crmProductionJobs.status);

    return jobsByStatus;
  }

  async getTaskStatistics() {
    const [tasksByStatus] = await this.db
      .select({
        done: crmTasks.done,
        count: sql<number>`count(*)::int`,
      })
      .from(crmTasks)
      .groupBy(crmTasks.done);

    return tasksByStatus;
  }
}
