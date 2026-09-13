import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
  IsDateString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';

class OrderItem {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productName!: string;

  @ApiProperty()
  @IsNumber()
  quantity!: number;

  @ApiProperty()
  @IsNumber()
  price!: number;
}

export class CreateCrmOrderDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  source!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  clientName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  wilaya!: string;

  @ApiProperty({ enum: ['pas_confirme', 'confirme', 'en_fabrication', 'en_preparation', 'en_livraison', 'livre', 'retour_echec'] })
  @IsEnum(['pas_confirme', 'confirme', 'en_fabrication', 'en_preparation', 'en_livraison', 'livre', 'retour_echec'])
  status!: 'pas_confirme' | 'confirme' | 'en_fabrication' | 'en_preparation' | 'en_livraison' | 'livre' | 'retour_echec';

  @ApiProperty({ type: [OrderItem] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItem)
  items!: OrderItem[];

  @ApiProperty()
  @IsNumber()
  total!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: ['injoignable', 'refus', 'a_rappeler'] })
  @IsOptional()
  @IsEnum(['injoignable', 'refus', 'a_rappeler'])
  confirmationReason?: 'injoignable' | 'refus' | 'a_rappeler';

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  reminderAt?: string;
}

export class UpdateCrmOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  wilaya?: string;

  @ApiPropertyOptional({ enum: ['pas_confirme', 'confirme', 'en_fabrication', 'en_preparation', 'en_livraison', 'livre', 'retour_echec'] })
  @IsOptional()
  @IsEnum(['pas_confirme', 'confirme', 'en_fabrication', 'en_preparation', 'en_livraison', 'livre', 'retour_echec'])
  status?: 'pas_confirme' | 'confirme' | 'en_fabrication' | 'en_preparation' | 'en_livraison' | 'livre' | 'retour_echec';

  @ApiPropertyOptional({ type: [OrderItem] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItem)
  items?: OrderItem[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  total?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: ['injoignable', 'refus', 'a_rappeler'] })
  @IsOptional()
  @IsEnum(['injoignable', 'refus', 'a_rappeler'])
  confirmationReason?: 'injoignable' | 'refus' | 'a_rappeler';

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  reminderAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  carrierStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  deliveredAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  shippedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  returnReason?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  to!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
