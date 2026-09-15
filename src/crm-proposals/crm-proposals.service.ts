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
    const proposals = await this.findAllEntities<any>(crmProposals);
    return proposals.map((proposal) => this.serialize(proposal));
  }

  async findById(id: string) {
    const proposal = await this.findEntityById<any>(crmProposals, id, 'Proposal');
    return this.serialize(proposal);
  }

  async create(dto: CreateCrmProposalDto) {
    const [proposal] = await this.db
      .insert(crmProposals)
      .values({
        id: dto.id || this.newId(),
        dealId: dto.dealId,
        status: dto.status ?? 'brouillon',
        items: dto.items as any,
        total: dto.total.toString(),
      })
      .returning();

    return this.serialize(proposal);
  }

  async update(id: string, dto: UpdateCrmProposalDto) {
    await this.findById(id);

    const [updatedProposal] = await this.db
      .update(crmProposals)
      .set(
        this.omitUndefined({
          dealId: dto.dealId,
          status: dto.status,
          items: dto.items as any,
          total:
            dto.total !== undefined ? dto.total.toString() : undefined,
          updatedAt: new Date(),
        }),
      )
      .where(eq(crmProposals.id, id))
      .returning();

    return this.serialize(updatedProposal);
  }

  async delete(id: string) {
    await this.findById(id);
    await this.deleteEntityById(crmProposals, id);
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

  private serialize(proposal: any) {
    const items = Array.isArray(proposal.items)
      ? proposal.items.map((item: any) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice ?? item.price ?? 0,
        }))
      : [];

    return {
      ...proposal,
      items,
      total: this.toNumber(proposal.total),
      createdAt: this.toIso(proposal.createdAt) ?? proposal.createdAt,
    };
  }
}
