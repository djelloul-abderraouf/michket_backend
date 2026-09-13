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
import { crmCompanies } from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import { CrmBaseService } from '../crm-base/crm-base.service';
import {
  CreateCrmCompanyDto,
  UpdateCrmCompanyDto,
} from './dto/crm-companies.dto';

@Injectable()
export class CrmCompaniesService extends CrmBaseService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    db: NodePgDatabase<typeof schema>,
  ) {
    super(db);
  }

  async findAll() {
    return this.findAll(crmCompanies);
  }

  async findById(id: string) {
    return this.findById(crmCompanies, id, 'Company');
  }

  async create(dto: CreateCrmCompanyDto) {
    const [company] = await this.db
      .insert(crmCompanies)
      .values({
        id: dto.id,
        name: dto.name,
        sector: dto.sector,
        commercialTerms: dto.commercialTerms,
      })
      .returning();

    return company;
  }

  async update(id: string, dto: UpdateCrmCompanyDto) {
    await this.findById(id);

    const [updatedCompany] = await this.db
      .update(crmCompanies)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(crmCompanies.id, id))
      .returning();

    return updatedCompany;
  }

  async delete(id: string) {
    await this.findById(id);
    await this.deleteById(crmCompanies, id);
  }

  async findBySector(sector: string) {
    return this.db
      .select()
      .from(crmCompanies)
      .where(eq(crmCompanies.sector, sector))
      .orderBy(desc(crmCompanies.createdAt));
  }
}
