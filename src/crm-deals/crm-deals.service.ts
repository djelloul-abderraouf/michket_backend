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
import { crmDeals } from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import { CrmBaseService } from '../crm-base/crm-base.service';
import {
  CreateCrmDealDto,
  UpdateCrmDealDto,
} from './dto/crm-deals.dto';

@Injectable()
export class CrmDealsService extends CrmBaseService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    db: NodePgDatabase<typeof schema>,
  ) {
    super(db);
  }

  async findAll() {
    return this.findAllEntities(crmDeals);
  }

  async findById(id: string) {
    return this.findEntityById(crmDeals, id, 'Deal');
  }

  async create(dto: CreateCrmDealDto) {
    const [deal] = await this.db
      .insert(crmDeals)
      .values({
        id: dto.id,
        title: dto.title,
        contactId: dto.contactId,
        companyId: dto.companyId,
        estimatedAmount: dto.estimatedAmount.toString(),
        stage: dto.stage,
        ownerId: dto.ownerId,
        expectedCloseAt: dto.expectedCloseAt ? new Date(dto.expectedCloseAt) : null,
      })
      .returning();

    return deal;
  }

  async update(id: string, dto: UpdateCrmDealDto) {
    await this.findById(id);

    const [updatedDeal] = await this.db
      .update(crmDeals)
      .set({
        ...dto,
        estimatedAmount: dto.estimatedAmount?.toString(),
        expectedCloseAt: dto.expectedCloseAt ? new Date(dto.expectedCloseAt) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(crmDeals.id, id))
      .returning();

    return updatedDeal;
  }

  async delete(id: string) {
    await this.findById(id);
    await this.deleteEntityById(crmDeals, id);
  }

  async findByOwner(ownerId: string) {
    return this.db
      .select()
      .from(crmDeals)
      .where(eq(crmDeals.ownerId, ownerId))
      .orderBy(desc(crmDeals.createdAt));
  }

  async findByStage(stage: 'prospection' | 'qualification' | 'devis_envoye' | 'negociation' | 'gagnee' | 'perdue') {
    return this.db
      .select()
      .from(crmDeals)
      .where(eq(crmDeals.stage, stage))
      .orderBy(desc(crmDeals.createdAt));
  }

  async findByContact(contactId: string) {
    return this.db
      .select()
      .from(crmDeals)
      .where(eq(crmDeals.contactId, contactId))
      .orderBy(desc(crmDeals.createdAt));
  }

  async findByCompany(companyId: string) {
    return this.db
      .select()
      .from(crmDeals)
      .where(eq(crmDeals.companyId, companyId))
      .orderBy(desc(crmDeals.createdAt));
  }
}
