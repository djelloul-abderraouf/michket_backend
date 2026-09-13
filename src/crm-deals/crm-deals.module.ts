import { Module } from '@nestjs/common';

import { CrmDealsController } from './crm-deals.controller';
import { CrmDealsService } from './crm-deals.service';
import { CrmBaseModule } from '../crm-base/crm-base.module';

@Module({
  imports: [CrmBaseModule],
  controllers: [CrmDealsController],
  providers: [CrmDealsService],
  exports: [CrmDealsService],
})
export class CrmDealsModule {}
