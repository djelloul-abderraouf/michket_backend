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
  @IsInt()
  @Min(0)
  @Max(99)
  quantity!: number;
}
