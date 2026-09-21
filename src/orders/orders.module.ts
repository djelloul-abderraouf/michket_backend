import { Module } from '@nestjs/common';

import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderExpirationReconciler } from './order-expiration.reconciler';

import { DatabaseModule } from '../database/database.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { PromotionsModule } from '../promotions/promotions.module';

@Module({
  imports: [
    DatabaseModule,
    DeliveryModule,
    PromotionsModule,
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    OrderExpirationReconciler,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
