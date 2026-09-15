import {
  IsInt,
  IsObject,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class AddCartItemDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;

  @IsOptional()
  @IsObject()
  personalization?: Record<string, unknown>;
}

export class UpdateCartItemDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  quantity?: number;

  /**
   * Allows the customer to change the selected variant/color
   * for an existing cart line.
   *
   * null explicitly clears the variant for products that do not
   * require one.
   */
  @IsOptional()
  @IsUUID()
  variantId?: string | null;

  /**
   * Allows the customer to edit or remove personalization
   * without deleting/re-adding the cart item.
   *
   * null explicitly clears existing personalization.
   */
  @IsOptional()
  @IsObject()
  personalization?: Record<string, unknown> | null;
}
