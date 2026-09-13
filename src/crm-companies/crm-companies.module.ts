import { Module } from '@nestjs/common';

import { CrmCompaniesController } from './crm-companies.controller';
import { CrmCompaniesService } from './crm-companies.service';
import { CrmBaseModule } from '../crm-base/crm-base.module';

@Module({
  imports: [CrmBaseModule],
  controllers: [CrmCompaniesController],
  providers: [CrmCompaniesService],
  exports: [CrmCompaniesService],
})
export class CrmCompaniesModule {}
