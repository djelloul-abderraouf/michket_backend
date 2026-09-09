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
          connectionString:
            configService.getOrThrow<string>('DATABASE_URL'),

          // Supabase already provides a pooler. Keeping the application-side
          // pool modest avoids opening unnecessary concurrent sessions.
          max: configService.get<number>(
            'DATABASE_POOL_MAX',
            5,
          ),

          idleTimeoutMillis: 30_000,

          // 5 seconds was too aggressive in practice: a temporary network /
          // Supabase pooler delay caused otherwise valid requests to fail.
          connectionTimeoutMillis:
            configService.get<number>(
              'DATABASE_CONNECTION_TIMEOUT_MS',
              15_000,
            ),

          keepAlive: true,
        });

        // An error on an idle pooled client should be logged instead of
        // becoming an unhandled pool error.
        pool.on('error', (error) => {
          logger.error(
            `PostgreSQL idle client error: ${error.message}`,
            error.stack,
          );
        });

        // Startup can also hit a short transient pooler/network delay.
        // Retry a few times before refusing to start the application.
        const startupAttempts = 3;

        for (
          let attempt = 1;
          attempt <= startupAttempts;
          attempt += 1
        ) {
          try {
            await pool.query('SELECT 1');
            logger.log('✅ Database connected');
            return pool;
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : String(error);

            if (attempt === startupAttempts) {
              logger.error(
                `❌ Database connection failed after ${startupAttempts} attempts: ${message}`,
                error instanceof Error ? error.stack : undefined,
              );

              await pool.end().catch(() => undefined);
              throw error;
            }

            logger.warn(
              `Database connection attempt ${attempt}/${startupAttempts} failed: ${message}. Retrying...`,
            );

            await new Promise((resolve) =>
              setTimeout(resolve, attempt * 1_000),
            );
          }
        }

        // TypeScript safeguard; the loop either returns or throws.
        throw new Error('Unable to initialize database pool');
      },
    },
    {
      provide: DATABASE_CONNECTION,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool) =>
        drizzle(pool, { schema }),
    },
    DatabasePoolLifecycle,
  ],
  exports: [
    DATABASE_CONNECTION,
    DATABASE_POOL,
  ],
})
export class DatabaseModule {}
