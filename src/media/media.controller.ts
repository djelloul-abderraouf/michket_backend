import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  HttpCode,
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
import {
  StorageLinkCheckerService,
} from './storage-link-checker.service';
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

const ALLOWED_STORAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'avif',
]);

@ApiTags('Media')
@ApiBearerAuth()
@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly linkChecker: StorageLinkCheckerService,
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

  @Post('category-images')
  @RouteConfig({
    rateLimit: {
      max: 30,
      timeWindow: '1 minute',
    },
  })
  @ApiOperation({
    summary: 'Upload a category image to Supabase Storage',
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
  async uploadCategoryImage(
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
      'categories',
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

  @Delete('category-images')
  @HttpCode(204)
  @RouteConfig({
    rateLimit: {
      max: 30,
      timeWindow: '1 minute',
    },
  })
  @ApiOperation({
    summary: 'Delete a category image from Supabase Storage (admin only)',
  })
  async deleteCategoryImage(
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

    // Fastify: parse raw body to get storagePath
    const body = await req.body;
    const storagePath =
      typeof body === 'string'
        ? (JSON.parse(body) as { storagePath?: string })?.storagePath
        : (body as { storagePath?: string })?.storagePath;

    if (
      !storagePath ||
      typeof storagePath !== 'string' ||
      storagePath.trim().length === 0
    ) {
      throw new BadRequestException(
        'storagePath is required',
      );
    }

    const normalizedPath = storagePath
      .trim()
      .replace(/^\/+/, '');

    // No path traversal
    if (normalizedPath.includes('..')) {
      throw new BadRequestException(
        'Invalid storage path',
      );
    }

    // Only allow categories/ prefix — never products/
    if (!normalizedPath.startsWith('categories/')) {
      throw new BadRequestException(
        'Only category image paths are allowed',
      );
    }

    // Validate format: categories/YYYY/MM/filename.ext
    const pathPattern =
      /^categories\/\d{4}\/\d{2}\/[^/]+\.(jpg|jpeg|png|webp|avif)$/i;

    if (!pathPattern.test(normalizedPath)) {
      throw new BadRequestException(
        'Invalid category image path format',
      );
    }

    await this.linkChecker.assertCategoryImageUnlinked(
      normalizedPath,
    );

    await this.mediaService.delete(normalizedPath);
  }

  @Delete('product-images')
  @HttpCode(204)
  @RouteConfig({
    rateLimit: {
      max: 30,
      timeWindow: '1 minute',
    },
  })
  @ApiOperation({
    summary: 'Delete a product image from Supabase Storage (admin only)',
  })
  async deleteProductImage(
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

    const body = await req.body;
    const storagePath =
      typeof body === 'string'
        ? (JSON.parse(body) as { storagePath?: string })?.storagePath
        : (body as { storagePath?: string })?.storagePath;

    if (
      !storagePath ||
      typeof storagePath !== 'string' ||
      storagePath.trim().length === 0
    ) {
      throw new BadRequestException(
        'storagePath is required',
      );
    }

    const normalizedPath = storagePath
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/{2,}/g, '/');

    // No path traversal
    if (
      normalizedPath.includes('..') ||
      normalizedPath.startsWith('.')
    ) {
      throw new BadRequestException(
        'Invalid storage path',
      );
    }

    // Only allow products/ prefix — never categories/
    if (!normalizedPath.startsWith('products/')) {
      throw new BadRequestException(
        'Only product image paths are allowed',
      );
    }

    // Validate format: products/YYYY/MM/<uuid>.ext
    const pathPattern =
      /^products\/\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|avif)$/i;

    if (!pathPattern.test(normalizedPath)) {
      throw new BadRequestException(
        'Invalid product image path format',
      );
    }

    await this.linkChecker.assertProductImageUnlinked(
      normalizedPath,
    );

    await this.mediaService.delete(normalizedPath);
  }
}
