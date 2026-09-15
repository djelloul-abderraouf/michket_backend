import { Module } from '@nestjs/common';

import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
// import { OrderExpirationWorker } from './order-expiration.worker'; // Temporarily disabled due to Redis issues
// import { OrderExpirationReconciler } from './order-expiration.reconciler'; // Temporarily disabled due to Redis issues

import { DatabaseModule } from '../database/database.module';
import { DeliveryModule } from '../delivery/delivery.module';
// import { QueueModule } from '../queue/queue.module'; // Temporarily disabled due to Redis issues
// import { OrderExpirationQueueService } from '../queue/order-expiration.queue'; // Temporarily disabled due to Redis issues

@Module({
  imports: [
    DatabaseModule,
    DeliveryModule,
    // QueueModule, // Temporarily disabled due to Redis issues
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    // OrderExpirationQueueService, // Temporarily disabled due to Redis issues
    // OrderExpirationWorker, // Temporarily disabled due to Redis issues
    // OrderExpirationReconciler, // Temporarily disabled due to Redis issues
  ],
  exports: [
    OrdersService,
    // OrderExpirationQueueService, // Temporarily disabled due to Redis issues
  ],
})
export class OrdersModule {}
