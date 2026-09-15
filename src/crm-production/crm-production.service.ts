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
    const jobs = await this.findAllEntities<any>(crmProductionJobs);
    return jobs.map((job) => this.serialize(job));
  }

  async findById(id: string) {
    const job = await this.findEntityById<any>(crmProductionJobs, id, 'Production Job');
    return this.serialize(job);
  }

  async create(dto: CreateCrmProductionJobDto) {
    const [job] = await this.db
      .insert(crmProductionJobs)
      .values({
        id: dto.id || this.newId(),
        orderId: dto.orderId,
        orderRef: dto.orderRef,
        clientName: dto.clientName,
        productSummary: dto.productSummary,
        status: dto.status ?? 'en_attente',
      })
      .returning();

    return this.serialize(job);
  }

  async update(id: string, dto: UpdateCrmProductionJobDto) {
    const job = await this.findById(id) as any;

    const [updatedJob] = await this.db
      .update(crmProductionJobs)
      .set(
        this.omitUndefined({
          orderId: dto.orderId,
          orderRef: dto.orderRef,
          clientName: dto.clientName,
          productSummary: dto.productSummary,
          status: dto.status,
          startedAt:
            dto.status === 'en_cours' && !job.startedAt
              ? new Date()
              : undefined,
          finishedAt:
            dto.status === 'termine' && !job.finishedAt
              ? new Date()
              : undefined,
          updatedAt: new Date(),
        }),
      )
      .where(eq(crmProductionJobs.id, id))
      .returning();

    return this.serialize(updatedJob);
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

  private serialize(job: any) {
    return {
      ...job,
      startedAt: this.toIso(job.startedAt),
      finishedAt: this.toIso(job.finishedAt),
      createdAt: this.toIso(job.createdAt) ?? new Date().toISOString(),
    };
  }
}
