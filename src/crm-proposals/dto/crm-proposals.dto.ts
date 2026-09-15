import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
  IsArray,
  ValidateNested,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';

class ProposalItem {
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
  unitPrice!: number;
}

export class CreateCrmProposalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  dealId!: string;

  @ApiPropertyOptional({ enum: ['brouillon', 'envoyee', 'acceptee', 'refusee'] })
  @IsOptional()
  @IsEnum(['brouillon', 'envoyee', 'acceptee', 'refusee'])
  status?: 'brouillon' | 'envoyee' | 'acceptee' | 'refusee';

  @ApiProperty({ type: [ProposalItem] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProposalItem)
  items!: ProposalItem[];

  @ApiProperty()
  @IsNumber()
  total!: number;
}

export class UpdateCrmProposalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dealId?: string;

  @ApiPropertyOptional({ enum: ['brouillon', 'envoyee', 'acceptee', 'refusee'] })
  @IsOptional()
  @IsEnum(['brouillon', 'envoyee', 'acceptee', 'refusee'])
  status?: 'brouillon' | 'envoyee' | 'acceptee' | 'refusee';

  @ApiPropertyOptional({ type: [ProposalItem] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProposalItem)
  items?: ProposalItem[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  total?: number;
}
