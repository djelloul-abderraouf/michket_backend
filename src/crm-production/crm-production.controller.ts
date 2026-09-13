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
  CreateCrmProductionJobDto,
  UpdateCrmProductionJobDto,
} from './dto/crm-production.dto';
import { CrmAuthGuard } from '../auth/guards/crm-auth.guard';
import { CrmRolesGuard } from '../auth/guards/crm-roles.guard';
import { CrmRoles } from '../common/decorators/roles.decorator';

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
