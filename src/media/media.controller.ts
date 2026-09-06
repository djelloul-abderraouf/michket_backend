import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RouteConfig } from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

import { MediaService } from './media.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

type AuthenticatedRequest = FastifyRequest & {
  user?: {
    id: string;
    email: string;
    role: 'customer' | 'admin' | 'super_admin';
  };
};

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

@ApiTags('Media')
@ApiBearerAuth()
@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
  ) {}

  @Post('product-images')
  @RouteConfig({
    rateLimit: {
      max: 30,
      timeWindow: '1 minute',
    },
  })
  @ApiOperation({
    summary: 'Upload a product image to Supabase Storage',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadProductImage(
    @Req() req: AuthenticatedRequest,
  ) {
    if (
      req.user?.role !== 'admin' &&
      req.user?.role !== 'super_admin'
    ) {
      throw new ForbiddenException(
        'Admin access required',
      );
    }

    const file = await req.file();

    if (!file) {
      throw new BadRequestException(
        'Image file is required',
      );
    }

    if (file.fieldname !== 'file') {
      throw new BadRequestException(
        'Multipart image field must be named "file"',
      );
    }

    const mimetype = file.mimetype
      .split(';', 1)[0]
      .trim()
      .toLowerCase();

    const extension =
      EXTENSION_BY_MIME[mimetype];

    if (!extension) {
      throw new BadRequestException(
        'Only JPEG, PNG, WebP and AVIF images are allowed',
      );
    }

    const buffer = await file.toBuffer();

    if (file.file.truncated) {
      throw new BadRequestException(
        'Image exceeds the 10 MB limit',
      );
    }

    const now = new Date();

    const path = [
      'products',
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      `${randomUUID()}.${extension}`,
    ].join('/');

    return this.mediaService.upload(
      buffer,
      path,
      mimetype,
    );
  }
}
