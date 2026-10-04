import { Module } from '@nestjs/common';

import { CrmBaseModule } from '../crm-base/crm-base.module';
import { CrmStockController } from './crm-stock.controller';
import { CrmStockService } from './crm-stock.service';

@Module({
  imports: [CrmBaseModule],
  controllers: [CrmStockController],
  providers: [CrmStockService],
  exports: [CrmStockService],
})
export class CrmStockModule {}
