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
import { crmProposals } from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import { CrmBaseService } from '../crm-base/crm-base.service';
import {
  CreateCrmProposalDto,
  UpdateCrmProposalDto,
} from './dto/crm-proposals.dto';

@Injectable()
export class CrmProposalsService extends CrmBaseService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    db: NodePgDatabase<typeof schema>,
  ) {
    super(db);
  }

  async findAll() {
    return this.findAll(crmProposals);
  }

  async findById(id: string) {
    return this.findById(crmProposals, id, 'Proposal');
  }

  async create(dto: CreateCrmProposalDto) {
    const [proposal] = await this.db
      .insert(crmProposals)
      .values({
        id: dto.id,
        dealId: dto.dealId,
        status: dto.status,
        items: dto.items as any,
        total: dto.total,
      })
      .returning();

    return proposal;
  }

  async update(id: string, dto: UpdateCrmProposalDto) {
    await this.findById(id);

    const [updatedProposal] = await this.db
      .update(crmProposals)
      .set({
        ...dto,
        items: dto.items as any,
        updatedAt: new Date(),
      })
      .where(eq(crmProposals.id, id))
      .returning();

    return updatedProposal;
  }

  async delete(id: string) {
    await this.findById(id);
    await this.deleteById(crmProposals, id);
  }

  async findByDeal(dealId: string) {
    return this.db
      .select()
      .from(crmProposals)
      .where(eq(crmProposals.dealId, dealId))
      .orderBy(desc(crmProposals.createdAt));
  }

  async findByStatus(status: 'brouillon' | 'envoyee' | 'acceptee' | 'refusee') {
    return this.db
      .select()
      .from(crmProposals)
      .where(eq(crmProposals.status, status))
      .orderBy(desc(crmProposals.createdAt));
  }
}
