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

import * as schema from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';

@Injectable()
export class CrmBaseService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    protected readonly db: NodePgDatabase<typeof schema>,
  ) {}

  protected async findById<T>(
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

  protected async findAll<T>(
    table: any,
    orderByField: string = 'createdAt',
  ): Promise<T[]> {
    return this.db
      .select()
      .from(table)
      .orderBy(desc(table[orderByField]));
  }

  protected async deleteById(
    table: any,
    id: string,
  ): Promise<void> {
    await this.db.delete(table).where(eq(table.id, id));
  }
}
