import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpsertPixelDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsIn(['meta', 'tiktok'])
  platform!: 'meta' | 'tiktok';

  @IsString()
  @Matches(/^[A-Za-z0-9]{4,64}$/)
  pixelId!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
