import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  eq,
  desc,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'crypto';

import * as schema from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';

@Injectable()
export class CrmBaseService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    protected readonly db: NodePgDatabase<typeof schema>,
  ) {}

  protected newId(): string {
    return randomUUID();
  }

  protected toNumber(value: string | number | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  protected toIso(value: Date | string | null | undefined): string | undefined {
    if (!value) {
      return undefined;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  protected async findEntityById<T>(
    table: any,
    id: string,
    tableName: string,
  ): Promise<T> {
    const [item] = await this.db
      .select()
      .from(table)
      .where(eq(table.id, id))
      .limit(1);

    if (!item) {
      throw new NotFoundException(`${tableName} with ID ${id} not found`);
    }

    return item as T;
  }

  protected async findAllEntities<T>(
    table: any,
    orderByField: string = 'createdAt',
  ): Promise<T[]> {
    return this.db
      .select()
      .from(table)
      .orderBy(desc(table[orderByField])) as unknown as T[];
  }

  protected async deleteEntityById(
    table: any,
    id: string,
  ): Promise<void> {
    await this.db.delete(table).where(eq(table.id, id));
  }

  protected omitUndefined<T extends Record<string, unknown>>(
    value: T,
  ): Partial<T> {
    return Object.fromEntries(
      Object.entries(value).filter(([, entry]) => entry !== undefined),
    ) as Partial<T>;
  }
}
