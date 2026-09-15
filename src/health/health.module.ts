import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { DatabaseModule } from '../database/database.module';
// import { QueueModule } from '../queue/queue.module'; // Temporarily disabled due to Redis issues

@Module({
  imports: [
    DatabaseModule,
    // QueueModule, // Temporarily disabled due to Redis issues
  ],
  controllers: [HealthController],
})
export class HealthModule {}
