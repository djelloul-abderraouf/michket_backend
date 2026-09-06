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

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

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

    const { error } = await this.supabase.storage
      .from(this.bucket)
      .upload(safePath, file, {
        // Never trust the MIME type sent by the client.
        // Store the type detected from the actual file bytes.
        contentType: detectedContentType,
        upsert: false,
        cacheControl: '31536000',
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

    const { data } = this.supabase.storage
      .from(this.bucket)
      .getPublicUrl(safePath);

    return {
      url: data.publicUrl,
      path: safePath,
    };
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
