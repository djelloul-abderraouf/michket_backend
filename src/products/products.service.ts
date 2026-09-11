import {
  Injectable,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  sql,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../database/schema';
import {
  categories,
  inventory,
  productImages,
  products,
  productVariants,
} from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import {
  PaginatedResponseDto,
  PaginationDto,
} from '../common/dto/pagination.dto';

type ProductFilters = {
  category?: string;
  badge?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  personalizable?: boolean;
  sort?: string;
};

@Injectable()
export class ProductsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findAll(
    pagination: PaginationDto,
    filters?: ProductFilters,
  ): Promise<PaginatedResponseDto<any>> {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = [eq(products.isActive, true)];

    if (filters?.category) {
      const [category] = await this.db
        .select({ id: categories.id, parentId: categories.parentId })
        .from(categories)
        .where(
          and(
            eq(categories.slug, filters.category),
            eq(categories.isActive, true),
          ),
        )
        .limit(1);

      if (!category) {
        return new PaginatedResponseDto([], 0, page, limit);
      }

      if (category.parentId === null) {
        const children = await this.db
          .select({ id: categories.id })
          .from(categories)
          .where(
            and(
              eq(categories.parentId, category.id),
              eq(categories.isActive, true),
            ),
          );

        const categoryIds = [category.id, ...children.map((c) => c.id)];
        conditions.push(inArray(products.categoryId, categoryIds));
      } else {
        conditions.push(eq(products.categoryId, category.id));
      }
    }

    if (filters?.badge) {
      conditions.push(
        eq(
          products.badge,
          filters.badge as typeof products.badge.enumValues[number],
        ),
      );
    }

    if (filters?.minPrice !== undefined) {
      conditions.push(gte(products.priceCents, filters.minPrice));
    }

    if (filters?.maxPrice !== undefined) {
      conditions.push(lte(products.priceCents, filters.maxPrice));
    }

    if (filters?.personalizable !== undefined) {
      conditions.push(
        eq(products.isPersonalizable, filters.personalizable),
      );
    }

    if (filters?.search?.trim()) {
      conditions.push(
        ilike(products.name, `%${filters.search.trim()}%`),
      );
    }

    const where = and(...conditions);

    const [countResult] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(products)
      .where(where);

    const productList = await this.db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        description: products.description,
        shortDescription: products.shortDescription,
        categoryId: products.categoryId,
        categorySlug: categories.slug,
        categoryName: categories.name,
        priceCents: products.priceCents,
        compareAtPriceCents: products.compareAtPriceCents,
        currency: products.currency,
        badge: products.badge,
        occasions: products.occasions,
        isPersonalizable: products.isPersonalizable,
        personalizationPrompt: products.personalizationPrompt,
        ratingAvg: products.ratingAvg,
        ratingCount: products.ratingCount,
        createdAt: products.createdAt,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      .orderBy(...this.getSort(filters?.sort))
      .limit(limit)
      .offset(offset);

    const data = await this.attachPrimaryImages(productList);

    return new PaginatedResponseDto(
      data,
      countResult?.count ?? 0,
      page,
      limit,
    );
  }

  async findBySlug(slug: string): Promise<any> {
    const [product] = await this.db
      .select()
      .from(products)
      .where(
        and(
          eq(products.slug, slug),
          eq(products.isActive, true),
        ),
      )
      .limit(1);

    if (!product) {
      throw new NotFoundException(
        `Product with slug "${slug}" not found`,
      );
    }

    const [
      images,
      variants,
      inventoryRows,
      [category],
    ] = await Promise.all([
      this.db
        .select()
        .from(productImages)
        .where(eq(productImages.productId, product.id))
        .orderBy(
          desc(productImages.isPrimary),
          asc(productImages.sortOrder),
          asc(productImages.createdAt),
        ),
      this.db
        .select()
        .from(productVariants)
        .where(
          and(
            eq(productVariants.productId, product.id),
            eq(productVariants.isActive, true),
          ),
        )
        .orderBy(
          asc(productVariants.sortOrder),
          asc(productVariants.name),
        ),
      this.db
        .select()
        .from(inventory)
        .where(eq(inventory.productId, product.id)),
      this.db
        .select()
        .from(categories)
        .where(eq(categories.id, product.categoryId))
        .limit(1),
    ]);

    const productInventory =
      inventoryRows.find((row) => row.variantId === null) ?? null;

    const inventoryByVariant = new Map(
      inventoryRows
        .filter((row) => row.variantId !== null)
        .map((row) => [row.variantId, row]),
    );

    const variantsWithInventory = variants.map((variant) => ({
      ...variant,
      inventory: inventoryByVariant.get(variant.id) ?? null,
    }));

    return {
      ...product,
      images,
      variants: variantsWithInventory,
      inventory: productInventory,
      category: category ?? null,
    };
  }

  async findBestSellers(limit = 10): Promise<any[]> {
    const safeLimit =
      Number.isInteger(limit) && limit > 0
        ? Math.min(limit, 50)
        : 10;

    // Keep the public list contract identical to GET /products.
    const productList = await this.db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        description: products.description,
        shortDescription: products.shortDescription,
        categoryId: products.categoryId,
        categorySlug: categories.slug,
        categoryName: categories.name,
        priceCents: products.priceCents,
        compareAtPriceCents: products.compareAtPriceCents,
        currency: products.currency,
        badge: products.badge,
        occasions: products.occasions,
        isPersonalizable: products.isPersonalizable,
        personalizationPrompt: products.personalizationPrompt,
        ratingAvg: products.ratingAvg,
        ratingCount: products.ratingCount,
        createdAt: products.createdAt,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(
        and(
          eq(products.isActive, true),
          eq(products.badge, 'BEST_SELLER'),
        ),
      )
      .orderBy(
        desc(products.ratingCount),
        desc(products.ratingAvg),
        desc(products.createdAt),
      )
      .limit(safeLimit);

    return this.attachPrimaryImages(productList);
  }

  private async attachPrimaryImages<
    T extends { id: string },
  >(
    productList: T[],
  ): Promise<
    Array<
      T & {
        imageUrl: string | null;
        imageAlt: string | null;
      }
    >
  > {
    if (productList.length === 0) {
      return [];
    }

    const productIds = productList.map((product) => product.id);

    const images = await this.db
      .select({
        productId: productImages.productId,
        url: productImages.url,
        altText: productImages.altText,
        isPrimary: productImages.isPrimary,
        sortOrder: productImages.sortOrder,
        variantId: productImages.variantId,
        createdAt: productImages.createdAt,
      })
      .from(productImages)
      .where(inArray(productImages.productId, productIds))
      .orderBy(
        desc(productImages.isPrimary),
        asc(productImages.sortOrder),
        asc(productImages.createdAt),
      );

    const imagesByProduct = new Map<
      string,
      Array<{
        url: string;
        altText: string | null;
        variantId: string | null;
      }>
    >();

    for (const image of images) {
      const list = imagesByProduct.get(image.productId) ?? [];
      list.push({
        url: image.url,
        altText: image.altText,
        variantId: image.variantId,
      });
      imagesByProduct.set(image.productId, list);
    }

    return productList.map((product) => {
      const candidates = imagesByProduct.get(product.id) ?? [];

      // A catalogue card has no selected variant, so prefer a general image.
      // Fall back to the first product image only if no general image exists.
      const image =
        candidates.find((candidate) => candidate.variantId === null) ??
        candidates[0];

      return {
        ...product,
        imageUrl: image?.url ?? null,
        imageAlt: image?.altText ?? null,
      };
    });
  }

  private getSort(sort?: string) {
    switch (sort) {
      case 'price_asc':
        return [
          asc(products.priceCents),
          desc(products.createdAt),
        ];

      case 'price_desc':
        return [
          desc(products.priceCents),
          desc(products.createdAt),
        ];

      case 'rating':
        return [
          desc(products.ratingAvg),
          desc(products.ratingCount),
          desc(products.createdAt),
        ];

      case 'oldest':
        return [asc(products.createdAt)];

      case 'newest':
      default:
        return [desc(products.createdAt)];
    }
  }
}
