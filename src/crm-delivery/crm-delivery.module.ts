import { Module, forwardRef } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CrmBaseModule } from '../crm-base/crm-base.module';
import { CrmOrdersModule } from '../crm-orders/crm-orders.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { CrmDeliveryController } from './crm-delivery.controller';
import { CrmDeliveryService } from './crm-delivery.service';

@Module({
  imports: [
    CrmBaseModule,
    AuthModule,
    DeliveryModule,
    forwardRef(() => CrmOrdersModule),
  ],
  controllers: [CrmDeliveryController],
  providers: [CrmDeliveryService],
  exports: [CrmDeliveryService],
})
export class CrmDeliveryModule {}
