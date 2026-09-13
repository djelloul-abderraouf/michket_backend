import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { CrmProductsService } from './crm-products.service';
import {
  CreateCrmProductDto,
  UpdateCrmProductDto,
} from './dto/crm-products.dto';
import { CrmAuthGuard } from '../auth/guards/crm-auth.guard';
import { CrmRolesGuard } from '../auth/guards/crm-roles.guard';
import { CrmRoles } from '../common/decorators/roles.decorator';

@ApiTags('CRM Products')
@Controller('crm/products')
@UseGuards(CrmAuthGuard, CrmRolesGuard)
@ApiBearerAuth()
export class CrmProductsController {
  constructor(
    private readonly crmProductsService: CrmProductsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all CRM products' })
  @ApiResponse({ status: 200, description: 'Returns all products' })
  @CrmRoles('admin', 'commercial', 'atelier_design', 'fabrication')
  async findAll(@Query('category') category?: 'lampe' | 'trophee' | 'carte' | 'neon') {
    if (category) {
      return this.crmProductsService.findByCategory(category);
    }
    return this.crmProductsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get CRM product by ID' })
  @ApiResponse({ status: 200, description: 'Returns the product' })
  @CrmRoles('admin', 'commercial', 'atelier_design', 'fabrication')
  async findById(@Param('id') id: string) {
    return this.crmProductsService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new CRM product' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  @CrmRoles('admin', 'atelier_design')
  async create(@Body() dto: CreateCrmProductDto) {
    return this.crmProductsService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update CRM product' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  @CrmRoles('admin', 'atelier_design')
  async update(@Param('id') id: string, @Body() dto: UpdateCrmProductDto) {
    return this.crmProductsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete CRM product' })
  @ApiResponse({ status: 200, description: 'Product deleted successfully' })
  @CrmRoles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    return this.crmProductsService.delete(id);
  }
}
