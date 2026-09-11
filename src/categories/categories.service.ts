import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  eq,
  isNull,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../database/schema';
import { categories, categoryImages } from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findAll() {
    return this.db
      .select()
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(
        asc(categories.sortOrder),
        asc(categories.name),
      );
  }

  async findBySlug(slug: string) {
    const normalizedSlug = slug.trim().toLowerCase();

    const [category] = await this.db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.slug, normalizedSlug),
          eq(categories.isActive, true),
        ),
      )
      .limit(1);

    if (!category) {
      throw new NotFoundException(
        `Category "${normalizedSlug}" not found`,
      );
    }

    const children = category.parentId === null
      ? await this.db
          .select()
          .from(categories)
          .where(
            and(
              eq(categories.parentId, category.id),
              eq(categories.isActive, true),
            ),
          )
          .orderBy(
            asc(categories.sortOrder),
            asc(categories.name),
          )
      : [];

    const heroImages = await this.db
      .select()
      .from(categoryImages)
      .where(eq(categoryImages.categoryId, category.id))
      .orderBy(asc(categoryImages.sortOrder));

    return {
      ...category,
      children,
      heroImages,
    };
  }

  async findById(id: string) {
    const [category] = await this.db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.id, id),
          eq(categories.isActive, true),
        ),
      )
      .limit(1);

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async findFeatured() {
    // The homepage has four featured-category slots.
    // Only main categories belong in this endpoint.
    return this.db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.isActive, true),
          isNull(categories.parentId),
        ),
      )
      .orderBy(
        asc(categories.sortOrder),
        asc(categories.name),
      )
      .limit(4);
  }
}
