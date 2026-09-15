import { Module } from '@nestjs/common';

import { CrmBaseModule } from '../crm-base/crm-base.module';
import { UsersModule } from '../users/users.module';
import { CrmUsersController } from './crm-users.controller';

@Module({
  imports: [CrmBaseModule, UsersModule],
  controllers: [CrmUsersController],
})
export class CrmUsersModule {}
