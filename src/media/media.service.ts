import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createClient,
  SupabaseClient,
} from '@supabase/supabase-js';
import sharp from 'sharp';

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const CATEGORY_LANDSCAPE_MAX_WIDTH = 1920;
const CATEGORY_PORTRAIT_MAX_WIDTH = 1080;
const CATEGORY_AVIF_QUALITY = 65;
const CATEGORY_AVIF_EFFORT = 6;
const STORAGE_CACHE_CONTROL_SECONDS = '31536000';

type AllowedImageType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/avif';

const ALLOWED_IMAGE_TYPES = new Set<AllowedImageType>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  private readonly supabase: SupabaseClient;
  private readonly bucket: string;

  constructor(
    private readonly configService: ConfigService,
  ) {
    const supabaseUrl =
      this.configService.getOrThrow<string>('SUPABASE_URL');

    const supabaseSecretKey =
      this.configService.getOrThrow<string>(
        'SUPABASE_SECRET_KEY',
      );

    this.bucket =
      this.configService.get<string>(
        'SUPABASE_STORAGE_BUCKET',
      )?.trim() || 'product-images';

    this.supabase = createClient(
      supabaseUrl,
      supabaseSecretKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }

  async upload(
    file: Buffer,
    path: string,
    contentType: string,
  ): Promise<{
    url: string;
    path: string;
  }> {
    const detectedContentType =
      this.validateImage(file, contentType);

    const safePath = this.normalizePath(path);

    await this.uploadToStorage(
      file,
      safePath,
      detectedContentType,
    );

    return this.getUploadedFileResult(safePath);
  }

  /**
   * Optimize category images before they reach Supabase Storage.
   *
   * The admin may upload JPEG, PNG, WebP or AVIF. The backend:
   * - validates the real file bytes;
   * - applies EXIF orientation;
   * - caps oversized landscape images at 1920 px wide;
   * - caps portrait/square images at 1080 px wide;
   * - never enlarges smaller images;
   * - converts the final asset to AVIF;
   * - stores it with a one-year cache lifetime.
   *
   * Product and reference image uploads keep using upload() unchanged.
   */
  async uploadOptimizedCategoryImage(
    file: Buffer,
    path: string,
    contentType: string,
  ): Promise<{
    url: string;
    path: string;
  }> {
    this.validateImage(file, contentType);

    const safePath = this.normalizePath(path);
    const avifPath = this.replaceExtension(
      safePath,
      'avif',
    );

    let optimizedFile: Buffer;

    try {
      const image = sharp(file, {
        failOn: 'warning',
      }).rotate();

      const metadata = await image.metadata();

      if (!metadata.width || !metadata.height) {
        throw new Error(
          'Unable to determine image dimensions',
        );
      }

      const isLandscape =
        metadata.width > metadata.height;

      const maxWidth = isLandscape
        ? CATEGORY_LANDSCAPE_MAX_WIDTH
        : CATEGORY_PORTRAIT_MAX_WIDTH;

      optimizedFile = await image
        .resize({
          width: maxWidth,
          withoutEnlargement: true,
          fit: 'inside',
        })
        .avif({
          quality: CATEGORY_AVIF_QUALITY,
          effort: CATEGORY_AVIF_EFFORT,
        })
        .toBuffer();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown image processing error';

      this.logger.error(
        `Category image optimization failed for "${safePath}": ${message}`,
      );

      throw new BadRequestException(
        'Unable to process category image',
      );
    }

    await this.uploadToStorage(
      optimizedFile,
      avifPath,
      'image/avif',
    );

    this.logger.log(
      `Optimized category image "${safePath}" -> "${avifPath}" (${file.length} bytes -> ${optimizedFile.length} bytes)`,
    );

    return this.getUploadedFileResult(avifPath);
  }

  async delete(path: string): Promise<void> {
    const safePath = this.normalizePath(path);

    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .remove([safePath]);

    if (error) {
      this.logger.error(
        `Supabase delete failed for "${safePath}": ${error.message}`,
      );

      throw new InternalServerErrorException(
        'Unable to delete image',
      );
    }

    if (!data || data.length === 0) {
      throw new NotFoundException('Image not found');
    }
  }

  async getSignedUrl(
    path: string,
    expiresIn = 3600,
  ): Promise<string> {
    const safePath = this.normalizePath(path);

    if (
      !Number.isInteger(expiresIn) ||
      expiresIn < 1 ||
      expiresIn > 604800
    ) {
      throw new BadRequestException(
        'expiresIn must be between 1 and 604800 seconds',
      );
    }

    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(safePath, expiresIn);

    if (error || !data?.signedUrl) {
      this.logger.error(
        `Supabase signed URL failed for "${safePath}": ${error?.message ?? 'unknown error'}`,
      );

      throw new InternalServerErrorException(
        'Unable to create signed URL',
      );
    }

    return data.signedUrl;
  }

  getPublicUrl(path: string): string {
    const safePath = this.normalizePath(path);

    const { data } = this.supabase.storage
      .from(this.bucket)
      .getPublicUrl(safePath);

    return data.publicUrl;
  }

  private async uploadToStorage(
    file: Buffer,
    safePath: string,
    contentType: AllowedImageType,
  ): Promise<void> {
    const { error } = await this.supabase.storage
      .from(this.bucket)
      .upload(safePath, file, {
        contentType,
        upsert: false,
        cacheControl:
          STORAGE_CACHE_CONTROL_SECONDS,
      });

    if (error) {
      this.logger.error(
        `Supabase upload failed for "${safePath}": ${error.message}`,
      );

      if (
        error.message.toLowerCase().includes('already exists')
      ) {
        throw new BadRequestException(
          'A file already exists at this path',
        );
      }

      throw new InternalServerErrorException(
        'Unable to upload image',
      );
    }
  }

  private getUploadedFileResult(
    safePath: string,
  ): {
    url: string;
    path: string;
  } {
    const { data } = this.supabase.storage
      .from(this.bucket)
      .getPublicUrl(safePath);

    return {
      url: data.publicUrl,
      path: safePath,
    };
  }

  private replaceExtension(
    path: string,
    extension: string,
  ): string {
    const lastSlash = path.lastIndexOf('/');
    const fileName =
      lastSlash >= 0
        ? path.slice(lastSlash + 1)
        : path;

    const lastDot = fileName.lastIndexOf('.');

    if (lastDot <= 0) {
      return `${path}.${extension}`;
    }

    return `${path.slice(
      0,
      path.length - fileName.length + lastDot,
    )}.${extension}`;
  }

  private validateImage(
    file: Buffer,
    declaredContentType: string,
  ): AllowedImageType {
    if (!file || file.length === 0) {
      throw new BadRequestException('Image file is empty');
    }

    if (file.length > MAX_IMAGE_SIZE_BYTES) {
      throw new BadRequestException(
        'Image must not exceed 10 MB',
      );
    }

    const normalizedDeclaredType =
      declaredContentType
        .split(';', 1)[0]
        .trim()
        .toLowerCase();

    if (
      !ALLOWED_IMAGE_TYPES.has(
        normalizedDeclaredType as AllowedImageType,
      )
    ) {
      throw new BadRequestException(
        'Only JPEG, PNG, WebP and AVIF images are allowed',
      );
    }

    const detectedType =
      this.detectImageType(file);

    if (!detectedType) {
      throw new BadRequestException(
        'The uploaded file is not a valid supported image',
      );
    }

    if (detectedType !== normalizedDeclaredType) {
      throw new BadRequestException(
        'Image content does not match its declared MIME type',
      );
    }

    return detectedType;
  }

  private detectImageType(
    file: Buffer,
  ): AllowedImageType | null {
    // JPEG: FF D8 FF
    if (
      file.length >= 3 &&
      file[0] === 0xff &&
      file[1] === 0xd8 &&
      file[2] === 0xff
    ) {
      return 'image/jpeg';
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    const pngSignature = Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
    ]);

    if (
      file.length >= pngSignature.length &&
      file.subarray(0, 8).equals(pngSignature)
    ) {
      return 'image/png';
    }

    // WebP: RIFF....WEBP
    if (
      file.length >= 12 &&
      file.toString('ascii', 0, 4) === 'RIFF' &&
      file.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return 'image/webp';
    }

    // AVIF is an ISO-BMFF file. The first box should be "ftyp"
    // and its major/compatible brands must include "avif" or "avis".
    if (
      file.length >= 16 &&
      file.toString('ascii', 4, 8) === 'ftyp'
    ) {
      const boxSize = file.readUInt32BE(0);

      if (
        boxSize >= 16 &&
        boxSize <= file.length
      ) {
        const brands: string[] = [];

        brands.push(
          file.toString('ascii', 8, 12),
        );

        for (
          let offset = 16;
          offset + 4 <= boxSize;
          offset += 4
        ) {
          brands.push(
            file.toString(
              'ascii',
              offset,
              offset + 4,
            ),
          );
        }

        if (
          brands.includes('avif') ||
          brands.includes('avis')
        ) {
          return 'image/avif';
        }
      }
    }

    return null;
  }

  private normalizePath(path: string): string {
    const normalized = path
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/{2,}/g, '/');

    if (!normalized) {
      throw new BadRequestException(
        'Storage path is required',
      );
    }

    if (
      normalized.includes('..') ||
      normalized.startsWith('.')
    ) {
      throw new BadRequestException(
        'Invalid storage path',
      );
    }

    return normalized;
  }
}
