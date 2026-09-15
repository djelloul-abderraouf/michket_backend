import {
  Injectable,
  Inject,
  BadRequestException,
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
    const activities = await this.findAllEntities<any>(crmActivities);
    return activities.map((activity) => this.serialize(activity));
  }

  async findById(id: string) {
    const activity = await this.findEntityById<any>(crmActivities, id, 'Activity');
    return this.serialize(activity);
  }

  async create(dto: CreateCrmActivityDto) {
    if (!dto.ownerId) {
      throw new BadRequestException('ownerId is required');
    }

    const [activity] = await this.db
      .insert(crmActivities)
      .values({
        id: dto.id || this.newId(),
        type: dto.type,
        target: dto.target,
        ownerId: dto.ownerId,
        description: dto.description,
      })
      .returning();

    return this.serialize(activity);
  }

  async delete(id: string) {
    await this.findById(id);
    await this.deleteEntityById(crmActivities, id);
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

  private serialize(activity: any) {
    return {
      ...activity,
      createdAt: this.toIso(activity.createdAt) ?? new Date().toISOString(),
    };
  }
}
