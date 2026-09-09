import {
  Body,
  Controller,
  Post,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RouteConfig } from '@nestjs/platform-fastify';

import { PromotionsService } from './promotions.service';
import { PreviewPromotionDto } from './promotions.dto';

@ApiTags('Promotions')
@Controller('promotions')
export class PromotionsController {
  constructor(
    private readonly promotionsService: PromotionsService,
  ) {}

  @Post('preview')
  @RouteConfig({
    rateLimit: {
      max: 60,
      timeWindow: '1 minute',
    },
  })
  @ApiOperation({
    summary:
      'Preview a promotion discount before checkout',
  })
  preview(
    @Body() body: PreviewPromotionDto,
  ) {
    return this.promotionsService.preview(
      body.code,
      body.subtotalCents,
    );
  }
}
