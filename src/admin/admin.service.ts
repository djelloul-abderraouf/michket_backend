import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../database/schema';
import {
  categories,
  categoryImages,
  inventory,
  orders,
  productImages,
  products,
  productVariants,
  promotions,
  users,
} from '../database/schema';
import { cartItems } from '../database/schema/carts';
import { DATABASE_CONNECTION } from '../database/database.module';
import { OrdersService } from '../orders/orders.service';
import { MediaService } from '../media/media.service';

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
  variantId?: string | null;
};

type ProductVariantInput = {
  name: string;
  sku?: string | null;
  colorName?: string | null;
  colorHex?: string | null;
  isMulticolor?: boolean;
  priceCents?: number | null;
  options?: Record<string, unknown>;
  sortOrder?: number;
  isActive?: boolean;
  inventory?: InventoryInput;
};

type UpdateProductImageInput = {
  altText?: string;
  sortOrder?: number;
  isPrimary?: boolean;
  variantId?: string | null;
};

type ProductImageOrderInput = {
  imageId: string;
  sortOrder: number;
};

type UpdateProductVariantInput = Partial<
  Omit<ProductVariantInput, 'inventory'>
>;

export type CreateAdminProductInput = {
  name: string;
  slug: string;
  categoryId: string;
  subcategoryId: string;
  subsubcategoryId?: string | null;
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

export type UpdateAdminProductInput = {
  name?: string;
  slug?: string;
  categoryId?: string;
  subcategoryId?: string;
  subsubcategoryId?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  priceCents?: number;
  compareAtPriceCents?: number | null;
  badge?: ProductBadge | null;
  occasions?: string[] | null;
  isActive?: boolean;
  isPersonalizable?: boolean;
  personalizationPrompt?: string | null;
  personalizationConfig?: Record<string, unknown> | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
};

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
  pageTitle?: string;
  productsTitle?: string;
  filterLabel?: string;
  imageUrl?: string;
  imageStoragePath?: string;
  href?: string;
  parentId?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  metaTitle?: string;
  metaDescription?: string;
};

export type UpdateAdminCategoryInput =
  Partial<CreateAdminCategoryInput>;

export type CreateAdminPromotionInput = {
  code: string;
  description?: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minSubtotalCents?: number;
  maxDiscountCents?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
  usageLimit?: number | null;
};

