import {
  IsInt,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PreviewPromotionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  code!: string;

  /**
   * Used only for a UI preview.
   * The real checkout recalculates prices and the discount server-side.
   */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  subtotalCents!: number;
}
