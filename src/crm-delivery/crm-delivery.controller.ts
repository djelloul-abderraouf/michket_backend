import {
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CrmAuthGuard } from '../auth/guards/crm-auth.guard';
import { CrmRolesGuard } from '../auth/guards/crm-roles.guard';
import { CrmRoles } from '../common/decorators/roles.decorator';
import { CurrentCrmUser } from '../common/decorators/current-crm-user.decorator';
import { CrmDeliveryService } from './crm-delivery.service';

@ApiTags('CRM Delivery')
@Controller('crm/delivery')
@UseGuards(CrmAuthGuard, CrmRolesGuard)
@ApiBearerAuth()
export class CrmDeliveryController {
  constructor(private readonly crmDeliveryService: CrmDeliveryService) {}

  @Get('shipments')
  @ApiOperation({ summary: 'List recent shipments' })
  @CrmRoles('admin', 'livraison', 'preparation')
  async listShipments() {
    return this.crmDeliveryService.listRecentShipments();
  }

  @Post('yalidine/:orderId')
  @ApiOperation({ summary: 'Create a Yalidine parcel for a confirmed order' })
  @CrmRoles('admin', 'livraison', 'preparation', 'confirmation')
  async createParcel(
    @Param('orderId') orderId: string,
    @CurrentCrmUser() crmUser: { id: string },
  ) {
    return this.crmDeliveryService.createYalidineParcel(orderId, crmUser);
  }

  @Post('yalidine/:orderId/sync')
  @ApiOperation({ summary: 'Refresh Yalidine tracking for an order' })
  @CrmRoles('admin', 'livraison', 'preparation')
  async syncParcel(@Param('orderId') orderId: string) {
    return this.crmDeliveryService.syncYalidineParcel(orderId);
  }
}
