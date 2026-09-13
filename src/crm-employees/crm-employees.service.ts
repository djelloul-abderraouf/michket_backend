import {
  Injectable,
  Inject,
  ConflictException,
} from '@nestjs/common';
import {
  eq,
  desc,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../database/schema';
import { crmUsers } from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import { CrmBaseService } from '../crm-base/crm-base.service';
import {
  CreateCrmEmployeeDto,
  UpdateCrmEmployeeDto,
} from './dto/crm-employees.dto';

@Injectable()
export class CrmEmployeesService extends CrmBaseService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    db: NodePgDatabase<typeof schema>,
  ) {
    super(db);
  }

  async findAll() {
    return this.findAll(crmUsers);
  }

  async findById(id: string) {
    return this.findById(crmUsers, id, 'Employee');
  }

  async create(dto: CreateCrmEmployeeDto) {
    try {
      const [employee] = await this.db
        .insert(crmUsers)
        .values({
          id: dto.id,
          name: dto.name,
          email: dto.email,
          roles: dto.roles,
          active: dto.active ?? true,
          lastLoginAt: new Date(dto.lastLoginAt),
        })
        .returning();

      return employee;
    } catch (error) {
      if (error.code === '23505') {
        throw new ConflictException('Employee with this email already exists');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateCrmEmployeeDto) {
    await this.findById(id);

    const [updatedEmployee] = await this.db
      .update(crmUsers)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(crmUsers.id, id))
      .returning();

    return updatedEmployee;
  }

  async delete(id: string) {
    await this.findById(id);
    await this.deleteById(crmUsers, id);
  }

  async findByEmail(email: string) {
    const [employee] = await this.db
      .select()
      .from(crmUsers)
      .where(eq(crmUsers.email, email))
      .limit(1);

    return employee ?? null;
  }
}
