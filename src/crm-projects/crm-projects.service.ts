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
import { crmProjects } from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import { CrmBaseService } from '../crm-base/crm-base.service';
import {
  CreateCrmProjectDto,
  UpdateCrmProjectDto,
} from './dto/crm-projects.dto';

@Injectable()
export class CrmProjectsService extends CrmBaseService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    db: NodePgDatabase<typeof schema>,
  ) {
    super(db);
  }

  async findAll() {
    return this.findAllEntities(crmProjects);
  }

  async findById(id: string) {
    return this.findEntityById(crmProjects, id, 'Project');
  }

  async create(dto: CreateCrmProjectDto) {
    const [project] = await this.db
      .insert(crmProjects)
      .values({
        id: dto.id || this.newId(),
        name: dto.name,
        status: dto.status ?? 'actif',
      })
      .returning();

    return project;
  }

  async update(id: string, dto: UpdateCrmProjectDto) {
    await this.findById(id);

    const [updatedProject] = await this.db
      .update(crmProjects)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(crmProjects.id, id))
      .returning();

    return updatedProject;
  }

  async delete(id: string) {
    await this.findById(id);
    await this.deleteEntityById(crmProjects, id);
  }

  async findByStatus(status: 'actif' | 'termine') {
    return this.db
      .select()
      .from(crmProjects)
      .where(eq(crmProjects.status, status))
      .orderBy(desc(crmProjects.createdAt));
  }
}