export type UpdateAdminPromotionInput =
  Partial<CreateAdminPromotionInput>;

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
  private readonly logger = new Logger(
    AdminService.name,
  );

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly ordersService: OrdersService,
    private readonly mediaService: MediaService,
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
          pageTitle:
            input.pageTitle?.trim() || null,
          productsTitle:
            input.productsTitle?.trim() || null,
          filterLabel:
            input.filterLabel?.trim() || null,
          imageUrl:
            input.imageUrl?.trim() || null,
          imageStoragePath:
            input.imageStoragePath?.trim() || null,
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
      input.parentId !== existing.parentId
    ) {
      await this.assertCategorySubtreeCanMove(
        categoryId,
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

    if (input.isActive === true) {
      const effectiveParentId =
        input.parentId !== undefined
          ? input.parentId
          : existing.parentId;

      if (effectiveParentId) {
        await this.assertValidCategoryParent(
          categoryId,
          effectiveParentId,
        );
      }
    }

    // Track old image for Storage cleanup after DB update
    const oldImageStoragePath = existing.imageStoragePath;

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
        input.description?.trim() || null;
    }

    if (input.pageTitle !== undefined) {
      updateData.pageTitle =
        input.pageTitle?.trim() || null;
    }

    if (input.productsTitle !== undefined) {
      updateData.productsTitle =
        input.productsTitle?.trim() || null;
    }

    if (input.filterLabel !== undefined) {
      updateData.filterLabel =
        input.filterLabel?.trim() || null;
    }

    if (input.imageUrl !== undefined) {
      updateData.imageUrl =
        input.imageUrl?.trim() || null;
    }

    if (input.imageStoragePath !== undefined) {
      updateData.imageStoragePath =
        input.imageStoragePath?.trim() || null;
    }

    if (input.href !== undefined) {
      updateData.href =
        input.href?.trim() || null;
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
        input.metaTitle?.trim() || null;
    }

    if (input.metaDescription !== undefined) {
      updateData.metaDescription =
        input.metaDescription?.trim() || null;
    }

    // Determine if image was replaced or removed
    const newImageStoragePath =
      updateData.imageStoragePath !== undefined
        ? updateData.imageStoragePath
        : undefined;

    const imageChanged =
      newImageStoragePath !== undefined &&
      newImageStoragePath !== oldImageStoragePath;

    try {
      const [updated] = await this.db
        .update(categories)
        .set(updateData)
        .where(eq(categories.id, categoryId))
        .returning();

      // After successful DB update, clean up old Storage file
      if (imageChanged && oldImageStoragePath) {
        try {
          await this.mediaService.delete(oldImageStoragePath);
        } catch (error) {
          // Log but don't throw — DB update succeeded
          this.logger.warn(
            `Failed to delete old category image from storage: ${oldImageStoragePath}`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }

      return updated;
    } catch (error) {
      // If DB update fails and a new image was uploaded, clean up the orphan
      if (imageChanged && newImageStoragePath) {
        try {
          await this.mediaService.delete(newImageStoragePath);
        } catch {
          // Best-effort cleanup
        }
      }

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
    /*
     * Permanent category deletion.
     *
     * This is intentionally conservative:
     * - a category cannot be permanently deleted while products still use it;
     * - a parent category cannot be permanently deleted while child categories exist;
     * - profile and hero images are removed from PostgreSQL first, then their
     *   Supabase Storage objects are cleaned up best-effort.
     *
     * Activation/deactivation is handled separately through updateCategory()
     * with isActive=true/false.
     */
    const deletedCategory =
      await this.db.transaction(
        async (tx) => {
          const [existing] = await tx
            .select({
              id: categories.id,
              name: categories.name,
              imageStoragePath:
                categories.imageStoragePath,
            })
            .from(categories)
            .where(
              eq(
                categories.id,
                categoryId,
              ),
            )
            .for('update')
            .limit(1);

          if (!existing) {
            throw new NotFoundException(
              'Category not found',
            );
          }

          const [[productUsage], [childUsage]] =
            await Promise.all([
              tx
                .select({
                  count: sql<number>`count(*)::int`,
                })
                .from(products)
                .where(
                  or(
                    eq(
                      products.categoryId,
                      categoryId,
                    ),
                    eq(
                      products.subcategoryId,
                      categoryId,
                    ),
                    eq(
                      products.subsubcategoryId,
                      categoryId,
                    ),
                  ),
                ),

              tx
                .select({
                  count: sql<number>`count(*)::int`,
                })
                .from(categories)
                .where(
                  eq(
                    categories.parentId,
                    categoryId,
                  ),
                ),
            ]);

          if (
            (productUsage?.count ?? 0) > 0
          ) {
            throw new ConflictException(
              'Category cannot be permanently deleted while products still use it',
            );
          }

          if (
            (childUsage?.count ?? 0) > 0
          ) {
            throw new ConflictException(
              'Category cannot be permanently deleted while child categories still exist',
            );
          }

          const heroImages = await tx
            .select({
              storagePath:
                categoryImages.storagePath,
            })
            .from(categoryImages)
            .where(
              eq(
                categoryImages.categoryId,
                categoryId,
              ),
            );

          await tx
            .delete(categoryImages)
            .where(
              eq(
                categoryImages.categoryId,
                categoryId,
              ),
            );

          const [deleted] = await tx
            .delete(categories)
            .where(
              eq(
                categories.id,
                categoryId,
              ),
            )
            .returning({
              id: categories.id,
            });

          if (!deleted) {
            throw new NotFoundException(
              'Category not found',
            );
          }

          const storagePaths = Array.from(
            new Set(
              [
                existing.imageStoragePath,
                ...heroImages.map(
                  (image) =>
                    image.storagePath,
                ),
              ].filter(
                (
                  storagePath,
                ): storagePath is string =>
                  Boolean(
                    storagePath,
                  ),
              ),
            ),
          );

          return {
            id: deleted.id,
            name: existing.name,
            storagePaths,
          };
        },
      );

    let storageDeleted = 0;
    let storageCleanupFailed = 0;

    for (const storagePath of
      deletedCategory.storagePaths) {
      try {
        await this.mediaService.delete(
          storagePath,
        );

        storageDeleted += 1;
      } catch (error) {
        if (
          error instanceof
          NotFoundException
        ) {
          storageDeleted += 1;
          continue;
        }

        storageCleanupFailed += 1;

        const message =
          error instanceof Error
            ? error.message
            : String(error);

        this.logger.warn(
          `Category "${deletedCategory.name}" (${deletedCategory.id}) was deleted from PostgreSQL but Storage cleanup failed for ${storagePath}: ${message}`,
        );
      }
    }

    return {
      success: true,
      id: deletedCategory.id,
      permanentlyDeleted: true,
      storageDeleted,
      storageCleanupFailed,
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

    await this.assertProductCategoryPath(
      input.categoryId,
      input.subcategoryId,
      input.subsubcategoryId ?? null,
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

    // Normalize personalization
    const personalizationEnabled =
      input.isPersonalizable === true;

    const normalizedPersonalization =
      this.validatePersonalization(
        input.isPersonalizable,
        input.personalizationConfig,
        input.personalizationPrompt,
      );

    const isPersonalizableFinal = personalizationEnabled;
    const personalizationPromptFinal =
      normalizedPersonalization.prompt;
    const personalizationConfigFinal =
      normalizedPersonalization.config;

    return this.db.transaction(async (tx) => {
      try {
        const [product] = await tx
          .insert(products)
          .values({
            name: input.name.trim(),
            slug: input.slug.trim(),
            categoryId: input.categoryId,
            subcategoryId: input.subcategoryId,
            subsubcategoryId:
              input.subsubcategoryId ?? null,
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
            isPersonalizable: isPersonalizableFinal,
            personalizationPrompt: personalizationPromptFinal,
            personalizationConfig: personalizationConfigFinal,
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
                variantId:
                  image.variantId ?? null,
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
                variantInput.isMulticolor
                  ? null
                  : variantInput.colorHex?.trim() ||
                    null,
              isMulticolor:
                variantInput.isMulticolor ?? false,
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

    const hierarchyChanged =
      input.categoryId !== undefined ||
      input.subcategoryId !== undefined ||
      input.subsubcategoryId !== undefined;

    if (hierarchyChanged) {
      const effectiveCategoryId =
        input.categoryId ??
        existing.categoryId;

      const effectiveSubcategoryId =
        input.subcategoryId ??
        existing.subcategoryId;

      const effectiveSubsubcategoryId =
        input.subsubcategoryId !== undefined
          ? input.subsubcategoryId
          : existing.subsubcategoryId;

      if (!effectiveSubcategoryId) {
        throw new BadRequestException(
          'Product subcategory is required',
        );
      }

      await this.assertProductCategoryPath(
        effectiveCategoryId,
        effectiveSubcategoryId,
        effectiveSubsubcategoryId,
      );
    }

    this.validateProductPrices({
      priceCents:
        input.priceCents ??
        existing.priceCents,
      compareAtPriceCents:
        input.compareAtPriceCents !== undefined
          ? input.compareAtPriceCents
          : existing.compareAtPriceCents ?? undefined,
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

    if (input.subcategoryId !== undefined) {
      updateData.subcategoryId =
        input.subcategoryId;
    }

    if (
      input.subsubcategoryId !== undefined
    ) {
      updateData.subsubcategoryId =
        input.subsubcategoryId;
    }

    if (input.description !== undefined) {
      updateData.description =
        input.description?.trim() || null;
    }

    if (
      input.shortDescription !== undefined
    ) {
      updateData.shortDescription =
        input.shortDescription?.trim() ||
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
        input.occasions ?? [];
    }

    if (input.isActive !== undefined) {
      updateData.isActive =
        input.isActive;
    }

    // ── Resolve final personalization state ──
    // Determine effective isPersonalizable: input override or existing
    const effectiveIsPersonalizable =
      input.isPersonalizable !== undefined
        ? input.isPersonalizable
        : existing.isPersonalizable;

    if (!effectiveIsPersonalizable) {
      // Becomes or stays non-personalizable: wipe everything
      updateData.isPersonalizable = false;
      updateData.personalizationPrompt = null;
      updateData.personalizationConfig = null;
    } else {
      // Personalizable: resolve effective prompt + config, then validate
      const effectivePrompt =
        input.personalizationPrompt !== undefined
          ? input.personalizationPrompt
          : existing.personalizationPrompt;

      const effectiveConfig =
        input.personalizationConfig !== undefined
          ? input.personalizationConfig
          : (existing.personalizationConfig as Record<string, unknown> | null);

      const normalized = this.validatePersonalization(
        true,
        effectiveConfig,
        effectivePrompt,
      );

      updateData.isPersonalizable = true;
      updateData.personalizationPrompt = normalized.prompt;
      updateData.personalizationConfig = normalized.config;
    }

    if (input.metaTitle !== undefined) {
      updateData.metaTitle =
        input.metaTitle?.trim() || null;
    }

    if (
      input.metaDescription !== undefined
    ) {
      updateData.metaDescription =
        input.metaDescription?.trim() ||
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
    /*
     * Permanent catalogue deletion.
     *
     * - order_items keep immutable snapshots and their product/variant
     *   foreign keys are configured with ON DELETE SET NULL, so order
     *   history remains intact.
     * - product images, variants and inventory are removed by PostgreSQL
     *   cascades from products.
     * - cart_items do not cascade and have non-null productId, so they must
     *   be removed explicitly before deleting the product.
     * - Supabase Storage objects are cleaned up after the DB transaction.
     */
    const deletedProduct =
      await this.db.transaction(
        async (tx) => {
          const [existing] = await tx
            .select({
              id: products.id,
              name: products.name,
            })
            .from(products)
            .where(
              eq(
                products.id,
                productId,
              ),
            )
            .for('update')
            .limit(1);

          if (!existing) {
            throw new NotFoundException(
              'Product not found',
            );
          }

          const imageRows = await tx
            .select({
              storagePath:
                productImages.storagePath,
            })
            .from(productImages)
            .where(
              eq(
                productImages.productId,
                productId,
              ),
            );

          // cart_items.productId is NOT nullable and has no ON DELETE
          // cascade, so stale cart lines must be removed first.
          await tx
            .delete(cartItems)
            .where(
              eq(
                cartItems.productId,
                productId,
              ),
            );

          const [deleted] = await tx
            .delete(products)
            .where(
              eq(
                products.id,
                productId,
              ),
            )
            .returning({
              id: products.id,
            });

          if (!deleted) {
            throw new NotFoundException(
              'Product not found',
            );
          }

          return {
            id: deleted.id,
            name: existing.name,
            storagePaths: Array.from(
              new Set(
                imageRows
                  .map(
                    (image) =>
                      image.storagePath,
                  )
                  .filter(
                    (
                      storagePath,
                    ): storagePath is string =>
                      Boolean(
                        storagePath,
                      ),
                  ),
              ),
            ),
          };
        },
      );

    let storageDeleted = 0;
    let storageCleanupFailed = 0;

    for (const storagePath of
      deletedProduct.storagePaths) {
      try {
        await this.mediaService.delete(
          storagePath,
        );

        storageDeleted += 1;
      } catch (error) {
        if (
          error instanceof
          NotFoundException
        ) {
          // The DB deletion is already complete and a missing Storage
          // object means there is nothing left to clean up.
          storageDeleted += 1;
          continue;
        }

        storageCleanupFailed += 1;

        const message =
          error instanceof Error
            ? error.message
            : String(error);

        this.logger.warn(
          `Product "${deletedProduct.name}" (${deletedProduct.id}) was deleted from PostgreSQL but Storage cleanup failed for ${storagePath}: ${message}`,
        );
      }
    }

    return {
      success: true,
      id: deletedProduct.id,
      permanentlyDeleted: true,
      storageDeleted,
      storageCleanupFailed,
    };
  }

  async getProductDetails(
    productId: string,
  ) {
    const [product] = await this.db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (!product) {
      throw new NotFoundException(
        'Product not found',
      );
    }

    const [
      images,
      variants,
      inventoryRows,
    ] = await Promise.all([
      this.db
        .select()
        .from(productImages)
        .where(
          eq(
            productImages.productId,
            productId,
          ),
        )
        .orderBy(
          desc(productImages.isPrimary),
          asc(productImages.sortOrder),
          asc(productImages.createdAt),
        ),

      this.db
        .select()
        .from(productVariants)
        .where(
          eq(
            productVariants.productId,
            productId,
          ),
        )
        .orderBy(
          asc(productVariants.sortOrder),
          asc(productVariants.createdAt),
        ),

      this.db
        .select()
        .from(inventory)
        .where(
          eq(
            inventory.productId,
            productId,
          ),
        ),
    ]);

    const inventoryByVariant =
      new Map<string, typeof inventory.$inferSelect>();

    let productInventory:
      | typeof inventory.$inferSelect
      | null = null;

    for (const row of inventoryRows) {
      if (row.variantId) {
        inventoryByVariant.set(
          row.variantId,
          row,
        );
      } else {
        productInventory = row;
      }
    }

    return {
      ...product,
      images,
      inventory: productInventory,
      variants: variants.map(
        (variant) => ({
          ...variant,
          inventory:
            inventoryByVariant.get(
              variant.id,
            ) ?? null,
        }),
      ),
    };
  }

  async addProductImage(
    productId: string,
    input: ProductImageInput,
  ) {
    const url = input.url.trim();
    const storagePath =
      input.storagePath.trim();

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

    try {
      return await this.db.transaction(
        async (tx) => {
          const [product] = await tx
            .select({
              id: products.id,
            })
            .from(products)
            .where(
              eq(
                products.id,
                productId,
              ),
            )
            .for('update')
            .limit(1);

          if (!product) {
            throw new NotFoundException(
              'Product not found',
            );
          }

          const [existingImage] = await tx
            .select({
              id: productImages.id,
            })
            .from(productImages)
            .where(
              eq(
                productImages.productId,
                productId,
              ),
            )
            .limit(1);

          const [countRow] = await tx
            .select({
              count: sql<number>`count(*)::int`,
            })
            .from(productImages)
            .where(
              eq(
                productImages.productId,
                productId,
              ),
            );

          if (countRow && countRow.count >= 20) {
            throw new BadRequestException(
              'A product can have a maximum of 20 images',
            );
          }

          const shouldBePrimary =
            input.isPrimary === true ||
            !existingImage;

          if (shouldBePrimary) {
            await tx
              .update(productImages)
              .set({
                isPrimary: false,
              })
              .where(
                and(
                  eq(
                    productImages.productId,
                    productId,
                  ),
                  eq(
                    productImages.isPrimary,
                    true,
                  ),
                ),
              );
          }

          // Validate variant ownership if variantId is provided
          let resolvedVariantId: string | null =
            input.variantId ?? null;

          // Validate UUID format if not null
          if (resolvedVariantId !== null) {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(resolvedVariantId)) {
              throw new BadRequestException(
                'Invalid variant ID format',
              );
            }
          }

          if (resolvedVariantId) {
            const [variant] = await tx
              .select({ id: productVariants.id })
              .from(productVariants)
              .where(
                and(
                  eq(
                    productVariants.id,
                    resolvedVariantId,
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

          const [created] = await tx
            .insert(productImages)
            .values({
              productId,
              url,
              storagePath,
              altText:
                input.altText?.trim() ||
                null,
              sortOrder:
                input.sortOrder ?? 0,
              isPrimary:
                shouldBePrimary,
              variantId:
                resolvedVariantId,
            })
            .returning();

          return created;
        },
      );
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'This storage image is already linked to a product',
        );
      }

      throw error;
    }
  }

  async updateProductImage(
    productId: string,
    imageId: string,
    input: UpdateProductImageInput,
  ) {
    return this.db.transaction(
      async (tx) => {
        const [image] = await tx
          .select()
          .from(productImages)
          .where(
            and(
              eq(
                productImages.id,
                imageId,
              ),
              eq(
                productImages.productId,
                productId,
              ),
            ),
          )
          .for('update')
          .limit(1);

        if (!image) {
          throw new NotFoundException(
            'Product image not found',
          );
        }

        let finalIsPrimary =
          input.isPrimary;

        if (input.isPrimary === true) {
          await tx
            .update(productImages)
            .set({
              isPrimary: false,
            })
            .where(
              and(
                eq(
                  productImages.productId,
                  productId,
                ),
                eq(
                  productImages.isPrimary,
                  true,
                ),
              ),
            );
        }

        if (
          input.isPrimary === false &&
          image.isPrimary
        ) {
          const [replacement] = await tx
            .select({
              id: productImages.id,
            })
            .from(productImages)
            .where(
              and(
                eq(
                  productImages.productId,
                  productId,
                ),
                ne(
                  productImages.id,
                  imageId,
                ),
              ),
            )
            .orderBy(
              asc(
                productImages.sortOrder,
              ),
              asc(
                productImages.createdAt,
              ),
            )
            .limit(1);

          if (replacement) {
            await tx
              .update(productImages)
              .set({
                isPrimary: true,
              })
              .where(
                eq(
                  productImages.id,
                  replacement.id,
                ),
              );
          } else {
            finalIsPrimary = true;
          }
        }

        const updateData: Partial<
          typeof productImages.$inferInsert
        > = {};

        if (input.altText !== undefined) {
          updateData.altText =
            input.altText.trim() || null;
        }

        if (
          input.sortOrder !== undefined
        ) {
          updateData.sortOrder =
            input.sortOrder;
        }

        if (
          finalIsPrimary !== undefined
        ) {
          updateData.isPrimary =
            finalIsPrimary;
        }

        if (
          input.variantId !== undefined
        ) {
          // Validate UUID format if not null
          if (input.variantId !== null) {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(input.variantId)) {
              throw new BadRequestException(
                'Invalid variant ID format',
              );
            }
          }

          // Validate variant ownership if provided
          if (input.variantId) {
            const [variant] = await tx
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

          updateData.variantId =
            input.variantId;
        }

        if (
          Object.keys(updateData).length ===
          0
        ) {
          return image;
        }

        const [updated] = await tx
          .update(productImages)
          .set(updateData)
          .where(
            and(
              eq(
                productImages.id,
                imageId,
              ),
              eq(
                productImages.productId,
                productId,
              ),
            ),
          )
          .returning();

        return updated;
      },
    );
  }

  async reorderProductImages(
    productId: string,
    imageOrders: ProductImageOrderInput[],
  ) {
    const imageIds = imageOrders.map(
      (item) => item.imageId,
    );

    if (
      new Set(imageIds).size !==
      imageIds.length
    ) {
      throw new BadRequestException(
        'Image ids must be unique',
      );
    }

    return this.db.transaction(
      async (tx) => {
        const [product] = await tx
          .select({
            id: products.id,
          })
          .from(products)
          .where(
            eq(
              products.id,
              productId,
            ),
          )
          .for('update')
          .limit(1);

        if (!product) {
          throw new NotFoundException(
            'Product not found',
          );
        }

        const ownedImages = await tx
          .select({
            id: productImages.id,
          })
          .from(productImages)
          .where(
            and(
              eq(
                productImages.productId,
                productId,
              ),
              inArray(
                productImages.id,
                imageIds,
              ),
            ),
          );

        if (
          ownedImages.length !==
          imageIds.length
        ) {
          throw new BadRequestException(
            'One or more images do not belong to this product',
          );
        }

        for (const item of imageOrders) {
          await tx
            .update(productImages)
            .set({
              sortOrder:
                item.sortOrder,
            })
            .where(
              and(
                eq(
                  productImages.id,
                  item.imageId,
                ),
                eq(
                  productImages.productId,
                  productId,
                ),
              ),
            );
        }

        return tx
          .select()
          .from(productImages)
          .where(
            eq(
              productImages.productId,
              productId,
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
      },
    );
  }

  async deleteProductImage(
    productId: string,
    imageId: string,
  ) {
    const deleted =
      await this.db.transaction(
        async (tx) => {
          const [image] = await tx
            .select()
            .from(productImages)
            .where(
              and(
                eq(
                  productImages.id,
                  imageId,
                ),
                eq(
                  productImages.productId,
                  productId,
                ),
              ),
            )
            .for('update')
            .limit(1);

          if (!image) {
            throw new NotFoundException(
              'Product image not found',
            );
          }

          await tx
            .delete(productImages)
            .where(
              and(
                eq(
                  productImages.id,
                  imageId,
                ),
                eq(
                  productImages.productId,
                  productId,
                ),
              ),
            );

          if (image.isPrimary) {
            const [replacement] = await tx
              .select({
                id: productImages.id,
              })
              .from(productImages)
              .where(
                eq(
                  productImages.productId,
                  productId,
                ),
              )
              .orderBy(
                asc(
                  productImages.sortOrder,
                ),
                asc(
                  productImages.createdAt,
                ),
              )
              .limit(1);

            if (replacement) {
              await tx
                .update(productImages)
                .set({
                  isPrimary: true,
                })
                .where(
                  eq(
                    productImages.id,
                    replacement.id,
                  ),
                );
            }
          }

          return {
            id: image.id,
            storagePath:
              image.storagePath,
          };
        },
      );

    let storageDeleted =
      !deleted.storagePath;

    if (deleted.storagePath) {
      try {
        await this.mediaService.delete(
          deleted.storagePath,
        );

        storageDeleted = true;
      } catch (error) {
        if (
          error instanceof
          NotFoundException
        ) {
          storageDeleted = true;
        } else {
          const message =
            error instanceof Error
              ? error.message
              : String(error);

          this.logger.error(
            `Product image ${deleted.id} was removed from PostgreSQL but Storage cleanup failed: ${message}`,
          );
        }
      }
    }

    return {
      success: true,
      id: deleted.id,
      storageDeleted,
    };
  }

  async createProductVariant(
    productId: string,
    input: ProductVariantInput,
  ) {
    this.validateVariant(input);

    if (input.inventory) {
      this.validateInventory(
        input.inventory,
      );
    }

    try {
      return await this.db.transaction(
        async (tx) => {
          const [product] = await tx
            .select({
              id: products.id,
            })
            .from(products)
            .where(
              eq(
                products.id,
                productId,
              ),
            )
            .for('update')
            .limit(1);

          if (!product) {
            throw new NotFoundException(
              'Product not found',
            );
          }

          const [existingVariant] = await tx
            .select({
              id: productVariants.id,
            })
            .from(productVariants)
            .where(
              eq(
                productVariants.productId,
                productId,
              ),
            )
            .limit(1);

          const [productInventory] =
            await tx
              .select()
              .from(inventory)
              .where(
                and(
                  eq(
                    inventory.productId,
                    productId,
                  ),
                  isNull(
                    inventory.variantId,
                  ),
                ),
              )
              .for('update')
              .limit(1);

          if (
            productInventory &&
            existingVariant
          ) {
            throw new ConflictException(
              'Product inventory is inconsistent: product-level stock cannot coexist with variants',
            );
          }

          if (
            productInventory &&
            productInventory.reserved > 0
          ) {
            throw new ConflictException(
              'Cannot add the first variant while product stock is reserved',
            );
          }

          const [variant] = await tx
            .insert(productVariants)
            .values({
              productId,
              name: input.name.trim(),
              sku:
                input.sku?.trim() ||
                null,
              colorName:
                input.colorName?.trim() ||
                null,
              colorHex:
                input.isMulticolor
                  ? null
                  : input.colorHex?.trim() ||
                    null,
              isMulticolor:
                input.isMulticolor ?? false,
              priceCents:
                input.priceCents ?? null,
              options:
                input.options ?? null,
              sortOrder:
                input.sortOrder ?? 0,
              isActive:
                input.isActive ?? true,
            })
            .returning();

          let variantInventory:
            | typeof inventory.$inferSelect
            | null = null;

          if (productInventory) {
            if (input.inventory) {
              await tx
                .delete(inventory)
                .where(
                  eq(
                    inventory.id,
                    productInventory.id,
                  ),
                );

              [variantInventory] = await tx
                .insert(inventory)
                .values({
                  productId,
                  variantId:
                    variant.id,
                  quantity:
                    input.inventory.quantity,
                  lowStockThreshold:
                    input.inventory
                      .lowStockThreshold ?? 5,
                  trackInventory:
                    input.inventory
                      .trackInventory ?? true,
                })
                .returning();
            } else {
              [variantInventory] = await tx
                .update(inventory)
                .set({
                  variantId:
                    variant.id,
                  updatedAt:
                    new Date(),
                })
                .where(
                  eq(
                    inventory.id,
                    productInventory.id,
                  ),
                )
                .returning();
            }
          } else if (input.inventory) {
            [variantInventory] = await tx
              .insert(inventory)
              .values({
                productId,
                variantId:
                  variant.id,
                quantity:
                  input.inventory
                    .quantity,
                lowStockThreshold:
                  input.inventory
                    .lowStockThreshold ?? 5,
                trackInventory:
                  input.inventory
                    .trackInventory ?? true,
              })
              .returning();
          }

          return {
            ...variant,
            inventory:
              variantInventory,
          };
        },
      );
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'Variant SKU already exists',
        );
      }

      throw error;
    }
  }

  async updateProductVariant(
    productId: string,
    variantId: string,
    input: UpdateProductVariantInput,
  ) {
    try {
      return await this.db.transaction(
        async (tx) => {
          const [product] = await tx
            .select({
              id: products.id,
              isActive:
                products.isActive,
            })
            .from(products)
            .where(
              eq(
                products.id,
                productId,
              ),
            )
            .for('update')
            .limit(1);

          if (!product) {
            throw new NotFoundException(
              'Product not found',
            );
          }

          const [variant] = await tx
            .select()
            .from(productVariants)
            .where(
              and(
                eq(
                  productVariants.id,
                  variantId,
                ),
                eq(
                  productVariants.productId,
                  productId,
                ),
              ),
            )
            .for('update')
            .limit(1);

          if (!variant) {
            throw new NotFoundException(
              'Product variant not found',
            );
          }

          this.validateVariant({
            name:
              input.name ??
              variant.name,
            priceCents:
              input.priceCents,
          });

          if (
            input.isActive === false &&
            variant.isActive &&
            product.isActive
          ) {
            const [otherActive] = await tx
              .select({
                id: productVariants.id,
              })
              .from(productVariants)
              .where(
                and(
                  eq(
                    productVariants.productId,
                    productId,
                  ),
                  eq(
                    productVariants.isActive,
                    true,
                  ),
                  ne(
                    productVariants.id,
                    variantId,
                  ),
                ),
              )
              .limit(1);

            if (!otherActive) {
              throw new ConflictException(
                'Cannot deactivate the last active variant while the product is active',
              );
            }
          }

          const updateData: Partial<
            typeof productVariants.$inferInsert
          > = {
            updatedAt:
              new Date(),
          };

          if (input.name !== undefined) {
            updateData.name =
              input.name.trim();
          }

          if (input.sku !== undefined) {
            updateData.sku =
              input.sku?.trim() ||
              null;
          }

          if (
            input.colorName !==
            undefined
          ) {
            updateData.colorName =
              input.colorName?.trim() ||
              null;
          }

          const effectiveIsMulticolor =
            input.isMulticolor ??
            variant.isMulticolor;

          if (
            input.isMulticolor !==
            undefined
          ) {
            updateData.isMulticolor =
              input.isMulticolor;
          }

          if (effectiveIsMulticolor) {
            updateData.colorHex = null;
          } else if (
            input.colorHex !==
            undefined
          ) {
            updateData.colorHex =
              input.colorHex?.trim() ||
              null;
          }

          if (
            input.priceCents !==
            undefined
          ) {
            updateData.priceCents =
              input.priceCents;
          }

          if (
            input.options !==
            undefined
          ) {
            updateData.options =
              input.options;
          }

          if (
            input.sortOrder !==
            undefined
          ) {
            updateData.sortOrder =
              input.sortOrder;
          }

          if (
            input.isActive !==
            undefined
          ) {
            updateData.isActive =
              input.isActive;
          }

          const [updated] = await tx
            .update(productVariants)
            .set(updateData)
            .where(
              and(
                eq(
                  productVariants.id,
                  variantId,
                ),
                eq(
                  productVariants.productId,
                  productId,
                ),
              ),
            )
            .returning();

          const [variantInventory] =
            await tx
              .select()
              .from(inventory)
              .where(
                and(
                  eq(
                    inventory.productId,
                    productId,
                  ),
                  eq(
                    inventory.variantId,
                    variantId,
                  ),
                ),
              )
              .limit(1);

          return {
            ...updated,
            inventory:
              variantInventory ?? null,
          };
        },
      );
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'Variant SKU already exists',
        );
      }

      throw error;
    }
  }

  async deleteProductVariant(
    productId: string,
    variantId: string,
  ) {
    const variant =
      await this.updateProductVariant(
        productId,
        variantId,
        {
          isActive: false,
        },
      );

    return {
      success: true,
      id: variant.id,
      isActive:
        variant.isActive,
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

  // ──── CATEGORY HERO IMAGES ────

  async getCategoryWithHeroImages(categoryId: string) {
    const [category] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, categoryId));

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const heroImages = await this.db
      .select()
      .from(categoryImages)
      .where(eq(categoryImages.categoryId, categoryId))
      .orderBy(asc(categoryImages.sortOrder), asc(categoryImages.createdAt));

    return { ...category, heroImages };
  }

  async addCategoryHeroImage(
    categoryId: string,
    input: { url: string; storagePath: string; altText?: string; sortOrder?: number },
  ) {
    // Verify category exists and is a subcategory
    const [category] = await this.db
      .select({ id: categories.id, parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.id, categoryId));

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (!category.parentId) {
      throw new BadRequestException('Hero images are only allowed for subcategories');
    }

    // Check max 10 images
    const [countResult] = await this.db
      .select({ count: count() })
      .from(categoryImages)
      .where(eq(categoryImages.categoryId, categoryId));

    if (countResult && countResult.count >= 10) {
      throw new BadRequestException('Maximum 10 hero images per category');
    }

    const sortOrder = input.sortOrder ?? 0;

    const [created] = await this.db
      .insert(categoryImages)
      .values({
        categoryId,
        url: input.url,
        storagePath: input.storagePath,
        altText: input.altText,
        sortOrder,
      })
      .returning();

    return created;
  }

  async updateCategoryHeroImage(
    categoryId: string,
    imageId: string,
    input: { altText?: string; sortOrder?: number },
  ) {
    const [image] = await this.db
      .select()
      .from(categoryImages)
      .where(and(eq(categoryImages.id, imageId), eq(categoryImages.categoryId, categoryId)));

    if (!image) {
      throw new NotFoundException('Category hero image not found');
    }

    const updateData: Record<string, unknown> = {};
    if (input.altText !== undefined) updateData.altText = input.altText;
    if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder;

    if (Object.keys(updateData).length === 0) {
      return image;
    }

    const [updated] = await this.db
      .update(categoryImages)
      .set(updateData)
      .where(eq(categoryImages.id, imageId))
      .returning();

    return updated;
  }

  async reorderCategoryHeroImages(
    categoryId: string,
    imageOrders: { imageId: string; sortOrder: number }[],
  ) {
    // Verify all images belong to this category
    const existingImages = await this.db
      .select({ id: categoryImages.id })
      .from(categoryImages)
      .where(eq(categoryImages.categoryId, categoryId));

    const validIds = new Set(existingImages.map((i) => i.id));

    for (const order of imageOrders) {
      if (!validIds.has(order.imageId)) {
        throw new BadRequestException(
          `Image ${order.imageId} does not belong to category ${categoryId}`,
        );
      }
    }

    // Update each image's sortOrder
    const updates = imageOrders.map((order) =>
      this.db
        .update(categoryImages)
        .set({ sortOrder: order.sortOrder })
        .where(eq(categoryImages.id, order.imageId)),
    );

    await Promise.all(updates);

    // Return updated images
    return this.db
      .select()
      .from(categoryImages)
      .where(eq(categoryImages.categoryId, categoryId))
      .orderBy(asc(categoryImages.sortOrder), asc(categoryImages.createdAt));
  }

  async deleteCategoryHeroImage(categoryId: string, imageId: string) {
    const [image] = await this.db
      .select()
      .from(categoryImages)
      .where(and(eq(categoryImages.id, imageId), eq(categoryImages.categoryId, categoryId)));

    if (!image) {
      throw new NotFoundException('Category hero image not found');
    }

    // Delete from DB
    await this.db.delete(categoryImages).where(eq(categoryImages.id, imageId));

    // Clean up Supabase Storage (best-effort, log but don't throw on failure)
    if (image.storagePath) {
      try {
        await this.mediaService.delete(image.storagePath);
      } catch (error) {
        // Log but don't throw — DB record is already deleted
        this.logger.warn(
          `Failed to delete category hero image from storage: ${image.storagePath}`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    return { message: 'Category hero image deleted successfully' };
  }

  async getAllPromotions(
    page = 1,
    limit = 20,
  ) {
    const safePage = this.normalizePage(page);
    const safeLimit = this.normalizeLimit(limit);

    const [countResult] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(promotions);

    const data = await this.db
      .select()
      .from(promotions)
      .orderBy(desc(promotions.createdAt))
      .limit(safeLimit)
      .offset((safePage - 1) * safeLimit);

    const total = countResult?.count ?? 0;

    return {
      data,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(
          total / safeLimit,
        ),
      },
    };
  }

  async createPromotion(
    input: CreateAdminPromotionInput,
  ) {
    const normalized =
      this.normalizePromotionInput(input);

    try {
      const [created] = await this.db
        .insert(promotions)
        .values({
          code: normalized.code,
          description:
            normalized.description,
          discountType:
            normalized.discountType,
          discountValue:
            normalized.discountValue,
          minSubtotalCents:
            normalized.minSubtotalCents,
          maxDiscountCents:
            normalized.maxDiscountCents,
          startsAt:
            normalized.startsAt,
          endsAt:
            normalized.endsAt,
          isActive:
            normalized.isActive,
          usageLimit:
            normalized.usageLimit,
          usageCount: 0,
        })
        .returning();

      return created;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'Promotion code already exists',
        );
      }

      throw error;
    }
  }

  async updatePromotion(
    promotionId: string,
    input: UpdateAdminPromotionInput,
  ) {
    return this.db.transaction(
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(promotions)
          .where(
            eq(
              promotions.id,
              promotionId,
            ),
          )
          .for('update')
          .limit(1);

        if (!existing) {
          throw new NotFoundException(
            'Promotion not found',
          );
        }

        if (
          Object.keys(input).length === 0
        ) {
          return existing;
        }

        const code =
          input.code !== undefined
            ? this.normalizePromotionCode(
                input.code,
              )
            : existing.code;

        if (
          input.code !== undefined &&
          code !== existing.code &&
          existing.usageCount > 0
        ) {
          throw new ConflictException(
            'Promotion code cannot be changed after the promotion has been used',
          );
        }

        const discountType =
          input.discountType ??
          existing.discountType;

        const discountValue =
          input.discountValue ??
          existing.discountValue;

        const minSubtotalCents =
          input.minSubtotalCents ??
          existing.minSubtotalCents;

        const maxDiscountCents =
          input.maxDiscountCents !==
          undefined
            ? input.maxDiscountCents
            : existing.maxDiscountCents;

        const startsAt =
          input.startsAt !== undefined
            ? this.parseOptionalDate(
                input.startsAt,
                'startsAt',
              )
            : existing.startsAt;

        const endsAt =
          input.endsAt !== undefined
            ? this.parseOptionalDate(
                input.endsAt,
                'endsAt',
              )
            : existing.endsAt;

        const usageLimit =
          input.usageLimit !== undefined
            ? input.usageLimit
            : existing.usageLimit;

        this.validatePromotionRules({
          discountType,
          discountValue,
          minSubtotalCents,
          maxDiscountCents,
          startsAt,
          endsAt,
          usageLimit,
          usageCount:
            existing.usageCount,
        });

        const updateData: Partial<
          typeof promotions.$inferInsert
        > = {
          updatedAt: new Date(),
        };

        if (input.code !== undefined) {
          updateData.code = code;
        }

        if (
          input.description !== undefined
        ) {
          updateData.description =
            input.description.trim() ||
            null;
        }

        if (
          input.discountType !== undefined
        ) {
          updateData.discountType =
            discountType;
        }

        if (
          input.discountValue !== undefined
        ) {
          updateData.discountValue =
            discountValue;
        }

        if (
          input.minSubtotalCents !==
          undefined
        ) {
          updateData.minSubtotalCents =
            minSubtotalCents;
        }

        if (
          input.maxDiscountCents !==
          undefined
        ) {
          updateData.maxDiscountCents =
            maxDiscountCents;
        }

        if (input.startsAt !== undefined) {
          updateData.startsAt =
            startsAt;
        }

        if (input.endsAt !== undefined) {
          updateData.endsAt =
            endsAt;
        }

        if (
          input.isActive !== undefined
        ) {
          updateData.isActive =
            input.isActive;
        }

        if (
          input.usageLimit !== undefined
        ) {
          updateData.usageLimit =
            usageLimit;
        }

        try {
          const [updated] = await tx
            .update(promotions)
            .set(updateData)
            .where(
              eq(
                promotions.id,
                promotionId,
              ),
            )
            .returning();

          return updated;
        } catch (error) {
          if (
            this.isUniqueViolation(error)
          ) {
            throw new ConflictException(
              'Promotion code already exists',
            );
          }

          throw error;
        }
      },
    );
  }

  async deletePromotion(
    promotionId: string,
  ) {
    const [existing] = await this.db
      .select({
        id: promotions.id,
        isActive: promotions.isActive,
      })
      .from(promotions)
      .where(
        eq(
          promotions.id,
          promotionId,
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException(
        'Promotion not found',
      );
    }

    if (!existing.isActive) {
      return {
        success: true,
        id: existing.id,
        alreadyInactive: true,
      };
    }

    const [updated] = await this.db
      .update(promotions)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        eq(
          promotions.id,
          promotionId,
        ),
      )
      .returning({
        id: promotions.id,
        isActive:
          promotions.isActive,
      });

    return {
      success: true,
      ...updated,
    };
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

    /*
     * The catalogue supports exactly three hierarchy levels:
     *
     * 1. Category
     * 2. Subcategory
     * 3. Sub-subcategory
     *
     * Validate both sides of a move:
     * - the proposed parent's ancestor depth;
     * - the height of the category subtree being moved.
     *
     * This prevents creating level 4 directly and also prevents moving
     * an existing category with children to a position that would push
     * one of its descendants to level 4.
     */
    let currentId: string | null =
      parentId;
    const visited = new Set<string>();
    let parentDepth = 0;

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

      parentDepth += 1;

      if (parentDepth >= 3) {
        throw new BadRequestException(
          'Category hierarchy supports a maximum of 3 levels',
        );
      }

      currentId = current.parentId;
    }

    const newCategoryDepth =
      parentDepth + 1;

    if (!categoryId) {
      return;
    }

    /*
     * When moving an existing category, its descendants move with it.
     * Count every descendant level, including inactive categories, so
     * the database can never contain a hidden level 4 that could later
     * become active.
     */
    let frontier = [categoryId];
    const descendantsVisited =
      new Set<string>([categoryId]);
    let descendantDepth = 0;

    while (frontier.length > 0) {
      const children = await this.db
        .select({
          id: categories.id,
        })
        .from(categories)
        .where(
          inArray(
            categories.parentId,
            frontier,
          ),
        );

      const nextFrontier = children
        .map((child) => child.id)
        .filter(
          (id) =>
            !descendantsVisited.has(id),
        );

      if (nextFrontier.length === 0) {
        break;
      }

      descendantDepth += 1;

      if (
        newCategoryDepth +
          descendantDepth >
        3
      ) {
        throw new BadRequestException(
          'Category hierarchy supports a maximum of 3 levels',
        );
      }

      for (const id of nextFrontier) {
        descendantsVisited.add(id);
      }

      frontier = nextFrontier;
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
              or(
                eq(
                  products.categoryId,
                  categoryId,
                ),
                eq(
                  products.subcategoryId,
                  categoryId,
                ),
                eq(
                  products.subsubcategoryId,
                  categoryId,
                ),
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

  private normalizePromotionInput(
    input: CreateAdminPromotionInput,
  ) {
    const code =
      this.normalizePromotionCode(
        input.code,
      );

    const startsAt =
      this.parseOptionalDate(
        input.startsAt,
        'startsAt',
      );

    const endsAt =
      this.parseOptionalDate(
        input.endsAt,
        'endsAt',
      );

    const normalized = {
      code,
      description:
        input.description?.trim() ||
        null,
      discountType:
        input.discountType,
      discountValue:
        input.discountValue,
      minSubtotalCents:
        input.minSubtotalCents ?? 0,
      maxDiscountCents:
        input.maxDiscountCents ?? null,
      startsAt,
      endsAt,
      isActive:
        input.isActive ?? true,
      usageLimit:
        input.usageLimit ?? null,
    };

    this.validatePromotionRules({
      discountType:
        normalized.discountType,
      discountValue:
        normalized.discountValue,
      minSubtotalCents:
        normalized.minSubtotalCents,
      maxDiscountCents:
        normalized.maxDiscountCents,
      startsAt:
        normalized.startsAt,
      endsAt:
        normalized.endsAt,
      usageLimit:
        normalized.usageLimit,
      usageCount: 0,
    });

    return normalized;
  }

  private normalizePromotionCode(
    rawCode: string,
  ): string {
    const code = rawCode
      .trim()
      .toUpperCase();

    if (!code) {
      throw new BadRequestException(
        'Promotion code is required',
      );
    }

    return code;
  }

  private parseOptionalDate(
    value: string | null | undefined,
    fieldName: string,
  ): Date | null {
    if (
      value === undefined ||
      value === null
    ) {
      return null;
    }

    const date = new Date(value);

    if (
      Number.isNaN(date.getTime())
    ) {
      throw new BadRequestException(
        `${fieldName} must be a valid date`,
      );
    }

    return date;
  }

  private validatePromotionRules(
    input: {
      discountType:
        | 'percentage'
        | 'fixed';
      discountValue: number;
      minSubtotalCents: number;
      maxDiscountCents:
        | number
        | null;
      startsAt: Date | null;
      endsAt: Date | null;
      usageLimit: number | null;
      usageCount: number;
    },
  ): void {
    if (
      !Number.isInteger(
        input.discountValue,
      ) ||
      input.discountValue <= 0
    ) {
      throw new BadRequestException(
        'Promotion discount value must be a positive integer',
      );
    }

    if (
      input.discountType ===
        'percentage' &&
      input.discountValue > 100
    ) {
      throw new BadRequestException(
        'Percentage promotion cannot exceed 100%',
      );
    }

    if (
      !Number.isInteger(
        input.minSubtotalCents,
      ) ||
      input.minSubtotalCents < 0
    ) {
      throw new BadRequestException(
        'Minimum subtotal must be a non-negative integer',
      );
    }

    if (
      input.maxDiscountCents !== null &&
      (
        !Number.isInteger(
          input.maxDiscountCents,
        ) ||
        input.maxDiscountCents < 0
      )
    ) {
      throw new BadRequestException(
        'Maximum discount must be a non-negative integer',
      );
    }

    if (
      input.startsAt &&
      input.endsAt &&
      input.endsAt <= input.startsAt
    ) {
      throw new BadRequestException(
        'Promotion end date must be after start date',
      );
    }

    if (
      input.usageLimit !== null &&
      (
        !Number.isInteger(
          input.usageLimit,
        ) ||
        input.usageLimit <= 0
      )
    ) {
      throw new BadRequestException(
        'Promotion usage limit must be a positive integer',
      );
    }

    if (
      input.usageLimit !== null &&
      input.usageLimit <
        input.usageCount
    ) {
      throw new ConflictException(
        `Usage limit cannot be lower than current usage count (${input.usageCount})`,
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

  private async assertProductCategoryPath(
    categoryId: string,
    subcategoryId: string,
    subsubcategoryId: string | null,
  ): Promise<void> {
    const categoryIds = Array.from(
      new Set(
        [
          categoryId,
          subcategoryId,
          subsubcategoryId,
        ].filter(
          (id): id is string =>
            Boolean(id),
        ),
      ),
    );

    const rows = await this.db
      .select({
        id: categories.id,
        parentId: categories.parentId,
        isActive: categories.isActive,
      })
      .from(categories)
      .where(
        inArray(
          categories.id,
          categoryIds,
        ),
      );

    const byId = new Map(
      rows.map((category) => [
        category.id,
        category,
      ]),
    );

    const category =
      byId.get(categoryId);

    if (
      !category ||
      !category.isActive ||
      category.parentId !== null
    ) {
      throw new BadRequestException(
        'Product category must be an active top-level category',
      );
    }

    const subcategory =
      byId.get(subcategoryId);

    if (
      !subcategory ||
      !subcategory.isActive ||
      subcategory.parentId !==
        category.id
    ) {
      throw new BadRequestException(
        'Product subcategory must be an active direct child of the selected category',
      );
    }

    if (!subsubcategoryId) {
      return;
    }

    const subsubcategory =
      byId.get(subsubcategoryId);

    if (
      !subsubcategory ||
      !subsubcategory.isActive ||
      subsubcategory.parentId !==
        subcategory.id
    ) {
      throw new BadRequestException(
        'Product sub-subcategory must be an active direct child of the selected subcategory',
      );
    }
  }

  private async assertCategorySubtreeCanMove(
    categoryId: string,
  ): Promise<void> {
    const subtreeIds = [categoryId];
    const visited =
      new Set<string>([categoryId]);
    let frontier = [categoryId];

    while (frontier.length > 0) {
      const children = await this.db
        .select({
          id: categories.id,
        })
        .from(categories)
        .where(
          inArray(
            categories.parentId,
            frontier,
          ),
        );

      const nextFrontier = children
        .map((child) => child.id)
        .filter(
          (id) =>
            !visited.has(id),
        );

      for (const id of nextFrontier) {
        visited.add(id);
        subtreeIds.push(id);
      }

      frontier = nextFrontier;
    }

    const [usage] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(products)
      .where(
        or(
          inArray(
            products.categoryId,
            subtreeIds,
          ),
          inArray(
            products.subcategoryId,
            subtreeIds,
          ),
          inArray(
            products.subsubcategoryId,
            subtreeIds,
          ),
        ),
      );

    if ((usage?.count ?? 0) > 0) {
      throw new ConflictException(
        'Category hierarchy cannot be moved while products use this category or one of its descendants',
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
          variantId:
            image.variantId ?? null,
        };
      },
    );
  }

  private validateProductPrices(
    input: {
      priceCents: number;
      compareAtPriceCents?: number | null;
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
      input.compareAtPriceCents !=
        null &&
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
      variant.priceCents != null &&
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

  // ──── PERSONALIZATION VALIDATION ────

  private validatePersonalization(
    isPersonalizable: boolean | undefined,
    personalizationConfig: Record<string, unknown> | null | undefined,
    personalizationPrompt: string | null | undefined,
  ): { config: Record<string, unknown> | null; prompt: string | null } {
    const enabled = isPersonalizable === true;

    if (!enabled) {
      return { config: null, prompt: null };
    }

    if (!personalizationConfig || typeof personalizationConfig !== 'object') {
      throw new BadRequestException(
        'Personalization config is required for personalizable products',
      );
    }

    // ── version (must be exactly 1) ──
    const version = personalizationConfig.version;
    if (typeof version !== 'number' || version !== 1 || !Number.isInteger(version)) {
      throw new BadRequestException(
        'Personalization config version must be 1',
      );
    }

    const mode = personalizationConfig.mode;

    if (mode === 'FREE') {
      return {
        config: this.buildFreeConfig(personalizationConfig),
        prompt: personalizationPrompt?.trim() || null,
      };
    }

    if (mode === 'OPTIONS') {
      return {
        config: this.buildOptionsConfig(personalizationConfig),
        prompt: personalizationPrompt?.trim() || null,
      };
    }

    throw new BadRequestException(
      'Unsupported personalization mode',
    );
  }

  // ── FREE: validate + build canonical form ──

  private buildFreeConfig(raw: Record<string, unknown>): Record<string, unknown> {
    const label = raw.label;
    if (typeof label !== 'string' || !label.trim()) {
      throw new BadRequestException(
        'FREE personalization label is required',
      );
    }

    const required = raw.required;
    if (typeof required !== 'boolean') {
      throw new BadRequestException(
        'FREE personalization required field must be a boolean',
      );
    }

    const maxLength = raw.maxLength;
    if (
      maxLength !== undefined &&
      maxLength !== null &&
      (typeof maxLength !== 'number' ||
        !Number.isInteger(maxLength) ||
        maxLength < 1 ||
        maxLength > 500)
    ) {
      throw new BadRequestException(
        'FREE personalization maxLength must be an integer between 1 and 500',
      );
    }

    const placeholder = raw.placeholder;
    if (
      placeholder !== undefined &&
      placeholder !== null &&
      (typeof placeholder !== 'string' ||
        placeholder.length > 200)
    ) {
      throw new BadRequestException(
        'FREE personalization placeholder must be a string of 200 characters or fewer',
      );
    }

    // ── canonical reconstruction ──
    const config: Record<string, unknown> = {
      version: 1,
      mode: 'FREE',
      label: (label as string).trim(),
      required,
      maxLength: typeof maxLength === 'number' ? maxLength : 50,
    };

    if (typeof placeholder === 'string' && placeholder.trim()) {
      config.placeholder = placeholder.trim();
    }

    return config;
  }

  // ── OPTIONS: validate + build canonical form ──

  private buildOptionsConfig(raw: Record<string, unknown>): Record<string, unknown> {
    const fields = raw.fields;

    if (!Array.isArray(fields) || fields.length === 0) {
      throw new BadRequestException(
        'OPTIONS personalization requires at least one field',
      );
    }

    if (fields.length > 10) {
      throw new BadRequestException(
        'OPTIONS personalization supports a maximum of 10 fields',
      );
    }

    const ids = new Set<string>();
    const canonicalFields: Record<string, unknown>[] = [];

    for (const rawField of fields) {
      if (!rawField || typeof rawField !== 'object') {
        throw new BadRequestException(
          'Each personalization field must be an object',
        );
      }

      const field = rawField as Record<string, unknown>;

      // id
      const id = field.id;
      if (typeof id !== 'string' || !id.trim()) {
        throw new BadRequestException(
          'Personalization field id is required',
        );
      }
      if (id.length > 64) {
        throw new BadRequestException(
          'Personalization field id must be 64 characters or fewer',
        );
      }
      if (!/^[a-z0-9_-]+$/.test(id)) {
        throw new BadRequestException(
          'Personalization field id must contain only lowercase letters, numbers, hyphens and underscores',
        );
      }
      if (ids.has(id)) {
        throw new BadRequestException(
          'Personalization field ids must be unique',
        );
      }
      ids.add(id);

      // label
      const label = field.label;
      if (typeof label !== 'string' || !label.trim()) {
        throw new BadRequestException(
          'Personalization field label is required',
        );
      }
      if (label.length > 120) {
        throw new BadRequestException(
          'Personalization field label must be 120 characters or fewer',
        );
      }

      // type
      const type = field.type;
      if (type !== 'TEXT' && type !== 'SELECT') {
        throw new BadRequestException(
          'Personalization field type must be TEXT or SELECT',
        );
      }

      // required
      const required = field.required;
      if (typeof required !== 'boolean') {
        throw new BadRequestException(
          'Personalization field required must be a boolean',
        );
      }

      if (type === 'TEXT') {
        // TEXT must NOT contain options
        if (field.options !== undefined && field.options !== null) {
          throw new BadRequestException(
            'TEXT personalization field must not contain options',
          );
        }

        const placeholder = field.placeholder;
        if (
          placeholder !== undefined &&
          placeholder !== null &&
          (typeof placeholder !== 'string' ||
            placeholder.length > 200)
        ) {
          throw new BadRequestException(
            'TEXT field placeholder must be a string of 200 characters or fewer',
          );
        }

        const maxLength = field.maxLength;
        if (
          maxLength !== undefined &&
          maxLength !== null &&
          (typeof maxLength !== 'number' ||
            !Number.isInteger(maxLength) ||
            maxLength < 1 ||
            maxLength > 500)
        ) {
          throw new BadRequestException(
            'TEXT field maxLength must be an integer between 1 and 500',
          );
        }

        // canonical TEXT field
        const f: Record<string, unknown> = {
          id,
          label: (label as string).trim(),
          type: 'TEXT',
          required,
        };
        if (typeof placeholder === 'string' && placeholder.trim()) {
          f.placeholder = placeholder.trim();
        }
        f.maxLength =
          typeof maxLength === 'number' ? maxLength : 50;

        canonicalFields.push(f);
      }

      if (type === 'SELECT') {
        // SELECT must NOT contain maxLength
        if (field.maxLength !== undefined && field.maxLength !== null) {
          throw new BadRequestException(
            'SELECT personalization field must not contain maxLength',
          );
        }

        const options = field.options;
        if (!Array.isArray(options) || options.length === 0) {
          throw new BadRequestException(
            'SELECT personalization field requires options',
          );
        }
        if (options.length > 30) {
          throw new BadRequestException(
            'SELECT field supports a maximum of 30 options',
          );
        }

        const optionSet = new Set<string>();
        const canonicalOptions: string[] = [];

        for (const opt of options) {
          if (typeof opt !== 'string' || !opt.trim()) {
            throw new BadRequestException(
              'SELECT field options must be non-empty strings',
            );
          }
          const trimmed = opt.trim();
          if (trimmed.length > 120) {
            throw new BadRequestException(
              'SELECT field option must be 120 characters or fewer',
            );
          }
          if (optionSet.has(trimmed.toLowerCase())) {
            throw new BadRequestException(
              'SELECT field options must be unique',
            );
          }
          optionSet.add(trimmed.toLowerCase());
          canonicalOptions.push(trimmed);
        }

        // canonical SELECT field
        canonicalFields.push({
          id,
          label: (label as string).trim(),
          type: 'SELECT',
          required,
          options: canonicalOptions,
        });
      }
    }

    return {
      version: 1,
      mode: 'OPTIONS',
      fields: canonicalFields,
    };
  }
}

