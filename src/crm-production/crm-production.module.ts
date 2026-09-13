import { Module } from '@nestjs/common';

import { CrmProductionController } from './crm-production.controller';
import { CrmProductionService } from './crm-production.service';
import { CrmBaseModule } from '../crm-base/crm-base.module';

@Module({
  imports: [CrmBaseModule],
  controllers: [CrmProductionController],
  providers: [CrmProductionService],
  exports: [CrmProductionService],
})
export class CrmProductionModule {}
