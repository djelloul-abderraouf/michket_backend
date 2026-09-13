import { Module } from '@nestjs/common';

import { CrmCustomersController } from './crm-customers.controller';
import { CrmCustomersService } from './crm-customers.service';
import { CrmBaseModule } from '../crm-base/crm-base.module';

@Module({
  imports: [CrmBaseModule],
  controllers: [CrmCustomersController],
  providers: [CrmCustomersService],
  exports: [CrmCustomersService],
})
export class CrmCustomersModule {}
