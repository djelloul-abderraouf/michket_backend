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
import { crmTasks } from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import { CrmBaseService } from '../crm-base/crm-base.service';
import {
  CreateCrmTaskDto,
  UpdateCrmTaskDto,
} from './dto/crm-tasks.dto';

@Injectable()
export class CrmTasksService extends CrmBaseService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    db: NodePgDatabase<typeof schema>,
  ) {
    super(db);
  }

  async findAll() {
    const tasks = await this.findAllEntities<any>(crmTasks);
    return tasks.map((task) => this.serialize(task));
  }

  async findById(id: string) {
    const task = await this.findEntityById<any>(crmTasks, id, 'Task');
    return this.serialize(task);
  }

  async create(dto: CreateCrmTaskDto) {
    const [task] = await this.db
      .insert(crmTasks)
      .values({
        id: dto.id || this.newId(),
        title: dto.title,
        assigneeId: dto.assigneeId,
        assigneeName: dto.assigneeName,
        projectId: dto.projectId,
        dueAt: new Date(dto.dueAt),
        priority: dto.priority,
        done: dto.done ?? false,
      })
      .returning();

    return this.serialize(task);
  }

  async update(id: string, dto: UpdateCrmTaskDto) {
    await this.findById(id);

    const [updatedTask] = await this.db
      .update(crmTasks)
      .set(
        this.omitUndefined({
          title: dto.title,
          assigneeId: dto.assigneeId,
          assigneeName: dto.assigneeName,
          projectId: dto.projectId,
          priority: dto.priority,
          done: dto.done,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
          updatedAt: new Date(),
        }),
      )
      .where(eq(crmTasks.id, id))
      .returning();

    return this.serialize(updatedTask);
  }

  async delete(id: string) {
    await this.findById(id);
    await this.deleteEntityById(crmTasks, id);
  }

  async findByAssignee(assigneeId: string) {
    return this.db
      .select()
      .from(crmTasks)
      .where(eq(crmTasks.assigneeId, assigneeId))
      .orderBy(desc(crmTasks.createdAt));
  }

  async findByProject(projectId: string) {
    return this.db
      .select()
      .from(crmTasks)
      .where(eq(crmTasks.projectId, projectId))
      .orderBy(desc(crmTasks.createdAt));
  }

  async findByStatus(done: boolean) {
    return this.db
      .select()
      .from(crmTasks)
      .where(eq(crmTasks.done, done))
      .orderBy(desc(crmTasks.createdAt));
  }

  async findByPriority(priority: 'basse' | 'normale' | 'haute' | 'urgente') {
    return this.db
      .select()
      .from(crmTasks)
      .where(eq(crmTasks.priority, priority))
      .orderBy(desc(crmTasks.createdAt));
  }

  private serialize(task: any) {
    return {
      ...task,
      dueAt: this.toIso(task.dueAt) ?? new Date().toISOString(),
      createdAt: this.toIso(task.createdAt) ?? new Date().toISOString(),
    };
  }
}
