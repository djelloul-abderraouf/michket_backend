import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Inject } from '@nestjs/common';

import * as schema from '../database/schema';
import {
  DATABASE_CONNECTION,
} from '../database/database.module';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
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
    summary: 'Readiness check (PostgreSQL)',
  })
  async ready() {
    let database: 'ok' | 'error' = 'error';

    try {
      await this.db.execute(sql`SELECT 1`);
      database = 'ok';
    } catch {
      database = 'error';
    }

    const body = {
      status: database === 'ok' ? 'ok' : 'degraded',
      checks: {
        database,
      },
      timestamp: new Date().toISOString(),
    };

    if (database !== 'ok') {
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
