import { Module } from '@nestjs/common';

import { CrmProjectsController } from './crm-projects.controller';
import { CrmProjectsService } from './crm-projects.service';
import { CrmBaseModule } from '../crm-base/crm-base.module';

@Module({
  imports: [CrmBaseModule],
  controllers: [CrmProjectsController],
  providers: [CrmProjectsService],
  exports: [CrmProjectsService],
})
export class CrmProjectsModule {}
