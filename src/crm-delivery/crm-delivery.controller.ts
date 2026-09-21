import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';

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

  @Get('yalidine/health')
  @ApiOperation({ summary: 'Check Yalidine API connectivity' })
  @CrmRoles('admin', 'livraison', 'preparation', 'confirmation')
  async yalidineHealth() {
    return this.crmDeliveryService.getYalidineHealth();
  }

  @Get('yalidine/:orderId/label')
  @ApiOperation({ summary: 'Get printable Yalidine label URL' })
  @CrmRoles('admin', 'livraison', 'preparation', 'confirmation')
  async yalidineLabel(@Param('orderId') orderId: string) {
    return this.crmDeliveryService.getYalidineLabelUrl(orderId);
  }

  @Get('bordereau/:orderId')
  @ApiOperation({ summary: 'Download shipping slip PDF for a confirmed order' })
  @CrmRoles('admin', 'livraison', 'preparation', 'confirmation', 'commercial')
  async bordereau(
    @Param('orderId') orderId: string,
    @Res() reply: FastifyReply,
  ) {
    const { filename, buffer } = await this.crmDeliveryService.buildBordereau(orderId);
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(buffer);
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
