import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../database/schema';
import {
  orderItems,
  orders,
  stockItems,
  stockManufacturingOrders,
  stockMovements,
  stockRecipeLines,
  stockRecipes,
  users,
} from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import { CrmBaseService } from '../crm-base/crm-base.service';
import type { StockItemType, StockMovementType } from '../database/schema/crm-stock';
import {
  CreateStockItemDto,
  CreateStockMovementDto,
  ManufactureDto,
  SaveRecipeDto,
  UpdateStockItemDto,
} from './dto/crm-stock.dto';

type Actor = {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

type StockStatus = 'ok' | 'low' | 'out';

const IN_FLOW = new Set(['confirmed', 'processing', 'shipped', 'delivered']);

@Injectable()
export class CrmStockService extends CrmBaseService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    db: NodePgDatabase<typeof schema>,
  ) {
    super(db);
  }

  async listItems() {
    const items = await this.db.select().from(stockItems).orderBy(stockItems.name);
    const balances = await this.balances();
    return items.map((item) => this.mapItem(item, balances.get(item.id) ?? 0));
  }

  async createItem(dto: CreateStockItemDto) {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Le nom est obligatoire.');
    }
    const [created] = await this.db.insert(stockItems).values({
      name,
      category: dto.category?.trim() || '',
      itemType: dto.itemType,
      unit: dto.unit?.trim() || 'pcs',
      minQuantity: this.qty(dto.minQuantity ?? 0),
      catalogProductId: dto.catalogProductId || null,
    }).returning();
    return this.mapItem(created, 0);
  }

  async updateItem(id: string, dto: UpdateStockItemDto) {
    const current = await this.requireItem(id);
    const [updated] = await this.db.update(stockItems).set({
      name: dto.name?.trim() || current.name,
      category: dto.category !== undefined ? dto.category.trim() : current.category,
      itemType: dto.itemType || current.itemType,
      unit: dto.unit?.trim() || current.unit,
      minQuantity: dto.minQuantity !== undefined ? this.qty(dto.minQuantity) : current.minQuantity,
      catalogProductId: dto.catalogProductId === undefined ? current.catalogProductId : dto.catalogProductId,
      active: dto.active ?? current.active,
      updatedAt: new Date(),
    }).where(eq(stockItems.id, id)).returning();
    const balances = await this.balances();
    return this.mapItem(updated, balances.get(id) ?? 0);
  }

  async listMovements(itemId?: string, movementType?: string) {
    const filters = [];
    if (itemId) filters.push(eq(stockMovements.itemId, itemId));
    if (movementType) filters.push(eq(stockMovements.movementType, movementType as StockMovementType));
    const rows = await this.db
      .select()
      .from(stockMovements)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(stockMovements.occurredAt))
      .limit(300);
    const items = await this.db.select({ id: stockItems.id, name: stockItems.name }).from(stockItems);
    const names = new Map(items.map((item) => [item.id, item.name]));
    return rows.map((row) => this.mapMovement(row, names.get(row.itemId) || 'Article'));
  }

  async createManualMovement(dto: CreateStockMovementDto, user?: Actor) {
    const item = await this.requireItem(dto.itemId);
    if (!item.active) {
      throw new BadRequestException('Cet article est inactif.');
    }
    const delta = this.manualDelta(dto.movementType, dto.quantity);
    const actorName = await this.actorName(user);
    const [created] = await this.db.insert(stockMovements).values({
      itemId: item.id,
      movementType: dto.movementType,
      quantity: this.qty(Math.abs(delta)),
      quantityDelta: this.qty(delta),
      sourceType: 'manual',
      note: dto.note?.trim() || null,
      createdBy: user?.id || null,
      createdByName: actorName,
    }).returning();
    return this.mapMovement(created, item.name);
  }

  async reverseMovement(id: string, user?: Actor) {
    const [movement] = await this.db.select().from(stockMovements).where(eq(stockMovements.id, id)).limit(1);
    if (!movement) {
      throw new NotFoundException('Mouvement introuvable.');
    }
    if (movement.movementType === 'reversal' || movement.reversesMovementId) {
      throw new BadRequestException('Ce mouvement est déjà une annulation.');
    }
    const [already] = await this.db
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(eq(stockMovements.reversesMovementId, id))
      .limit(1);
    if (already) {
      throw new BadRequestException('Ce mouvement a déjà été annulé.');
    }
    const item = await this.requireItem(movement.itemId);
    const delta = -this.num(movement.quantityDelta);
    const actorName = await this.actorName(user);
    const [created] = await this.db.insert(stockMovements).values({
      itemId: movement.itemId,
      movementType: 'reversal',
      quantity: this.qty(Math.abs(delta)),
      quantityDelta: this.qty(delta),
      sourceType: 'reversal',
      sourceId: movement.id,
      sourceRef: movement.sourceRef,
      note: `Annulation du mouvement ${movement.movementType}`,
      idempotencyKey: `reversal:${movement.id}`,
      reversesMovementId: movement.id,
      createdBy: user?.id || null,
      createdByName: actorName,
    }).onConflictDoNothing({ target: stockMovements.idempotencyKey }).returning();
    if (!created) {
      throw new BadRequestException('Ce mouvement a déjà été annulé.');
    }
    return this.mapMovement(created, item.name);
  }

  async listRecipes(kind?: 'manufacturing' | 'sales') {
    const recipes = await this.db
      .select()
      .from(stockRecipes)
      .where(kind ? eq(stockRecipes.kind, kind) : undefined)
      .orderBy(stockRecipes.name);
    return this.mapRecipes(recipes);
  }

  async saveRecipe(dto: SaveRecipeDto) {
    const output = await this.requireItem(dto.outputItemId);
    const lines = this.cleanLines(dto.lines, output.id);
    const name = dto.name.trim() || output.name;
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(stockRecipes)
        .where(and(eq(stockRecipes.kind, dto.kind), eq(stockRecipes.outputItemId, output.id)))
        .limit(1);
      const recipe = existing
        ? (await tx.update(stockRecipes).set({
            name,
            active: true,
            updatedAt: new Date(),
          }).where(eq(stockRecipes.id, existing.id)).returning())[0]
        : (await tx.insert(stockRecipes).values({
            kind: dto.kind,
            outputItemId: output.id,
            name,
          }).returning())[0];
      await tx.delete(stockRecipeLines).where(eq(stockRecipeLines.recipeId, recipe.id));
      await tx.insert(stockRecipeLines).values(lines.map((line) => ({
        recipeId: recipe.id,
        componentItemId: line.componentItemId,
        quantityPerUnit: this.qty(line.quantityPerUnit),
      })));
      const [mapped] = await this.mapRecipes([recipe], tx);
      return mapped;
    });
  }

  async previewManufacture(dto: ManufactureDto) {
    const output = await this.requireItem(dto.outputItemId);
    const lines = await this.requirementLines('manufacturing', output.id, dto.quantity);
    const balances = await this.balances();
    return {
      outputItemId: output.id,
      outputName: output.name,
      quantity: this.round(dto.quantity),
      lines: lines.map((line) => {
        const available = balances.get(line.componentItemId) ?? 0;
        return {
          componentItemId: line.componentItemId,
          componentName: line.componentName,
          required: line.required,
          available: this.round(available),
          enough: available + 0.0001 >= line.required,
        };
      }),
      canManufacture: lines.every((line) => (balances.get(line.componentItemId) ?? 0) + 0.0001 >= line.required),
    };
  }

  async manufacture(dto: ManufactureDto, user?: Actor) {
    const preview = await this.previewManufacture(dto);
    if (preview.lines.length === 0) {
      throw new BadRequestException('Ajoutez une recette de fabrication pour cet article.');
    }
    if (!preview.canManufacture) {
      throw new BadRequestException('Stock insuffisant pour fabriquer cette quantité.');
    }
    const actorName = await this.actorName(user);
    return this.db.transaction(async (tx) => {
      const balances = await this.balances(tx);
      const short = preview.lines.filter((line) => (balances.get(line.componentItemId) ?? 0) + 0.0001 < line.required);
      if (short.length > 0) {
        throw new BadRequestException('Stock insuffisant pour fabriquer cette quantité.');
      }
      const reference = await this.nextManufacturingReference(tx);
      const [order] = await tx.insert(stockManufacturingOrders).values({
        reference,
        outputItemId: dto.outputItemId,
        quantity: this.qty(dto.quantity),
        status: 'completed',
        note: dto.note?.trim() || null,
        createdBy: user?.id || null,
        createdByName: actorName,
      }).returning();
      for (const line of preview.lines) {
        await this.insertMovement(tx, {
          itemId: line.componentItemId,
          movementType: 'manufacturing_consumption',
          delta: -line.required,
          sourceType: 'manufacturing',
          sourceId: order.id,
          sourceRef: reference,
          note: `Fabrication ${reference}`,
          idempotencyKey: `mfg:${order.id}:out:${line.componentItemId}`,
          user,
          actorName,
        });
      }
      await this.insertMovement(tx, {
        itemId: dto.outputItemId,
        movementType: 'manufacturing_production',
        delta: dto.quantity,
        sourceType: 'manufacturing',
        sourceId: order.id,
        sourceRef: reference,
        note: `Fabrication ${reference}`,
        idempotencyKey: `mfg:${order.id}:in`,
        user,
        actorName,
      });
      return this.mapManufacturing(order, preview.outputName);
    });
  }

  async listManufacturing() {
    const rows = await this.db
      .select()
      .from(stockManufacturingOrders)
      .orderBy(desc(stockManufacturingOrders.createdAt))
      .limit(200);
    const items = await this.db.select({ id: stockItems.id, name: stockItems.name }).from(stockItems);
    const names = new Map(items.map((item) => [item.id, item.name]));
    return rows.map((row) => this.mapManufacturing(row, names.get(row.outputItemId) || 'Article'));
  }

  async cancelManufacturing(id: string, user?: Actor) {
    const [order] = await this.db
      .select()
      .from(stockManufacturingOrders)
      .where(eq(stockManufacturingOrders.id, id))
      .limit(1);
    if (!order) {
      throw new NotFoundException('Fabrication introuvable.');
    }
    if (order.status === 'cancelled') {
      throw new BadRequestException('Cette fabrication est déjà annulée.');
    }
    const actorName = await this.actorName(user);
    const item = await this.requireItem(order.outputItemId);
    await this.db.transaction(async (tx) => {
      const originals = await tx
        .select()
        .from(stockMovements)
        .where(and(eq(stockMovements.sourceType, 'manufacturing'), eq(stockMovements.sourceId, order.id)));
      const originalIds = originals.map((movement) => movement.id);
      const alreadyReversed = originalIds.length
        ? await tx
            .select({ id: stockMovements.reversesMovementId })
            .from(stockMovements)
            .where(inArray(stockMovements.reversesMovementId, originalIds))
        : [];
      const reversed = new Set(alreadyReversed.map((row) => row.id).filter(Boolean));
      for (const movement of originals) {
        if (movement.movementType === 'reversal' || reversed.has(movement.id)) continue;
        await this.insertMovement(tx, {
          itemId: movement.itemId,
          movementType: 'reversal',
          delta: -this.num(movement.quantityDelta),
          sourceType: 'manufacturing',
          sourceId: order.id,
          sourceRef: order.reference,
          note: `Annulation ${order.reference}`,
          idempotencyKey: `mfg-cancel:${order.id}:${movement.id}`,
          reversesMovementId: movement.id,
          user,
          actorName,
        });
      }
      await tx.update(stockManufacturingOrders).set({
        status: 'cancelled',
        cancelledAt: new Date(),
      }).where(eq(stockManufacturingOrders.id, order.id));
    });
    return this.mapManufacturing({ ...order, status: 'cancelled' }, item.name);
  }

  async applyOrderSale(orderId: string, user?: Actor) {
    const empty = { deducted: [] as Array<{ itemId: string; name: string; quantity: number }>, unmatched: [] as string[], withoutRecipe: [] as string[], alerts: [] as Array<{ id: string; name: string; currentQuantity: number; minQuantity: number; stockStatus: 'low' | 'out' }> };
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) return empty;
    const lines = await this.db
      .select({
        productId: orderItems.productId,
        productName: orderItems.productName,
        variantName: orderItems.variantName,
        colorName: orderItems.colorName,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    const { needed, unmatched, withoutRecipe } = await this.salesNeeds(lines);
    const actorName = await this.actorName(user);
    const items = await this.db.select().from(stockItems);
    const names = new Map(items.map((item) => [item.id, item.name]));
    const existing = await this.db
      .select()
      .from(stockMovements)
      .where(and(
        eq(stockMovements.sourceType, 'order'),
        eq(stockMovements.sourceId, orderId),
        eq(stockMovements.movementType, 'sale'),
      ));
    const reversed = await this.reversedIds(existing.map((movement) => movement.id));
    const deducted: Array<{ itemId: string; name: string; quantity: number }> = [];
    for (const [itemId, quantity] of needed) {
      const sales = existing.filter((movement) => movement.itemId === itemId);
      if (sales.some((movement) => !reversed.has(movement.id))) continue;
      const created = await this.insertMovement(this.db, {
        itemId,
        movementType: 'sale',
        delta: -quantity,
        sourceType: 'order',
        sourceId: orderId,
        sourceRef: order.reference,
        note: `Vente ${order.reference}`,
        idempotencyKey: `sale:${orderId}:${itemId}:${sales.length + 1}`,
        user,
        actorName,
      });
      if (created) {
        deducted.push({ itemId, name: names.get(itemId) || 'Article', quantity: this.round(quantity) });
      }
    }
    const alerts = await this.alertsFor(items, [...needed.keys()]);
    return { deducted, unmatched, withoutRecipe, alerts };
  }

  async reverseOrderSale(orderId: string, user?: Actor) {
    const originals = await this.db
      .select()
      .from(stockMovements)
      .where(and(
        eq(stockMovements.sourceType, 'order'),
        eq(stockMovements.sourceId, orderId),
        eq(stockMovements.movementType, 'sale'),
      ));
    if (originals.length === 0) return;
    const reversed = await this.reversedIds(originals.map((movement) => movement.id));
    const actorName = await this.actorName(user);
    for (const movement of originals) {
      if (reversed.has(movement.id)) continue;
      await this.insertMovement(this.db, {
        itemId: movement.itemId,
        movementType: 'reversal',
        delta: -this.num(movement.quantityDelta),
        sourceType: 'order',
        sourceId: orderId,
        sourceRef: movement.sourceRef,
        note: `Annulation vente ${movement.sourceRef || orderId}`,
        idempotencyKey: `sale-reversal:${movement.id}`,
        reversesMovementId: movement.id,
        user,
        actorName,
      });
    }
  }

  isInFulfillment(dbStatus: string) {
    return IN_FLOW.has(dbStatus);
  }

  private async salesNeeds(lines: Array<{
    productId: string | null;
    productName: string;
    variantName?: string | null;
    colorName?: string | null;
    quantity: number;
  }>) {
    const items = await this.db.select().from(stockItems);
    const recipes = await this.db.select().from(stockRecipes).where(eq(stockRecipes.kind, 'sales'));
    const activeRecipes = recipes.filter((recipe) => recipe.active);
    const recipeIds = activeRecipes.map((recipe) => recipe.id);
    const recipeLines = recipeIds.length
      ? await this.db.select().from(stockRecipeLines).where(inArray(stockRecipeLines.recipeId, recipeIds))
      : [];
    const recipeByOutput = new Map(activeRecipes.map((recipe) => [recipe.outputItemId, recipe]));
    const needed = new Map<string, number>();
    const unmatched: string[] = [];
    const withoutRecipe: string[] = [];
    for (const line of lines) {
      const match = this.matchStockItem(items, line);
      if (!match) {
        unmatched.push(this.lineLabel(line));
        continue;
      }
      const recipe = recipeByOutput.get(match.id);
      if (!recipe) {
        withoutRecipe.push(match.name);
        continue;
      }
      for (const component of recipeLines.filter((row) => row.recipeId === recipe.id)) {
        const add = this.num(component.quantityPerUnit) * line.quantity;
        needed.set(component.componentItemId, (needed.get(component.componentItemId) || 0) + add);
      }
    }
    return { needed, unmatched, withoutRecipe };
  }

  private matchStockItem(
    items: Array<typeof stockItems.$inferSelect>,
    line: { productId: string | null; productName: string; variantName?: string | null; colorName?: string | null },
  ) {
    const active = items.filter((item) => item.active);
    return this.matchAmong(active, line) ?? this.matchAmong(items, line);
  }

  private matchAmong(
    items: Array<typeof stockItems.$inferSelect>,
    line: { productId: string | null; productName: string; variantName?: string | null; colorName?: string | null },
  ) {
    const linked = line.productId
      ? items.filter((item) => item.catalogProductId === line.productId)
      : [];
    const pool = linked.length > 0 ? linked : items;
    const byName = this.pickByName(pool, line);
    if (byName) return byName;
    return linked.length === 1 ? linked[0] : null;
  }

  private pickByName(
    items: Array<typeof stockItems.$inferSelect>,
    line: { productName: string; variantName?: string | null; colorName?: string | null },
  ) {
    const candidates = new Set(
      [
        line.productName,
        [line.productName, line.colorName].filter(Boolean).join(' '),
        [line.productName, line.variantName].filter(Boolean).join(' '),
        [line.colorName, line.productName].filter(Boolean).join(' '),
      ].map((value) => this.norm(value)).filter(Boolean),
    );
    return items.find((item) => candidates.has(this.norm(item.name))) ?? null;
  }

  private lineLabel(line: { productName: string; colorName?: string | null }) {
    return [line.productName, line.colorName].filter(Boolean).join(' ');
  }

  private norm(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async alertsFor(items: Array<typeof stockItems.$inferSelect>, itemIds: string[]) {
    if (itemIds.length === 0) return [];
    const balances = await this.balances();
    return itemIds.flatMap((itemId) => {
      const item = items.find((row) => row.id === itemId);
      if (!item || !item.active) return [];
      const current = this.round(balances.get(itemId) ?? 0);
      const minQuantity = this.num(item.minQuantity);
      const stockStatus = this.stockStatus(current, minQuantity);
      if (stockStatus === 'ok') return [];
      return [{ id: item.id, name: item.name, currentQuantity: current, minQuantity, stockStatus }];
    });
  }

  private async requirementLines(kind: 'manufacturing' | 'sales', outputItemId: string, quantity: number) {
    const [recipe] = await this.db
      .select()
      .from(stockRecipes)
      .where(and(eq(stockRecipes.kind, kind), eq(stockRecipes.outputItemId, outputItemId), eq(stockRecipes.active, true)))
      .limit(1);
    if (!recipe) return [];
    const lines = await this.db.select().from(stockRecipeLines).where(eq(stockRecipeLines.recipeId, recipe.id));
    const items = await this.db.select({ id: stockItems.id, name: stockItems.name }).from(stockItems);
    const names = new Map(items.map((item) => [item.id, item.name]));
    return lines.map((line) => ({
      componentItemId: line.componentItemId,
      componentName: names.get(line.componentItemId) || 'Composant',
      required: this.round(this.num(line.quantityPerUnit) * quantity),
    }));
  }

  private async reversedIds(movementIds: string[]) {
    if (movementIds.length === 0) return new Set<string>();
    const rows = await this.db
      .select({ id: stockMovements.reversesMovementId })
      .from(stockMovements)
      .where(inArray(stockMovements.reversesMovementId, movementIds));
    return new Set(rows.map((row) => row.id).filter((id): id is string => Boolean(id)));
  }

  private async balances(tx: NodePgDatabase<typeof schema> | typeof this.db = this.db) {
    const rows = await tx
      .select({
        itemId: stockMovements.itemId,
        quantity: sql<string>`coalesce(sum(${stockMovements.quantityDelta}), 0)`,
      })
      .from(stockMovements)
      .groupBy(stockMovements.itemId);
    return new Map(rows.map((row) => [row.itemId, this.num(row.quantity)]));
  }

  private async mapRecipes(
    recipes: Array<typeof stockRecipes.$inferSelect>,
    tx: NodePgDatabase<typeof schema> | typeof this.db = this.db,
  ) {
    if (recipes.length === 0) return [];
    const lines = await tx
      .select()
      .from(stockRecipeLines)
      .where(inArray(stockRecipeLines.recipeId, recipes.map((recipe) => recipe.id)));
    const items = await tx.select({ id: stockItems.id, name: stockItems.name }).from(stockItems);
    const names = new Map(items.map((item) => [item.id, item.name]));
    return recipes.map((recipe) => ({
      id: recipe.id,
      kind: recipe.kind,
      name: recipe.name,
      outputItemId: recipe.outputItemId,
      outputName: names.get(recipe.outputItemId) || 'Article',
      active: recipe.active,
      lines: lines
        .filter((line) => line.recipeId === recipe.id)
        .map((line) => ({
          id: line.id,
          componentItemId: line.componentItemId,
          componentName: names.get(line.componentItemId) || 'Composant',
          quantityPerUnit: this.num(line.quantityPerUnit),
        })),
    }));
  }

  private async insertMovement(
    tx: NodePgDatabase<typeof schema> | typeof this.db,
    input: {
      itemId: string;
      movementType: StockMovementType;
      delta: number;
      sourceType: string;
      sourceId?: string | null;
      sourceRef?: string | null;
      note?: string | null;
      idempotencyKey?: string | null;
      reversesMovementId?: string | null;
      user?: Actor;
      actorName: string;
    },
  ) {
    const delta = this.round(input.delta);
    if (delta === 0) return null;
    const rows = await tx.insert(stockMovements).values({
      itemId: input.itemId,
      movementType: input.movementType,
      quantity: this.qty(Math.abs(delta)),
      quantityDelta: this.qty(delta),
      sourceType: input.sourceType,
      sourceId: input.sourceId || null,
      sourceRef: input.sourceRef || null,
      note: input.note || null,
      idempotencyKey: input.idempotencyKey || null,
      reversesMovementId: input.reversesMovementId || null,
      createdBy: input.user?.id || null,
      createdByName: input.actorName,
    }).onConflictDoNothing({ target: stockMovements.idempotencyKey }).returning();
    return rows[0] ?? null;
  }

  private async nextManufacturingReference(tx: NodePgDatabase<typeof schema> | typeof this.db) {
    const rows = await tx.select({ reference: stockManufacturingOrders.reference }).from(stockManufacturingOrders);
    let max = 0;
    for (const row of rows) {
      const match = /^MFG-(\d+)$/.exec(row.reference);
      if (match) max = Math.max(max, Number(match[1]));
    }
    return `MFG-${String(max + 1).padStart(3, '0')}`;
  }

  private cleanLines(lines: SaveRecipeDto['lines'], outputItemId: string) {
    const unique = new Map<string, number>();
    for (const line of lines) {
      if (line.componentItemId === outputItemId) {
        throw new BadRequestException('Un article ne peut pas être un composant de lui-même.');
      }
      if (line.quantityPerUnit <= 0) {
        throw new BadRequestException('La quantité par unité doit être supérieure à 0.');
      }
      unique.set(line.componentItemId, line.quantityPerUnit);
    }
    if (unique.size === 0) {
      throw new BadRequestException('Ajoutez au moins un composant.');
    }
    return [...unique.entries()].map(([componentItemId, quantityPerUnit]) => ({
      componentItemId,
      quantityPerUnit,
    }));
  }

  private manualDelta(type: CreateStockMovementDto['movementType'], quantity: number) {
    if (type === 'adjustment') {
      if (!quantity || quantity === 0) {
        throw new BadRequestException('L\'ajustement doit être différent de 0.');
      }
      return quantity;
    }
    if (quantity <= 0) {
      throw new BadRequestException('La quantité doit être supérieure à 0.');
    }
    if (type === 'loss') return -quantity;
    return quantity;
  }

  private async requireItem(id: string) {
    const [item] = await this.db.select().from(stockItems).where(eq(stockItems.id, id)).limit(1);
    if (!item) throw new NotFoundException('Article de stock introuvable.');
    return item;
  }

  private async actorName(user?: Actor) {
    const direct = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
    if (direct && !direct.includes('@')) return direct;
    if (!user?.id) return 'Équipe';
    const [row] = await this.db
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    return `${row?.firstName || ''} ${row?.lastName || ''}`.trim() || 'Équipe';
  }

  private mapItem(item: typeof stockItems.$inferSelect, quantity: number) {
    const minQuantity = this.num(item.minQuantity);
    const current = this.round(quantity);
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      itemType: item.itemType as StockItemType,
      unit: item.unit,
      minQuantity,
      currentQuantity: current,
      stockStatus: this.stockStatus(current, minQuantity),
      catalogProductId: item.catalogProductId,
      active: item.active,
    };
  }

  private mapMovement(row: typeof stockMovements.$inferSelect, itemName: string) {
    return {
      id: row.id,
      itemId: row.itemId,
      itemName,
      movementType: row.movementType,
      quantity: this.num(row.quantity),
      quantityDelta: this.num(row.quantityDelta),
      occurredAt: row.occurredAt?.toISOString?.() ?? new Date().toISOString(),
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      sourceRef: row.sourceRef,
      note: row.note,
      reversesMovementId: row.reversesMovementId,
      createdByName: row.createdByName,
    };
  }

  private mapManufacturing(row: typeof stockManufacturingOrders.$inferSelect, outputName: string) {
    return {
      id: row.id,
      reference: row.reference,
      outputItemId: row.outputItemId,
      outputName,
      quantity: this.num(row.quantity),
      status: row.status,
      note: row.note,
      createdByName: row.createdByName,
      createdAt: row.createdAt?.toISOString?.() ?? new Date().toISOString(),
      cancelledAt: row.cancelledAt?.toISOString?.() ?? null,
    };
  }

  private stockStatus(quantity: number, minQuantity: number): StockStatus {
    if (quantity <= 0) return 'out';
    const warningAt = minQuantity > 0 ? minQuantity : 1;
    if (quantity <= warningAt) return 'low';
    return 'ok';
  }

  private num(value: string | number | null | undefined) {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private round(value: number) {
    return Math.round(value * 1000) / 1000;
  }

  private qty(value: number) {
    return this.round(value).toFixed(3);
  }
}
