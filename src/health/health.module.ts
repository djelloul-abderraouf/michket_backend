import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { DatabaseModule } from '../database/database.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    DatabaseModule,
    QueueModule,
  ],
  controllers: [HealthController],
})
export class HealthModule {}
