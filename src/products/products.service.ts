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
        .select({ id: categories.id })
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

      conditions.push(eq(products.categoryId, category.id));
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
      conditions.push(
        gte(products.priceCents, filters.minPrice),
      );
    }

    if (filters?.maxPrice !== undefined) {
      conditions.push(
        lte(products.priceCents, filters.maxPrice),
      );
    }

    if (filters?.personalizable !== undefined) {
      conditions.push(
        eq(
          products.isPersonalizable,
          filters.personalizable,
        ),
      );
    }

    if (filters?.search?.trim()) {
      conditions.push(
        ilike(
          products.name,
          `%${filters.search.trim()}%`,
        ),
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
        priceCents: products.priceCents,
        compareAtPriceCents: products.compareAtPriceCents,
        currency: products.currency,
        badge: products.badge,
        occasions: products.occasions,
        isPersonalizable: products.isPersonalizable,
        personalizationPrompt:
          products.personalizationPrompt,
        ratingAvg: products.ratingAvg,
        ratingCount: products.ratingCount,
        createdAt: products.createdAt,
      })
      .from(products)
      .where(where)
      .orderBy(...this.getSort(filters?.sort))
      .limit(limit)
      .offset(offset);

    const data =
      await this.attachPrimaryImages(productList);

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

    const images = await this.db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, product.id))
      .orderBy(
        desc(productImages.isPrimary),
        asc(productImages.sortOrder),
        asc(productImages.createdAt),
      );

    const variants = await this.db
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
      );

    const inventoryRows = await this.db
      .select()
      .from(inventory)
      .where(eq(inventory.productId, product.id));

    const productInventory =
      inventoryRows.find(
        (row) => row.variantId === null,
      ) ?? null;

    const inventoryByVariant = new Map(
      inventoryRows
        .filter((row) => row.variantId !== null)
        .map((row) => [row.variantId, row]),
    );

    const variantsWithInventory = variants.map(
      (variant) => ({
        ...variant,
        inventory:
          inventoryByVariant.get(variant.id) ?? null,
      }),
    );

    return {
      ...product,
      images,
      variants: variantsWithInventory,

      // Product-level stock for products without variants.
      inventory: productInventory,
    };
  }

  async findBestSellers(limit = 10): Promise<any[]> {
    const safeLimit =
      Number.isInteger(limit) && limit > 0
        ? Math.min(limit, 50)
        : 10;

    const productList = await this.db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        shortDescription: products.shortDescription,
        priceCents: products.priceCents,
        compareAtPriceCents: products.compareAtPriceCents,
        currency: products.currency,
        badge: products.badge,
        ratingAvg: products.ratingAvg,
        ratingCount: products.ratingCount,
        isPersonalizable: products.isPersonalizable,
        createdAt: products.createdAt,
      })
      .from(products)
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

    const productIds = productList.map(
      (product) => product.id,
    );

    const images = await this.db
      .select({
        productId: productImages.productId,
        url: productImages.url,
        altText: productImages.altText,
        isPrimary: productImages.isPrimary,
        sortOrder: productImages.sortOrder,
        createdAt: productImages.createdAt,
      })
      .from(productImages)
      .where(inArray(productImages.productId, productIds))
      .orderBy(
        desc(productImages.isPrimary),
        asc(productImages.sortOrder),
        asc(productImages.createdAt),
      );

    const primaryImageByProduct = new Map<
      string,
      {
        url: string;
        altText: string | null;
      }
    >();

    for (const image of images) {
      if (!primaryImageByProduct.has(image.productId)) {
        primaryImageByProduct.set(image.productId, {
          url: image.url,
          altText: image.altText,
        });
      }
    }

    return productList.map((product) => {
      const image = primaryImageByProduct.get(
        product.id,
      );

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
