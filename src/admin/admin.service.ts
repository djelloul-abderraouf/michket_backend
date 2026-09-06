import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  sql,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../database/schema';
import {
  categories,
  inventory,
  orders,
  productImages,
  products,
  productVariants,
  users,
} from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import { OrdersService } from '../orders/orders.service';

type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

type UserRole = 'customer' | 'admin' | 'super_admin';

type ProductBadge =
  | 'BEST_SELLER'
  | 'NOUVEAU'
  | 'PROMO'
  | 'PERSONNALISABLE'
  | 'ENVOI_GRATUIT';

type InventoryInput = {
  quantity: number;
  lowStockThreshold?: number;
  trackInventory?: boolean;
};

type ProductImageInput = {
  url: string;
  storagePath: string;
  altText?: string;
  sortOrder?: number;
  isPrimary?: boolean;
};

type ProductVariantInput = {
  name: string;
  sku?: string;
  colorName?: string;
  colorHex?: string;
  priceCents?: number;
  options?: Record<string, unknown>;
  sortOrder?: number;
  isActive?: boolean;
  inventory?: InventoryInput;
};

export type CreateAdminProductInput = {
  name: string;
  slug: string;
  categoryId: string;
  description?: string;
  shortDescription?: string;
  priceCents: number;
  compareAtPriceCents?: number;
  badge?: ProductBadge;
  occasions?: string[];
  isActive?: boolean;
  isPersonalizable?: boolean;
  personalizationPrompt?: string;
  personalizationConfig?: Record<string, unknown>;
  metaTitle?: string;
  metaDescription?: string;
  images?: ProductImageInput[];
  variants?: ProductVariantInput[];
  inventory?: InventoryInput;
};

export type UpdateAdminProductInput = Partial<
  Omit<CreateAdminProductInput, 'images' | 'variants' | 'inventory'>
>;

export type UpdateAdminInventoryInput = {
  variantId?: string;
  quantity: number;
  lowStockThreshold?: number;
  trackInventory?: boolean;
};

export type CreateAdminCategoryInput = {
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  href?: string;
  parentId?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  metaTitle?: string;
  metaDescription?: string;
};

export type UpdateAdminCategoryInput =
  Partial<CreateAdminCategoryInput>;

const ORDER_STATUSES: readonly OrderStatus[] = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
];

