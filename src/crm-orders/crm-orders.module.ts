import { Module, forwardRef } from '@nestjs/common';

import { CrmOrdersController } from './crm-orders.controller';
import { CrmOrdersService } from './crm-orders.service';
import { CrmBaseModule } from '../crm-base/crm-base.module';
import { AuthModule } from '../auth/auth.module';
import { CrmDeliveryModule } from '../crm-delivery/crm-delivery.module';

@Module({
  imports: [CrmBaseModule, AuthModule, forwardRef(() => CrmDeliveryModule)],
  controllers: [CrmOrdersController],
  providers: [CrmOrdersService],
  exports: [CrmOrdersService],
})
export class CrmOrdersModule {}
