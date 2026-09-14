import {
  BadRequestException,
  Controller,
  Get,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { DeliveryService } from './delivery.service';

@ApiTags('Delivery')
@Controller('delivery')
export class DeliveryController {
  constructor(
    private readonly deliveryService: DeliveryService,
  ) {}

  @Get('rate')
  @ApiOperation({
    summary: 'Calculate delivery rate',
  })
  @ApiQuery({
    name: 'wilayaCode',
    required: true,
    type: Number,
  })
  @ApiQuery({
    name: 'communeId',
    required: false,
    type: Number,
    description:
      'Yalidine commune id. Required for an exact Yalidine rate.',
  })
  @ApiQuery({
    name: 'deliveryType',
    required: false,
    enum: ['home', 'office'],
  })
  async getRate(
    @Query('wilayaCode', ParseIntPipe)
    wilayaCode: number,

    @Query('deliveryType')
    deliveryType?: 'home' | 'office',

    @Query('communeId')
    communeIdRaw?: string,
  ) {
    let communeId: number | undefined;

    if (
      communeIdRaw !== undefined &&
      communeIdRaw.trim() !== ''
    ) {
      const parsed = Number(communeIdRaw);

      if (
        !Number.isInteger(parsed) ||
        parsed <= 0
      ) {
        throw new BadRequestException(
          'communeId must be a positive integer',
        );
      }

      communeId = parsed;
    }

    return this.deliveryService.calculateRate(
      wilayaCode,
      deliveryType,
      communeId,
    );
  }

  @Get('wilayas')
  @ApiOperation({
    summary: 'Get Yalidine wilayas',
  })
  async getWilayas() {
    return this.deliveryService.getWilayas();
  }

  @Get('communes')
  @ApiOperation({
    summary: 'Get Yalidine communes for a wilaya',
  })
  @ApiQuery({
    name: 'wilayaCode',
    required: true,
    type: Number,
  })
  async getCommunes(
    @Query('wilayaCode', ParseIntPipe)
    wilayaCode: number,
  ) {
    return this.deliveryService.getCommunes(
      wilayaCode,
    );
  }
}
