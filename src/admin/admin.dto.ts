import { Type } from 'class-transformer';

import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  OmitType,
  PartialType,
} from '@nestjs/swagger';

const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
] as const;

const PRODUCT_BADGES = [
  'BEST_SELLER',
  'NOUVEAU',
  'PROMO',
  'PERSONNALISABLE',
  'ENVOI_GRATUIT',
] as const;

const USER_ROLES = [
  'customer',
  'admin',
  'super_admin',
] as const;

const PROMOTION_DISCOUNT_TYPES = [
  'percentage',
  'fixed',
] as const;

export class AdminPaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit = 20;
}

export class AdminOrdersQueryDto extends AdminPaginationDto {
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: (typeof ORDER_STATUSES)[number];
}

export class UpdateOrderStatusDto {
  @IsIn(ORDER_STATUSES)
  status!: (typeof ORDER_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AdminInventoryDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;

  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean;
}

export class AdminProductImageDto {
  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
  })
  url!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  storagePath!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  altText?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  variantId?: string | null;
}

export class CreateAdminProductImageDto extends AdminProductImageDto {}

export class UpdateAdminProductImageDto extends PartialType(
  OmitType(AdminProductImageDto, [
    'url',
    'storagePath',
  ] as const),
) {}

export class AdminProductImageOrderItemDto {
  @IsUUID()
  imageId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ReorderAdminProductImagesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AdminProductImageOrderItemDto)
  images!: AdminProductImageOrderItemDto[];
}

export class AdminProductVariantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  colorName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message:
      'colorHex must be a 6-digit hex color like #FFAA00',
  })
  colorHex?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceCents?: number;

  @IsOptional()
  @IsObject()
  options?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => AdminInventoryDto)
  inventory?: AdminInventoryDto;
}

export class CreateAdminProductVariantDto extends AdminProductVariantDto {}

export class UpdateAdminProductVariantDto extends PartialType(
  OmitType(AdminProductVariantDto, [
    'inventory',
  ] as const),
) {}

export class CreateAdminProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(220)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'slug must contain only lowercase letters, numbers and hyphens',
  })
  slug!: string;

  // Explicit catalogue path:
  // categoryId -> root category (ex. Lampes 3D)
  // subcategoryId -> level 2 (ex. Football)
  // subsubcategoryId -> optional level 3 (ex. Real Madrid)
  @IsUUID()
  categoryId!: string;

  @IsUUID()
  subcategoryId!: string;

  @IsOptional()
  @IsUUID()
  subsubcategoryId?: string | null;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescription?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceCents!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  compareAtPriceCents?: number;

  @IsOptional()
  @IsIn(PRODUCT_BADGES)
  badge?: (typeof PRODUCT_BADGES)[number];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  occasions?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isPersonalizable?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  personalizationPrompt?: string;

  @IsOptional()
  @IsObject()
  personalizationConfig?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  metaDescription?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AdminProductImageDto)
  images?: AdminProductImageDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AdminProductVariantDto)
  variants?: AdminProductVariantDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => AdminInventoryDto)
  inventory?: AdminInventoryDto;
}

export class UpdateAdminProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'slug must contain only lowercase letters, numbers and hyphens',
  })
  slug?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  subcategoryId?: string;

  @IsOptional()
  @IsUUID()
  subsubcategoryId?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescription?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  compareAtPriceCents?: number | null;

  @IsOptional()
  @IsIn(PRODUCT_BADGES)
  badge?: (typeof PRODUCT_BADGES)[number] | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  occasions?: string[] | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isPersonalizable?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  personalizationPrompt?: string | null;

  @IsOptional()
  @IsObject()
  personalizationConfig?: Record<string, unknown> | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  metaTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  metaDescription?: string | null;
}

export class UpdateAdminInventoryDto extends AdminInventoryDto {
  @IsOptional()
  @IsUUID()
  variantId?: string;
}

export class CreateAdminCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @IsString()
  @MaxLength(180)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'slug must contain only lowercase letters, numbers and hyphens',
  })
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  pageTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  productsTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  filterLabel?: string;

  @IsOptional()
  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
  })
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageStoragePath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  href?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  metaDescription?: string;
}

export class UpdateAdminCategoryDto extends PartialType(
  CreateAdminCategoryDto,
) {}

// ── Category Hero Images ──

export class CreateCategoryHeroImageDto {
  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
  })
  url!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  storagePath!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  altText?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateCategoryHeroImageDto extends PartialType(
  OmitType(CreateCategoryHeroImageDto, [
    'url',
    'storagePath',
  ] as const),
) {}

export class CategoryHeroImageOrderItemDto {
  @IsUUID()
  imageId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ReorderCategoryHeroImagesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CategoryHeroImageOrderItemDto)
  images!: CategoryHeroImageOrderItemDto[];
}

export class CreateAdminPromotionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, {
    message:
      'code must contain only letters, numbers, hyphens and underscores',
  })
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsIn(PROMOTION_DISCOUNT_TYPES)
  discountType!: (typeof PROMOTION_DISCOUNT_TYPES)[number];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  discountValue!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minSubtotalCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxDiscountCents?: number | null;

  @IsOptional()
  @IsISO8601()
  startsAt?: string | null;

  @IsOptional()
  @IsISO8601()
  endsAt?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usageLimit?: number | null;
}

export class UpdateAdminPromotionDto extends PartialType(
  CreateAdminPromotionDto,
) {}

export class ChangeUserRoleDto {
  @IsIn(USER_ROLES)
  role!: (typeof USER_ROLES)[number];
}
