import {
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  asc,
  eq,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../database/schema';
import {
  clientReferences,
} from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';

@Injectable()
export class ReferencesService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findAllActive() {
    return this.db
      .select({
        id: clientReferences.id,
        name: clientReferences.name,
        imageUrl: clientReferences.imageUrl,
        altText: clientReferences.altText,
        sortOrder: clientReferences.sortOrder,
      })
      .from(clientReferences)
      .where(
        eq(
          clientReferences.isActive,
          true,
        ),
      )
      .orderBy(
        asc(clientReferences.sortOrder),
        asc(clientReferences.name),
        asc(clientReferences.createdAt),
      );
  }
}
