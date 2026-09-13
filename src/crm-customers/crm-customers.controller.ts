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

import { CrmCustomersService } from './crm-customers.service';
import {
  CreateCrmCustomerDto,
  UpdateCrmCustomerDto,
} from './dto/crm-customers.dto';
import { CrmAuthGuard } from '../auth/guards/crm-auth.guard';
import { CrmRolesGuard } from '../auth/guards/crm-roles.guard';
import { CrmRoles } from '../common/decorators/roles.decorator';

@ApiTags('CRM Customers')
@Controller('crm/customers')
@UseGuards(CrmAuthGuard, CrmRolesGuard)
@ApiBearerAuth()
export class CrmCustomersController {
  constructor(
    private readonly crmCustomersService: CrmCustomersService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all CRM customers' })
  @ApiResponse({ status: 200, description: 'Returns all customers' })
  @CrmRoles('admin', 'commercial')
  async findAll(@Query('companyId') companyId?: string, @Query('wilaya') wilaya?: string) {
    if (companyId) {
      return this.crmCustomersService.findByCompany(companyId);
    }
    if (wilaya) {
      return this.crmCustomersService.findByWilaya(wilaya);
    }
    return this.crmCustomersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get CRM customer by ID' })
  @ApiResponse({ status: 200, description: 'Returns the customer' })
  @CrmRoles('admin', 'commercial')
  async findById(@Param('id') id: string) {
    return this.crmCustomersService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new CRM customer' })
  @ApiResponse({ status: 201, description: 'Customer created successfully' })
  @CrmRoles('admin', 'commercial')
  async create(@Body() dto: CreateCrmCustomerDto) {
    return this.crmCustomersService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update CRM customer' })
  @ApiResponse({ status: 200, description: 'Customer updated successfully' })
  @CrmRoles('admin', 'commercial')
  async update(@Param('id') id: string, @Body() dto: UpdateCrmCustomerDto) {
    return this.crmCustomersService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete CRM customer' })
  @ApiResponse({ status: 200, description: 'Customer deleted successfully' })
  @CrmRoles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    return this.crmCustomersService.delete(id);
  }
}
