import { Module } from '@nestjs/common';

import { CrmBaseModule } from '../crm-base/crm-base.module';
import { MediaModule } from '../media/media.module';
import { ProductsModule } from '../products/products.module';
import { CrmCatalogController } from './crm-catalog.controller';

@Module({
  imports: [CrmBaseModule, ProductsModule, MediaModule],
  controllers: [CrmCatalogController],
})
export class CrmCatalogModule {}
