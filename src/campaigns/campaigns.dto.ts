import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CampaignItemDto {
  @IsUUID()
  productId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsArray()
  @ArrayMaxSize(30)
  @IsUUID('4', { each: true })
  variantIds!: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpsertCampaignDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  publicTitle!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CampaignItemDto)
  items!: CampaignItemDto[];
}
