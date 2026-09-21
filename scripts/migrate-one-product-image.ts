import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { asc, eq, isNotNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import sharpModule = require('sharp');

import { productImages } from '../src/database/schema/products';

type SharpFactory = (
  input: Buffer,
  options?: {
    failOn?: 'none' | 'truncated' | 'error' | 'warning';
  },
) => any;

const sharp = sharpModule as unknown as SharpFactory;

const PRODUCT_MAX_DIMENSION = 1600;
const PRODUCT_WEBP_QUALITY = 82;
const PRODUCT_WEBP_EFFORT = 4;
const STORAGE_CACHE_CONTROL_SECONDS = '31536000';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is missing. Run this script from the backend folder with Node --env-file=.env.`,
    );
  }

  return value;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;

  return `${(kb / 1024).toFixed(2)} MB`;
}

function getMonthPath(): string {
  const now = new Date();

  return [
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
  ].join('/');
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const databaseUrl = requireEnv('DATABASE_URL');
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseSecretKey = requireEnv('SUPABASE_SECRET_KEY');

  const bucket =
    process.env.SUPABASE_STORAGE_BUCKET?.trim() ||
    'product-images';

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
  });

  const db = drizzle(pool);

  const supabase = createClient(
    supabaseUrl,
    supabaseSecretKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  let newStoragePath: string | null = null;
  let migratedImageId: string | null = null;
  let originalUrl: string | null = null;
  let originalStoragePath: string | null = null;
  let databaseWasUpdated = false;

  try {
    await pool.query('SELECT 1');

    const [candidate] = await db
      .select({
        id: productImages.id,
        productId: productImages.productId,
        url: productImages.url,
        storagePath: productImages.storagePath,
        altText: productImages.altText,
        sortOrder: productImages.sortOrder,
        isPrimary: productImages.isPrimary,
        variantId: productImages.variantId,
        createdAt: productImages.createdAt,
      })
      .from(productImages)
      .where(
        sql`${isNotNull(productImages.storagePath)}
          AND lower(${productImages.storagePath}) NOT LIKE '%.webp'`,
      )
      .orderBy(asc(productImages.createdAt))
      .limit(1);

    if (!candidate || !candidate.storagePath) {
      console.log(
        'No legacy non-WebP product image with a storage path was found.',
      );
      return;
    }

    if (!candidate.storagePath.startsWith('products/')) {
      throw new Error(
        `Safety stop: unexpected storage path "${candidate.storagePath}".`,
      );
    }

    console.log('');
    console.log('Candidate selected');
    console.log('------------------');
    console.log(`Image ID:      ${candidate.id}`);
    console.log(`Product ID:    ${candidate.productId}`);
    console.log(`Storage path:  ${candidate.storagePath}`);
    console.log(`Current URL:   ${candidate.url}`);
    console.log(`Primary:       ${candidate.isPrimary ? 'yes' : 'no'}`);
    console.log(`Variant ID:    ${candidate.variantId ?? 'none'}`);
    console.log('');

    if (!apply) {
      console.log(
        'DRY RUN ONLY: nothing was changed.',
      );
      console.log(
        'Run again with --apply to migrate exactly this one legacy image.',
      );
      return;
    }

    const downloadResult = await supabase.storage
      .from(bucket)
      .download(candidate.storagePath);

    if (downloadResult.error || !downloadResult.data) {
      throw new Error(
        `Unable to download source image: ${
          downloadResult.error?.message ?? 'unknown error'
        }`,
      );
    }

    const sourceBuffer = Buffer.from(
      await downloadResult.data.arrayBuffer(),
    );

    const metadata = await sharp(sourceBuffer, {
      failOn: 'error',
    }).metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error(
        'Unable to determine source image dimensions.',
      );
    }

    const optimizedBuffer = await sharp(sourceBuffer, {
      failOn: 'error',
    })
      .rotate()
      .resize({
        width: PRODUCT_MAX_DIMENSION,
        height: PRODUCT_MAX_DIMENSION,
        withoutEnlargement: true,
        fit: 'inside',
      })
      .webp({
        quality: PRODUCT_WEBP_QUALITY,
        effort: PRODUCT_WEBP_EFFORT,
        smartSubsample: true,
      })
      .toBuffer();

    const optimizedMetadata = await sharp(
      optimizedBuffer,
      { failOn: 'error' },
    ).metadata();

    if (
      !optimizedMetadata.width ||
      !optimizedMetadata.height
    ) {
      throw new Error(
        'Unable to verify optimized image dimensions.',
      );
    }

    newStoragePath = [
      'products',
      getMonthPath(),
      `${randomUUID()}.webp`,
    ].join('/');

    const uploadResult = await supabase.storage
      .from(bucket)
      .upload(newStoragePath, optimizedBuffer, {
        contentType: 'image/webp',
        upsert: false,
        cacheControl: STORAGE_CACHE_CONTROL_SECONDS,
      });

    if (uploadResult.error) {
      throw new Error(
        `Unable to upload optimized image: ${uploadResult.error.message}`,
      );
    }

    const verificationDownload = await supabase.storage
      .from(bucket)
      .download(newStoragePath);

    if (
      verificationDownload.error ||
      !verificationDownload.data
    ) {
      throw new Error(
        `Optimized upload could not be verified: ${
          verificationDownload.error?.message ??
          'unknown error'
        }`,
      );
    }

    const verifiedBuffer = Buffer.from(
      await verificationDownload.data.arrayBuffer(),
    );

    if (verifiedBuffer.length !== optimizedBuffer.length) {
      throw new Error(
        `Uploaded size mismatch: expected ${optimizedBuffer.length}, got ${verifiedBuffer.length}.`,
      );
    }

    const publicUrlResult = supabase.storage
      .from(bucket)
      .getPublicUrl(newStoragePath);

    const newUrl = publicUrlResult.data.publicUrl;

    if (!newUrl) {
      throw new Error(
        'Unable to generate public URL for optimized image.',
      );
    }

    migratedImageId = candidate.id;
    originalUrl = candidate.url;
    originalStoragePath = candidate.storagePath;

    await db
      .update(productImages)
      .set({
        url: newUrl,
        storagePath: newStoragePath,
      })
      .where(eq(productImages.id, candidate.id));

    databaseWasUpdated = true;

    const [verifiedRow] = await db
      .select({
        url: productImages.url,
        storagePath: productImages.storagePath,
      })
      .from(productImages)
      .where(eq(productImages.id, candidate.id))
      .limit(1);

    if (
      !verifiedRow ||
      verifiedRow.url !== newUrl ||
      verifiedRow.storagePath !== newStoragePath
    ) {
      throw new Error(
        'Database verification failed after the update.',
      );
    }

    const reductionPercent =
      sourceBuffer.length > 0
        ? (
            (1 -
              optimizedBuffer.length /
                sourceBuffer.length) *
            100
          ).toFixed(1)
        : '0.0';

    console.log('');
    console.log('Migration successful');
    console.log('--------------------');
    console.log(
      `Original:  ${formatBytes(sourceBuffer.length)} (${metadata.width}x${metadata.height})`,
    );
    console.log(
      `Optimized: ${formatBytes(optimizedBuffer.length)} (${optimizedMetadata.width}x${optimizedMetadata.height})`,
    );
    console.log(`Reduction: ${reductionPercent}%`);
    console.log(`Old path kept: ${candidate.storagePath}`);
    console.log(`New path:      ${newStoragePath}`);
    console.log(`New URL:       ${newUrl}`);
    console.log('');
    console.log(
      'IMPORTANT: the old Supabase object was NOT deleted.',
    );
    console.log(
      'Open the product on the storefront and verify the image before any cleanup.',
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error('');
    console.error(`Migration failed: ${message}`);

    if (
      databaseWasUpdated &&
      migratedImageId &&
      originalUrl &&
      originalStoragePath
    ) {
      try {
        await db
          .update(productImages)
          .set({
            url: originalUrl,
            storagePath: originalStoragePath,
          })
          .where(eq(productImages.id, migratedImageId));

        console.error(
          'Database row was rolled back to the original image.',
        );
      } catch (rollbackError) {
        console.error(
          `WARNING: database rollback failed: ${
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError)
          }`,
        );
      }
    }

    if (newStoragePath) {
      try {
        const removal = await supabase.storage
          .from(bucket)
          .remove([newStoragePath]);

        if (removal.error) {
          console.error(
            `WARNING: unable to remove new orphaned object "${newStoragePath}": ${removal.error.message}`,
          );
        } else {
          console.error(
            `New object "${newStoragePath}" was removed.`,
          );
        }
      } catch (cleanupError) {
        console.error(
          `WARNING: cleanup failed for "${newStoragePath}": ${
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError)
          }`,
        );
      }
    }

    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
