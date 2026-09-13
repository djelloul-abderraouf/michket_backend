import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { CrmBaseService } from './crm-base.service';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
  ],
  providers: [CrmBaseService],
  exports: [
    DatabaseModule,
    AuthModule,
    CrmBaseService,
  ],
})
export class CrmBaseModule {}
