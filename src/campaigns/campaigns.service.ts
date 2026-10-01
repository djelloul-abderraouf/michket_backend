import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { UpsertCampaignDto } from './campaigns.dto';
import { DATABASE_CONNECTION } from '../database/database.module';
import * as schema from '../database/schema';
import {
  campaignItems,
  campaigns,
  categories,
  productImages,
  products,
  productVariants,
  trackingPixels,
} from '../database/schema';

type NormalizedItem = {
  productId: string;
  title: string;
  sortOrder: number;
  variantIds: string[];
};

@Injectable()
export class CampaignsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async catalog() {
    const rows = await this.db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        priceCents: products.priceCents,
        isPersonalizable: products.isPersonalizable,
        isActive: products.isActive,
      })
      .from(products)
      .where(eq(products.isActive, true))
      .orderBy(asc(products.name))
      .limit(200);

    return this.attachProductChoices(rows);
  }

  async list() {
    const rows = await this.db
      .select()
      .from(campaigns)
      .orderBy(desc(campaigns.createdAt));

    if (rows.length === 0) return [];

    const items = await this.db
      .select({
        campaignId: campaignItems.campaignId,
      })
      .from(campaignItems)
      .where(
        inArray(
          campaignItems.campaignId,
          rows.map((row) => row.id),
        ),
      );

    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(
        item.campaignId,
        (counts.get(item.campaignId) ?? 0) + 1,
      );
    }

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      publicTitle: row.publicTitle,
      slug: row.slug,
      isActive: row.isActive,
      metaPixelId: row.metaPixelId,
      tiktokPixelId: row.tiktokPixelId,
      itemCount: counts.get(row.id) ?? 0,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async getById(id: string) {
    const campaign = await this.findCampaign(id);
    const items = await this.loadItems(campaign.id);
    const choices = await this.attachProductChoices(
      await this.loadProducts(items.map((item) => item.productId)),
    );
    const byId = new Map(choices.map((product) => [product.id, product]));

    return {
      id: campaign.id,
      title: campaign.title,
      publicTitle: campaign.publicTitle,
      slug: campaign.slug,
      isActive: campaign.isActive,
      metaPixelId: campaign.metaPixelId,
      tiktokPixelId: campaign.tiktokPixelId,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
      items: items.map((item) => ({
        id: item.id,
        productId: item.productId,
        title: item.title,
        sortOrder: item.sortOrder,
        variantIds: item.variantIds,
        product: byId.get(item.productId) ?? null,
      })),
    };
  }

  async getPublic(slug: string) {
    const [campaign] = await this.db
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.slug, slug),
          eq(campaigns.isActive, true),
        ),
      )
      .limit(1);

    if (!campaign) {
      throw new NotFoundException('Campagne introuvable');
    }

    const items = await this.loadItems(campaign.id);
    const productRows = (
      await this.loadProducts(items.map((item) => item.productId))
    ).filter((product) => product.isActive);

    const activeIds = new Set(productRows.map((product) => product.id));
    const visibleItems = items.filter((item) =>
      activeIds.has(item.productId),
    );

    if (visibleItems.length === 0) {
      throw new NotFoundException('Campagne introuvable');
    }

    const presented = await this.presentProducts(productRows);

    const publicItems = visibleItems.flatMap((item) => {
        const product = presented.get(item.productId);
        if (!product) return [];

        const allowed = new Set(item.variantIds);
        const variants =
          product.variants.length === 0
            ? []
            : product.variants.filter((variant) =>
                allowed.has(variant.id),
              );

        if (product.variants.length > 0 && variants.length === 0) {
          return [];
        }

        return [
          {
            id: item.id,
            title: item.title,
            productId: product.id,
            name: product.name,
            slug: product.slug,
            price: product.price,
            imageUrl: product.imageUrl,
            personalizable: product.personalizable,
            orderDetailsPrompt: product.orderDetailsPrompt,
            variants,
          },
        ];
    });

    if (publicItems.length === 0) {
      throw new NotFoundException('Campagne introuvable');
    }

    const pixels = await this.publicPixels(
      campaign.metaPixelId,
      campaign.tiktokPixelId,
    );

    return {
      id: campaign.id,
      slug: campaign.slug,
      publicTitle: campaign.publicTitle,
      pixels,
      items: publicItems,
    };
  }

  async create(input: UpsertCampaignDto, userId: string) {
    const normalized = await this.normalizeItems(input.items);
    await this.assertSlugAvailable(input.slug);
    const metaPixelId = await this.resolvePixel(input.metaPixelId, 'meta');
    const tiktokPixelId = await this.resolvePixel(
      input.tiktokPixelId,
      'tiktok',
    );

    return this.db.transaction(async (tx) => {
      const [campaign] = await tx
        .insert(campaigns)
        .values({
          title: input.title.trim(),
          publicTitle: input.publicTitle.trim(),
          slug: input.slug,
          isActive: input.isActive ?? true,
          metaPixelId,
          tiktokPixelId,
          createdBy: userId,
        })
        .returning();

      await tx.insert(campaignItems).values(
        normalized.map((item) => ({
          campaignId: campaign.id,
          productId: item.productId,
          title: item.title,
          sortOrder: item.sortOrder,
          variantIds: item.variantIds,
        })),
      );

      return { id: campaign.id, slug: campaign.slug };
    });
  }

  async update(id: string, input: UpsertCampaignDto) {
    await this.findCampaign(id);
    const normalized = await this.normalizeItems(input.items);
    await this.assertSlugAvailable(input.slug, id);
    const metaPixelId = await this.resolvePixel(input.metaPixelId, 'meta');
    const tiktokPixelId = await this.resolvePixel(
      input.tiktokPixelId,
      'tiktok',
    );

    await this.db.transaction(async (tx) => {
      await tx
        .update(campaigns)
        .set({
          title: input.title.trim(),
          publicTitle: input.publicTitle.trim(),
          slug: input.slug,
          isActive: input.isActive ?? true,
          metaPixelId,
          tiktokPixelId,
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, id));

      await tx
        .delete(campaignItems)
        .where(eq(campaignItems.campaignId, id));

      await tx.insert(campaignItems).values(
        normalized.map((item) => ({
          campaignId: id,
          productId: item.productId,
          title: item.title,
          sortOrder: item.sortOrder,
          variantIds: item.variantIds,
        })),
      );
    });

    return { id, slug: input.slug };
  }

  private async resolvePixel(
    pixelRowId: string | null | undefined,
    platform: 'meta' | 'tiktok',
  ) {
    if (!pixelRowId) return null;

    const [pixel] = await this.db
      .select({
        id: trackingPixels.id,
        platform: trackingPixels.platform,
      })
      .from(trackingPixels)
      .where(eq(trackingPixels.id, pixelRowId))
      .limit(1);

    if (!pixel || pixel.platform !== platform) {
      throw new BadRequestException(
        platform === 'meta'
          ? 'Le pixel Meta sélectionné est invalide.'
          : 'Le pixel TikTok sélectionné est invalide.',
      );
    }

    return pixel.id;
  }

  private async publicPixels(
    metaPixelId: string | null,
    tiktokPixelId: string | null,
  ) {
    const ids = [metaPixelId, tiktokPixelId].filter(
      (id): id is string => Boolean(id),
    );

    if (ids.length === 0) {
      return { meta: null, tiktok: null };
    }

    const rows = await this.db
      .select({
        id: trackingPixels.id,
        platform: trackingPixels.platform,
        pixelId: trackingPixels.pixelId,
        isActive: trackingPixels.isActive,
      })
      .from(trackingPixels)
      .where(inArray(trackingPixels.id, ids));

    const meta = rows.find(
      (row) => row.id === metaPixelId && row.platform === 'meta' && row.isActive,
    );
    const tiktok = rows.find(
      (row) =>
        row.id === tiktokPixelId && row.platform === 'tiktok' && row.isActive,
    );

    return {
      meta: meta?.pixelId ?? null,
      tiktok: tiktok?.pixelId ?? null,
    };
  }

  private async findCampaign(id: string) {
    const [campaign] = await this.db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .limit(1);

    if (!campaign) {
      throw new NotFoundException('Campagne introuvable');
    }

    return campaign;
  }

  private async loadItems(campaignId: string) {
    return this.db
      .select()
      .from(campaignItems)
      .where(eq(campaignItems.campaignId, campaignId))
      .orderBy(asc(campaignItems.sortOrder), asc(campaignItems.title));
  }

  private async loadProducts(ids: string[]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];

    return this.db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        priceCents: products.priceCents,
        isPersonalizable: products.isPersonalizable,
        isActive: products.isActive,
        personalizationPrompt: products.personalizationPrompt,
        categoryId: products.categoryId,
        subcategoryId: products.subcategoryId,
        subsubcategoryId: products.subsubcategoryId,
      })
      .from(products)
      .where(inArray(products.id, unique));
  }

  private async normalizeItems(
    items: UpsertCampaignDto['items'],
  ): Promise<NormalizedItem[]> {
    const productRows = await this.loadProducts(
      items.map((item) => item.productId),
    );
    const productsById = new Map(
      productRows.map((product) => [product.id, product]),
    );

    const variantRows = await this.db
      .select({
        id: productVariants.id,
        productId: productVariants.productId,
        isActive: productVariants.isActive,
      })
      .from(productVariants)
      .where(
        inArray(
          productVariants.productId,
          [...productsById.keys()],
        ),
      );

    const activeByProduct = new Map<string, Set<string>>();
    for (const variant of variantRows) {
      if (!variant.isActive) continue;
      const set =
        activeByProduct.get(variant.productId) ?? new Set<string>();
      set.add(variant.id);
      activeByProduct.set(variant.productId, set);
    }

    return items.map((item, index) => {
      const product = productsById.get(item.productId);
      if (!product || !product.isActive) {
        throw new BadRequestException(
          'Un des produits sélectionnés est introuvable.',
        );
      }

      const allowed = activeByProduct.get(product.id) ?? new Set<string>();
      const variantIds = [...new Set(item.variantIds)];

      if (allowed.size > 0 && variantIds.length === 0) {
        throw new BadRequestException(
          `Choisissez au moins une couleur pour « ${product.name} ».`,
        );
      }

      for (const variantId of variantIds) {
        if (!allowed.has(variantId)) {
          throw new BadRequestException(
            `Une couleur ne correspond pas au produit « ${product.name} ».`,
          );
        }
      }

      return {
        productId: product.id,
        title: item.title.trim(),
        sortOrder: item.sortOrder ?? index,
        variantIds,
      };
    });
  }

  private async assertSlugAvailable(slug: string, ignoreId?: string) {
    const [existing] = await this.db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(eq(campaigns.slug, slug))
      .limit(1);

    if (existing && existing.id !== ignoreId) {
      throw new ConflictException(
        'Ce lien de campagne est déjà utilisé.',
      );
    }
  }

  private async attachProductChoices<
    T extends {
      id: string;
      name: string;
      slug: string;
      priceCents: number;
      isPersonalizable: boolean;
      isActive: boolean;
    },
  >(rows: T[]) {
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.id);
    const [variants, images] = await Promise.all([
      this.db
        .select({
          id: productVariants.id,
          productId: productVariants.productId,
          name: productVariants.name,
          colorName: productVariants.colorName,
          colorHex: productVariants.colorHex,
          isMulticolor: productVariants.isMulticolor,
          sortOrder: productVariants.sortOrder,
        })
        .from(productVariants)
        .where(
          and(
            inArray(productVariants.productId, ids),
            eq(productVariants.isActive, true),
          ),
        )
        .orderBy(asc(productVariants.sortOrder)),
      this.db
        .select({
          productId: productImages.productId,
          url: productImages.url,
          isPrimary: productImages.isPrimary,
          sortOrder: productImages.sortOrder,
        })
        .from(productImages)
        .where(inArray(productImages.productId, ids))
        .orderBy(
          desc(productImages.isPrimary),
          asc(productImages.sortOrder),
        ),
    ]);

    const imageByProduct = new Map<string, string>();
    for (const image of images) {
      if (!imageByProduct.has(image.productId)) {
        imageByProduct.set(image.productId, image.url);
      }
    }

    return rows.map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      price: Math.round(product.priceCents / 100),
      isActive: product.isActive,
      personalizable: product.isPersonalizable,
      imageUrl: imageByProduct.get(product.id) ?? null,
      variants: variants
        .filter((variant) => variant.productId === product.id)
        .map((variant) => ({
          id: variant.id,
          name: variant.colorName || variant.name,
          hex: variant.colorHex,
          isMulticolor: variant.isMulticolor,
        })),
    }));
  }

  private async presentProducts(
    rows: Awaited<ReturnType<CampaignsService['loadProducts']>>,
  ) {
    const choices = await this.attachProductChoices(rows);
    const categoryIds = [
      ...new Set(
        rows.flatMap((row) =>
          [
            row.subsubcategoryId,
            row.subcategoryId,
            row.categoryId,
          ].filter((id): id is string => Boolean(id)),
        ),
      ),
    ];

    const categoryRows =
      categoryIds.length === 0
        ? []
        : await this.db
            .select({
              id: categories.id,
              orderDetailsPrompt: categories.orderDetailsPrompt,
            })
            .from(categories)
            .where(inArray(categories.id, categoryIds));

    const prompts = new Map(
      categoryRows.map((row) => [row.id, row.orderDetailsPrompt]),
    );
    const source = new Map(rows.map((row) => [row.id, row]));

    return new Map(
      choices.map((product) => {
        const row = source.get(product.id);
        const orderDetailsPrompt =
          (row?.subsubcategoryId
            ? prompts.get(row.subsubcategoryId)
            : null) ||
          (row?.subcategoryId
            ? prompts.get(row.subcategoryId)
            : null) ||
          (row?.categoryId ? prompts.get(row.categoryId) : null) ||
          row?.personalizationPrompt ||
          null;

        return [
          product.id,
          {
            ...product,
            orderDetailsPrompt,
          },
        ];
      }),
    );
  }
}
