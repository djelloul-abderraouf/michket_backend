import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsEnum,
} from 'class-validator';
import {
  ApiProperty,
} from '@nestjs/swagger';

export class CreateCrmActivityDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty({ enum: ['appel', 'message', 'visite'] })
  @IsEnum(['appel', 'message', 'visite'])
  type!: 'appel' | 'message' | 'visite';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  target!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  ownerId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(500)
  description!: string;
}
