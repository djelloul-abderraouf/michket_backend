import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  MinLength,
  MaxLength,
  IsEnum,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateCrmProductDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ enum: ['lampe', 'trophee', 'carte', 'neon'] })
  @IsEnum(['lampe', 'trophee', 'carte', 'neon'])
  category!: 'lampe' | 'trophee' | 'carte' | 'neon';

  @ApiProperty()
  @IsNumber()
  price!: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  photoUrl!: string;

  @ApiProperty()
  @IsNumber()
  averageBuildHours!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateCrmProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ enum: ['lampe', 'trophee', 'carte', 'neon'] })
  @IsOptional()
  @IsEnum(['lampe', 'trophee', 'carte', 'neon'])
  category?: 'lampe' | 'trophee' | 'carte' | 'neon';

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  averageBuildHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
