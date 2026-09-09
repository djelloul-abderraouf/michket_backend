import { Module } from '@nestjs/common';

import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import {
  StorageLinkCheckerService,
} from './storage-link-checker.service';

@Module({
  controllers: [MediaController],
  providers: [
    MediaService,
    StorageLinkCheckerService,
  ],
  exports: [MediaService],
})
export class MediaModule {}
