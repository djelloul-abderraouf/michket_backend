import { Module } from '@nestjs/common';

import { CrmProposalsController } from './crm-proposals.controller';
import { CrmProposalsService } from './crm-proposals.service';
import { CrmBaseModule } from '../crm-base/crm-base.module';

@Module({
  imports: [CrmBaseModule],
  controllers: [CrmProposalsController],
  providers: [CrmProposalsService],
  exports: [CrmProposalsService],
})
export class CrmProposalsModule {}
