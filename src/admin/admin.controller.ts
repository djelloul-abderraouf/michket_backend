import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { AdminService } from './admin.service';
import {
  AdminOrdersQueryDto,
  AdminPaginationDto,
  ChangeUserRoleDto,
  CreateAdminCategoryDto,
  CreateAdminOrderItemDto,
  CreateAdminProductDto,
  CreateAdminProductImageDto,
  CreateAdminProductVariantDto,
  CreateAdminPromotionDto,
  CreateAdminReferenceDto,
  CreateCategoryHeroImageDto,
  ReorderAdminProductImagesDto,
  ReorderAdminReferencesDto,
  ReorderCategoryHeroImagesDto,
  UpdateAdminCategoryDto,
  UpdateAdminInventoryDto,
  UpdateAdminOrderDto,
  UpdateAdminOrderItemDto,
  UpdateAdminProductDto,
  UpdateAdminProductImageDto,
  UpdateAdminProductVariantDto,
  UpdateAdminPromotionDto,
  UpdateAdminReferenceDto,
  UpdateCategoryHeroImageDto,
  UpdateOrderStatusDto,
} from './admin.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

type AuthenticatedAdminRequest = FastifyRequest & {
  user: {
    id: string;
    email: string;
    role: 'admin' | 'super_admin';
  };
};

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
  ) {}

  @Get('dashboard')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Get dashboard stats',
  })
  getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('orders')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Get all orders (admin)',
  })
  getAllOrders(
    @Query() query: AdminOrdersQueryDto,
  ) {
    return this.adminService.getAllOrders(
      query.page,
      query.limit,
      query.status,
    );
  }

  @Put('orders/:id')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Update editable order fields',
  })
  updateOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAdminOrderDto,
  ) {
    return this.adminService.updateOrder(
      id,
      body,
    );
  }

  @Post('orders/:id/items')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Add an item to an order',
  })
  createOrderItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateAdminOrderItemDto,
  ) {
    return this.adminService.createOrderItem(
      id,
      body,
    );
  }

  @Put('orders/:id/items/:itemId')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Update an order item',
  })
  updateOrderItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: UpdateAdminOrderItemDto,
  ) {
    return this.adminService.updateOrderItem(
      id,
      itemId,
      body,
    );
  }

  @Delete('orders/:id/items/:itemId')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Delete an order item',
  })
  deleteOrderItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.adminService.deleteOrderItem(
      id,
      itemId,
    );
  }

  @Put('orders/:id/status')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Update order status',
  })
  updateOrderStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateOrderStatusDto,
    @Req() request: AuthenticatedAdminRequest,
  ) {
    return this.adminService.updateOrderStatus(
      id,
      body.status,
      body.reason,
      request.user.id,
    );
  }

  @Get('categories')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Get all categories (admin)',
  })
  getAllCategories(
    @Query() query: AdminPaginationDto,
  ) {
    return this.adminService.getAllCategories(
      query.page,
      query.limit,
    );
  }

  @Post('categories')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Create category',
  })
  createCategory(
    @Body() body: CreateAdminCategoryDto,
  ) {
    return this.adminService.createCategory(body);
  }

  @Put('categories/:id')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Update category',
  })
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAdminCategoryDto,
  ) {
    return this.adminService.updateCategory(
      id,
      body,
    );
  }

  @Delete('categories/:id')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Deactivate category',
  })
  deleteCategory(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminService.deleteCategory(id);
  }

  // ──── Category Hero Images ────

  @Get('categories/:id')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Get category details with hero images',
  })
  getCategoryDetails(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminService.getCategoryWithHeroImages(id);
  }

  @Post('categories/:id/hero-images')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Add hero image to subcategory',
  })
  addCategoryHeroImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateCategoryHeroImageDto,
  ) {
    return this.adminService.addCategoryHeroImage(id, body);
  }

  @Put('categories/:id/hero-images/reorder')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Reorder category hero images',
  })
  reorderCategoryHeroImages(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReorderCategoryHeroImagesDto,
  ) {
    return this.adminService.reorderCategoryHeroImages(id, body.images);
  }

  @Put('categories/:id/hero-images/:imageId')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Update category hero image',
  })
  updateCategoryHeroImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Body() body: UpdateCategoryHeroImageDto,
  ) {
    return this.adminService.updateCategoryHeroImage(id, imageId, body);
  }

  @Delete('categories/:id/hero-images/:imageId')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Delete category hero image',
  })
  deleteCategoryHeroImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    return this.adminService.deleteCategoryHeroImage(id, imageId);
  }

  @Get('products')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Get all products (admin)',
  })
  getAllProducts(
    @Query() query: AdminPaginationDto,
  ) {
    return this.adminService.getAllProducts(
      query.page,
      query.limit,
    );
  }

  @Get('products/:id')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary:
      'Get product details with images, variants and inventory',
  })
  getProductDetails(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminService.getProductDetails(id);
  }

  @Post('products')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Create product',
  })
  createProduct(
    @Body() body: CreateAdminProductDto,
  ) {
    return this.adminService.createProduct(body);
  }

  @Put('products/:id')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Update product',
  })
  updateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAdminProductDto,
  ) {
    return this.adminService.updateProduct(
      id,
      body,
    );
  }

  @Delete('products/:id')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Deactivate product',
  })
  deleteProduct(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminService.deleteProduct(id);
  }

  @Post('products/:id/images')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Add an image to a product',
  })
  addProductImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateAdminProductImageDto,
  ) {
    return this.adminService.addProductImage(
      id,
      body,
    );
  }

  @Put('products/:id/images/reorder')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Reorder product images',
  })
  reorderProductImages(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReorderAdminProductImagesDto,
  ) {
    return this.adminService.reorderProductImages(
      id,
      body.images,
    );
  }

  @Put('products/:id/images/:imageId')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary:
      'Update a product image or set it as primary',
  })
  updateProductImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe)
    imageId: string,
    @Body() body: UpdateAdminProductImageDto,
  ) {
    return this.adminService.updateProductImage(
      id,
      imageId,
      body,
    );
  }

  @Delete('products/:id/images/:imageId')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary:
      'Delete a product image and clean up Storage',
  })
  deleteProductImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe)
    imageId: string,
  ) {
    return this.adminService.deleteProductImage(
      id,
      imageId,
    );
  }

  @Post('products/:id/variants')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Create a product variant',
  })
  createProductVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateAdminProductVariantDto,
  ) {
    return this.adminService.createProductVariant(
      id,
      body,
    );
  }

  @Put('products/:id/variants/:variantId')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Update a product variant',
  })
  updateProductVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variantId', ParseUUIDPipe)
    variantId: string,
    @Body() body: UpdateAdminProductVariantDto,
  ) {
    return this.adminService.updateProductVariant(
      id,
      variantId,
      body,
    );
  }

  @Delete('products/:id/variants/:variantId')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Deactivate a product variant',
  })
  deleteProductVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variantId', ParseUUIDPipe)
    variantId: string,
  ) {
    return this.adminService.deleteProductVariant(
      id,
      variantId,
    );
  }

  @Put('products/:id/inventory')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Update product or variant inventory',
  })
  updateInventory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAdminInventoryDto,
  ) {
    return this.adminService.updateInventory(
      id,
      body,
    );
  }

  // ──── Client References ────

  @Get('references')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Get all client references',
  })
  getAllReferences(
    @Query() query: AdminPaginationDto,
  ) {
    return this.adminService.getAllReferences(
      query.page,
      query.limit,
    );
  }

  @Post('references')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Create client reference',
  })
  createReference(
    @Body() body: CreateAdminReferenceDto,
  ) {
    return this.adminService.createReference(
      body,
    );
  }

  @Put('references/reorder')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Reorder client references',
  })
  reorderReferences(
    @Body() body: ReorderAdminReferencesDto,
  ) {
    return this.adminService.reorderReferences(
      body.references,
    );
  }

  @Put('references/:id')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Update client reference',
  })
  updateReference(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAdminReferenceDto,
  ) {
    return this.adminService.updateReference(
      id,
      body,
    );
  }

  @Delete('references/:id')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Delete client reference',
  })
  deleteReference(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminService.deleteReference(
      id,
    );
  }

  @Get('promotions')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Get all promotions',
  })
  getAllPromotions(
    @Query() query: AdminPaginationDto,
  ) {
    return this.adminService.getAllPromotions(
      query.page,
      query.limit,
    );
  }

  @Post('promotions')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Create promotion',
  })
  createPromotion(
    @Body() body: CreateAdminPromotionDto,
  ) {
    return this.adminService.createPromotion(body);
  }

  @Put('promotions/:id')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Update promotion',
  })
  updatePromotion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAdminPromotionDto,
  ) {
    return this.adminService.updatePromotion(
      id,
      body,
    );
  }

  @Delete('promotions/:id')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Deactivate promotion',
  })
  deletePromotion(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminService.deletePromotion(id);
  }

  @Get('users')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Get all users',
  })
  getAllUsers(
    @Query() query: AdminPaginationDto,
  ) {
    return this.adminService.getAllUsers(
      query.page,
      query.limit,
    );
  }

  @Put('users/:id/role')
  @Roles('super_admin')
  @ApiOperation({
    summary: 'Change user role',
  })
  changeUserRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ChangeUserRoleDto,
  ) {
    return this.adminService.changeUserRole(
      id,
      body.role,
    );
  }
}
