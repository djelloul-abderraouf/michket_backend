import { Module } from '@nestjs/common';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

import { DatabaseModule } from '../database/database.module';
import { ProductsModule } from '../products/products.module';
import { CategoriesModule } from '../categories/categories.module';
import { OrdersModule } from '../orders/orders.module';
import { UsersModule } from '../users/users.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    DatabaseModule,
    ProductsModule,
    CategoriesModule,
    OrdersModule,
    UsersModule,
    MediaModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
