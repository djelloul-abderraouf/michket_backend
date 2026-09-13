import { Module } from '@nestjs/common';

import { CrmTasksController } from './crm-tasks.controller';
import { CrmTasksService } from './crm-tasks.service';
import { CrmBaseModule } from '../crm-base/crm-base.module';

@Module({
  imports: [CrmBaseModule],
  controllers: [CrmTasksController],
  providers: [CrmTasksService],
  exports: [CrmTasksService],
})
export class CrmTasksModule {}
