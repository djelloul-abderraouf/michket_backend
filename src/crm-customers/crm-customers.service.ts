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
import { crmContacts } from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import { CrmBaseService } from '../crm-base/crm-base.service';
import {
  CreateCrmCustomerDto,
  UpdateCrmCustomerDto,
} from './dto/crm-customers.dto';

@Injectable()
export class CrmCustomersService extends CrmBaseService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    db: NodePgDatabase<typeof schema>,
  ) {
    super(db);
  }

  async findAll() {
    return this.findAll(crmContacts);
  }

  async findById(id: string) {
    return this.findById(crmContacts, id, 'Customer');
  }

  async create(dto: CreateCrmCustomerDto) {
    const [customer] = await this.db
      .insert(crmContacts)
      .values({
        id: dto.id,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        email: dto.email,
        wilaya: dto.wilaya,
        type: dto.type,
        companyId: dto.companyId,
      })
      .returning();

    return customer;
  }

  async update(id: string, dto: UpdateCrmCustomerDto) {
    await this.findById(id);

    const [updatedCustomer] = await this.db
      .update(crmContacts)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(crmContacts.id, id))
      .returning();

    return updatedCustomer;
  }

  async delete(id: string) {
    await this.findById(id);
    await this.deleteById(crmContacts, id);
  }

  async findByCompany(companyId: string) {
    return this.db
      .select()
      .from(crmContacts)
      .where(eq(crmContacts.companyId, companyId))
      .orderBy(desc(crmContacts.createdAt));
  }

  async findByWilaya(wilaya: string) {
    return this.db
      .select()
      .from(crmContacts)
      .where(eq(crmContacts.wilaya, wilaya))
      .orderBy(desc(crmContacts.createdAt));
  }
}
