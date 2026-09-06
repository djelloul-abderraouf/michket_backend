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

        const redis = new IORedis(redisUrl, {
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
          lazyConnect: true,
        });

        redis.on('error', (error) => {
          Logger.error(
            error.message,
            error.stack,
            'QueueRedis',
          );
        });

        await redis.connect();
        await redis.ping();

        Logger.log(
          'BullMQ Redis connection ready',
          'QueueRedis',
        );

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
    if (this.redis.status === 'ready') {
      await this.redis.quit();
      return;
    }

    this.redis.disconnect();
  }
}
