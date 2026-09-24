import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

import { CrmAuthGuard } from '../auth/guards/crm-auth.guard';
import { CrmRolesGuard } from '../auth/guards/crm-roles.guard';
import { CrmRoles } from '../common/decorators/roles.decorator';
import { ProductsService } from '../products/products.service';
import { MediaService } from '../media/media.service';
import { centsToDzd } from '../crm-base/crm-status';

const IMAGE_EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

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
  @IsString()
  storagePath?: string;

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
  @IsString()
  storagePath?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPersonalizable?: boolean;
}

class CreateCrmCategoryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageStoragePath?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  href?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  metaTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  metaDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pageTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productsTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  filterLabel?: string;
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
  variants?: Array<{
    id: string;
    name: string;
    colorName: string | null;
    colorHex: string | null;
  }>;
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
    variants: (product.variants || []).map((variant) => ({
      id: variant.id,
      name: variant.name,
      colorName: variant.colorName,
      colorHex: variant.colorHex,
    })),
  };
}

@ApiTags('CRM Catalog')
@Controller('crm/products')
@UseGuards(CrmAuthGuard, CrmRolesGuard)
@ApiBearerAuth()
export class CrmCatalogController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly mediaService: MediaService,
  ) {}

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

  @Post('categories')
  @ApiOperation({ summary: 'Create a product category using Supabase category attributes' })
  @CrmRoles('admin', 'atelier_design')
  async createCategory(@Body() dto: CreateCrmCategoryDto) {
    return this.productsService.createCategoryForCrm(dto);
  }

  @Post('categories/images')
  @ApiOperation({ summary: 'Upload a category image to the Supabase product-images bucket' })
  @CrmRoles('admin', 'atelier_design')
  async uploadCategoryImage(@Req() req: FastifyRequest) {
    return this.uploadCatalogImage(req, 'categories');
  }

  @Post('images')
  @ApiOperation({ summary: 'Upload a product image to the Supabase bucket' })
  @CrmRoles('admin', 'atelier_design')
  async uploadImage(@Req() req: FastifyRequest) {
    return this.uploadCatalogImage(req, 'products');
  }

  private async uploadCatalogImage(
    req: FastifyRequest,
    folder: 'products' | 'categories',
  ) {
    const file = await req.file();
    if (!file) {
      throw new BadRequestException('Image fichier requis');
    }

    const mimetype = file.mimetype.split(';', 1)[0].trim().toLowerCase();
    const extension = IMAGE_EXTENSION_BY_MIME[mimetype];
    if (!extension) {
      throw new BadRequestException('Formats acceptes: JPEG, PNG, WebP, AVIF');
    }

    const buffer = await file.toBuffer();
    if (file.file.truncated) {
      throw new BadRequestException('Image trop lourde (10 Mo max)');
    }

    const now = new Date();
    const path = [
      folder,
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      `${randomUUID()}.${extension}`,
    ].join('/');

    return this.mediaService.upload(buffer, path, mimetype);
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
      storagePath: dto.storagePath,
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
      storagePath: dto.storagePath,
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
