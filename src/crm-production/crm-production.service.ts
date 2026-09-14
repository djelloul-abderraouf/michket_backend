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
import { crmProductionJobs } from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import { CrmBaseService } from '../crm-base/crm-base.service';
import {
  CreateCrmProductionJobDto,
  UpdateCrmProductionJobDto,
} from './dto/crm-production.dto';

@Injectable()
export class CrmProductionService extends CrmBaseService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    db: NodePgDatabase<typeof schema>,
  ) {
    super(db);
  }

  async findAll() {
    return this.findAllEntities(crmProductionJobs);
  }

  async findById(id: string) {
    return this.findEntityById(crmProductionJobs, id, 'Production Job');
  }

  async create(dto: CreateCrmProductionJobDto) {
    const [job] = await this.db
      .insert(crmProductionJobs)
      .values({
        id: dto.id,
        orderId: dto.orderId,
        orderRef: dto.orderRef,
        clientName: dto.clientName,
        productSummary: dto.productSummary,
        status: dto.status,
      })
      .returning();

    return job;
  }

  async update(id: string, dto: UpdateCrmProductionJobDto) {
    const job = await this.findById(id) as any;

    const updateData: any = {
      ...dto,
      updatedAt: new Date(),
    };

    // Auto-set timestamps based on status
    if (dto.status === 'en_cours' && !job.startedAt) {
      updateData.startedAt = new Date();
    }

    if (dto.status === 'termine' && !job.finishedAt) {
      updateData.finishedAt = new Date();
    }

    const [updatedJob] = await this.db
      .update(crmProductionJobs)
      .set(updateData)
      .where(eq(crmProductionJobs.id, id))
      .returning();

    return updatedJob;
  }

  async delete(id: string) {
    await this.findById(id);
    await this.deleteEntityById(crmProductionJobs, id);
  }

  async findByOrder(orderId: string) {
    return this.db
      .select()
      .from(crmProductionJobs)
      .where(eq(crmProductionJobs.orderId, orderId))
      .orderBy(desc(crmProductionJobs.createdAt));
  }

  async findByStatus(status: 'en_attente' | 'en_cours' | 'termine') {
    return this.db
      .select()
      .from(crmProductionJobs)
      .where(eq(crmProductionJobs.status, status))
      .orderBy(desc(crmProductionJobs.createdAt));
  }
}
