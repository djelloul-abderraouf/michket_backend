import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';

import { OrdersService } from './orders.service';
import {
  ORDER_EXPIRATION_JOB,
  ORDER_EXPIRATION_QUEUE,
} from '../queue/order-expiration.queue';
import {
  QUEUE_REDIS_CONNECTION,
} from '../queue/queue.module';

type OrderExpirationJobData = {
  orderId: string;
};

@Injectable()
export class OrderExpirationWorker
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(
    OrderExpirationWorker.name,
  );

  private worker?: Worker<OrderExpirationJobData>;

  constructor(
    @Inject(QUEUE_REDIS_CONNECTION)
    private readonly redis: IORedis,
    private readonly ordersService: OrdersService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<OrderExpirationJobData>(
      ORDER_EXPIRATION_QUEUE,
      async (job) => {
        if (job.name !== ORDER_EXPIRATION_JOB) {
          this.logger.warn(
            `Ignoring unknown job "${job.name}"`,
          );
          return;
        }

        const cancelled =
          await this.ordersService.expirePendingOrder(
            job.data.orderId,
            'Pending order expired after 72 hours',
          );

        if (cancelled) {
          this.logger.log(
            `Expired pending order ${job.data.orderId}`,
          );
          return;
        }

        this.logger.log(
          `Order ${job.data.orderId} is no longer pending; expiration skipped`,
        );
      },
      {
        connection: this.redis,
        concurrency: 5,
      },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Expiration job failed${
          job ? ` for order ${job.data.orderId}` : ''
        }: ${error.message}`,
        error.stack,
      );
    });

    this.worker.on('error', (error) => {
      this.logger.error(
        `BullMQ worker error: ${error.message}`,
        error.stack,
      );
    });

    this.logger.log(
      'Order expiration worker started',
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
