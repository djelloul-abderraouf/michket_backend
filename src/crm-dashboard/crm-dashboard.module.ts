import { Module } from '@nestjs/common';

import { CrmDashboardController } from './crm-dashboard.controller';
import { CrmDashboardService } from './crm-dashboard.service';
import { CrmBaseModule } from '../crm-base/crm-base.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [CrmBaseModule, AuthModule],
  controllers: [CrmDashboardController],
  providers: [CrmDashboardService],
  exports: [CrmDashboardService],
})
export class CrmDashboardModule {}
