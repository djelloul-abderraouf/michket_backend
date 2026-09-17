import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './config/validation';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { ReferencesModule } from './references/references.module';
import { CartsModule } from './carts/carts.module';
import { OrdersModule } from './orders/orders.module';
import { CacheModule } from './cache/cache.module';
import { HealthModule } from './health/health.module';
import { AdminModule } from './admin/admin.module';
import { DeliveryModule } from './delivery/delivery.module';
import { UsersModule } from './users/users.module';
import { MediaModule } from './media/media.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
      cache: true,
    }),

    DatabaseModule,
    CacheModule,
    AuthModule,
    ProductsModule,
    CategoriesModule,
    ReferencesModule,
    CartsModule,
    OrdersModule,
    HealthModule,
    AdminModule,
    DeliveryModule,
    UsersModule,
    MediaModule,
  ],
})
export class AppModule {}
