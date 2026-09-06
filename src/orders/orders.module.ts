import { Module } from '@nestjs/common';

import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderExpirationWorker } from './order-expiration.worker';
import { OrderExpirationReconciler } from './order-expiration.reconciler';

import { DatabaseModule } from '../database/database.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { QueueModule } from '../queue/queue.module';
import { OrderExpirationQueueService } from '../queue/order-expiration.queue';

@Module({
  imports: [
    DatabaseModule,
    DeliveryModule,
    QueueModule,
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    OrderExpirationQueueService,
    OrderExpirationWorker,
    OrderExpirationReconciler,
  ],
  exports: [
    OrdersService,
    OrderExpirationQueueService,
  ],
})
export class OrdersModule {}
