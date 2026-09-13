import {
  Controller,
  Get,
  Post,
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

import { CrmActivitiesService } from './crm-activities.service';
import { CreateCrmActivityDto } from './dto/crm-activities.dto';
import { CrmAuthGuard } from '../auth/guards/crm-auth.guard';
import { CrmRolesGuard } from '../auth/guards/crm-roles.guard';
import { CrmRoles } from '../common/decorators/roles.decorator';

@ApiTags('CRM Activities')
@Controller('crm/activities')
@UseGuards(CrmAuthGuard, CrmRolesGuard)
@ApiBearerAuth()
export class CrmActivitiesController {
  constructor(
    private readonly crmActivitiesService: CrmActivitiesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all CRM activities' })
  @ApiResponse({ status: 200, description: 'Returns all activities' })
  @CrmRoles('admin', 'commercial')
  async findAll(@Query('ownerId') ownerId?: string, @Query('target') target?: string) {
    if (ownerId) {
      return this.crmActivitiesService.findByOwner(ownerId);
    }
    if (target) {
      return this.crmActivitiesService.findByTarget(target);
    }
    return this.crmActivitiesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get CRM activity by ID' })
  @ApiResponse({ status: 200, description: 'Returns the activity' })
  @CrmRoles('admin', 'commercial')
  async findById(@Param('id') id: string) {
    return this.crmActivitiesService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new CRM activity' })
  @ApiResponse({ status: 201, description: 'Activity created successfully' })
  @CrmRoles('admin', 'commercial')
  async create(@Body() dto: CreateCrmActivityDto) {
    return this.crmActivitiesService.create(dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete CRM activity' })
  @ApiResponse({ status: 200, description: 'Activity deleted successfully' })
  @CrmRoles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    return this.crmActivitiesService.delete(id);
  }
}
