import {
  Inject,
  Logger,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

export const QUEUE_REDIS_CONNECTION =
  Symbol('QUEUE_REDIS_CONNECTION');

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: QUEUE_REDIS_CONNECTION,
      inject: [ConfigService],
      useFactory: async (
        configService: ConfigService,
      ): Promise<IORedis> => {
        const redisUrl =
          configService.get<string>('REDIS_URL');

        if (!redisUrl) {
          throw new Error(
            'REDIS_URL is required for BullMQ',
          );
        }

        const logger = new Logger('QueueRedis');

        const redis = new IORedis(redisUrl, {
          // Required by BullMQ for blocking operations.
          maxRetriesPerRequest: null,

          enableReadyCheck: true,
          lazyConnect: true,
          keepAlive: 10_000,

          // A temporary network delay must not fail too quickly.
          connectTimeout: 15_000,

          // Keep reconnecting in the background when Redis/Upstash
          // is temporarily unreachable. Cap the delay at 10 seconds.
          retryStrategy: (times) =>
            Math.min(times * 1_000, 10_000),
        });

        redis.on('error', (error) => {
          logger.error(
            error.message,
            error.stack,
          );
        });

        redis.on('ready', () => {
          logger.log(
            'BullMQ Redis connection ready',
          );
        });

        redis.on('reconnecting', (delay: number) => {
          logger.warn(
            `Redis reconnecting in ${delay} ms`,
          );
        });

        /*
         * Redis/BullMQ is important, but PostgreSQL remains the source
         * of truth for orders and the reconciler can recover missed
         * expiration jobs later.
         *
         * Therefore a temporary Redis outage must NOT prevent the whole
         * Nest application from starting.
         */
        try {
          await redis.connect();
          await redis.ping();
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : String(error);

          logger.warn(
            `Redis unavailable during startup: ${message}. ` +
              'Backend will start and Redis will reconnect in the background.',
          );
        }

        return redis;
      },
    },
  ],
  exports: [QUEUE_REDIS_CONNECTION],
})
export class QueueModule
  implements OnApplicationShutdown
{
  constructor(
    @Inject(QUEUE_REDIS_CONNECTION)
    private readonly redis: IORedis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    if (
      this.redis.status === 'ready' ||
      this.redis.status === 'connect'
    ) {
      try {
        await this.redis.quit();
        return;
      } catch {
        // Fall back to a hard disconnect below.
      }
    }

    this.redis.disconnect();
  }
}
