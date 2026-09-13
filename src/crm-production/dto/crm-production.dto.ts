import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateCrmProductionJobDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  orderRef!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  clientName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productSummary!: string;

  @ApiProperty({ enum: ['en_attente', 'en_cours', 'termine'] })
  @IsEnum(['en_attente', 'en_cours', 'termine'])
  status!: 'en_attente' | 'en_cours' | 'termine';
}

export class UpdateCrmProductionJobDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orderRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productSummary?: string;

  @ApiPropertyOptional({ enum: ['en_attente', 'en_cours', 'termine'] })
  @IsOptional()
  @IsEnum(['en_attente', 'en_cours', 'termine'])
  status?: 'en_attente' | 'en_cours' | 'termine';
}
