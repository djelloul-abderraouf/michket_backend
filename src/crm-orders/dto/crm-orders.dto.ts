import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsIn,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export const CRM_ORDER_SOURCES = [
  'ecom',
  'whatsapp',
  'facebook',
  'instagram',
] as const;

export class CreateCrmOrderDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  wilayaName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  wilayaCode?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  commune?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressLine1?: string;

  @ApiProperty({
    enum: CRM_ORDER_SOURCES,
    description: 'Manual CRM orders are WhatsApp / Facebook / Instagram. E-com is set automatically by checkout.',
  })
  @IsIn(CRM_ORDER_SOURCES)
  source!: (typeof CRM_ORDER_SOURCES)[number];

  @ApiPropertyOptional({ enum: ['home', 'office'] })
  @IsOptional()
  @IsIn(['home', 'office'])
  deliveryType?: 'home' | 'office';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryOfficeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryOfficeId?: string;

  @ApiPropertyOptional({ enum: ['particulier', 'professionnel'] })
  @IsOptional()
  @IsIn(['particulier', 'professionnel'])
  clientType?: 'particulier' | 'professionnel';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  colorName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  personalizationText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity?: number;
}

export class UpdateCrmOrderStatusDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  status!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
