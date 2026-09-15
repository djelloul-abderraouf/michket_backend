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

import { CrmDealsService } from './crm-deals.service';
import {
  CreateCrmDealDto,
  UpdateCrmDealDto,
} from './dto/crm-deals.dto';
import { CrmAuthGuard } from '../auth/guards/crm-auth.guard';
import { CrmRolesGuard } from '../auth/guards/crm-roles.guard';
import { CrmRoles } from '../common/decorators/roles.decorator';
import { CurrentCrmUser } from '../common/decorators/current-crm-user.decorator';

@ApiTags('CRM Deals')
@Controller('crm/deals')
@UseGuards(CrmAuthGuard, CrmRolesGuard)
@ApiBearerAuth()
export class CrmDealsController {
  constructor(
    private readonly crmDealsService: CrmDealsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all CRM deals' })
  @ApiResponse({ status: 200, description: 'Returns all deals' })
  @CrmRoles('admin', 'commercial')
  async findAll(
    @Query('ownerId') ownerId?: string,
    @Query('stage') stage?: 'prospection' | 'qualification' | 'devis_envoye' | 'negociation' | 'gagnee' | 'perdue',
    @Query('contactId') contactId?: string,
    @Query('companyId') companyId?: string,
  ) {
    if (ownerId) {
      return this.crmDealsService.findByOwner(ownerId);
    }
    if (stage) {
      return this.crmDealsService.findByStage(stage);
    }
    if (contactId) {
      return this.crmDealsService.findByContact(contactId);
    }
    if (companyId) {
      return this.crmDealsService.findByCompany(companyId);
    }
    return this.crmDealsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get CRM deal by ID' })
  @ApiResponse({ status: 200, description: 'Returns the deal' })
  @CrmRoles('admin', 'commercial')
  async findById(@Param('id') id: string) {
    return this.crmDealsService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new CRM deal' })
  @ApiResponse({ status: 201, description: 'Deal created successfully' })
  @CrmRoles('admin', 'commercial')
  async create(@Body() dto: CreateCrmDealDto, @CurrentCrmUser() crmUser: any) {
    return this.crmDealsService.create(dto, crmUser);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update CRM deal' })
  @ApiResponse({ status: 200, description: 'Deal updated successfully' })
  @CrmRoles('admin', 'commercial')
  async update(@Param('id') id: string, @Body() dto: UpdateCrmDealDto) {
    return this.crmDealsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete CRM deal' })
  @ApiResponse({ status: 200, description: 'Deal deleted successfully' })
  @CrmRoles('admin', 'commercial')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    return this.crmDealsService.delete(id);
  }
}
