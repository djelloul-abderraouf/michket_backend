import { Module } from '@nestjs/common';

import { CrmActivitiesController } from './crm-activities.controller';
import { CrmActivitiesService } from './crm-activities.service';
import { CrmBaseModule } from '../crm-base/crm-base.module';

@Module({
  imports: [CrmBaseModule],
  controllers: [CrmActivitiesController],
  providers: [CrmActivitiesService],
  exports: [CrmActivitiesService],
})
export class CrmActivitiesModule {}
