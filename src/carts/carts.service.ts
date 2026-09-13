import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  and,
  eq,
  isNull,
  inArray,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../database/schema';
import {
  carts,
  cartItems,
  products,
  productVariants,
  productImages,
} from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';

const MAX_CART_QUANTITY = 99;
const MAX_PERSONALIZATION_BYTES = 10_000;

@Injectable()
export class CartsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async getOrCreate(
    userId?: string,
    sessionId?: string,
  ) {
    if (!userId && !sessionId) {
      throw new BadRequestException(
        'A user id or guest session id is required',
      );
    }

    const existing = await this.findActiveCart(
      userId,
      sessionId,
    );

    if (existing) {
      return existing;
    }

    // Partial unique indexes on active user/session carts protect us
    // against two simultaneous requests creating duplicate active carts.
    await this.db
      .insert(carts)
      .values({
        userId: userId ?? null,
        sessionId: sessionId ?? null,
      })
      .onConflictDoNothing();

    const created = await this.findActiveCart(
      userId,
      sessionId,
    );

    if (!created) {
      throw new BadRequestException(
        'Unable to create cart',
      );
    }

    return created;
  }

  async addItem(
    cartId: string,
    productId: string,
    quantity: number,
    variantId?: string,
    personalization?: unknown,
  ) {
    this.assertQuantity(quantity);

    const personalizationKey =
      this.buildPersonalizationKey(
        personalization,
      );

    return this.db.transaction(async (tx) => {
      // Lock the cart row so simultaneous add-item requests for the
      // same cart are processed one after another.
      const [cart] = await tx
        .select()
        .from(carts)
        .where(eq(carts.id, cartId))
        .for('update')
        .limit(1);

      if (
        !cart ||
        cart.status !== 'active'
      ) {
        throw new NotFoundException(
          'Active cart not found',
        );
      }

      const [product] = await tx
        .select()
        .from(products)
        .where(
          and(
            eq(products.id, productId),
            eq(products.isActive, true),
          ),
        )
        .limit(1);

      if (!product) {
        throw new NotFoundException(
          'Product not found or unavailable',
        );
      }

      if (
        personalization !== undefined &&
        personalization !== null &&
        !product.isPersonalizable
      ) {
        throw new BadRequestException(
          `Product "${product.name}" is not personalizable`,
        );
      }

      let variant:
        | typeof productVariants.$inferSelect
        | undefined;

      if (variantId) {
        [variant] = await tx
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
              eq(
                productVariants.isActive,
                true,
              ),
            ),
          )
          .limit(1);

        if (!variant) {
          throw new BadRequestException(
            'Variant does not belong to this product or is unavailable',
          );
        }
      } else {
        const [activeVariant] = await tx
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
            ),
          )
          .limit(1);

        if (activeVariant) {
          throw new BadRequestException(
            `A variant must be selected for "${product.name}"`,
          );
        }
      }

      const unitPriceCents =
        variant?.priceCents ??
        product.priceCents;

      const existingConditions = [
        eq(
          cartItems.cartId,
          cartId,
        ),
        eq(
          cartItems.productId,
          productId,
        ),
        eq(
          cartItems.personalizationKey,
          personalizationKey,
        ),
        variantId
          ? eq(
              cartItems.variantId,
              variantId,
            )
          : isNull(cartItems.variantId),
      ];

      const [existingItem] = await tx
        .select()
        .from(cartItems)
        .where(
          and(...existingConditions),
        )
        .limit(1);

      if (existingItem) {
        const nextQuantity =
          existingItem.quantity + quantity;

        this.assertQuantity(
          nextQuantity,
        );

        const [updated] = await tx
          .update(cartItems)
          .set({
            quantity:
              nextQuantity,
            unitPriceCents,
            selectedColorName:
              variant?.colorName ?? null,
            selectedColorHex:
              variant?.colorHex ?? null,
            personalization:
              personalization ?? null,
            updatedAt: new Date(),
          })
          .where(
            eq(
              cartItems.id,
              existingItem.id,
            ),
          )
          .returning();

        return updated;
      }

      const [newItem] = await tx
        .insert(cartItems)
        .values({
          cartId,
          productId,
          variantId:
            variant?.id ?? null,
          quantity,
          unitPriceCents,
          selectedColorName:
            variant?.colorName ?? null,
          selectedColorHex:
            variant?.colorHex ?? null,
          personalization:
            personalization ?? null,
          personalizationKey,
        })
        .returning();

      return newItem;
    });
  }

  async updateOwnedItemQuantity(
    itemId: string,
    quantity: number,
    userId?: string,
    sessionId?: string,
  ) {
    if (quantity <= 0) {
      await this.removeOwnedItem(
        itemId,
        userId,
        sessionId,
      );

      return null;
    }

    this.assertQuantity(quantity);

    const owned = await this.findOwnedItem(
      itemId,
      userId,
      sessionId,
    );

    if (!owned) {
      throw new NotFoundException(
        'Cart item not found',
      );
    }

    const [updated] = await this.db
      .update(cartItems)
      .set({
        quantity,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(
            cartItems.id,
            itemId,
          ),
          eq(
            cartItems.cartId,
            owned.cartId,
          ),
        ),
      )
      .returning();

    if (!updated) {
      throw new NotFoundException(
        'Cart item not found',
      );
    }

    return updated;
  }

  async removeOwnedItem(
    itemId: string,
    userId?: string,
    sessionId?: string,
  ): Promise<void> {
    const owned = await this.findOwnedItem(
      itemId,
      userId,
      sessionId,
    );

    if (!owned) {
      throw new NotFoundException(
        'Cart item not found',
      );
    }

    await this.db
      .delete(cartItems)
      .where(
        and(
          eq(
            cartItems.id,
            itemId,
          ),
          eq(
            cartItems.cartId,
            owned.cartId,
          ),
        ),
      );
  }

  async clearOwnedCart(
    userId?: string,
    sessionId?: string,
  ): Promise<void> {
    const cart = await this.findActiveCart(
      userId,
      sessionId,
    );

    if (!cart) {
      return;
    }

    await this.db
      .delete(cartItems)
      .where(
        eq(
          cartItems.cartId,
          cart.id,
        ),
      );
  }

  async getCartItems(cartId: string) {
    const items = await this.db
      .select({
        id: cartItems.id,
        quantity: cartItems.quantity,
        unitPriceCents: cartItems.unitPriceCents,
        personalization: cartItems.personalization,
        personalizationKey: cartItems.personalizationKey,
        selectedColorName: cartItems.selectedColorName,
        selectedColorHex: cartItems.selectedColorHex,
        variant: {
          id: productVariants.id,
          name: productVariants.name,
          sku: productVariants.sku,
          colorName: productVariants.colorName,
          colorHex: productVariants.colorHex,
          isMulticolor: productVariants.isMulticolor,
          priceCents: productVariants.priceCents,
        },
        product: {
          id: products.id,
          name: products.name,
          slug: products.slug,
          priceCents: products.priceCents,
          isPersonalizable: products.isPersonalizable,
        },
      })
      .from(cartItems)
      .innerJoin(
        products,
        eq(
          cartItems.productId,
          products.id,
        ),
      )
      .leftJoin(
        productVariants,
        eq(
          cartItems.variantId,
          productVariants.id,
        ),
      )
      .where(
        eq(
          cartItems.cartId,
          cartId,
        ),
      );

    if (items.length === 0) {
      return [];
    }

    const productIds = [
      ...new Set(
        items.map((item) => item.product.id),
      ),
    ];

    const images = await this.db
      .select({
        id: productImages.id,
        productId: productImages.productId,
        url: productImages.url,
        altText: productImages.altText,
        sortOrder: productImages.sortOrder,
        isPrimary: productImages.isPrimary,
        variantId: productImages.variantId,
      })
      .from(productImages)
      .where(
        inArray(
          productImages.productId,
          productIds,
        ),
      );

    type CartImage = (typeof images)[number];

    const imagesByProduct = new Map<
      string,
      CartImage[]
    >();

    for (const image of images) {
      const current =
        imagesByProduct.get(image.productId) ?? [];

      current.push(image);
      imagesByProduct.set(
        image.productId,
        current,
      );
    }

    const sortImages = (
      a: CartImage,
      b: CartImage,
    ) => {
      if (a.isPrimary && !b.isPrimary) {
        return -1;
      }

      if (!a.isPrimary && b.isPrimary) {
        return 1;
      }

      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }

      return a.id.localeCompare(b.id);
    };

    return items.map((item) => {
      const availableImages =
        imagesByProduct.get(item.product.id) ?? [];

      const variantImages = item.variant?.id
        ? availableImages
            .filter(
              (image) =>
                image.variantId === item.variant?.id,
            )
            .sort(sortImages)
        : [];

      const generalImages = availableImages
        .filter(
          (image) => image.variantId === null,
        )
        .sort(sortImages);

      const selectedImage =
        variantImages[0] ??
        generalImages[0] ??
        null;

      const authoritativeUnitPriceCents =
        item.variant?.priceCents ??
        item.product.priceCents;

      return {
        ...item,
        unitPriceCents:
          authoritativeUnitPriceCents,
        selectedColorName:
          item.variant?.colorName ??
          item.selectedColorName,
        selectedColorHex:
          item.variant?.colorHex ??
          item.selectedColorHex,
        product: {
          ...item.product,
          imageUrl: selectedImage?.url ?? null,
          imageAlt: selectedImage
            ? selectedImage.altText ??
              item.product.name
            : null,
        },
      };
    });
  }

  async calculateCartTotal(
    cartId: string,
  ) {
    const items =
      await this.getCartItems(cartId);

    const subtotalCents =
      items.reduce(
        (sum, item) =>
          sum +
          item.unitPriceCents *
            item.quantity,
        0,
      );

    return {
      items,
      subtotalCents,
      currency: 'DZD',
      itemCount: items.reduce(
        (sum, item) =>
          sum + item.quantity,
        0,
      ),
    };
  }

  private async findActiveCart(
    userId?: string,
    sessionId?: string,
  ) {
    if (!userId && !sessionId) {
      return null;
    }

    const ownerCondition = userId
      ? eq(
          carts.userId,
          userId,
        )
      : eq(
          carts.sessionId,
          sessionId!,
        );

    const [cart] = await this.db
      .select()
      .from(carts)
      .where(
        and(
          ownerCondition,
          eq(
            carts.status,
            'active',
          ),
        ),
      )
      .limit(1);

    return cart ?? null;
  }

  private async findOwnedItem(
    itemId: string,
    userId?: string,
    sessionId?: string,
  ) {
    if (!userId && !sessionId) {
      throw new BadRequestException(
        'A user id or guest session id is required',
      );
    }

    const ownerCondition = userId
      ? eq(
          carts.userId,
          userId,
        )
      : eq(
          carts.sessionId,
          sessionId!,
        );

    const [row] = await this.db
      .select({
        itemId: cartItems.id,
        cartId: carts.id,
      })
      .from(cartItems)
      .innerJoin(
        carts,
        eq(
          cartItems.cartId,
          carts.id,
        ),
      )
      .where(
        and(
          eq(
            cartItems.id,
            itemId,
          ),
          eq(
            carts.status,
            'active',
          ),
          ownerCondition,
        ),
      )
      .limit(1);

    return row ?? null;
  }

  private assertQuantity(
    quantity: number,
  ): void {
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity >
        MAX_CART_QUANTITY
    ) {
      throw new BadRequestException(
        `Quantity must be an integer between 1 and ${MAX_CART_QUANTITY}`,
      );
    }
  }

  private buildPersonalizationKey(
    personalization?: unknown,
  ): string {
    if (
      personalization === undefined ||
      personalization === null
    ) {
      return '';
    }

    const normalized =
      this.stableStringify(
        personalization,
      );

    const bytes =
      Buffer.byteLength(
        normalized,
        'utf8',
      );

    if (
      bytes >
      MAX_PERSONALIZATION_BYTES
    ) {
      throw new BadRequestException(
        'Personalization data is too large',
      );
    }

    return createHash('sha256')
      .update(normalized)
      .digest('hex');
  }

  private stableStringify(
    value: unknown,
  ): string {
    if (
      value === null ||
      typeof value !== 'object'
    ) {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value
        .map((item) =>
          this.stableStringify(
            item,
          ),
        )
        .join(',')}]`;
    }

    const record =
      value as Record<
        string,
        unknown
      >;

    const keys =
      Object.keys(record).sort();

    return `{${keys
      .map(
        (key) =>
          `${JSON.stringify(
            key,
          )}:${this.stableStringify(
            record[key],
          )}`,
      )
      .join(',')}}`;
  }
}
