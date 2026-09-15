import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

import { CrmAuthGuard } from '../auth/guards/crm-auth.guard';
import { CrmRolesGuard } from '../auth/guards/crm-roles.guard';
import { CrmRoles } from '../common/decorators/roles.decorator';
import { ProductsService } from '../products/products.service';
import { centsToDzd } from '../crm-base/crm-status';

class ToggleProductDto {
  @ApiProperty()
  @IsBoolean()
  active!: boolean;
}

class CreateCrmProductDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @ApiProperty({ description: 'Price in DZD' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shortDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPersonalizable?: boolean;
}

class UpdateCrmProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shortDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPersonalizable?: boolean;
}

function mapCrmProduct(product: {
  id: string;
  name: string;
  slug?: string | null;
  categoryName?: string | null;
  categorySlug?: string | null;
  categoryId?: string | null;
  priceCents: number;
  imageUrl?: string | null;
  isActive: boolean;
  isPersonalizable?: boolean | null;
}) {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    categoryId: product.categoryId || '',
    category: product.categoryName || product.categorySlug || 'Catalogue',
    categorySlug: product.categorySlug || '',
    price: centsToDzd(product.priceCents),
    photoUrl: product.imageUrl || '/images/placeholder-product.png',
    averageBuildHours: product.isPersonalizable ? 6 : 4,
    active: product.isActive,
    isPersonalizable: product.isPersonalizable,
  };
}

@ApiTags('CRM Catalog')
@Controller('crm/products')
@UseGuards(CrmAuthGuard, CrmRolesGuard)
@ApiBearerAuth()
export class CrmCatalogController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List catalog products for CRM' })
  @CrmRoles(
    'admin',
    'commercial',
    'confirmation',
    'atelier_design',
    'fabrication',
  )
  async findAll() {
    const products = await this.productsService.findAllForCrm();
    return products.map(mapCrmProduct);
  }

  @Get('categories')
  @ApiOperation({ summary: 'List product categories' })
  @CrmRoles('admin', 'atelier_design', 'commercial')
  async listCategories() {
    return this.productsService.listCategoriesForCrm();
  }

  @Post()
  @ApiOperation({ summary: 'Create a catalog product' })
  @CrmRoles('admin', 'atelier_design')
  async create(@Body() dto: CreateCrmProductDto) {
    const created = await this.productsService.createForCrm({
      name: dto.name,
      categoryId: dto.categoryId,
      priceCents: Math.round(dto.price * 100),
      shortDescription: dto.shortDescription,
      description: dto.description,
      photoUrl: dto.photoUrl,
      isActive: dto.isActive,
      isPersonalizable: dto.isPersonalizable,
    });
    const products = await this.productsService.findAllForCrm();
    const mapped = products.find((item) => item.id === created.id);
    return mapped ? mapCrmProduct(mapped) : mapCrmProduct({
      ...created,
      categoryName: '',
      categorySlug: '',
      imageUrl: dto.photoUrl || null,
    });
  }

  @Put(':id/active')
  @ApiOperation({ summary: 'Activate or deactivate a product' })
  @CrmRoles('admin', 'atelier_design')
  async setActive(@Param('id') id: string, @Body() dto: ToggleProductDto) {
    return this.productsService.setActive(id, dto.active);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a catalog product' })
  @CrmRoles('admin', 'atelier_design')
  async update(@Param('id') id: string, @Body() dto: UpdateCrmProductDto) {
    await this.productsService.updateForCrm(id, {
      name: dto.name,
      categoryId: dto.categoryId,
      priceCents:
        dto.price !== undefined ? Math.round(dto.price * 100) : undefined,
      shortDescription: dto.shortDescription,
      description: dto.description,
      photoUrl: dto.photoUrl,
      isActive: dto.isActive,
      isPersonalizable: dto.isPersonalizable,
    });
    const products = await this.productsService.findAllForCrm();
    const updated = products.find((item) => item.id === id);
    return updated ? mapCrmProduct(updated) : { id };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a catalog product' })
  @CrmRoles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.productsService.deleteForCrm(id);
  }
}
