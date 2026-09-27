import { Module } from '@nestjs/common';

import {
  AdminCampaignsController,
  CampaignsController,
} from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

@Module({
  controllers: [AdminCampaignsController, CampaignsController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
