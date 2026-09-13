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

import { CrmProposalsService } from './crm-proposals.service';
import {
  CreateCrmProposalDto,
  UpdateCrmProposalDto,
} from './dto/crm-proposals.dto';
import { CrmAuthGuard } from '../auth/guards/crm-auth.guard';
import { CrmRolesGuard } from '../auth/guards/crm-roles.guard';
import { CrmRoles } from '../common/decorators/roles.decorator';

@ApiTags('CRM Proposals')
@Controller('crm/proposals')
@UseGuards(CrmAuthGuard, CrmRolesGuard)
@ApiBearerAuth()
export class CrmProposalsController {
  constructor(
    private readonly crmProposalsService: CrmProposalsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all CRM proposals' })
  @ApiResponse({ status: 200, description: 'Returns all proposals' })
  @CrmRoles('admin', 'commercial')
  async findAll(
    @Query('dealId') dealId?: string,
    @Query('status') status?: 'brouillon' | 'envoyee' | 'acceptee' | 'refusee',
  ) {
    if (dealId) {
      return this.crmProposalsService.findByDeal(dealId);
    }
    if (status) {
      return this.crmProposalsService.findByStatus(status);
    }
    return this.crmProposalsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get CRM proposal by ID' })
  @ApiResponse({ status: 200, description: 'Returns the proposal' })
  @CrmRoles('admin', 'commercial')
  async findById(@Param('id') id: string) {
    return this.crmProposalsService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new CRM proposal' })
  @ApiResponse({ status: 201, description: 'Proposal created successfully' })
  @CrmRoles('admin', 'commercial')
  async create(@Body() dto: CreateCrmProposalDto) {
    return this.crmProposalsService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update CRM proposal' })
  @ApiResponse({ status: 200, description: 'Proposal updated successfully' })
  @CrmRoles('admin', 'commercial')
  async update(@Param('id') id: string, @Body() dto: UpdateCrmProposalDto) {
    return this.crmProposalsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete CRM proposal' })
  @ApiResponse({ status: 200, description: 'Proposal deleted successfully' })
  @CrmRoles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    return this.crmProposalsService.delete(id);
  }
}
