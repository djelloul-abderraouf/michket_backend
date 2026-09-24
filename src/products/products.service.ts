import {
  BadRequestException,
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

  async findAllForCrm() {
    const productList = await this.db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        shortDescription: products.shortDescription,
        categoryId: products.categoryId,
        categorySlug: categories.slug,
        categoryName: categories.name,
        priceCents: products.priceCents,
        isActive: products.isActive,
        isPersonalizable: products.isPersonalizable,
        createdAt: products.createdAt,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .orderBy(desc(products.createdAt));

    const withImages = await this.attachPrimaryImages(productList);
    if (withImages.length === 0) {
      return [];
    }

    const variantRows = await this.db
      .select({
        id: productVariants.id,
        productId: productVariants.productId,
        name: productVariants.name,
        colorName: productVariants.colorName,
        colorHex: productVariants.colorHex,
        isActive: productVariants.isActive,
        sortOrder: productVariants.sortOrder,
      })
      .from(productVariants)
      .where(
        inArray(
          productVariants.productId,
          withImages.map((product) => product.id),
        ),
      )
      .orderBy(asc(productVariants.sortOrder), asc(productVariants.name));

    return withImages.map((product) => ({
      ...product,
      variants: variantRows.filter(
        (variant) => variant.productId === product.id && variant.isActive,
      ),
    }));
  }

  async setActive(id: string, isActive: boolean) {
    const [product] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const [updated] = await this.db
      .update(products)
      .set({
        isActive,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id))
      .returning({
        id: products.id,
        name: products.name,
        isActive: products.isActive,
      });

    return updated;
  }

  async listCategoriesForCrm() {
    return this.db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        imageUrl: categories.imageUrl,
        imageStoragePath: categories.imageStoragePath,
        href: categories.href,
        parentId: categories.parentId,
        isActive: categories.isActive,
        sortOrder: categories.sortOrder,
        metaTitle: categories.metaTitle,
        metaDescription: categories.metaDescription,
        pageTitle: categories.pageTitle,
        productsTitle: categories.productsTitle,
        filterLabel: categories.filterLabel,
      })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name));
  }

  async createCategoryForCrm(data: {
    name: string;
    slug?: string;
    description?: string;
    imageUrl?: string;
    imageStoragePath?: string;
    href?: string;
    parentId?: string;
    isActive?: boolean;
    sortOrder?: number;
    metaTitle?: string;
    metaDescription?: string;
    pageTitle?: string;
    productsTitle?: string;
    filterLabel?: string;
  }) {
    const name = data.name.trim();
    if (!name) {
      throw new BadRequestException('Nom de categorie requis');
    }

    const [existing] = await this.db
      .select()
      .from(categories)
      .where(sql`lower(${categories.name}) = ${name.toLowerCase()}`)
      .limit(1);

    if (existing) {
      return this.mapCrmCategory(existing);
    }

    if (data.parentId) {
      await this.assertCategory(data.parentId);
    }

    const slug = await this.uniqueCategorySlug(name, data.slug);
    const href = data.href?.trim() || `/${slug}`;

    const [created] = await this.db
      .insert(categories)
      .values({
        name,
        slug,
        description: data.description?.trim() || null,
        imageUrl: data.imageUrl?.trim() || null,
        imageStoragePath: data.imageStoragePath?.trim() || null,
        href,
        parentId: data.parentId || null,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 0,
        metaTitle: data.metaTitle?.trim() || null,
        metaDescription: data.metaDescription?.trim() || null,
        pageTitle: data.pageTitle?.trim() || null,
        productsTitle: data.productsTitle?.trim() || null,
        filterLabel: data.filterLabel?.trim() || null,
      })
      .returning();

    return this.mapCrmCategory(created);
  }

  async createForCrm(data: {
    name: string;
    categoryId: string;
    priceCents: number;
    shortDescription?: string;
    description?: string;
    photoUrl?: string;
    storagePath?: string;
    isActive?: boolean;
    isPersonalizable?: boolean;
  }) {
    await this.assertCategory(data.categoryId);

    const [created] = await this.db
      .insert(products)
      .values({
        name: data.name.trim(),
        slug: this.uniqueSlug(data.name),
        shortDescription: data.shortDescription?.trim() || null,
        description: data.description?.trim() || null,
        categoryId: data.categoryId,
        priceCents: data.priceCents,
        isActive: data.isActive ?? true,
        isPersonalizable: data.isPersonalizable ?? false,
      })
      .returning();

    if (data.photoUrl?.trim()) {
      await this.db.insert(productImages).values({
        productId: created.id,
        url: data.photoUrl.trim(),
        storagePath: data.storagePath?.trim() || null,
        altText: created.name,
        isPrimary: true,
        sortOrder: 0,
      });
    }

    await this.db.insert(inventory).values({
      productId: created.id,
      quantity: 0,
      reserved: 0,
    });

    return created;
  }

  async updateForCrm(
    id: string,
    data: {
      name?: string;
      categoryId?: string;
      priceCents?: number;
      shortDescription?: string;
      description?: string;
      photoUrl?: string;
      storagePath?: string;
      isActive?: boolean;
      isPersonalizable?: boolean;
    },
  ) {
    const existing = await this.db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!existing[0]) {
      throw new NotFoundException('Product not found');
    }

    if (data.categoryId) {
      await this.assertCategory(data.categoryId);
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) {
      patch.name = data.name.trim();
    }
    if (data.categoryId !== undefined) {
      patch.categoryId = data.categoryId;
    }
    if (data.priceCents !== undefined) {
      patch.priceCents = data.priceCents;
    }
    if (data.shortDescription !== undefined) {
      patch.shortDescription = data.shortDescription.trim() || null;
    }
    if (data.description !== undefined) {
      patch.description = data.description.trim() || null;
    }
    if (data.isActive !== undefined) {
      patch.isActive = data.isActive;
    }
    if (data.isPersonalizable !== undefined) {
      patch.isPersonalizable = data.isPersonalizable;
    }

    const [updated] = await this.db
      .update(products)
      .set(patch)
      .where(eq(products.id, id))
      .returning();

    if (data.photoUrl !== undefined) {
      const url = data.photoUrl.trim();
      const [primary] = await this.db
        .select({ id: productImages.id })
        .from(productImages)
        .where(
          and(
            eq(productImages.productId, id),
            eq(productImages.isPrimary, true),
          ),
        )
        .limit(1);

      if (url && primary) {
        await this.db
          .update(productImages)
          .set({
            url,
            storagePath: data.storagePath?.trim() || undefined,
            altText: updated.name,
          })
          .where(eq(productImages.id, primary.id));
      } else if (url) {
        await this.db.insert(productImages).values({
          productId: id,
          url,
          storagePath: data.storagePath?.trim() || null,
          altText: updated.name,
          isPrimary: true,
          sortOrder: 0,
        });
      }
    }

    return updated;
  }

  async deleteForCrm(id: string) {
    const [existing] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    await this.db.delete(products).where(eq(products.id, id));
  }

  private async assertCategory(categoryId: string) {
    const [category] = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1);

    if (!category) {
      throw new NotFoundException('Categorie introuvable');
    }
  }

  private mapCrmCategory(category: typeof categories.$inferSelect) {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      imageUrl: category.imageUrl,
      imageStoragePath: category.imageStoragePath,
      href: category.href,
      parentId: category.parentId,
      isActive: category.isActive,
      sortOrder: category.sortOrder,
      metaTitle: category.metaTitle,
      metaDescription: category.metaDescription,
      pageTitle: category.pageTitle,
      productsTitle: category.productsTitle,
      filterLabel: category.filterLabel,
    };
  }

  private cleanSlug(value: string, fallback = 'categorie') {
    return (
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || fallback
    );
  }

  private async uniqueCategorySlug(name: string, preferred?: string) {
    const base = this.cleanSlug(preferred || name);
    let slug = base;
    let suffix = 2;

    while (true) {
      const [found] = await this.db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.slug, slug))
        .limit(1);
      if (!found) {
        return slug;
      }
      slug = `${base}-${suffix}`;
      suffix += 1;
    }
  }

  private uniqueSlug(name: string) {
    const base = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'produit';
    return `${base}-${Date.now().toString(36)}`;
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
