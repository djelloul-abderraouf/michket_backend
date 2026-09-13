import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsEnum,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateCrmTaskDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  assigneeId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  assigneeName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiProperty()
  @IsDateString()
  dueAt!: string;

  @ApiProperty({ enum: ['basse', 'normale', 'haute', 'urgente'] })
  @IsEnum(['basse', 'normale', 'haute', 'urgente'])
  priority!: 'basse' | 'normale' | 'haute' | 'urgente';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  done?: boolean;
}

export class UpdateCrmTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assigneeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional({ enum: ['basse', 'normale', 'haute', 'urgente'] })
  @IsOptional()
  @IsEnum(['basse', 'normale', 'haute', 'urgente'])
  priority?: 'basse' | 'normale' | 'haute' | 'urgente';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  done?: boolean;
}
