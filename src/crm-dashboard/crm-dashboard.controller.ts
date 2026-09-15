import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { CrmDashboardService } from './crm-dashboard.service';
import { CrmAuthGuard } from '../auth/guards/crm-auth.guard';
import { CrmRolesGuard } from '../auth/guards/crm-roles.guard';
import { CrmRoles } from '../common/decorators/roles.decorator';

@ApiTags('CRM Dashboard')
@Controller('crm/dashboard')
@UseGuards(CrmAuthGuard, CrmRolesGuard)
@ApiBearerAuth()
export class CrmDashboardController {
  constructor(
    private readonly crmDashboardService: CrmDashboardService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get CRM dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Returns dashboard statistics' })
  @CrmRoles('admin', 'commercial', 'confirmation', 'fabrication', 'preparation', 'livraison')
  async getStats() {
    return this.crmDashboardService.getEnhancedStats();
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get CRM summary statistics' })
  @ApiResponse({ status: 200, description: 'Returns summary statistics' })
  @CrmRoles('admin', 'commercial', 'confirmation', 'fabrication', 'preparation', 'livraison')
  async getSummary() {
    return this.crmDashboardService.getSummary();
  }

  @Get('deals')
  @ApiOperation({ summary: 'Get deal statistics' })
  @ApiResponse({ status: 200, description: 'Returns deal statistics' })
  @CrmRoles('admin', 'commercial')
  async getDealStatistics() {
    return this.crmDashboardService.getDealStatistics();
  }

  @Get('production')
  @ApiOperation({ summary: 'Get production statistics' })
  @ApiResponse({ status: 200, description: 'Returns production statistics' })
  @CrmRoles('admin', 'fabrication')
  async getProductionStatistics() {
    return this.crmDashboardService.getProductionStatistics();
  }

  @Get('tasks')
  @ApiOperation({ summary: 'Get task statistics' })
  @ApiResponse({ status: 200, description: 'Returns task statistics' })
  @CrmRoles('admin', 'commercial', 'confirmation', 'fabrication', 'preparation', 'livraison')
  async getTaskStatistics() {
    return this.crmDashboardService.getTaskStatistics();
  }

  @Get('enhanced-stats')
  @ApiOperation({ summary: 'Get enhanced dashboard statistics with KPIs' })
  @ApiResponse({ status: 200, description: 'Returns enhanced statistics with detailed KPIs' })
  @CrmRoles('admin', 'commercial', 'confirmation', 'fabrication', 'preparation', 'livraison')
  async getEnhancedStats() {
    return this.crmDashboardService.getEnhancedStats();
  }

  @Get('kpis')
  @ApiOperation({ summary: 'Get key performance indicators' })
  @ApiResponse({ status: 200, description: 'Returns KPIs for dashboard' })
  @CrmRoles('admin', 'commercial', 'confirmation', 'fabrication', 'preparation', 'livraison')
  async getKPIs() {
    return this.crmDashboardService.getKPIs();
  }
}