@Injectable()
export class AdminService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly ordersService: OrdersService,
  ) {}

  async getDashboard() {
    const [
      [ordersCount],
      [revenueResult],
      [productsCount],
      [usersCount],
    ] = await Promise.all([
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders),

      this.db
        .select({
          total: sql<number>`
            coalesce(
              sum(${orders.totalCents})
              filter (where ${orders.status} = 'delivered'),
              0
            )::int
          `,
        })
        .from(orders),

      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(products)
        .where(eq(products.isActive, true)),

      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(users),
    ]);

    return {
      totalOrders: ordersCount?.count ?? 0,
      totalRevenueCents: revenueResult?.total ?? 0,
      currency: 'DZD',
      totalProducts: productsCount?.count ?? 0,
      totalUsers: usersCount?.count ?? 0,
    };
  }

  async getAllOrders(
    page = 1,
    limit = 20,
    status?: string,
  ) {
    const safePage = this.normalizePage(page);
    const safeLimit = this.normalizeLimit(limit);

    let where: ReturnType<typeof eq> | undefined;

    if (status) {
      if (!this.isOrderStatus(status)) {
        throw new BadRequestException(
          `Invalid order status "${status}"`,
        );
      }

      where = eq(orders.status, status);
    }

    const countQuery = this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders);

    const dataQuery = this.db.select().from(orders);

    const [countResult] = where
      ? await countQuery.where(where)
      : await countQuery;

    const rows = where
      ? await dataQuery
          .where(where)
          .orderBy(desc(orders.createdAt))
          .limit(safeLimit)
          .offset((safePage - 1) * safeLimit)
      : await dataQuery
          .orderBy(desc(orders.createdAt))
          .limit(safeLimit)
          .offset((safePage - 1) * safeLimit);

    const data = rows.map(
      ({ guestAccessTokenHash: _guestAccessTokenHash, ...order }) => order,
    );

    const total = countResult?.count ?? 0;

    return {
      data,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async updateOrderStatus(
    orderId: string,
    status: string,
    reason?: string,
    changedByUserId?: string,
  ) {
    return this.ordersService.updateStatus(
      orderId,
      status,
      reason,
      changedByUserId,
    );
  }

  async getAllCategories(
    page = 1,
    limit = 50,
  ) {
    const safePage = this.normalizePage(page);
    const safeLimit = this.normalizeLimit(limit);

    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(categories);

    const data = await this.db
      .select()
      .from(categories)
      .orderBy(
        asc(categories.sortOrder),
        asc(categories.name),
      )
      .limit(safeLimit)
      .offset((safePage - 1) * safeLimit);

    const total = countResult?.count ?? 0;

    return {
      data,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async createCategory(
    input: CreateAdminCategoryInput,
  ) {
    const name = input.name.trim();
    const slug = input.slug.trim().toLowerCase();

    if (!name) {
      throw new BadRequestException(
        'Category name is required',
      );
    }

    if (!slug) {
      throw new BadRequestException(
        'Category slug is required',
      );
    }

    await this.assertCategorySlugAvailable(slug);

    if (input.parentId) {
      await this.assertValidCategoryParent(
        undefined,
        input.parentId,
      );
    }

    try {
      const [created] = await this.db
        .insert(categories)
        .values({
          name,
          slug,
          description:
            input.description?.trim() || null,
          imageUrl: input.imageUrl?.trim() || null,
          href: input.href?.trim() || null,
          parentId: input.parentId ?? null,
          isActive: input.isActive ?? true,
          sortOrder: input.sortOrder ?? 0,
          metaTitle:
            input.metaTitle?.trim() || null,
          metaDescription:
            input.metaDescription?.trim() || null,
        })
        .returning();

      return created;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'Category slug already exists',
        );
      }

      throw error;
    }
  }

  async updateCategory(
    categoryId: string,
    input: UpdateAdminCategoryInput,
  ) {
    const [existing] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(
        'Category not found',
      );
    }

    if (input.slug !== undefined) {
      const slug = input.slug
        .trim()
        .toLowerCase();

      if (!slug) {
        throw new BadRequestException(
          'Category slug is required',
        );
      }

      await this.assertCategorySlugAvailable(
        slug,
        categoryId,
      );
    }

    if (
      input.name !== undefined &&
      !input.name.trim()
    ) {
      throw new BadRequestException(
        'Category name is required',
      );
    }

    if (
      input.parentId !== undefined &&
      input.parentId !== null
    ) {
      await this.assertValidCategoryParent(
        categoryId,
        input.parentId,
      );
    }

    if (input.isActive === false) {
      await this.assertCategoryCanBeDeactivated(
        categoryId,
      );
    }

    const updateData: Partial<
      typeof categories.$inferInsert
    > = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) {
      updateData.name = input.name.trim();
    }

    if (input.slug !== undefined) {
      updateData.slug = input.slug
        .trim()
        .toLowerCase();
    }

    if (input.description !== undefined) {
      updateData.description =
        input.description.trim() || null;
    }

    if (input.imageUrl !== undefined) {
      updateData.imageUrl =
        input.imageUrl.trim() || null;
    }

    if (input.href !== undefined) {
      updateData.href =
        input.href.trim() || null;
    }

    if (input.parentId !== undefined) {
      updateData.parentId = input.parentId;
    }

    if (input.isActive !== undefined) {
      updateData.isActive = input.isActive;
    }

    if (input.sortOrder !== undefined) {
      updateData.sortOrder = input.sortOrder;
    }

    if (input.metaTitle !== undefined) {
      updateData.metaTitle =
        input.metaTitle.trim() || null;
    }

    if (input.metaDescription !== undefined) {
      updateData.metaDescription =
        input.metaDescription.trim() || null;
    }

    try {
      const [updated] = await this.db
        .update(categories)
        .set(updateData)
        .where(eq(categories.id, categoryId))
        .returning();

      return updated;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'Category slug already exists',
        );
      }

      throw error;
    }
  }

  async deleteCategory(
    categoryId: string,
  ) {
    const [existing] = await this.db
      .select({
        id: categories.id,
        isActive: categories.isActive,
      })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(
        'Category not found',
      );
    }

    if (!existing.isActive) {
      return {
        success: true,
        id: existing.id,
        alreadyInactive: true,
      };
    }

    await this.assertCategoryCanBeDeactivated(
      categoryId,
    );

    const [updated] = await this.db
      .update(categories)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(categories.id, categoryId))
      .returning({
        id: categories.id,
        isActive: categories.isActive,
      });

    return {
      success: true,
      ...updated,
    };
  }

  async getAllProducts(
    page = 1,
    limit = 20,
  ) {
    const safePage = this.normalizePage(page);
    const safeLimit = this.normalizeLimit(limit);

    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(products);

    const rows = await this.db
      .select()
      .from(products)
      .orderBy(desc(products.createdAt))
      .limit(safeLimit)
      .offset((safePage - 1) * safeLimit);

    const primaryImages =
      await this.getPrimaryImages(
        rows.map((product) => product.id),
      );

    const data = rows.map((product) => ({
      ...product,
      imageUrl:
        primaryImages.get(product.id)?.url ?? null,
      imageStoragePath:
        primaryImages.get(product.id)?.storagePath ?? null,
      imageAlt:
        primaryImages.get(product.id)?.altText ?? null,
    }));

    const total = countResult?.count ?? 0;

    return {
      data,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async createProduct(
    input: CreateAdminProductInput,
  ) {
    this.validateProductPrices(input);
    await this.assertCategoryExists(
      input.categoryId,
    );

    const variants = input.variants ?? [];

    if (
      variants.length > 0 &&
      input.inventory
    ) {
      throw new BadRequestException(
        'Product-level inventory cannot be used when variants exist',
      );
    }

    return this.db.transaction(async (tx) => {
      try {
        const [product] = await tx
          .insert(products)
          .values({
            name: input.name.trim(),
            slug: input.slug.trim(),
            categoryId: input.categoryId,
            description:
              input.description?.trim() || null,
            shortDescription:
              input.shortDescription?.trim() || null,
            priceCents: input.priceCents,
            compareAtPriceCents:
              input.compareAtPriceCents ?? null,
            currency: 'DZD',
            badge: input.badge ?? null,
            occasions: input.occasions ?? null,
            isActive: input.isActive ?? true,
            isPersonalizable:
              input.isPersonalizable ?? false,
            personalizationPrompt:
              input.personalizationPrompt?.trim() ||
              null,
            personalizationConfig:
              input.personalizationConfig ?? null,
            metaTitle:
              input.metaTitle?.trim() || null,
            metaDescription:
              input.metaDescription?.trim() ||
              null,
          })
          .returning();

        const normalizedImages =
          this.normalizeImages(
            input.images ?? [],
          );

        if (normalizedImages.length > 0) {
          await tx
            .insert(productImages)
            .values(
              normalizedImages.map((image) => ({
                productId: product.id,
                url: image.url,
                storagePath:
                  image.storagePath,
                altText:
                  image.altText ?? null,
                sortOrder:
                  image.sortOrder,
                isPrimary:
                  image.isPrimary,
              })),
            );
        }

        for (const variantInput of variants) {
          this.validateVariant(variantInput);

          const [variant] = await tx
            .insert(productVariants)
            .values({
              productId: product.id,
              name: variantInput.name.trim(),
              sku:
                variantInput.sku?.trim() ||
                null,
              colorName:
                variantInput.colorName?.trim() ||
                null,
              colorHex:
                variantInput.colorHex?.trim() ||
                null,
              priceCents:
                variantInput.priceCents ?? null,
              options:
                variantInput.options ?? null,
              sortOrder:
                variantInput.sortOrder ?? 0,
              isActive:
                variantInput.isActive ?? true,
            })
            .returning();

          if (variantInput.inventory) {
            this.validateInventory(
              variantInput.inventory,
            );

            await tx
              .insert(inventory)
              .values({
                productId: product.id,
                variantId: variant.id,
                quantity:
                  variantInput.inventory
                    .quantity,
                lowStockThreshold:
                  variantInput.inventory
                    .lowStockThreshold ?? 5,
                trackInventory:
                  variantInput.inventory
                    .trackInventory ?? true,
              });
          }
        }

        if (
          variants.length === 0 &&
          input.inventory
        ) {
          this.validateInventory(
            input.inventory,
          );

          await tx
            .insert(inventory)
            .values({
              productId: product.id,
              variantId: null,
              quantity:
                input.inventory.quantity,
              lowStockThreshold:
                input.inventory
                  .lowStockThreshold ?? 5,
              trackInventory:
                input.inventory
                  .trackInventory ?? true,
            });
        }

        return {
          ...product,
          images: normalizedImages,
          variantCount: variants.length,
        };
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          throw new ConflictException(
            'Product slug or variant SKU already exists',
          );
        }

        throw error;
      }
    });
  }

  async updateProduct(
    productId: string,
    input: UpdateAdminProductInput,
  ) {
    const [existing] = await this.db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(
        'Product not found',
      );
    }

    if (input.categoryId) {
      await this.assertCategoryExists(
        input.categoryId,
      );
    }

    this.validateProductPrices({
      priceCents:
        input.priceCents ??
        existing.priceCents,
      compareAtPriceCents:
        input.compareAtPriceCents ??
        existing.compareAtPriceCents ??
        undefined,
    });

    const updateData: Partial<
      typeof products.$inferInsert
    > = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) {
      updateData.name = input.name.trim();
    }

    if (input.slug !== undefined) {
      updateData.slug = input.slug.trim();
    }

    if (input.categoryId !== undefined) {
      updateData.categoryId =
        input.categoryId;
    }

    if (input.description !== undefined) {
      updateData.description =
        input.description.trim() || null;
    }

    if (
      input.shortDescription !== undefined
    ) {
      updateData.shortDescription =
        input.shortDescription.trim() ||
        null;
    }

    if (input.priceCents !== undefined) {
      updateData.priceCents =
        input.priceCents;
    }

    if (
      input.compareAtPriceCents !== undefined
    ) {
      updateData.compareAtPriceCents =
        input.compareAtPriceCents;
    }

    if (input.badge !== undefined) {
      updateData.badge = input.badge;
    }

    if (input.occasions !== undefined) {
      updateData.occasions =
        input.occasions;
    }

    if (input.isActive !== undefined) {
      updateData.isActive =
        input.isActive;
    }

    if (
      input.isPersonalizable !== undefined
    ) {
      updateData.isPersonalizable =
        input.isPersonalizable;
    }

    if (
      input.personalizationPrompt !== undefined
    ) {
      updateData.personalizationPrompt =
        input.personalizationPrompt.trim() ||
        null;
    }

    if (
      input.personalizationConfig !== undefined
    ) {
      updateData.personalizationConfig =
        input.personalizationConfig;
    }

    if (input.metaTitle !== undefined) {
      updateData.metaTitle =
        input.metaTitle.trim() || null;
    }

    if (
      input.metaDescription !== undefined
    ) {
      updateData.metaDescription =
        input.metaDescription.trim() ||
        null;
    }

    try {
      const [updated] = await this.db
        .update(products)
        .set(updateData)
        .where(eq(products.id, productId))
        .returning();

      return updated;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'Product slug already exists',
        );
      }

      throw error;
    }
  }

  async deleteProduct(
    productId: string,
  ) {
    const [product] = await this.db
      .update(products)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId))
      .returning();

    if (!product) {
      throw new NotFoundException(
        'Product not found',
      );
    }

    await this.db
      .update(productVariants)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        eq(
          productVariants.productId,
          productId,
        ),
      );

    return {
      success: true,
      id: product.id,
    };
  }

  async updateInventory(
    productId: string,
    input: UpdateAdminInventoryInput,
  ) {
    this.validateInventory(input);

    const [product] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (!product) {
      throw new NotFoundException(
        'Product not found',
      );
    }

    if (input.variantId) {
      const [variant] = await this.db
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(
          and(
            eq(
              productVariants.id,
              input.variantId,
            ),
            eq(
              productVariants.productId,
              productId,
            ),
          ),
        )
        .limit(1);

      if (!variant) {
        throw new BadRequestException(
          'Variant does not belong to this product',
        );
      }
    }

    return this.db.transaction(
      async (tx) => {
        const condition =
          input.variantId
            ? and(
                eq(
                  inventory.productId,
                  productId,
                ),
                eq(
                  inventory.variantId,
                  input.variantId,
                ),
              )
            : and(
                eq(
                  inventory.productId,
                  productId,
                ),
                isNull(
                  inventory.variantId,
                ),
              );

        const [existing] = await tx
          .select()
          .from(inventory)
          .where(condition)
          .for('update')
          .limit(1);

        if (existing) {
          if (
            existing.reserved >
            input.quantity
          ) {
            throw new BadRequestException(
              `Quantity cannot be lower than currently reserved stock (${existing.reserved})`,
            );
          }

          const [updated] = await tx
            .update(inventory)
            .set({
              quantity: input.quantity,
              lowStockThreshold:
                input.lowStockThreshold ??
                existing.lowStockThreshold,
              trackInventory:
                input.trackInventory ??
                existing.trackInventory,
              updatedAt: new Date(),
            })
            .where(
              eq(
                inventory.id,
                existing.id,
              ),
            )
            .returning();

          return updated;
        }

        const [created] = await tx
          .insert(inventory)
          .values({
            productId,
            variantId:
              input.variantId ?? null,
            quantity: input.quantity,
            lowStockThreshold:
              input.lowStockThreshold ?? 5,
            trackInventory:
              input.trackInventory ?? true,
          })
          .returning();

        return created;
      },
    );
  }

  async getAllUsers(
    page = 1,
    limit = 20,
  ) {
    const safePage = this.normalizePage(page);
    const safeLimit = this.normalizeLimit(limit);

    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);

    const data = await this.db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(safeLimit)
      .offset((safePage - 1) * safeLimit);

    const total = countResult?.count ?? 0;

    return {
      data,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async changeUserRole(
    userId: string,
    role: UserRole,
  ) {
    const [updated] = await this.db
      .update(users)
      .set({
        role,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
      });

    if (!updated) {
      throw new NotFoundException(
        'User not found',
      );
    }

    return updated;
  }

  private async assertCategorySlugAvailable(
    slug: string,
    excludeCategoryId?: string,
  ): Promise<void> {
    const [existing] = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, slug))
      .limit(1);

    if (
      existing &&
      existing.id !== excludeCategoryId
    ) {
      throw new ConflictException(
        'Category slug already exists',
      );
    }
  }

  private async assertValidCategoryParent(
    categoryId: string | undefined,
    parentId: string,
  ): Promise<void> {
    if (
      categoryId &&
      categoryId === parentId
    ) {
      throw new BadRequestException(
        'A category cannot be its own parent',
      );
    }

    let currentId: string | null =
      parentId;
    const visited = new Set<string>();

    while (currentId) {
      if (visited.has(currentId)) {
        throw new BadRequestException(
          'Invalid category hierarchy',
        );
      }

      visited.add(currentId);

      if (
        categoryId &&
        currentId === categoryId
      ) {
        throw new BadRequestException(
          'Category hierarchy would create a cycle',
        );
      }

      const [current] = await this.db
        .select({
          id: categories.id,
          parentId: categories.parentId,
          isActive: categories.isActive,
        })
        .from(categories)
        .where(
          eq(
            categories.id,
            currentId,
          ),
        )
        .limit(1);

      if (
        !current ||
        !current.isActive
      ) {
        throw new BadRequestException(
          'Parent category does not exist or is inactive',
        );
      }

      currentId = current.parentId;
    }
  }

  private async assertCategoryCanBeDeactivated(
    categoryId: string,
  ): Promise<void> {
    const [[productUsage], [childUsage]] =
      await Promise.all([
        this.db
          .select({
            count: sql<number>`count(*)::int`,
          })
          .from(products)
          .where(
            and(
              eq(
                products.categoryId,
                categoryId,
              ),
              eq(
                products.isActive,
                true,
              ),
            ),
          ),

        this.db
          .select({
            count: sql<number>`count(*)::int`,
          })
          .from(categories)
          .where(
            and(
              eq(
                categories.parentId,
                categoryId,
              ),
              eq(
                categories.isActive,
                true,
              ),
            ),
          ),
      ]);

    if (
      (productUsage?.count ?? 0) > 0
    ) {
      throw new ConflictException(
        'Category cannot be deactivated while active products use it',
      );
    }

    if (
      (childUsage?.count ?? 0) > 0
    ) {
      throw new ConflictException(
        'Category cannot be deactivated while active child categories use it',
      );
    }
  }

  private isUniqueViolation(
    error: unknown,
  ): boolean {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code ===
        '23505'
    ) {
      return true;
    }

    return (
      error instanceof Error &&
      error.message
        .toLowerCase()
        .includes('unique')
    );
  }

  private async assertCategoryExists(
    categoryId: string,
  ): Promise<void> {
    const [category] = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(
            categories.id,
            categoryId,
          ),
          eq(
            categories.isActive,
            true,
          ),
        ),
      )
      .limit(1);

    if (!category) {
      throw new BadRequestException(
        'Category does not exist or is inactive',
      );
    }
  }

  private async getPrimaryImages(
    productIds: string[],
  ) {
    const result = new Map<
      string,
      {
        url: string;
        storagePath: string | null;
        altText: string | null;
      }
    >();

    if (productIds.length === 0) {
      return result;
    }

    const images = await this.db
      .select({
        productId:
          productImages.productId,
        url: productImages.url,
        storagePath:
          productImages.storagePath,
        altText: productImages.altText,
        isPrimary:
          productImages.isPrimary,
        sortOrder:
          productImages.sortOrder,
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
        productImages.sortOrder,
      );

    for (const image of images) {
      if (
        !result.has(image.productId)
      ) {
        result.set(
          image.productId,
          {
            url: image.url,
            storagePath:
              image.storagePath,
            altText: image.altText,
          },
        );
      }
    }

    return result;
  }

  private normalizeImages(
    images: ProductImageInput[],
  ) {
    if (images.length === 0) {
      return [];
    }

    const requestedPrimaryIndex =
      images.findIndex(
        (image) => image.isPrimary === true,
      );

    const primaryIndex =
      requestedPrimaryIndex >= 0
        ? requestedPrimaryIndex
        : 0;

    return images.map(
      (image, index) => {
        const url = image.url.trim();
        const storagePath =
          image.storagePath.trim();

        if (!url) {
          throw new BadRequestException(
            'Product image URL is required',
          );
        }

        if (!storagePath) {
          throw new BadRequestException(
            'Product image storagePath is required',
          );
        }

        return {
          url,
          storagePath,
          altText:
            image.altText?.trim() ||
            undefined,
          sortOrder:
            image.sortOrder ?? index,
          isPrimary:
            index === primaryIndex,
        };
      },
    );
  }

  private validateProductPrices(
    input: {
      priceCents: number;
      compareAtPriceCents?: number;
    },
  ): void {
    if (
      !Number.isInteger(
        input.priceCents,
      ) ||
      input.priceCents < 0
    ) {
      throw new BadRequestException(
        'Product price must be a non-negative integer',
      );
    }

    if (
      input.compareAtPriceCents !==
        undefined &&
      (
        !Number.isInteger(
          input.compareAtPriceCents,
        ) ||
        input.compareAtPriceCents < 0
      )
    ) {
      throw new BadRequestException(
        'Compare-at price must be a non-negative integer',
      );
    }
  }

  private validateVariant(
    variant: ProductVariantInput,
  ): void {
    if (!variant.name?.trim()) {
      throw new BadRequestException(
        'Variant name is required',
      );
    }

    if (
      variant.priceCents !== undefined &&
      (
        !Number.isInteger(
          variant.priceCents,
        ) ||
        variant.priceCents < 0
      )
    ) {
      throw new BadRequestException(
        'Variant price must be a non-negative integer',
      );
    }
  }

  private validateInventory(
    input: InventoryInput,
  ): void {
    if (
      !Number.isInteger(
        input.quantity,
      ) ||
      input.quantity < 0
    ) {
      throw new BadRequestException(
        'Inventory quantity must be a non-negative integer',
      );
    }

    if (
      input.lowStockThreshold !==
        undefined &&
      (
        !Number.isInteger(
          input.lowStockThreshold,
        ) ||
        input.lowStockThreshold < 0
      )
    ) {
      throw new BadRequestException(
        'Low stock threshold must be a non-negative integer',
      );
    }
  }

  private normalizePage(
    page: number,
  ): number {
    return (
      Number.isInteger(page) &&
      page > 0
    )
      ? page
      : 1;
  }

  private normalizeLimit(
    limit: number,
  ): number {
    return (
      Number.isInteger(limit) &&
      limit > 0
    )
      ? Math.min(limit, 100)
      : 20;
  }

  private isOrderStatus(
    status: string,
  ): status is OrderStatus {
    return ORDER_STATUSES.includes(
      status as OrderStatus,
    );
  }
}
