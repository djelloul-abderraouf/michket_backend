import { Module } from '@nestjs/common';

import { ReferencesService } from './references.service';
import { ReferencesController } from './references.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ReferencesController],
  providers: [ReferencesService],
  exports: [ReferencesService],
})
export class ReferencesModule {}
