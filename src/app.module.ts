import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './config/validation';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { CartsModule } from './carts/carts.module';
import { OrdersModule } from './orders/orders.module';
// import { CacheModule } from './cache/cache.module'; // Temporarily disabled due to Redis issues
import { HealthModule } from './health/health.module';
// import { AdminModule } from './admin/admin.module'; // Temporarily disabled due to Redis/Queue dependencies
import { DeliveryModule } from './delivery/delivery.module';
import { UsersModule } from './users/users.module';
import { MediaModule } from './media/media.module';
import { CrmBaseModule } from './crm-base/crm-base.module';
import { CrmDashboardModule } from './crm-dashboard/crm-dashboard.module';
import { CrmCustomersModule } from './crm-customers/crm-customers.module';
import { CrmCompaniesModule } from './crm-companies/crm-companies.module';
import { CrmActivitiesModule } from './crm-activities/crm-activities.module';
import { CrmProjectsModule } from './crm-projects/crm-projects.module';
import { CrmDealsModule } from './crm-deals/crm-deals.module';
import { CrmProposalsModule } from './crm-proposals/crm-proposals.module';
import { CrmProductionModule } from './crm-production/crm-production.module';
import { CrmTasksModule } from './crm-tasks/crm-tasks.module';
import { CrmOrdersModule } from './crm-orders/crm-orders.module';
import { CrmUsersModule } from './crm-users/crm-users.module';
import { CrmCatalogModule } from './crm-catalog/crm-catalog.module';
// import { QueueModule } from './queue/queue.module'; // Temporarily disabled due to Redis issues

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
      cache: true,
    }),

    DatabaseModule,
    // CacheModule, // Temporarily disabled due to Redis issues
    AuthModule,
    ProductsModule,
    CategoriesModule,
    CartsModule,
    OrdersModule,
    HealthModule,
    // AdminModule, // Temporarily disabled due to Redis/Queue dependencies
    DeliveryModule,
    UsersModule,
    MediaModule,
    CrmBaseModule,
    CrmDashboardModule,
    CrmCustomersModule,
    CrmCompaniesModule,
    CrmActivitiesModule,
    CrmProjectsModule,
    CrmDealsModule,
    CrmProposalsModule,
    CrmProductionModule,
    CrmTasksModule,
    CrmOrdersModule,
    CrmUsersModule,
    CrmCatalogModule,
  ],
})
export class AppModule {}