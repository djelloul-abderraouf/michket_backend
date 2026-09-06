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

        const pool = new Pool({
          connectionString: configService.getOrThrow<string>('DATABASE_URL'),
          max: configService.get<number>('DATABASE_POOL_MAX', 10),
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
          keepAlive: true,
        });

        try {
          await pool.query('SELECT 1');
          logger.log('✅ Database connected');
        } catch (error) {
          logger.error('❌ Database connection failed', error);
          await pool.end().catch(() => undefined);
          throw error;
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
