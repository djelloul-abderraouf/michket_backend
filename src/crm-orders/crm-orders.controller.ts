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
  CreateContactAttemptDto,
  CreateCrmOrderDto,
  CreateOrderRemarkDto,
  UpdateCrmOrderDuplicateDto,
  UpdateCrmOrderKindDto,
  UpdateCrmOrderPhoneDto,
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
    @Query('source') source?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.crmOrdersService.findAll({
      status,
      wilaya,
      source,
      search,
      page: page || 1,
      limit: limit || 50,
    });
  }

  @Get('client-by-phone')
  @ApiOperation({ summary: 'Lookup existing CRM client and prior orders by phone' })
  @CrmRoles('admin', 'commercial', 'confirmation')
  async lookupClientByPhone(@Query('phone') phone?: string) {
    return this.crmOrdersService.lookupClientByPhone(phone || '');
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

  @Put(':id/phone')
  @ApiOperation({ summary: 'Update the client phone on an order' })
  @CrmRoles('admin', 'commercial')
  async updatePhone(
    @Param('id') id: string,
    @Body() body: UpdateCrmOrderPhoneDto,
  ) {
    return this.crmOrdersService.updateClientPhone(id, body.phone);
  }

  @Put(':id/duplicate')
  @ApiOperation({ summary: 'Mark an order unique or confirm a phone duplicate' })
  @CrmRoles('admin', 'commercial', 'confirmation')
  async updateDuplicate(
    @Param('id') id: string,
    @Body() body: UpdateCrmOrderDuplicateDto,
    @CurrentCrmUser() crmUser: any,
  ) {
    return this.crmOrdersService.updateDuplicateReview(id, body.review, crmUser);
  }

  @Put(':id/kind')
  @ApiOperation({ summary: 'Update the commercial order type' })
  @CrmRoles('admin', 'commercial')
  async updateKind(
    @Param('id') id: string,
    @Body() body: UpdateCrmOrderKindDto,
  ) {
    return this.crmOrdersService.updateOrderKind(id, body.orderKind);
  }

  @Post(':id/remarks')
  @ApiOperation({ summary: 'Add a remark the author can later remove' })
  @CrmRoles('admin', 'commercial', 'livraison', 'confirmation', 'fabrication', 'preparation')
  async addRemark(
    @Param('id') id: string,
    @Body() body: CreateOrderRemarkDto,
    @CurrentCrmUser() crmUser: any,
  ) {
    return this.crmOrdersService.addRemark(id, body.body, crmUser);
  }

  @Delete(':id/remarks/:remarkId')
  @ApiOperation({ summary: 'Remove a remark written by the current user' })
  @CrmRoles('admin', 'commercial', 'livraison', 'confirmation', 'fabrication', 'preparation')
  async deleteRemark(
    @Param('id') id: string,
    @Param('remarkId') remarkId: string,
    @CurrentCrmUser() crmUser: any,
  ) {
    return this.crmOrdersService.deleteRemark(id, remarkId, crmUser);
  }

  @Post(':id/contact-attempts')
  @ApiOperation({ summary: 'Log a client contact attempt, up to five' })
  @CrmRoles('admin', 'livraison')
  async addContactAttempt(
    @Param('id') id: string,
    @Body() body: CreateContactAttemptDto,
    @CurrentCrmUser() crmUser: any,
  ) {
    return this.crmOrdersService.addContactAttempt(id, body.notes, crmUser);
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
