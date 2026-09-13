import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
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

import { CrmEmployeesService } from './crm-employees.service';
import {
  CreateCrmEmployeeDto,
  UpdateCrmEmployeeDto,
} from './dto/crm-employees.dto';
import { CrmAuthGuard } from '../auth/guards/crm-auth.guard';
import { CrmRolesGuard } from '../auth/guards/crm-roles.guard';
import { CrmRoles } from '../common/decorators/roles.decorator';

@ApiTags('CRM Employees')
@Controller('crm/employees')
@UseGuards(CrmAuthGuard, CrmRolesGuard)
@ApiBearerAuth()
export class CrmEmployeesController {
  constructor(
    private readonly crmEmployeesService: CrmEmployeesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all CRM employees' })
  @ApiResponse({ status: 200, description: 'Returns all employees' })
  @CrmRoles('admin')
  async findAll() {
    return this.crmEmployeesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get CRM employee by ID' })
  @ApiResponse({ status: 200, description: 'Returns the employee' })
  @CrmRoles('admin')
  async findById(@Param('id') id: string) {
    return this.crmEmployeesService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new CRM employee' })
  @ApiResponse({ status: 201, description: 'Employee created successfully' })
  @CrmRoles('admin')
  async create(@Body() dto: CreateCrmEmployeeDto) {
    return this.crmEmployeesService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update CRM employee' })
  @ApiResponse({ status: 200, description: 'Employee updated successfully' })
  @CrmRoles('admin')
  async update(@Param('id') id: string, @Body() dto: UpdateCrmEmployeeDto) {
    return this.crmEmployeesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete CRM employee' })
  @ApiResponse({ status: 200, description: 'Employee deleted successfully' })
  @CrmRoles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    return this.crmEmployeesService.delete(id);
  }
}
