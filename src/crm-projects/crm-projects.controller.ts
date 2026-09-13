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

import { CrmProjectsService } from './crm-projects.service';
import {
  CreateCrmProjectDto,
  UpdateCrmProjectDto,
} from './dto/crm-projects.dto';
import { CrmAuthGuard } from '../auth/guards/crm-auth.guard';
import { CrmRolesGuard } from '../auth/guards/crm-roles.guard';
import { CrmRoles } from '../common/decorators/roles.decorator';

@ApiTags('CRM Projects')
@Controller('crm/projects')
@UseGuards(CrmAuthGuard, CrmRolesGuard)
@ApiBearerAuth()
export class CrmProjectsController {
  constructor(
    private readonly crmProjectsService: CrmProjectsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all CRM projects' })
  @ApiResponse({ status: 200, description: 'Returns all projects' })
  @CrmRoles('admin', 'commercial', 'fabrication', 'preparation', 'livraison')
  async findAll(@Query('status') status?: 'actif' | 'termine') {
    if (status) {
      return this.crmProjectsService.findByStatus(status);
    }
    return this.crmProjectsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get CRM project by ID' })
  @ApiResponse({ status: 200, description: 'Returns the project' })
  @CrmRoles('admin', 'commercial', 'fabrication', 'preparation', 'livraison')
  async findById(@Param('id') id: string) {
    return this.crmProjectsService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new CRM project' })
  @ApiResponse({ status: 201, description: 'Project created successfully' })
  @CrmRoles('admin')
  async create(@Body() dto: CreateCrmProjectDto) {
    return this.crmProjectsService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update CRM project' })
  @ApiResponse({ status: 200, description: 'Project updated successfully' })
  @CrmRoles('admin')
  async update(@Param('id') id: string, @Body() dto: UpdateCrmProjectDto) {
    return this.crmProjectsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete CRM project' })
  @ApiResponse({ status: 200, description: 'Project deleted successfully' })
  @CrmRoles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    return this.crmProjectsService.delete(id);
  }
}
