import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsIn,
  IsArray,
  ArrayMinSize,
  IsUUID,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateCrmProductionJobDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

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

  @ApiPropertyOptional({ enum: ['en_attente', 'en_cours', 'termine'] })
  @IsOptional()
  @IsEnum(['en_attente', 'en_cours', 'termine'])
  status?: 'en_attente' | 'en_cours' | 'termine';
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

export class CreateCrmPlancheDto {
  @ApiProperty({ minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  capacity!: number;
}

export class UpdateCrmPlancheCapacityDto {
  @ApiProperty({ minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  capacity!: number;
}

export class AddPlancheOrdersDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  orderIds!: string[];
}

export class UpdateCrmPlancheStatusDto {
  @ApiProperty({ enum: ['lancee', 'terminee'] })
  @IsIn(['lancee', 'terminee'])
  status!: 'lancee' | 'terminee';
}
