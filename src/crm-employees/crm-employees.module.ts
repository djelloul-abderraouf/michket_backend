import { Module } from '@nestjs/common';

import { CrmEmployeesController } from './crm-employees.controller';
import { CrmEmployeesService } from './crm-employees.service';
import { CrmBaseModule } from '../crm-base/crm-base.module';

@Module({
  imports: [CrmBaseModule],
  controllers: [CrmEmployeesController],
  providers: [CrmEmployeesService],
  exports: [CrmEmployeesService],
})
export class CrmEmployeesModule {}
