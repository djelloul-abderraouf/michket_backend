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

import { CrmProductionService } from './crm-production.service';
import {
  AddPlancheOrdersDto,
  CreateCrmPlancheDto,
  CreateCrmProductionJobDto,
  UpdateCrmPlancheCapacityDto,
  UpdateCrmPlancheStatusDto,
  UpdateCrmProductionJobDto,
} from './dto/crm-production.dto';
import { CrmAuthGuard } from '../auth/guards/crm-auth.guard';
import { CrmRolesGuard } from '../auth/guards/crm-roles.guard';
import { CrmRoles } from '../common/decorators/roles.decorator';
import { CurrentCrmUser } from '../common/decorators/current-crm-user.decorator';

@ApiTags('CRM Production')
@Controller('crm/production')
@UseGuards(CrmAuthGuard, CrmRolesGuard)
@ApiBearerAuth()
export class CrmProductionController {
  constructor(
    private readonly crmProductionService: CrmProductionService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all CRM production jobs' })
  @ApiResponse({ status: 200, description: 'Returns all production jobs' })
  @CrmRoles('admin', 'fabrication')
  async findAll(
    @Query('orderId') orderId?: string,
    @Query('status') status?: 'en_attente' | 'en_cours' | 'termine',
  ) {
    if (orderId) {
      return this.crmProductionService.findByOrder(orderId);
    }
    if (status) {
      return this.crmProductionService.findByStatus(status);
    }
    return this.crmProductionService.findAll();
  }

  @Get('planches')
  @ApiOperation({ summary: 'List fabrication planches' })
  @CrmRoles('admin', 'fabrication')
  async listPlanches() {
    return this.crmProductionService.listPlanches();
  }

  @Post('planches')
  @ApiOperation({ summary: 'Create a fabrication planche with a chosen capacity' })
  @CrmRoles('admin', 'fabrication')
  async createPlanche(
    @Body() dto: CreateCrmPlancheDto,
    @CurrentCrmUser() crmUser: any,
  ) {
    return this.crmProductionService.createPlanche(dto, crmUser);
  }

  @Post('planches/:id/orders')
  @ApiOperation({ summary: 'Add orders to a planche' })
  @CrmRoles('admin', 'fabrication')
  async addPlancheOrders(
    @Param('id') id: string,
    @Body() dto: AddPlancheOrdersDto,
    @CurrentCrmUser() crmUser: any,
  ) {
    return this.crmProductionService.addPlancheOrders(id, dto, crmUser);
  }

  @Delete('planches/:id/orders/:orderId')
  @ApiOperation({ summary: 'Remove an order from a waiting planche' })
  @CrmRoles('admin', 'fabrication')
  async removePlancheOrder(
    @Param('id') id: string,
    @Param('orderId') orderId: string,
    @CurrentCrmUser() crmUser: any,
  ) {
    return this.crmProductionService.removePlancheOrder(id, orderId, crmUser);
  }

  @Put('planches/:id/capacity')
  @ApiOperation({ summary: 'Change how many orders a waiting planche can hold' })
  @CrmRoles('admin', 'fabrication')
  async updatePlancheCapacity(
    @Param('id') id: string,
    @Body() dto: UpdateCrmPlancheCapacityDto,
    @CurrentCrmUser() crmUser: any,
  ) {
    return this.crmProductionService.updatePlancheCapacity(id, dto, crmUser);
  }

  @Put('planches/:id/status')
  @ApiOperation({ summary: 'Launch or finish a planche' })
  @CrmRoles('admin', 'fabrication')
  async updatePlancheStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCrmPlancheStatusDto,
    @CurrentCrmUser() crmUser: any,
  ) {
    return this.crmProductionService.updatePlancheStatus(id, dto, crmUser);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get CRM production job by ID' })
  @ApiResponse({ status: 200, description: 'Returns the production job' })
  @CrmRoles('admin', 'fabrication')
  async findById(@Param('id') id: string) {
    return this.crmProductionService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new CRM production job' })
  @ApiResponse({ status: 201, description: 'Production job created successfully' })
  @CrmRoles('admin', 'fabrication')
  async create(@Body() dto: CreateCrmProductionJobDto) {
    return this.crmProductionService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update CRM production job' })
  @ApiResponse({ status: 200, description: 'Production job updated successfully' })
  @CrmRoles('admin', 'fabrication')
  async update(@Param('id') id: string, @Body() dto: UpdateCrmProductionJobDto) {
    return this.crmProductionService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete CRM production job' })
  @ApiResponse({ status: 200, description: 'Production job deleted successfully' })
  @CrmRoles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    return this.crmProductionService.delete(id);
  }
}
