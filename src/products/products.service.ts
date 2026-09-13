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
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { alias } from 'drizzle-orm/pg-core';

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

type ActiveCategoryContext = {
  id: string;
  level: 1 | 2 | 3;
  subtreeIds: string[];
};

const productSubcategory = alias(
  categories,
  'product_subcategory',
);

const productSubsubcategory = alias(
  categories,
  'product_subsubcategory',
);

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

    const conditions: SQL[] = [
      eq(products.isActive, true),
    ];

    if (filters?.category) {
      const categoryCondition =
        await this.getCategoryFilterCondition(
          filters.category,
        );

      if (!categoryCondition) {
        return new PaginatedResponseDto(
          [],
          0,
          page,
          limit,
        );
      }

      conditions.push(categoryCondition);
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
        gte(
          products.priceCents,
          filters.minPrice,
        ),
      );
    }

    if (filters?.maxPrice !== undefined) {
      conditions.push(
        lte(
          products.priceCents,
          filters.maxPrice,
        ),
      );
    }

    if (
      filters?.personalizable !== undefined
    ) {
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
        shortDescription:
          products.shortDescription,

        categoryId: products.categoryId,
        categorySlug: categories.slug,
        categoryName: categories.name,

        subcategoryId:
          products.subcategoryId,
        subcategorySlug:
          productSubcategory.slug,
        subcategoryName:
          productSubcategory.name,

        subsubcategoryId:
          products.subsubcategoryId,
        subsubcategorySlug:
          productSubsubcategory.slug,
        subsubcategoryName:
          productSubsubcategory.name,

        priceCents: products.priceCents,
        compareAtPriceCents:
          products.compareAtPriceCents,
        currency: products.currency,
        badge: products.badge,
        occasions: products.occasions,
        isPersonalizable:
          products.isPersonalizable,
        personalizationPrompt:
          products.personalizationPrompt,
        ratingAvg: products.ratingAvg,
        ratingCount: products.ratingCount,
        createdAt: products.createdAt,
      })
      .from(products)
      .innerJoin(
        categories,
        eq(
          products.categoryId,
          categories.id,
        ),
      )
      .leftJoin(
        productSubcategory,
        eq(
          products.subcategoryId,
          productSubcategory.id,
        ),
      )
      .leftJoin(
        productSubsubcategory,
        eq(
          products.subsubcategoryId,
          productSubsubcategory.id,
        ),
      )
      .where(where)
      .orderBy(
        ...this.getSort(filters?.sort),
      )
      .limit(limit)
      .offset(offset);

    const data =
      await this.attachPrimaryImages(
        productList,
      );

    return new PaginatedResponseDto(
      data,
      countResult?.count ?? 0,
      page,
      limit,
    );
  }

  async findBySlug(
    slug: string,
  ): Promise<any> {
    const [product] = await this.db
      .select()
      .from(products)
      .where(
        and(
          eq(products.slug, slug),
          eq(
            products.isActive,
            true,
          ),
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
      subcategoryRows,
      subsubcategoryRows,
    ] = await Promise.all([
      this.db
        .select()
        .from(productImages)
        .where(
          eq(
            productImages.productId,
            product.id,
          ),
        )
        .orderBy(
          desc(
            productImages.isPrimary,
          ),
          asc(
            productImages.sortOrder,
          ),
          asc(
            productImages.createdAt,
          ),
        ),

      this.db
        .select()
        .from(productVariants)
        .where(
          and(
            eq(
              productVariants.productId,
              product.id,
            ),
            eq(
              productVariants.isActive,
              true,
            ),
          ),
        )
        .orderBy(
          asc(
            productVariants.sortOrder,
          ),
          asc(
            productVariants.name,
          ),
        ),

      this.db
        .select()
        .from(inventory)
        .where(
          eq(
            inventory.productId,
            product.id,
          ),
        ),

      this.db
        .select()
        .from(categories)
        .where(
          eq(
            categories.id,
            product.categoryId,
          ),
        )
        .limit(1),

      product.subcategoryId
        ? this.db
            .select()
            .from(categories)
            .where(
              eq(
                categories.id,
                product.subcategoryId,
              ),
            )
            .limit(1)
        : Promise.resolve([]),

      product.subsubcategoryId
        ? this.db
            .select()
            .from(categories)
            .where(
              eq(
                categories.id,
                product.subsubcategoryId,
              ),
            )
            .limit(1)
        : Promise.resolve([]),
    ]);

    const productInventory =
      inventoryRows.find(
        (row) =>
          row.variantId === null,
      ) ?? null;

    const inventoryByVariant =
      new Map(
        inventoryRows
          .filter(
            (row) =>
              row.variantId !== null,
          )
          .map((row) => [
            row.variantId,
            row,
          ]),
      );

    const variantsWithInventory =
      variants.map((variant) => ({
        ...variant,
        inventory:
          inventoryByVariant.get(
            variant.id,
          ) ?? null,
      }));

    return {
      ...product,
      images,
      variants:
        variantsWithInventory,
      inventory:
        productInventory,

      category:
        category ?? null,
      subcategory:
        subcategoryRows[0] ??
        null,
      subsubcategory:
        subsubcategoryRows[0] ??
        null,
    };
  }

  async findBestSellers(
    limit = 10,
  ): Promise<any[]> {
    const safeLimit =
      Number.isInteger(limit) &&
      limit > 0
        ? Math.min(limit, 50)
        : 10;

    // Keep the public list contract compatible while exposing
    // the complete explicit category path.
    const productList = await this.db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        description:
          products.description,
        shortDescription:
          products.shortDescription,

        categoryId:
          products.categoryId,
        categorySlug:
          categories.slug,
        categoryName:
          categories.name,

        subcategoryId:
          products.subcategoryId,
        subcategorySlug:
          productSubcategory.slug,
        subcategoryName:
          productSubcategory.name,

        subsubcategoryId:
          products.subsubcategoryId,
        subsubcategorySlug:
          productSubsubcategory.slug,
        subsubcategoryName:
          productSubsubcategory.name,

        priceCents:
          products.priceCents,
        compareAtPriceCents:
          products.compareAtPriceCents,
        currency:
          products.currency,
        badge:
          products.badge,
        occasions:
          products.occasions,
        isPersonalizable:
          products.isPersonalizable,
        personalizationPrompt:
          products.personalizationPrompt,
        ratingAvg:
          products.ratingAvg,
        ratingCount:
          products.ratingCount,
        createdAt:
          products.createdAt,
      })
      .from(products)
      .innerJoin(
        categories,
        eq(
          products.categoryId,
          categories.id,
        ),
      )
      .leftJoin(
        productSubcategory,
        eq(
          products.subcategoryId,
          productSubcategory.id,
        ),
      )
      .leftJoin(
        productSubsubcategory,
        eq(
          products.subsubcategoryId,
          productSubsubcategory.id,
        ),
      )
      .where(
        and(
          eq(
            products.isActive,
            true,
          ),
          eq(
            products.badge,
            'BEST_SELLER',
          ),
        ),
      )
      .orderBy(
        desc(
          products.ratingCount,
        ),
        desc(
          products.ratingAvg,
        ),
        desc(
          products.createdAt,
        ),
      )
      .limit(safeLimit);

    return this.attachPrimaryImages(
      productList,
    );
  }

  /**
   * Build the public product filter for a category slug.
   *
   * New explicit model:
   * - level 1 -> products.categoryId
   * - level 2 -> products.subcategoryId
   * - level 3 -> products.subsubcategoryId
   *
   * During the transition we also keep a legacy fallback for old products
   * whose previous category_id still contains their deepest category.
   * That fallback can be removed after the backfill is complete.
   */
  private async getCategoryFilterCondition(
    slug: string,
  ): Promise<SQL | null> {
    const context =
      await this.getActiveCategoryContext(
        slug,
      );

    if (!context) {
      return null;
    }

    if (context.level === 1) {
      const condition = or(
        // New explicit rows.
        eq(
          products.categoryId,
          context.id,
        ),

        // Legacy rows: category_id may still contain a level-2 or
        // level-3 descendant while the new columns are null.
        and(
          isNull(
            products.subcategoryId,
          ),
          inArray(
            products.categoryId,
            context.subtreeIds,
          ),
        ),
      );

      return condition ?? null;
    }

    if (context.level === 2) {
      const condition = or(
        // New explicit rows.
        eq(
          products.subcategoryId,
          context.id,
        ),

        // Legacy rows: category_id may be this level-2 category
        // or one of its level-3 descendants.
        and(
          isNull(
            products.subcategoryId,
          ),
          inArray(
            products.categoryId,
            context.subtreeIds,
          ),
        ),
      );

      return condition ?? null;
    }

    const condition = or(
      // New explicit rows.
      eq(
        products.subsubcategoryId,
        context.id,
      ),

      // Legacy level-3 rows.
      and(
        isNull(
          products.subcategoryId,
        ),
        isNull(
          products.subsubcategoryId,
        ),
        eq(
          products.categoryId,
          context.id,
        ),
      ),
    );

    return condition ?? null;
  }

  /**
   * Resolve an active category slug, determine its hierarchy level and
   * collect its active subtree for the temporary legacy fallback.
   *
   * The public catalogue supports exactly three category levels.
   */
  private async getActiveCategoryContext(
    slug: string,
  ): Promise<ActiveCategoryContext | null> {
    const normalizedSlug = slug
      .trim()
      .toLowerCase();

    const activeCategories =
      await this.db
        .select({
          id: categories.id,
          slug: categories.slug,
          parentId:
            categories.parentId,
        })
        .from(categories)
        .where(
          eq(
            categories.isActive,
            true,
          ),
        );

    const selected =
      activeCategories.find(
        (category) =>
          category.slug ===
          normalizedSlug,
      );

    if (!selected) {
      return null;
    }

    const byId = new Map(
      activeCategories.map(
        (category) => [
          category.id,
          category,
        ],
      ),
    );

    let level: 1 | 2 | 3;

    if (
      selected.parentId === null
    ) {
      level = 1;
    } else {
      const parent =
        byId.get(
          selected.parentId,
        );

      if (!parent) {
        return null;
      }

      if (
        parent.parentId === null
      ) {
        level = 2;
      } else {
        const grandparent =
          byId.get(
            parent.parentId,
          );

        if (
          !grandparent ||
          grandparent.parentId !==
            null
        ) {
          // Invalid/deeper hierarchy must not be exposed publicly.
          return null;
        }

        level = 3;
      }
    }

    const childrenByParent =
      new Map<string, string[]>();

    for (const category of
      activeCategories) {
      if (!category.parentId) {
        continue;
      }

      const children =
        childrenByParent.get(
          category.parentId,
        ) ?? [];

      children.push(category.id);

      childrenByParent.set(
        category.parentId,
        children,
      );
    }

    const subtreeIds:
      string[] = [];
    const visited =
      new Set<string>();
    const queue = [selected.id];

    while (queue.length > 0) {
      const currentId =
        queue.shift();

      if (
        !currentId ||
        visited.has(currentId)
      ) {
        continue;
      }

      visited.add(currentId);
      subtreeIds.push(
        currentId,
      );

      const children =
        childrenByParent.get(
          currentId,
        ) ?? [];

      for (const childId of children) {
        if (
          !visited.has(childId)
        ) {
          queue.push(childId);
        }
      }
    }

    return {
      id: selected.id,
      level,
      subtreeIds,
    };
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
    if (
      productList.length === 0
    ) {
      return [];
    }

    const productIds =
      productList.map(
        (product) =>
          product.id,
      );

    const images =
      await this.db
        .select({
          productId:
            productImages.productId,
          url:
            productImages.url,
          altText:
            productImages.altText,
          isPrimary:
            productImages.isPrimary,
          sortOrder:
            productImages.sortOrder,
          variantId:
            productImages.variantId,
          createdAt:
            productImages.createdAt,
        })
        .from(productImages)
        .where(
          inArray(
            productImages.productId,
            productIds,
          ),
        )
        .orderBy(
          desc(
            productImages.isPrimary,
          ),
          asc(
            productImages.sortOrder,
          ),
          asc(
            productImages.createdAt,
          ),
        );

    const imagesByProduct =
      new Map<
        string,
        Array<{
          url: string;
          altText: string | null;
          variantId: string | null;
        }>
      >();

    for (const image of images) {
      const list =
        imagesByProduct.get(
          image.productId,
        ) ?? [];

      list.push({
        url: image.url,
        altText:
          image.altText,
        variantId:
          image.variantId,
      });

      imagesByProduct.set(
        image.productId,
        list,
      );
    }

    return productList.map(
      (product) => {
        const candidates =
          imagesByProduct.get(
            product.id,
          ) ?? [];

        // A catalogue card has no selected variant, so prefer a
        // general product image. Fall back only if none exists.
        const image =
          candidates.find(
            (candidate) =>
              candidate.variantId ===
              null,
          ) ??
          candidates[0];

        return {
          ...product,
          imageUrl:
            image?.url ?? null,
          imageAlt:
            image?.altText ??
            null,
        };
      },
    );
  }

  private getSort(
    sort?: string,
  ) {
    switch (sort) {
      case 'price_asc':
        return [
          asc(
            products.priceCents,
          ),
          desc(
            products.createdAt,
          ),
        ];

      case 'price_desc':
        return [
          desc(
            products.priceCents,
          ),
          desc(
            products.createdAt,
          ),
        ];

      case 'rating':
        return [
          desc(
            products.ratingAvg,
          ),
          desc(
            products.ratingCount,
          ),
          desc(
            products.createdAt,
          ),
        ];

      case 'oldest':
        return [
          asc(
            products.createdAt,
          ),
        ];

      case 'newest':
      default:
        return [
          desc(
            products.createdAt,
          ),
        ];
    }
  }
}
