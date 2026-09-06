import {
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { ProductsService } from './products.service';
import {
  BestSellersQueryDto,
  ProductQueryDto,
} from './dto/product-query.dto';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List products with filters' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({
    name: 'badge',
    required: false,
    enum: [
      'BEST_SELLER',
      'NOUVEAU',
      'PROMO',
      'PERSONNALISABLE',
      'ENVOI_GRATUIT',
    ],
  })
  @ApiQuery({ name: 'minPrice', required: false, type: Number })
  @ApiQuery({ name: 'maxPrice', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'personalizable',
    required: false,
    type: Boolean,
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: [
      'newest',
      'oldest',
      'price_asc',
      'price_desc',
      'rating',
    ],
  })
  async findAll(@Query() query: ProductQueryDto) {
    const {
      page,
      limit,
      category,
      badge,
      minPrice,
      maxPrice,
      search,
      personalizable,
      sort,
    } = query;

    return this.productsService.findAll(
      { page, limit },
      {
        category,
        badge,
        minPrice,
        maxPrice,
        search,
        personalizable,
        sort,
      },
    );
  }

  @Get('best-sellers')
  @ApiOperation({ summary: 'Get best selling products' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
  })
  async getBestSellers(
    @Query() query: BestSellersQueryDto,
  ) {
    return this.productsService.findBestSellers(
      query.limit,
    );
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get product by slug' })
  async findBySlug(@Param('slug') slug: string) {
    return this.productsService.findBySlug(slug);
  }
}
