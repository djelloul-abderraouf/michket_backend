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
  CreateAdminProductDto,
  UpdateAdminCategoryDto,
  UpdateAdminInventoryDto,
  UpdateAdminProductDto,
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

  @Put('products/:id/inventory')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Update product inventory',
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
