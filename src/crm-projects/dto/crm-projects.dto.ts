import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MinLength,
  MaxLength,
  IsEnum,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateCrmProjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ enum: ['actif', 'termine'] })
  @IsOptional()
  @IsEnum(['actif', 'termine'])
  status?: 'actif' | 'termine';
}

export class UpdateCrmProjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ enum: ['actif', 'termine'] })
  @IsOptional()
  @IsEnum(['actif', 'termine'])
  status?: 'actif' | 'termine';
}
