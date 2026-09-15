import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { CrmAuthGuard } from '../auth/guards/crm-auth.guard';
import { CrmRolesGuard } from '../auth/guards/crm-roles.guard';
import { CrmRoles } from '../common/decorators/roles.decorator';
import { CurrentCrmUser } from '../common/decorators/current-crm-user.decorator';
import { CrmOrdersService } from './crm-orders.service';
import {
  CreateCrmOrderDto,
  UpdateCrmOrderStatusDto,
} from './dto/crm-orders.dto';

@ApiTags('CRM Orders')
@Controller('crm/orders')
@UseGuards(CrmAuthGuard, CrmRolesGuard)
@ApiBearerAuth()
export class CrmOrdersController {
  constructor(private readonly crmOrdersService: CrmOrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all CRM orders with filters' })
  @ApiResponse({ status: 200, description: 'Returns filtered orders' })
  @CrmRoles(
    'admin',
    'commercial',
    'confirmation',
    'fabrication',
    'preparation',
    'livraison',
  )
  async getAllOrders(
    @Query('status') status?: string,
    @Query('wilaya') wilaya?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.crmOrdersService.findAll({
      status,
      wilaya,
      search,
      page: page || 1,
      limit: limit || 50,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiResponse({ status: 200, description: 'Returns order details' })
  @CrmRoles(
    'admin',
    'commercial',
    'confirmation',
    'fabrication',
    'preparation',
    'livraison',
  )
  async getOrderById(@Param('id') id: string) {
    return this.crmOrdersService.findById(id);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Update order status' })
  @ApiResponse({ status: 200, description: 'Returns updated order' })
  @CrmRoles(
    'admin',
    'commercial',
    'confirmation',
    'fabrication',
    'preparation',
    'livraison',
  )
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() body: UpdateCrmOrderStatusDto,
    @CurrentCrmUser() crmUser: any,
  ) {
    return this.crmOrdersService.updateStatus(
      id,
      body.status,
      body.note,
      crmUser,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create new CRM order' })
  @ApiResponse({ status: 201, description: 'Returns created order' })
  @CrmRoles('admin', 'commercial', 'confirmation')
  async createOrder(
    @Body() body: CreateCrmOrderDto,
    @CurrentCrmUser() crmUser: any,
  ) {
    return this.crmOrdersService.create(body, crmUser);
  }
}
