import { Module } from '@nestjs/common';

import { CrmProductsController } from './crm-products.controller';
import { CrmProductsService } from './crm-products.service';
import { CrmBaseModule } from '../crm-base/crm-base.module';

@Module({
  imports: [CrmBaseModule],
  controllers: [CrmProductsController],
  providers: [CrmProductsService],
  exports: [CrmProductsService],
})
export class CrmProductsModule {}
