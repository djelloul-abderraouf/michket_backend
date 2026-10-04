import { Module, forwardRef } from '@nestjs/common';

import { CrmOrdersController } from './crm-orders.controller';
import { CrmOrdersService } from './crm-orders.service';
import { CrmBaseModule } from '../crm-base/crm-base.module';
import { AuthModule } from '../auth/auth.module';
import { CrmDeliveryModule } from '../crm-delivery/crm-delivery.module';
import { CrmStockModule } from '../crm-stock/crm-stock.module';

@Module({
  imports: [CrmBaseModule, AuthModule, forwardRef(() => CrmDeliveryModule), CrmStockModule],
  controllers: [CrmOrdersController],
  providers: [CrmOrdersService],
  exports: [CrmOrdersService],
})
export class CrmOrdersModule {}
