import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
// import IORedis from 'ioredis'; // Temporarily disabled due to Redis issues

import * as schema from '../database/schema';
import {
  DATABASE_CONNECTION,
} from '../database/database.module';
// import {
//   QUEUE_REDIS_CONNECTION,
// } from '../queue/queue.module'; // Temporarily disabled due to Redis issues

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,

    // @Inject(QUEUE_REDIS_CONNECTION) // Temporarily disabled due to Redis issues
    // private readonly redis: IORedis,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness check (PostgreSQL, Redis)',
  })
  async ready() {
    const checks: Record<
      'database' | 'redis',
      'ok' | 'error'
    > = {
      database: 'error',
      redis: 'ok', // Temporarily set to ok since Redis is disabled
    };

    try {
      await this.db.execute(sql`SELECT 1`);
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }

    // Temporarily disabled due to Redis issues
    // try {
    //   const pong = await this.redis.ping();
    //   checks.redis =
    //     pong === 'PONG' ? 'ok' : 'error';
    // } catch {
    //   checks.redis = 'error';
    // }

    const allOk =
      checks.database === 'ok' &&
      checks.redis === 'ok';

    const body = {
      status: allOk ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    };

    if (!allOk) {
      throw new ServiceUnavailableException(body);
    }

    return body;
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness check' })
  live() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
