import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  forwardRef,
} from '@nestjs/common';
import {
  and,
  desc,
  eq,
  inArray,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../database/schema';
import {
  crmPlancheEvents,
  crmPlancheOrders,
  crmPlanches,
  crmProductionJobs,
  orderItems,
  orderRemarks,
  orders,
  users,
} from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import { CrmBaseService } from '../crm-base/crm-base.service';
import { CrmOrdersService } from '../crm-orders/crm-orders.service';
import { assignedStaffRoles } from '../auth/crm-role-map';

const PLANCHE_MAX_ORDERS = 100;
import {
  AddPlancheOrdersDto,
  CreateCrmPlancheDto,
  CreateCrmProductionJobDto,
  UpdateCrmPlancheCapacityDto,
  UpdateCrmPlancheStatusDto,
  UpdateCrmProductionJobDto,
} from './dto/crm-production.dto';

type PlancheActor = {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  roles?: string[];
};

@Injectable()
export class CrmProductionService extends CrmBaseService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    db: NodePgDatabase<typeof schema>,
    @Inject(forwardRef(() => CrmOrdersService))
    private readonly crmOrdersService: CrmOrdersService,
  ) {
    super(db);
  }

  async findAll() {
    const jobs = await this.findAllEntities<any>(crmProductionJobs);
    return jobs.map((job) => this.serialize(job));
  }

  async findById(id: string) {
    const job = await this.findEntityById<any>(crmProductionJobs, id, 'Production Job');
    return this.serialize(job);
  }

  async create(dto: CreateCrmProductionJobDto) {
    const [job] = await this.db
      .insert(crmProductionJobs)
      .values({
        id: dto.id || this.newId(),
        orderId: dto.orderId,
        orderRef: dto.orderRef,
        clientName: dto.clientName,
        productSummary: dto.productSummary,
        status: dto.status ?? 'en_attente',
      })
      .returning();

    return this.serialize(job);
  }

  async update(id: string, dto: UpdateCrmProductionJobDto) {
    const job = await this.findById(id) as any;

    const [updatedJob] = await this.db
      .update(crmProductionJobs)
      .set(
        this.omitUndefined({
          orderId: dto.orderId,
          orderRef: dto.orderRef,
          clientName: dto.clientName,
          productSummary: dto.productSummary,
          status: dto.status,
          startedAt:
            dto.status === 'en_cours' && !job.startedAt
              ? new Date()
              : undefined,
          finishedAt:
            dto.status === 'termine' && !job.finishedAt
              ? new Date()
              : undefined,
          updatedAt: new Date(),
        }),
      )
      .where(eq(crmProductionJobs.id, id))
      .returning();

    return this.serialize(updatedJob);
  }

  async delete(id: string) {
    await this.findById(id);
    await this.deleteEntityById(crmProductionJobs, id);
  }

  async findByOrder(orderId: string) {
    return this.db
      .select()
      .from(crmProductionJobs)
      .where(eq(crmProductionJobs.orderId, orderId))
      .orderBy(desc(crmProductionJobs.createdAt));
  }

  async findByStatus(status: 'en_attente' | 'en_cours' | 'termine') {
    return this.db
      .select()
      .from(crmProductionJobs)
      .where(eq(crmProductionJobs.status, status))
      .orderBy(desc(crmProductionJobs.createdAt));
  }

  async listPlanches() {
    await this.syncPlancheOrderStatuses();
    const boards = await this.db
      .select()
      .from(crmPlanches)
      .orderBy(desc(crmPlanches.createdAt));
    return this.mapPlanches(boards);
  }

  async createPlanche(
    dto: CreateCrmPlancheDto,
    user?: PlancheActor,
  ) {
    const actorName = await this.resolveActorName(user);

    const [board] = await this.db
      .insert(crmPlanches)
      .values({
        id: this.newId(),
        reference: await this.nextPlancheReference(),
        capacity: PLANCHE_MAX_ORDERS,
        status: 'en_attente',
        createdBy: user?.id || null,
        createdByName: actorName,
      })
      .returning();

    await this.recordPlancheEvent({
      plancheId: board.id,
      action: 'created',
      toStatus: 'en_attente',
      note: 'Planche créée',
      user,
      actorName,
    });

    const [mapped] = await this.mapPlanches([board]);
    return mapped;
  }

  async updatePlancheCapacity(
    plancheId: string,
    dto: UpdateCrmPlancheCapacityDto,
    user?: PlancheActor,
  ) {
    const board = await this.findPlancheRow(plancheId);
    if (board.status !== 'en_attente') {
      throw new BadRequestException('La capacité se change seulement tant que la planche est en attente.');
    }
    const capacity = this.assertCapacity(dto.capacity);
    const currentLinks = await this.db
      .select({ orderId: crmPlancheOrders.orderId })
      .from(crmPlancheOrders)
      .where(eq(crmPlancheOrders.plancheId, plancheId));
    if (capacity < currentLinks.length) {
      throw new BadRequestException(
        `La planche contient déjà ${currentLinks.length} commande${currentLinks.length > 1 ? 's' : ''}.`,
      );
    }
    if (capacity === board.capacity) {
      return this.findPlanche(plancheId);
    }

    await this.db
      .update(crmPlanches)
      .set({ capacity, updatedAt: new Date() })
      .where(eq(crmPlanches.id, plancheId));
    await this.recordPlancheEvent({
      plancheId,
      action: 'capacity',
      note: `${board.capacity} → ${capacity}`,
      user,
    });
    return this.findPlanche(plancheId);
  }

  async addPlancheOrders(plancheId: string, dto: AddPlancheOrdersDto, user?: PlancheActor) {
    const board = await this.findPlancheRow(plancheId);
    if (board.status !== 'en_attente') {
      throw new BadRequestException('On ajoute des commandes seulement sur une planche en attente.');
    }

    const orderIds = [...new Set(dto.orderIds)];
    if (orderIds.length === 0) {
      throw new BadRequestException('Choisissez au moins une commande.');
    }

    const currentLinks = await this.db
      .select({ orderId: crmPlancheOrders.orderId })
      .from(crmPlancheOrders)
      .where(eq(crmPlancheOrders.plancheId, plancheId));

    if (currentLinks.length + orderIds.length > PLANCHE_MAX_ORDERS) {
      const remaining = PLANCHE_MAX_ORDERS - currentLinks.length;
      throw new BadRequestException(
        remaining <= 0
          ? `Cette planche est complète (${PLANCHE_MAX_ORDERS} commandes).`
          : `Il reste ${remaining} place${remaining > 1 ? 's' : ''} sur cette planche.`,
      );
    }

    const taken = await this.db
      .select({ orderId: crmPlancheOrders.orderId })
      .from(crmPlancheOrders)
      .where(inArray(crmPlancheOrders.orderId, orderIds));
    if (taken.length > 0) {
      throw new BadRequestException('Une commande choisie est déjà sur une planche.');
    }

    const orderRows = await this.db
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(inArray(orders.id, orderIds));
    if (orderRows.length !== orderIds.length) {
      throw new BadRequestException('Une commande est introuvable.');
    }
    if (orderRows.some((order) => order.status !== 'confirmed')) {
      throw new BadRequestException('Seules les commandes confirmées peuvent entrer sur une planche.');
    }
    if (!user?.id) {
      throw new ForbiddenException('Utilisateur requis');
    }

    const remarkRows = await this.db
      .select({
        orderId: orderRemarks.orderId,
        role: users.role,
        staffRoles: users.staffRoles,
      })
      .from(orderRemarks)
      .innerJoin(users, eq(users.id, orderRemarks.authorId))
      .where(inArray(orderRemarks.orderId, orderIds));
    const needsRead = new Set<string>();
    for (const row of remarkRows) {
      const roles = assignedStaffRoles({
        role: row.role,
        staffRoles: row.staffRoles,
      });
      if (roles.includes('commercial')) {
        needsRead.add(row.orderId);
      }
    }
    const readIds = new Set(dto.readOrderIds || []);
    if ([...needsRead].some((orderId) => orderIds.includes(orderId) && !readIds.has(orderId))) {
      throw new BadRequestException(
        'Confirmez avoir lu les remarques du commercial avant d’ajouter la commande à la planche.',
      );
    }

    try {
      await this.db.insert(crmPlancheOrders).values(
        orderIds.map((orderId) => ({
          id: this.newId(),
          plancheId,
          orderId,
        })),
      );
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new BadRequestException('Une commande choisie est déjà sur une planche.');
      }
      throw error;
    }
    const actor = { id: user.id, roles: user.roles };
    const note = `Planche ${board.reference}`;
    for (const orderId of orderIds) {
      await this.crmOrdersService.updateStatus(orderId, 'en_fabrication', note, actor, {
        historyOnly: true,
      });
    }
    await this.recordPlancheEvent({
      plancheId,
      action: 'orders_added',
      note: `${orderIds.length} commande${orderIds.length > 1 ? 's' : ''} ajoutée${orderIds.length > 1 ? 's' : ''}`,
      user,
    });

    return this.findPlanche(plancheId);
  }

  async removePlancheOrder(plancheId: string, orderId: string, user?: PlancheActor) {
    const board = await this.findPlancheRow(plancheId);
    if (board.status !== 'en_attente') {
      throw new BadRequestException('On retire une commande seulement tant que la planche est en attente.');
    }

    const removed = await this.db
      .delete(crmPlancheOrders)
      .where(
        and(
          eq(crmPlancheOrders.plancheId, plancheId),
          eq(crmPlancheOrders.orderId, orderId),
        ),
      )
      .returning({ id: crmPlancheOrders.id });
    if (removed.length === 0) {
      throw new BadRequestException('Cette commande n’est pas sur la planche.');
    }
    if (user?.id) {
      await this.restoreConfirmedOrder(orderId, { id: user.id, roles: user.roles });
    }
    await this.recordPlancheEvent({
      plancheId,
      action: 'orders_removed',
      note: '1 commande retirée',
      user,
    });

    return this.findPlanche(plancheId);
  }

  async updatePlancheStatus(
    plancheId: string,
    dto: UpdateCrmPlancheStatusDto,
    user?: { id?: string; roles?: string[] },
  ) {
    const board = await this.findPlancheRow(plancheId);
    if (dto.status === board.status) {
      return this.findPlanche(plancheId);
    }
    if (dto.status === 'lancee' && board.status !== 'en_attente') {
      throw new BadRequestException('Seule une planche en attente peut être lancée.');
    }
    if (dto.status === 'terminee' && board.status !== 'lancee') {
      throw new BadRequestException('Lancez la planche avant de la terminer.');
    }

    const links = await this.db
      .select({ orderId: crmPlancheOrders.orderId })
      .from(crmPlancheOrders)
      .where(eq(crmPlancheOrders.plancheId, plancheId));
    if (links.length === 0) {
      throw new BadRequestException('Ajoutez au moins une commande avant de changer le statut.');
    }

    const note = `Planche ${board.reference}`;
    if (!user?.id) {
      throw new ForbiddenException('Utilisateur requis');
    }
    const actor = { id: user.id, roles: user.roles };
    for (const link of links) {
      await this.movePlancheOrder(link.orderId, dto.status, note, actor);
    }

    await this.db
      .update(crmPlanches)
      .set({
        status: dto.status,
        launchedAt: dto.status === 'lancee' ? new Date() : board.launchedAt,
        finishedAt: dto.status === 'terminee' ? new Date() : board.finishedAt,
        updatedAt: new Date(),
      })
      .where(eq(crmPlanches.id, plancheId));
    await this.recordPlancheEvent({
      plancheId,
      action: 'status',
      fromStatus: board.status,
      toStatus: dto.status,
      user,
    });

    return this.findPlanche(plancheId);
  }

  private async movePlancheOrder(
    orderId: string,
    plancheStatus: 'lancee' | 'terminee',
    note: string,
    user: { id: string; roles?: string[] },
  ) {
    const [order] = await this.db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order || order.status === 'cancelled' || order.status === 'refunded') {
      return;
    }

    if (plancheStatus === 'lancee') {
      if (order.status === 'confirmed') {
        await this.crmOrdersService.updateStatus(orderId, 'en_fabrication', note, user, {
          historyOnly: true,
        });
      }
      return;
    }

    if (order.status === 'confirmed') {
      await this.crmOrdersService.updateStatus(orderId, 'en_fabrication', note, user, {
        historyOnly: true,
      });
    }
    const jobs = await this.db
      .select({ status: crmProductionJobs.status })
      .from(crmProductionJobs)
      .where(eq(crmProductionJobs.orderId, orderId));
    if (jobs.length === 0) {
      const [current] = await this.db
        .select({ status: orders.status })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      if (current?.status === 'processing') {
        await this.crmOrdersService.updateStatus(orderId, 'en_fabrication', note, user, {
          historyOnly: true,
        });
      }
    }
    const freshJobs = jobs.length === 0
      ? await this.db
          .select({ status: crmProductionJobs.status })
          .from(crmProductionJobs)
          .where(eq(crmProductionJobs.orderId, orderId))
      : jobs;
    const complete = freshJobs.length > 0 && freshJobs.every((job) => job.status === 'termine');
    if (complete) {
      return;
    }
    const [fresh] = await this.db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (fresh?.status === 'processing') {
      await this.crmOrdersService.updateStatus(orderId, 'en_preparation', note, user, {
        historyOnly: true,
      });
    }
  }

  private async restoreConfirmedOrder(
    orderId: string,
    user: { id: string; roles?: string[] },
  ) {
    const [order] = await this.db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (order?.status !== 'processing') {
      return;
    }
    const jobs = await this.db
      .select({ status: crmProductionJobs.status })
      .from(crmProductionJobs)
      .where(eq(crmProductionJobs.orderId, orderId));
    const complete = jobs.length > 0 && jobs.every((job) => job.status === 'termine');
    if (complete) {
      return;
    }
    await this.crmOrdersService.updateStatus(orderId, 'confirme', 'Retirée de la planche', user, {
      historyOnly: true,
      skipParcel: true,
    });
  }

  private async findPlanche(id: string) {
    const board = await this.findPlancheRow(id);
    const [mapped] = await this.mapPlanches([board]);
    return mapped;
  }

  private async findPlancheRow(id: string) {
    const [board] = await this.db
      .select()
      .from(crmPlanches)
      .where(eq(crmPlanches.id, id))
      .limit(1);
    if (!board) {
      throw new BadRequestException('Planche introuvable.');
    }
    return board;
  }

  private async mapPlanches(boardRows: Array<typeof crmPlanches.$inferSelect>) {
    if (boardRows.length === 0) {
      return [];
    }

    const boardIds = boardRows.map((board) => board.id);
    const links = await this.db
      .select()
      .from(crmPlancheOrders)
      .where(inArray(crmPlancheOrders.plancheId, boardIds));
    const eventRows = await this.db
      .select()
      .from(crmPlancheEvents)
      .where(inArray(crmPlancheEvents.plancheId, boardIds))
      .orderBy(desc(crmPlancheEvents.createdAt));
    const orderIds = [...new Set(links.map((link) => link.orderId))];
    const orderRows = orderIds.length
      ? await this.db.select().from(orders).where(inArray(orders.id, orderIds))
      : [];
    const itemRows = orderIds.length
      ? await this.db
          .select({
            orderId: orderItems.orderId,
            productName: orderItems.productName,
            quantity: orderItems.quantity,
          })
          .from(orderItems)
          .where(inArray(orderItems.orderId, orderIds))
      : [];

    const personIds = [
      ...new Set(
        [
          ...eventRows.map((event) => event.actorId),
          ...boardRows.map((board) => board.createdBy),
        ].filter((id): id is string => Boolean(id)),
      ),
    ];
    const personRows = personIds.length
      ? await this.db
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
          })
          .from(users)
          .where(inArray(users.id, personIds))
      : [];
    const personNames = new Map(
      personRows.map((person) => [
        person.id,
        `${person.firstName || ''} ${person.lastName || ''}`.trim(),
      ]),
    );
    const displayName = (id?: string | null, stored?: string | null) => {
      const fromUser = id ? personNames.get(id) : '';
      if (fromUser) {
        return fromUser;
      }
      if (stored && !stored.includes('@')) {
        return stored;
      }
      return 'Équipe';
    };

    return boardRows.map((board) => ({
      id: board.id,
      reference: board.reference,
      capacity: board.capacity,
      status: board.status,
      createdByName: displayName(board.createdBy, board.createdByName),
      launchedAt: this.toIso(board.launchedAt) ?? null,
      finishedAt: this.toIso(board.finishedAt) ?? null,
      createdAt: this.toIso(board.createdAt) ?? new Date().toISOString(),
      events: this.plancheEventsFor(board, eventRows, personNames),
      orders: links
        .filter((link) => link.plancheId === board.id)
        .map((link) => {
          const order = orderRows.find((item) => item.id === link.orderId);
          const items = itemRows.filter((item) => item.orderId === link.orderId);
          return {
            orderId: link.orderId,
            reference: order?.reference || link.orderId.slice(0, 8).toUpperCase(),
            clientName: order?.fullName || 'Client',
            phone: order?.phone || '',
            wilaya: order?.wilayaName || '',
            productSummary: items.length
              ? items.map((item) => `${item.quantity} x ${item.productName}`).join(', ')
              : 'Commande',
          };
        }),
    }));
  }

  private async nextPlancheReference() {
    const rows = await this.db
      .select({ reference: crmPlanches.reference })
      .from(crmPlanches);
    let max = 0;
    for (const row of rows) {
      const match = /^PL-(\d+)$/.exec(row.reference);
      if (match) {
        max = Math.max(max, Number(match[1]));
      }
    }
    return `PL-${String(max + 1).padStart(3, '0')}`;
  }

  private isUniqueViolation(error: unknown) {
    const candidate = error as { code?: string; cause?: { code?: string } };
    return candidate?.code === '23505' || candidate?.cause?.code === '23505';
  }

  private assertCapacity(value: number) {
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      throw new BadRequestException('Choisissez une capacité entre 1 et 100 commandes.');
    }
    return value;
  }

  private async recordPlancheEvent(input: {
    plancheId: string;
    action: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    note?: string | null;
    user?: PlancheActor;
    actorName?: string | null;
  }) {
    await this.db.insert(crmPlancheEvents).values({
      id: this.newId(),
      plancheId: input.plancheId,
      action: input.action,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      note: input.note ?? null,
      actorId: input.user?.id || null,
      actorName: input.actorName || (await this.resolveActorName(input.user)),
    });
  }

  private plancheEventsFor(
    board: typeof crmPlanches.$inferSelect,
    eventRows: Array<typeof crmPlancheEvents.$inferSelect>,
    personNames: Map<string, string>,
  ) {
    const label = (id?: string | null, stored?: string | null) => {
      const fromUser = id ? personNames.get(id) : '';
      if (fromUser) {
        return fromUser;
      }
      if (stored && !stored.includes('@')) {
        return stored;
      }
      return 'Équipe';
    };
    const events = eventRows
      .filter((event) => event.plancheId === board.id)
      .map((event) => ({
        id: event.id,
        action: event.action,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        note: event.note,
        actorName: label(event.actorId, event.actorName),
        createdAt: this.toIso(event.createdAt) ?? new Date().toISOString(),
      }));

    if (events.length > 0) {
      return events;
    }

    return [
      {
        id: `created-${board.id}`,
        action: 'created',
        fromStatus: null,
        toStatus: 'en_attente',
        note: `Capacité ${board.capacity}`,
        actorName: label(board.createdBy, board.createdByName),
        createdAt: this.toIso(board.createdAt) ?? new Date().toISOString(),
      },
    ];
  }

  private personName(user?: PlancheActor) {
    const name = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
    return name || null;
  }

  private async resolveActorName(user?: PlancheActor) {
    const direct = this.personName(user);
    if (direct && !direct.includes('@')) {
      return direct;
    }
    if (!user?.id) {
      return 'Équipe';
    }
    const [row] = await this.db
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    const fromDb = `${row?.firstName || ''} ${row?.lastName || ''}`.trim();
    return fromDb || 'Équipe';
  }

  private async syncPlancheOrderStatuses() {
    const rows = await this.db
      .select({
        orderId: crmPlancheOrders.orderId,
        plancheStatus: crmPlanches.status,
        reference: crmPlanches.reference,
        createdBy: crmPlanches.createdBy,
        orderStatus: orders.status,
      })
      .from(crmPlancheOrders)
      .innerJoin(crmPlanches, eq(crmPlancheOrders.plancheId, crmPlanches.id))
      .innerJoin(orders, eq(crmPlancheOrders.orderId, orders.id));

    const processingIds = [
      ...new Set(
        rows
          .filter((row) => row.orderStatus === 'processing')
          .map((row) => row.orderId),
      ),
    ];
    const jobRows = processingIds.length
      ? await this.db
          .select({
            orderId: crmProductionJobs.orderId,
            status: crmProductionJobs.status,
          })
          .from(crmProductionJobs)
          .where(inArray(crmProductionJobs.orderId, processingIds))
      : [];
    const jobsByOrder = new Map<string, string[]>();
    for (const job of jobRows) {
      const current = jobsByOrder.get(job.orderId) || [];
      current.push(job.status);
      jobsByOrder.set(job.orderId, current);
    }
    const alreadyPrepared = new Set(
      [...jobsByOrder.entries()]
        .filter(([, statuses]) => statuses.length > 0 && statuses.every((status) => status === 'termine'))
        .map(([orderId]) => orderId),
    );

    const mismatched = rows.filter((row) => {
      if (row.orderStatus === 'cancelled' || row.orderStatus === 'refunded' || row.orderStatus === 'shipped' || row.orderStatus === 'delivered') {
        return false;
      }
      if (row.plancheStatus === 'terminee') {
        if (alreadyPrepared.has(row.orderId)) {
          return false;
        }
        return row.orderStatus === 'confirmed' || row.orderStatus === 'processing';
      }
      return row.orderStatus === 'confirmed';
    });
    if (mismatched.length === 0) {
      return;
    }

    let fallbackId: string | undefined;
    for (const row of mismatched) {
      let actorId = row.createdBy || undefined;
      if (!actorId) {
        if (!fallbackId) {
          const [admin] = await this.db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.role, 'admin'))
            .limit(1);
          fallbackId = admin?.id;
        }
        actorId = fallbackId;
      }
      if (!actorId) {
        continue;
      }
      const actor = { id: actorId, roles: ['fabrication'] };
      const note = `Planche ${row.reference}`;
      if (row.plancheStatus === 'terminee') {
        await this.movePlancheOrder(row.orderId, 'terminee', note, actor);
      } else if (row.orderStatus === 'confirmed') {
        await this.crmOrdersService.updateStatus(row.orderId, 'en_fabrication', note, actor, {
          historyOnly: true,
        });
      }
    }
  }

  private serialize(job: any) {
    return {
      ...job,
      startedAt: this.toIso(job.startedAt),
      finishedAt: this.toIso(job.finishedAt),
      createdAt: this.toIso(job.createdAt) ?? new Date().toISOString(),
    };
  }
}
