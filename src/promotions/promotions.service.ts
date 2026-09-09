import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  eq,
  gt,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../database/schema';
import { promotions } from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';

type DbTransaction = Parameters<
  Parameters<
    NodePgDatabase<typeof schema>['transaction']
  >[0]
>[0];

type PromotionEvaluation = {
  promotionId: string;
  code: string;
  discountCents: number;
};

@Injectable()
export class PromotionsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Public/server-side preview.
   * Does not consume one use of the promotion.
   */
  async preview(
    rawCode: string,
    subtotalCents: number,
  ): Promise<PromotionEvaluation> {
    this.validateSubtotal(subtotalCents);

    const code = this.normalizeCode(rawCode);
    const now = new Date();

    const [promotion] = await this.db
      .select()
      .from(promotions)
      .where(
        and(
          eq(promotions.code, code),
          eq(promotions.isActive, true),
          or(
            isNull(promotions.startsAt),
            lt(promotions.startsAt, now),
            eq(promotions.startsAt, now),
          ),
          or(
            isNull(promotions.endsAt),
            gt(promotions.endsAt, now),
          ),
        ),
      )
      .limit(1);

    if (!promotion) {
      throw new NotFoundException(
        'Promotion code is invalid or inactive',
      );
    }

    this.assertPromotionUsable(
      promotion,
      subtotalCents,
      now,
    );

    return {
      promotionId: promotion.id,
      code: promotion.code,
      discountCents: this.calculateDiscount(
        promotion,
        subtotalCents,
      ),
    };
  }

  /**
   * Checkout-only method.
   *
   * The promotion row is locked and usage_count is incremented inside
   * the SAME PostgreSQL transaction as the order creation. This keeps
   * usage limits safe under concurrent checkouts and rolls back the
   * usage increment if the checkout transaction fails.
   */
  async consumeForCheckout(
    tx: DbTransaction,
    rawCode: string,
    subtotalCents: number,
  ): Promise<PromotionEvaluation> {
    this.validateSubtotal(subtotalCents);

    const code = this.normalizeCode(rawCode);
    const now = new Date();

    const [promotion] = await tx
      .select()
      .from(promotions)
      .where(eq(promotions.code, code))
      .for('update')
      .limit(1);

    if (!promotion) {
      throw new BadRequestException(
        'Promotion code is invalid',
      );
    }

    this.assertPromotionUsable(
      promotion,
      subtotalCents,
      now,
    );

    const discountCents =
      this.calculateDiscount(
        promotion,
        subtotalCents,
      );

    await tx
      .update(promotions)
      .set({
        usageCount: sql`${promotions.usageCount} + 1`,
        updatedAt: now,
      })
      .where(eq(promotions.id, promotion.id));

    return {
      promotionId: promotion.id,
      code: promotion.code,
      discountCents,
    };
  }

  /**
   * Releases one previously consumed use when an order is cancelled
   * (including an automatic expiration).
   *
   * The promotion row is locked so concurrent checkouts/cancellations
   * cannot corrupt usage_count. Missing promotions or an already-zero
   * counter do not block order cancellation.
   */
  async releaseForCancelledOrder(
    tx: DbTransaction,
    rawCode: string,
  ): Promise<boolean> {
    const code = this.normalizeCode(rawCode);
    const now = new Date();

    const [promotion] = await tx
      .select({
        id: promotions.id,
        usageCount: promotions.usageCount,
      })
      .from(promotions)
      .where(eq(promotions.code, code))
      .for('update')
      .limit(1);

    if (
      !promotion ||
      promotion.usageCount <= 0
    ) {
      return false;
    }

    await tx
      .update(promotions)
      .set({
        usageCount: promotion.usageCount - 1,
        updatedAt: now,
      })
      .where(eq(promotions.id, promotion.id));

    return true;
  }

  private assertPromotionUsable(
    promotion: typeof promotions.$inferSelect,
    subtotalCents: number,
    now: Date,
  ): void {
    if (!promotion.isActive) {
      throw new BadRequestException(
        'Promotion code is inactive',
      );
    }

    if (
      promotion.startsAt &&
      promotion.startsAt > now
    ) {
      throw new BadRequestException(
        'Promotion code is not active yet',
      );
    }

    if (
      promotion.endsAt &&
      promotion.endsAt <= now
    ) {
      throw new BadRequestException(
        'Promotion code has expired',
      );
    }

    if (
      promotion.usageLimit !== null &&
      promotion.usageCount >=
        promotion.usageLimit
    ) {
      throw new BadRequestException(
        'Promotion usage limit has been reached',
      );
    }

    if (
      subtotalCents <
      promotion.minSubtotalCents
    ) {
      throw new BadRequestException(
        `Promotion requires a minimum subtotal of ${promotion.minSubtotalCents} centimes`,
      );
    }
  }

  private calculateDiscount(
    promotion: typeof promotions.$inferSelect,
    subtotalCents: number,
  ): number {
    let discountCents: number;

    if (
      promotion.discountType ===
      'percentage'
    ) {
      discountCents = Math.floor(
        subtotalCents *
          promotion.discountValue /
          100,
      );
    } else {
      discountCents =
        promotion.discountValue;
    }

    if (
      promotion.maxDiscountCents !==
      null
    ) {
      discountCents = Math.min(
        discountCents,
        promotion.maxDiscountCents,
      );
    }

    // Promotions never reduce the delivery fee.
    // The maximum discount is the product subtotal.
    return Math.min(
      discountCents,
      subtotalCents,
    );
  }

  private normalizeCode(
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

    if (code.length > 100) {
      throw new BadRequestException(
        'Promotion code is too long',
      );
    }

    return code;
  }

  private validateSubtotal(
    subtotalCents: number,
  ): void {
    if (
      !Number.isInteger(subtotalCents) ||
      subtotalCents < 0
    ) {
      throw new BadRequestException(
        'Subtotal must be a non-negative integer',
      );
    }
  }
}
