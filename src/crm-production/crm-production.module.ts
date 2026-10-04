import { Module, forwardRef } from '@nestjs/common';

import { CrmProductionController } from './crm-production.controller';
import { CrmProductionService } from './crm-production.service';
import { CrmBaseModule } from '../crm-base/crm-base.module';
import { CrmOrdersModule } from '../crm-orders/crm-orders.module';

@Module({
  imports: [CrmBaseModule, forwardRef(() => CrmOrdersModule)],
  controllers: [CrmProductionController],
  providers: [CrmProductionService],
  exports: [CrmProductionService],
})
export class CrmProductionModule {}
