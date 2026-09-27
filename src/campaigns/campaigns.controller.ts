import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { UpsertCampaignDto } from './campaigns.dto';
import { CampaignsService } from './campaigns.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

type StaffRequest = FastifyRequest & {
  user: { id: string };
};

@ApiTags('Campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get(':slug')
  getPublic(@Param('slug') slug: string) {
    return this.campaignsService.getPublic(slug);
  }
}

@ApiTags('Admin campaigns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/campaigns')
export class AdminCampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get('catalog')
  @Roles('admin', 'super_admin', 'social_media')
  catalog() {
    return this.campaignsService.catalog();
  }

  @Get()
  @Roles('admin', 'super_admin', 'social_media')
  list() {
    return this.campaignsService.list();
  }

  @Get(':id')
  @Roles('admin', 'super_admin', 'social_media')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.getById(id);
  }

  @Post()
  @Roles('admin', 'super_admin', 'social_media')
  create(
    @Body() body: UpsertCampaignDto,
    @Req() req: StaffRequest,
  ) {
    return this.campaignsService.create(body, req.user.id);
  }

  @Put(':id')
  @Roles('admin', 'super_admin', 'social_media')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpsertCampaignDto,
  ) {
    return this.campaignsService.update(id, body);
  }
}
