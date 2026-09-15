import { Module } from '@nestjs/common';

import { CrmOrdersController } from './crm-orders.controller';
import { CrmOrdersService } from './crm-orders.service';
import { CrmBaseModule } from '../crm-base/crm-base.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [CrmBaseModule, AuthModule],
  controllers: [CrmOrdersController],
  providers: [CrmOrdersService],
  exports: [CrmOrdersService],
})
export class CrmOrdersModule {}