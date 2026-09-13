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

import { CrmOrdersService } from './crm-orders.service';
import {
  CreateCrmOrderDto,
  UpdateCrmOrderDto,
  UpdateOrderStatusDto,
} from './dto/crm-orders.dto';
import { CrmAuthGuard } from '../auth/guards/crm-auth.guard';
import { CrmRolesGuard } from '../auth/guards/crm-roles.guard';
import { CrmRoles } from '../common/decorators/roles.decorator';
import { CurrentCrmUser } from '../common/decorators/current-crm-user.decorator';

@ApiTags('CRM Orders')
@Controller('crm/orders')
@UseGuards(CrmAuthGuard, CrmRolesGuard)
@ApiBearerAuth()
export class CrmOrdersController {
  constructor(
    private readonly crmOrdersService: CrmOrdersService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all CRM orders' })
  @ApiResponse({ status: 200, description: 'Returns all orders' })
  @CrmRoles('admin', 'commercial', 'fabrication', 'preparation', 'livraison')
  async findAll(
    @Query('status') status?: string,
    @Query('wilaya') wilaya?: string,
  ) {
    if (status) {
      return this.crmOrdersService.findByStatus(status);
    }
    if (wilaya) {
      return this.crmOrdersService.findByWilaya(wilaya);
    }
    return this.crmOrdersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get CRM order by ID' })
  @ApiResponse({ status: 200, description: 'Returns the order' })
  @CrmRoles('admin', 'commercial', 'fabrication', 'preparation', 'livraison')
  async findById(@Param('id') id: string) {
    return this.crmOrdersService.findById(id);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Get order status history' })
  @ApiResponse({ status: 200, description: 'Returns status history' })
  @CrmRoles('admin', 'commercial', 'fabrication', 'preparation', 'livraison')
  async getStatusHistory(@Param('id') id: string) {
    return this.crmOrdersService.getStatusHistory(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new CRM order' })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @CrmRoles('admin', 'commercial')
  async create(@Body() dto: CreateCrmOrderDto) {
    return this.crmOrdersService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update CRM order' })
  @ApiResponse({ status: 200, description: 'Order updated successfully' })
  @CrmRoles('admin', 'commercial', 'fabrication', 'preparation', 'livraison')
  async update(@Param('id') id: string, @Body() dto: UpdateCrmOrderDto) {
    return this.crmOrdersService.update(id, dto);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Update CRM order status' })
  @ApiResponse({ status: 200, description: 'Order status updated successfully' })
  @CrmRoles('admin', 'commercial', 'fabrication', 'preparation', 'livraison')
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentCrmUser() user: any,
  ) {
    return this.crmOrdersService.updateOrderStatus(id, dto, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete CRM order' })
  @ApiResponse({ status: 200, description: 'Order deleted successfully' })
  @CrmRoles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    return this.crmOrdersService.delete(id);
  }
}
