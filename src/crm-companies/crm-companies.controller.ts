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

import { CrmCompaniesService } from './crm-companies.service';
import {
  CreateCrmCompanyDto,
  UpdateCrmCompanyDto,
} from './dto/crm-companies.dto';
import { CrmAuthGuard } from '../auth/guards/crm-auth.guard';
import { CrmRolesGuard } from '../auth/guards/crm-roles.guard';
import { CrmRoles } from '../common/decorators/roles.decorator';

@ApiTags('CRM Companies')
@Controller('crm/companies')
@UseGuards(CrmAuthGuard, CrmRolesGuard)
@ApiBearerAuth()
export class CrmCompaniesController {
  constructor(
    private readonly crmCompaniesService: CrmCompaniesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all CRM companies' })
  @ApiResponse({ status: 200, description: 'Returns all companies' })
  @CrmRoles('admin', 'commercial')
  async findAll(@Query('sector') sector?: string) {
    if (sector) {
      return this.crmCompaniesService.findBySector(sector);
    }
    return this.crmCompaniesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get CRM company by ID' })
  @ApiResponse({ status: 200, description: 'Returns the company' })
  @CrmRoles('admin', 'commercial')
  async findById(@Param('id') id: string) {
    return this.crmCompaniesService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new CRM company' })
  @ApiResponse({ status: 201, description: 'Company created successfully' })
  @CrmRoles('admin', 'commercial')
  async create(@Body() dto: CreateCrmCompanyDto) {
    return this.crmCompaniesService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update CRM company' })
  @ApiResponse({ status: 200, description: 'Company updated successfully' })
  @CrmRoles('admin', 'commercial')
  async update(@Param('id') id: string, @Body() dto: UpdateCrmCompanyDto) {
    return this.crmCompaniesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete CRM company' })
  @ApiResponse({ status: 200, description: 'Company deleted successfully' })
  @CrmRoles('admin', 'commercial')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    return this.crmCompaniesService.delete(id);
  }
}
