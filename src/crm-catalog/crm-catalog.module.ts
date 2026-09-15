import { Module } from '@nestjs/common';

import { CrmBaseModule } from '../crm-base/crm-base.module';
import { ProductsModule } from '../products/products.module';
import { CrmCatalogController } from './crm-catalog.controller';

@Module({
  imports: [CrmBaseModule, ProductsModule],
  controllers: [CrmCatalogController],
})
export class CrmCatalogModule {}
