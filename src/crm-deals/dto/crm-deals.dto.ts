import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  MinLength,
  MaxLength,
  IsEnum,
  IsDateString,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateCrmDealDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  estimatedAmount!: number;

  @ApiPropertyOptional({ enum: ['prospection', 'qualification', 'devis_envoye', 'negociation', 'gagnee', 'perdue'] })
  @IsOptional()
  @IsEnum(['prospection', 'qualification', 'devis_envoye', 'negociation', 'gagnee', 'perdue'])
  stage?: 'prospection' | 'qualification' | 'devis_envoye' | 'negociation' | 'gagnee' | 'perdue';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedCloseAt?: string;
}

export class UpdateCrmDealDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  estimatedAmount?: number;

  @ApiPropertyOptional({ enum: ['prospection', 'qualification', 'devis_envoye', 'negociation', 'gagnee', 'perdue'] })
  @IsOptional()
  @IsEnum(['prospection', 'qualification', 'devis_envoye', 'negociation', 'gagnee', 'perdue'])
  stage?: 'prospection' | 'qualification' | 'devis_envoye' | 'negociation' | 'gagnee' | 'perdue';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedCloseAt?: string;
}
