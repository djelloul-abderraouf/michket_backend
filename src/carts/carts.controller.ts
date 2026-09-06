import {
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
  Body,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { CartsService } from './carts.service';
import {
  AddCartItemDto,
  UpdateCartItemDto,
} from './dto/carts.dto';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

type AuthenticatedUser = {
  id: string;
  email: string;
  role: 'customer' | 'admin' | 'super_admin';
};

type RequestWithOptionalUser = FastifyRequest & {
  user?: AuthenticatedUser;
};

@Controller('carts')
@UseGuards(OptionalJwtAuthGuard)
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @Get()
  async getCart(
    @Req() req: RequestWithOptionalUser,
    @Headers('x-session-id') sessionIdHeader: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const sessionId = this.resolveSessionId(
      req.user?.id,
      sessionIdHeader,
      reply,
    );

    const cart = await this.cartsService.getOrCreate(
      req.user?.id,
      sessionId,
    );

    const totals = await this.cartsService.calculateCartTotal(
      cart.id,
    );

    return {
      cart: {
        id: cart.id,
        status: cart.status,
      },
      sessionId: req.user ? undefined : sessionId,
      ...totals,
    };
  }

  @Post('items')
  async addItem(
    @Body() body: AddCartItemDto,
    @Req() req: RequestWithOptionalUser,
    @Headers('x-session-id') sessionIdHeader: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const sessionId = this.resolveSessionId(
      req.user?.id,
      sessionIdHeader,
      reply,
    );

    const cart = await this.cartsService.getOrCreate(
      req.user?.id,
      sessionId,
    );

    await this.cartsService.addItem(
      cart.id,
      body.productId,
      body.quantity,
      body.variantId,
      body.personalization,
    );

    const totals = await this.cartsService.calculateCartTotal(
      cart.id,
    );

    return {
      cart: {
        id: cart.id,
        status: cart.status,
      },
      sessionId: req.user ? undefined : sessionId,
      ...totals,
    };
  }

  @Put('items/:itemId')
  async updateItem(
    @Param('itemId') itemId: string,
    @Body() body: UpdateCartItemDto,
    @Req() req: RequestWithOptionalUser,
    @Headers('x-session-id') sessionIdHeader: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const sessionId = this.resolveSessionId(
      req.user?.id,
      sessionIdHeader,
      reply,
    );

    await this.cartsService.updateOwnedItemQuantity(
      itemId,
      body.quantity,
      req.user?.id,
      sessionId,
    );

    const cart = await this.cartsService.getOrCreate(
      req.user?.id,
      sessionId,
    );

    const totals = await this.cartsService.calculateCartTotal(
      cart.id,
    );

    return {
      cart: {
        id: cart.id,
        status: cart.status,
      },
      sessionId: req.user ? undefined : sessionId,
      ...totals,
    };
  }

  @Delete('items/:itemId')
  async removeItem(
    @Param('itemId') itemId: string,
    @Req() req: RequestWithOptionalUser,
    @Headers('x-session-id') sessionIdHeader: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const sessionId = this.resolveSessionId(
      req.user?.id,
      sessionIdHeader,
      reply,
    );

    await this.cartsService.removeOwnedItem(
      itemId,
      req.user?.id,
      sessionId,
    );

    const cart = await this.cartsService.getOrCreate(
      req.user?.id,
      sessionId,
    );

    const totals = await this.cartsService.calculateCartTotal(
      cart.id,
    );

    return {
      cart: {
        id: cart.id,
        status: cart.status,
      },
      sessionId: req.user ? undefined : sessionId,
      ...totals,
    };
  }

  @Delete()
  async clearCart(
    @Req() req: RequestWithOptionalUser,
    @Headers('x-session-id') sessionIdHeader: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const sessionId = this.resolveSessionId(
      req.user?.id,
      sessionIdHeader,
      reply,
    );

    await this.cartsService.clearOwnedCart(
      req.user?.id,
      sessionId,
    );

    const cart = await this.cartsService.getOrCreate(
      req.user?.id,
      sessionId,
    );

    return {
      cart: {
        id: cart.id,
        status: cart.status,
      },
      sessionId: req.user ? undefined : sessionId,
      items: [],
      subtotalCents: 0,
      currency: 'DZD',
      itemCount: 0,
    };
  }

  private resolveSessionId(
    userId: string | undefined,
    sessionIdHeader: string | undefined,
    reply: FastifyReply,
  ): string | undefined {
    if (userId) {
      return undefined;
    }

    const candidate = sessionIdHeader?.trim();

    if (
      candidate &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        candidate,
      )
    ) {
      return candidate;
    }

    const sessionId = randomUUID();

    // The frontend should persist this value and send it again
    // in the X-Session-Id header for subsequent guest cart requests.
    reply.header('X-Session-Id', sessionId);

    return sessionId;
  }
}
