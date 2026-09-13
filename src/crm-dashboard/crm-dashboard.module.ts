import { Module } from '@nestjs/common';

import { CrmDashboardController } from './crm-dashboard.controller';
import { CrmDashboardService } from './crm-dashboard.service';
import { CrmBaseModule } from '../crm-base/crm-base.module';

@Module({
  imports: [CrmBaseModule],
  controllers: [CrmDashboardController],
  providers: [CrmDashboardService],
  exports: [CrmDashboardService],
})
export class CrmDashboardModule {}
