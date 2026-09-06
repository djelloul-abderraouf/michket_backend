import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  // No public webhook is exposed for now.
  //
  // Michket currently uses Cash on Delivery (COD) only and
  // no external carrier/payment integration requires inbound webhooks.
  //
  // A webhook route can be added later when a real external service
  // (for example a delivery carrier) is integrated, with signature
  // verification and strict payload validation.
}
