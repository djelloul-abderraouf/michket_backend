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
    const companies = await this.findAllEntities<any>(crmCompanies);
    return companies.map((company) => this.serialize(company));
  }

  async findById(id: string) {
    const company = await this.findEntityById<any>(crmCompanies, id, 'Company');
    return this.serialize(company);
  }

  async create(dto: CreateCrmCompanyDto) {
    const [company] = await this.db
      .insert(crmCompanies)
      .values({
        id: dto.id || this.newId(),
        name: dto.name,
        sector: dto.sector,
        commercialTerms: dto.commercialTerms,
      })
      .returning();

    return this.serialize(company);
  }

  async update(id: string, dto: UpdateCrmCompanyDto) {
    await this.findById(id);

    const [updatedCompany] = await this.db
      .update(crmCompanies)
      .set(
        this.omitUndefined({
          name: dto.name,
          sector: dto.sector,
          commercialTerms: dto.commercialTerms,
          updatedAt: new Date(),
        }),
      )
      .where(eq(crmCompanies.id, id))
      .returning();

    return this.serialize(updatedCompany);
  }

  async delete(id: string) {
    await this.findById(id);
    await this.db
      .update(schema.crmContacts)
      .set({ companyId: null, updatedAt: new Date() })
      .where(eq(schema.crmContacts.companyId, id));
    await this.db
      .update(schema.crmDeals)
      .set({ companyId: null, updatedAt: new Date() })
      .where(eq(schema.crmDeals.companyId, id));
    await this.deleteEntityById(crmCompanies, id);
  }

  async findBySector(sector: string) {
    return this.db
      .select()
      .from(crmCompanies)
      .where(eq(crmCompanies.sector, sector))
      .orderBy(desc(crmCompanies.createdAt));
  }

  private serialize(company: any) {
    return {
      ...company,
      commercialTerms: company.commercialTerms ?? '',
      createdAt: this.toIso(company.createdAt) ?? new Date().toISOString(),
    };
  }
}
