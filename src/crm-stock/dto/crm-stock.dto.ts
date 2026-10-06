import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const itemTypes = ['matiere', 'composant', 'semi_fini', 'produit_fini'] as const;
const itemUsages = ['alimentation', 'vente', 'les_deux'] as const;
const manualMovements = ['restock', 'adjustment', 'loss', 'return'] as const;
const recipeKinds = ['manufacturing', 'sales'] as const;

export class CreateStockItemDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ enum: itemTypes })
  @IsIn(itemTypes)
  itemType!: (typeof itemTypes)[number];

  @ApiPropertyOptional({ enum: itemUsages })
  @IsOptional()
  @IsIn(itemUsages)
  usage?: (typeof itemUsages)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  minQuantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  initialQuantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  catalogProductId?: string | null;
}

export class UpdateStockItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: itemTypes })
  @IsOptional()
  @IsIn(itemTypes)
  itemType?: (typeof itemTypes)[number];

  @ApiPropertyOptional({ enum: itemUsages })
  @IsOptional()
  @IsIn(itemUsages)
  usage?: (typeof itemUsages)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  minQuantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  catalogProductId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateStockMovementDto {
  @ApiProperty()
  @IsUUID()
  itemId!: string;

  @ApiProperty({ enum: manualMovements })
  @IsIn(manualMovements)
  movementType!: (typeof manualMovements)[number];

  @ApiProperty()
  @IsNumber()
  quantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class RecipeLineDto {
  @ApiProperty()
  @IsUUID()
  componentItemId!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.001)
  quantityPerUnit!: number;
}

export class SaveRecipeDto {
  @ApiProperty({ enum: recipeKinds })
  @IsIn(recipeKinds)
  kind!: (typeof recipeKinds)[number];

  @ApiProperty()
  @IsUUID()
  outputItemId!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ type: [RecipeLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipeLineDto)
  lines!: RecipeLineDto[];
}

export class ManufactureDto {
  @ApiProperty()
  @IsUUID()
  outputItemId!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
