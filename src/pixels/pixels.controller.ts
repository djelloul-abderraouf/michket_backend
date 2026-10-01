import {
  Body,
  Controller,
  Delete,
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

import { UpsertPixelDto } from './pixels.dto';
import { PixelsService } from './pixels.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

type StaffRequest = FastifyRequest & {
  user: { id: string };
};

@ApiTags('Admin pixels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/pixels')
export class PixelsController {
  constructor(private readonly pixelsService: PixelsService) {}

  @Get()
  @Roles('admin', 'super_admin', 'social_media')
  list() {
    return this.pixelsService.list();
  }

  @Post()
  @Roles('admin', 'super_admin', 'social_media')
  create(@Body() body: UpsertPixelDto, @Req() req: StaffRequest) {
    return this.pixelsService.create(body, req.user.id);
  }

  @Put(':id')
  @Roles('admin', 'super_admin', 'social_media')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpsertPixelDto,
  ) {
    return this.pixelsService.update(id, body);
  }

  @Delete(':id')
  @Roles('admin', 'super_admin', 'social_media')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.pixelsService.remove(id);
  }
}
