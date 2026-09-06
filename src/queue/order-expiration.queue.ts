import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import IORedis from 'ioredis';

import {
  QUEUE_REDIS_CONNECTION,
} from './queue.module';

export const ORDER_EXPIRATION_QUEUE =
  'order-expiration';

export const ORDER_EXPIRATION_JOB =
  'expire-pending-order';

export const ORDER_PENDING_EXPIRATION_MS =
  72 * 60 * 60 * 1000;

type OrderExpirationJobData = {
  orderId: string;
};

@Injectable()
export class OrderExpirationQueueService
  implements OnApplicationShutdown
{
  private readonly logger = new Logger(
    OrderExpirationQueueService.name,
  );

  private readonly queue: Queue<OrderExpirationJobData>;

  constructor(
    @Inject(QUEUE_REDIS_CONNECTION)
    redis: IORedis,
  ) {
    this.queue = new Queue<OrderExpirationJobData>(
      ORDER_EXPIRATION_QUEUE,
      {
        connection: redis,
        defaultJobOptions: {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 30_000,
          },
          removeOnComplete: {
            age: 24 * 60 * 60,
            count: 1000,
          },
          removeOnFail: {
            age: 7 * 24 * 60 * 60,
            count: 5000,
          },
        },
      },
    );
  }

  async schedule(orderId: string): Promise<Job<OrderExpirationJobData>> {
    const job = await this.queue.add(
      ORDER_EXPIRATION_JOB,
      { orderId },
      {
        jobId: this.jobId(orderId),
        delay: ORDER_PENDING_EXPIRATION_MS,
      },
    );

    this.logger.log(
      `Pending-order expiration scheduled for ${orderId} in 72 hours`,
    );

    return job;
  }

  async remove(orderId: string): Promise<boolean> {
    const job = await this.queue.getJob(
      this.jobId(orderId),
    );

    if (!job) {
      return false;
    }

    try {
      await job.remove();

      this.logger.log(
        `Pending-order expiration removed for ${orderId}`,
      );

      return true;
    } catch {
      // The job may already be active/completed by the time
      // we try to remove it. The worker will still re-check
      // the real order status in PostgreSQL before cancelling.
      return false;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }

  private jobId(orderId: string): string {
    // BullMQ custom job IDs must not contain ":".
    return `pending-order-${orderId}`;
  }
}
