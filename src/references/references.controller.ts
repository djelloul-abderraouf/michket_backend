import {
  Controller,
  Get,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ReferencesService } from './references.service';

@ApiTags('References')
@Controller('references')
export class ReferencesController {
  constructor(
    private readonly referencesService: ReferencesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List active client references',
  })
  findAll() {
    return this.referencesService.findAllActive();
  }
}
