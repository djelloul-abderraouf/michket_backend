import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

export const DATABASE_CONNECTION = 'DATABASE_CONNECTION';
export const DATABASE_POOL = 'DATABASE_POOL';

@Injectable()
class DatabasePoolLifecycle implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabasePoolLifecycle.name);

  constructor(
    @Inject(DATABASE_POOL)
    private readonly pool: Pool,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    this.logger.log('Closing PostgreSQL connection pool...');
    await this.pool.end();
    this.logger.log('PostgreSQL connection pool closed');
  }
}


@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const logger = new Logger('Database');

        const poolMax = Number(
          configService.get('DATABASE_POOL_MAX') ?? 8,
        );

        const pool = new Pool({
          connectionString: configService.getOrThrow<string>('DATABASE_URL'),
          max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 8,
          idleTimeoutMillis: 15_000,
          connectionTimeoutMillis: 60_000,
          keepAlive: true,
          keepAliveInitialDelayMillis: 10_000,
        });

        pool.on('error', (error) => {
          logger.error(`PostgreSQL pool error: ${error.message}`);
        });

        pool.on('connect', (client) => {
          void client.query('SET statement_timeout = 120000');
        });

        let lastError: unknown;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            await pool.query('SELECT 1');
            lastError = undefined;
            logger.log('Database connected');
            break;
          } catch (error) {
            lastError = error;
            logger.warn(
              `Database connection attempt ${attempt}/3 failed`,
            );
            await new Promise((resolve) =>
              setTimeout(resolve, attempt * 1500),
            );
          }
        }

        if (lastError) {
          logger.error('Database connection failed', lastError);
          await pool.end().catch(() => undefined);
          throw lastError;
        }

        return pool;
      },
    },
    {
      provide: DATABASE_CONNECTION,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool) => drizzle(pool, { schema }),
    },
    DatabasePoolLifecycle,
  ],
  exports: [DATABASE_CONNECTION, DATABASE_POOL],
})
export class DatabaseModule {}
