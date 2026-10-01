import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { UpsertPixelDto } from './pixels.dto';
import { DATABASE_CONNECTION } from '../database/database.module';
import * as schema from '../database/schema';
import { trackingPixels } from '../database/schema';

@Injectable()
export class PixelsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  list() {
    return this.db
      .select({
        id: trackingPixels.id,
        name: trackingPixels.name,
        platform: trackingPixels.platform,
        pixelId: trackingPixels.pixelId,
        isActive: trackingPixels.isActive,
        createdAt: trackingPixels.createdAt,
        updatedAt: trackingPixels.updatedAt,
      })
      .from(trackingPixels)
      .orderBy(asc(trackingPixels.platform), desc(trackingPixels.createdAt));
  }

  async create(input: UpsertPixelDto, userId: string) {
    await this.assertUnique(input.platform, input.pixelId);

    const [created] = await this.db
      .insert(trackingPixels)
      .values({
        name: input.name.trim(),
        platform: input.platform,
        pixelId: input.pixelId.trim(),
        isActive: input.isActive ?? true,
        createdBy: userId,
      })
      .returning({
        id: trackingPixels.id,
        name: trackingPixels.name,
        platform: trackingPixels.platform,
        pixelId: trackingPixels.pixelId,
        isActive: trackingPixels.isActive,
      });

    return created;
  }

  async update(id: string, input: UpsertPixelDto) {
    await this.findOne(id);
    await this.assertUnique(input.platform, input.pixelId, id);

    const [updated] = await this.db
      .update(trackingPixels)
      .set({
        name: input.name.trim(),
        platform: input.platform,
        pixelId: input.pixelId.trim(),
        isActive: input.isActive ?? true,
        updatedAt: new Date(),
      })
      .where(eq(trackingPixels.id, id))
      .returning({
        id: trackingPixels.id,
        name: trackingPixels.name,
        platform: trackingPixels.platform,
        pixelId: trackingPixels.pixelId,
        isActive: trackingPixels.isActive,
      });

    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.db.delete(trackingPixels).where(eq(trackingPixels.id, id));
    return { ok: true };
  }

  private async findOne(id: string) {
    const [pixel] = await this.db
      .select({ id: trackingPixels.id })
      .from(trackingPixels)
      .where(eq(trackingPixels.id, id))
      .limit(1);

    if (!pixel) {
      throw new NotFoundException('Pixel introuvable');
    }

    return pixel;
  }

  private async assertUnique(
    platform: string,
    pixelId: string,
    ignoreId?: string,
  ) {
    const filters = [
      eq(trackingPixels.platform, platform),
      eq(trackingPixels.pixelId, pixelId.trim()),
    ];

    if (ignoreId) {
      filters.push(ne(trackingPixels.id, ignoreId));
    }

    const [existing] = await this.db
      .select({ id: trackingPixels.id })
      .from(trackingPixels)
      .where(and(...filters))
      .limit(1);

    if (existing) {
      throw new ConflictException(
        'Ce pixel est déjà enregistré pour cette plateforme.',
      );
    }
  }
}
