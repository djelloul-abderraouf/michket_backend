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
    const deals = await this.findAllEntities<any>(crmDeals);
    return deals.map((deal) => this.serialize(deal));
  }

  async findById(id: string) {
    const deal = await this.findEntityById<any>(crmDeals, id, 'Deal');
    return this.serialize(deal);
  }

  async create(dto: CreateCrmDealDto, user?: { id: string }) {
    const ownerId = dto.ownerId || user?.id;
    if (!ownerId) {
      throw new BadRequestException('ownerId is required');
    }

    const [deal] = await this.db
      .insert(crmDeals)
      .values({
        id: dto.id || this.newId(),
        title: dto.title,
        contactId: dto.contactId || null,
        companyId: dto.companyId || null,
        estimatedAmount: dto.estimatedAmount.toString(),
        stage: dto.stage ?? 'prospection',
        ownerId,
        expectedCloseAt: dto.expectedCloseAt ? new Date(dto.expectedCloseAt) : null,
      })
      .returning();

    return this.serialize(deal);
  }

  async update(id: string, dto: UpdateCrmDealDto) {
    await this.findById(id);

    const [updatedDeal] = await this.db
      .update(crmDeals)
      .set(
        this.omitUndefined({
          title: dto.title,
          contactId:
            dto.contactId === undefined ? undefined : dto.contactId || null,
          companyId:
            dto.companyId === undefined ? undefined : dto.companyId || null,
          estimatedAmount:
            dto.estimatedAmount !== undefined
              ? dto.estimatedAmount.toString()
              : undefined,
          stage: dto.stage,
          ownerId: dto.ownerId,
          expectedCloseAt: dto.expectedCloseAt
            ? new Date(dto.expectedCloseAt)
            : undefined,
          updatedAt: new Date(),
        }),
      )
      .where(eq(crmDeals.id, id))
      .returning();

    return this.serialize(updatedDeal);
  }

  async delete(id: string) {
    await this.findById(id);
    await this.db
      .delete(schema.crmProposals)
      .where(eq(schema.crmProposals.dealId, id));
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

  private serialize(deal: any) {
    return {
      ...deal,
      estimatedAmount: this.toNumber(deal.estimatedAmount),
      createdAt: this.toIso(deal.createdAt) ?? deal.createdAt,
      expectedCloseAt: this.toIso(deal.expectedCloseAt) ?? deal.expectedCloseAt,
    };
  }
}
