import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import {
  and,
  asc,
  eq,
  lte,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../database/schema';
import { orders } from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import { OrdersService } from './orders.service';

const PENDING_ORDER_MAX_AGE_MS =
  72 * 60 * 60 * 1000;

const RECONCILIATION_INTERVAL_MS =
  60 * 60 * 1000;

const RECONCILIATION_BATCH_SIZE = 500;

@Injectable()
export class OrderExpirationReconciler
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(
    OrderExpirationReconciler.name,
  );

  private interval?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly ordersService: OrdersService,
  ) {}

  onModuleInit(): void {
    // Run once at startup so missed BullMQ jobs are recovered
    // without waiting for the first hourly interval.
    void this.reconcile();

    this.interval = setInterval(
      () => {
        void this.reconcile();
      },
      RECONCILIATION_INTERVAL_MS,
    );

    // Do not keep the Node process alive only because of this timer.
    this.interval.unref();

    this.logger.log(
      'Pending-order reconciliation started',
    );
  }

  onApplicationShutdown(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private async reconcile(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      const cutoff = new Date(
        Date.now() - PENDING_ORDER_MAX_AGE_MS,
      );

      const staleOrders = await this.db
        .select({
          id: orders.id,
        })
        .from(orders)
        .where(
          and(
            eq(orders.status, 'pending'),
            lte(orders.createdAt, cutoff),
          ),
        )
        .orderBy(asc(orders.createdAt))
        .limit(RECONCILIATION_BATCH_SIZE);

      if (staleOrders.length === 0) {
        return;
      }

      this.logger.warn(
        `Found ${staleOrders.length} stale pending order(s) to reconcile`,
      );

      let expiredCount = 0;

      for (const order of staleOrders) {
        try {
          const expired =
            await this.ordersService.expirePendingOrder(
              order.id,
              'Pending order expired after 72 hours (PostgreSQL reconciliation)',
            );

          if (expired) {
            expiredCount += 1;
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : String(error);

          this.logger.error(
            `Unable to reconcile pending order ${order.id}: ${message}`,
          );
        }
      }

      this.logger.log(
        `Pending-order reconciliation completed: ${expiredCount}/${staleOrders.length} expired`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      this.logger.error(
        `Pending-order reconciliation failed: ${message}`,
      );
    } finally {
      this.running = false;
    }
  }
}
