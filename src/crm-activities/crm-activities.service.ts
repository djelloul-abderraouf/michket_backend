import {
  Injectable,
  Inject,
} from '@nestjs/common';
import {
  eq,
  desc,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../database/schema';
import { crmActivities } from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import { CrmBaseService } from '../crm-base/crm-base.service';
import { CreateCrmActivityDto } from './dto/crm-activities.dto';

@Injectable()
export class CrmActivitiesService extends CrmBaseService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    db: NodePgDatabase<typeof schema>,
  ) {
    super(db);
  }

  async findAll() {
    return this.findAll(crmActivities);
  }

  async findById(id: string) {
    return this.findById(crmActivities, id, 'Activity');
  }

  async create(dto: CreateCrmActivityDto) {
    const [activity] = await this.db
      .insert(crmActivities)
      .values({
        id: dto.id,
        type: dto.type,
        target: dto.target,
        ownerId: dto.ownerId,
        description: dto.description,
      })
      .returning();

    return activity;
  }

  async delete(id: string) {
    await this.findById(id);
    await this.deleteById(crmActivities, id);
  }

  async findByOwner(ownerId: string) {
    return this.db
      .select()
      .from(crmActivities)
      .where(eq(crmActivities.ownerId, ownerId))
      .orderBy(desc(crmActivities.createdAt));
  }

  async findByTarget(target: string) {
    return this.db
      .select()
      .from(crmActivities)
      .where(eq(crmActivities.target, target))
      .orderBy(desc(crmActivities.createdAt));
  }
}
