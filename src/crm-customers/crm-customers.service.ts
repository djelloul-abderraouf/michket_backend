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
    const customers = await this.findAllEntities<any>(crmContacts);
    return customers.map((customer) => this.serialize(customer));
  }

  async findById(id: string) {
    const customer = await this.findEntityById<any>(crmContacts, id, 'Customer');
    return this.serialize(customer);
  }

  async create(dto: CreateCrmCustomerDto) {
    const [customer] = await this.db
      .insert(crmContacts)
      .values({
        id: dto.id || this.newId(),
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone.replace(/\s+/g, ''),
        email: dto.email?.trim() || null,
        wilaya: dto.wilaya.trim(),
        type: dto.type,
        companyId: dto.companyId || null,
      })
      .returning();

    return this.serialize(customer);
  }

  async update(id: string, dto: UpdateCrmCustomerDto) {
    await this.findById(id);

    const [updatedCustomer] = await this.db
      .update(crmContacts)
      .set(
        this.omitUndefined({
          firstName: dto.firstName?.trim(),
          lastName: dto.lastName?.trim(),
          phone: dto.phone?.replace(/\s+/g, ''),
          email: dto.email?.trim(),
          wilaya: dto.wilaya?.trim(),
          type: dto.type,
          companyId: dto.companyId,
          updatedAt: new Date(),
        }),
      )
      .where(eq(crmContacts.id, id))
      .returning();

    return this.serialize(updatedCustomer);
  }

  async delete(id: string) {
    await this.findById(id);
    await this.db
      .update(schema.crmDeals)
      .set({ contactId: null, updatedAt: new Date() })
      .where(eq(schema.crmDeals.contactId, id));
    await this.deleteEntityById(crmContacts, id);
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

  private serialize(customer: any) {
    return {
      ...customer,
      createdAt: this.toIso(customer.createdAt) ?? new Date().toISOString(),
    };
  }
}
