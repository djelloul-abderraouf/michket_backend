import {
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
    name: 'deliveryType',
    required: false,
    enum: ['home', 'office'],
  })
  async getRate(
    @Query('wilayaCode', ParseIntPipe)
    wilayaCode: number,
    @Query('deliveryType')
    deliveryType?: 'home' | 'office',
  ) {
    return this.deliveryService.calculateRate(
      wilayaCode,
      deliveryType,
    );
  }

  @Get('wilayas')
  @ApiOperation({
    summary: 'Get list of wilayas',
  })
  async getWilayas() {
    return this.deliveryService.getWilayas();
  }

  @Get('communes')
  @ApiOperation({
    summary: 'Get communes for a wilaya',
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
