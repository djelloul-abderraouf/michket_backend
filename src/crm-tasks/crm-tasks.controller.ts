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

import { CrmTasksService } from './crm-tasks.service';
import {
  CreateCrmTaskDto,
  UpdateCrmTaskDto,
} from './dto/crm-tasks.dto';
import { CrmAuthGuard } from '../auth/guards/crm-auth.guard';
import { CrmRolesGuard } from '../auth/guards/crm-roles.guard';
import { CrmRoles } from '../common/decorators/roles.decorator';

@ApiTags('CRM Tasks')
@Controller('crm/tasks')
@UseGuards(CrmAuthGuard, CrmRolesGuard)
@ApiBearerAuth()
export class CrmTasksController {
  constructor(
    private readonly crmTasksService: CrmTasksService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all CRM tasks' })
  @ApiResponse({ status: 200, description: 'Returns all tasks' })
  @CrmRoles('admin', 'commercial', 'confirmation', 'atelier_design', 'fabrication', 'preparation', 'livraison')
  async findAll(
    @Query('assigneeId') assigneeId?: string,
    @Query('projectId') projectId?: string,
    @Query('done') done?: string,
    @Query('priority') priority?: 'basse' | 'normale' | 'haute' | 'urgente',
  ) {
    if (assigneeId) {
      return this.crmTasksService.findByAssignee(assigneeId);
    }
    if (projectId) {
      return this.crmTasksService.findByProject(projectId);
    }
    if (done !== undefined) {
      return this.crmTasksService.findByStatus(done === 'true');
    }
    if (priority) {
      return this.crmTasksService.findByPriority(priority);
    }
    return this.crmTasksService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get CRM task by ID' })
  @ApiResponse({ status: 200, description: 'Returns the task' })
  @CrmRoles('admin', 'commercial', 'confirmation', 'atelier_design', 'fabrication', 'preparation', 'livraison')
  async findById(@Param('id') id: string) {
    return this.crmTasksService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new CRM task' })
  @ApiResponse({ status: 201, description: 'Task created successfully' })
  @CrmRoles('admin', 'commercial', 'confirmation', 'atelier_design', 'fabrication', 'preparation', 'livraison')
  async create(@Body() dto: CreateCrmTaskDto) {
    return this.crmTasksService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update CRM task' })
  @ApiResponse({ status: 200, description: 'Task updated successfully' })
  @CrmRoles('admin', 'commercial', 'confirmation', 'atelier_design', 'fabrication', 'preparation', 'livraison')
  async update(@Param('id') id: string, @Body() dto: UpdateCrmTaskDto) {
    return this.crmTasksService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete CRM task' })
  @ApiResponse({ status: 200, description: 'Task deleted successfully' })
  @CrmRoles('admin', 'commercial', 'confirmation', 'atelier_design', 'fabrication', 'preparation', 'livraison')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    return this.crmTasksService.delete(id);
  }
}
