import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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

type Candidate = {
  id: string;
  productId: string;
  url: string;
  storagePath: string | null;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
  variantId: string | null;
  createdAt: Date;
};

type MigrationResult = {
  imageId: string;
  productId: string;
  oldUrl: string;
  oldStoragePath: string;
  newUrl?: string;
  newStoragePath?: string;
  originalBytes?: number;
  optimizedBytes?: number;
  originalDimensions?: string;
  optimizedDimensions?: string;
  reductionPercent?: number;
  status: 'migrated' | 'failed';
  error?: string;
};

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

function readLimit(): number {
  const arg = process.argv.find((value) =>
    value.startsWith('--limit='),
  );

  if (!arg) return 10;

  const raw = Number(arg.slice('--limit='.length));

  if (!Number.isInteger(raw) || raw < 1 || raw > 10000) {
    throw new Error(
      '--limit must be an integer between 1 and 10000.',
    );
  }

  return raw;
}

function timestampForFile(): string {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, '-');
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const migrateAll = process.argv.includes('--all');
  const limit = migrateAll ? 10000 : readLimit();

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

  const results: MigrationResult[] = [];

  try {
    await pool.query('SELECT 1');

    const candidates = (await db
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
          AND ${productImages.storagePath} LIKE 'products/%'
          AND lower(${productImages.storagePath}) NOT LIKE '%.webp'`,
      )
      .orderBy(asc(productImages.createdAt))
      .limit(limit)) as Candidate[];

    console.log('');
    console.log('Legacy product image migration');
    console.log('==============================');
    console.log(
      `Mode: ${apply ? 'APPLY' : 'DRY RUN'}`,
    );
    console.log(
      `Requested: ${migrateAll ? 'all remaining images' : `up to ${limit} image(s)`}`,
    );
    console.log(
      `Candidates found: ${candidates.length}`,
    );
    console.log('');

    if (candidates.length === 0) {
      console.log(
        'No legacy non-WebP product image with a storage path was found.',
      );
      return;
    }

    if (!apply) {
      for (const candidate of candidates) {
        console.log(
          `- ${candidate.id} | product=${candidate.productId} | primary=${candidate.isPrimary ? 'yes' : 'no'} | variant=${candidate.variantId ?? 'none'} | ${candidate.storagePath}`,
        );
      }

      console.log('');
      console.log(
        'DRY RUN ONLY: nothing was changed.',
      );
      console.log(
        'Recommended first batch:',
      );
      console.log(
        'node --env-file=.env --import tsx scripts/migrate-product-images-batch.ts --apply --limit=10',
      );
      return;
    }

    for (
      let index = 0;
      index < candidates.length;
      index += 1
    ) {
      const candidate = candidates[index];

      if (!candidate.storagePath) {
        continue;
      }

      const position = `${index + 1}/${candidates.length}`;

      console.log(
        `[${position}] Migrating ${candidate.storagePath}`,
      );

      let newStoragePath: string | null = null;
      let databaseWasUpdated = false;

      try {
        const downloadResult = await supabase.storage
          .from(bucket)
          .download(candidate.storagePath);

        if (
          downloadResult.error ||
          !downloadResult.data
        ) {
          throw new Error(
            `Unable to download source image: ${
              downloadResult.error?.message ??
              'unknown error'
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

        const optimizedBuffer = await sharp(
          sourceBuffer,
          {
            failOn: 'error',
          },
        )
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
          {
            failOn: 'error',
          },
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
          .upload(
            newStoragePath,
            optimizedBuffer,
            {
              contentType: 'image/webp',
              upsert: false,
              cacheControl:
                STORAGE_CACHE_CONTROL_SECONDS,
            },
          );

        if (uploadResult.error) {
          throw new Error(
            `Unable to upload optimized image: ${uploadResult.error.message}`,
          );
        }

        const verificationDownload =
          await supabase.storage
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

        if (
          verifiedBuffer.length !==
          optimizedBuffer.length
        ) {
          throw new Error(
            `Uploaded size mismatch: expected ${optimizedBuffer.length}, got ${verifiedBuffer.length}.`,
          );
        }

        const publicUrlResult = supabase.storage
          .from(bucket)
          .getPublicUrl(newStoragePath);

        const newUrl =
          publicUrlResult.data.publicUrl;

        if (!newUrl) {
          throw new Error(
            'Unable to generate public URL for optimized image.',
          );
        }

        await db
          .update(productImages)
          .set({
            url: newUrl,
            storagePath: newStoragePath,
          })
          .where(
            eq(productImages.id, candidate.id),
          );

        databaseWasUpdated = true;

        const [verifiedRow] = await db
          .select({
            url: productImages.url,
            storagePath:
              productImages.storagePath,
          })
          .from(productImages)
          .where(
            eq(productImages.id, candidate.id),
          )
          .limit(1);

        if (
          !verifiedRow ||
          verifiedRow.url !== newUrl ||
          verifiedRow.storagePath !==
            newStoragePath
        ) {
          throw new Error(
            'Database verification failed after the update.',
          );
        }

        const reductionPercent =
          sourceBuffer.length > 0
            ? (1 -
                optimizedBuffer.length /
                  sourceBuffer.length) *
              100
            : 0;

        results.push({
          imageId: candidate.id,
          productId: candidate.productId,
          oldUrl: candidate.url,
          oldStoragePath:
            candidate.storagePath,
          newUrl,
          newStoragePath,
          originalBytes: sourceBuffer.length,
          optimizedBytes:
            optimizedBuffer.length,
          originalDimensions: `${metadata.width}x${metadata.height}`,
          optimizedDimensions: `${optimizedMetadata.width}x${optimizedMetadata.height}`,
          reductionPercent: Number(
            reductionPercent.toFixed(1),
          ),
          status: 'migrated',
        });

        console.log(
          `[${position}] OK ${formatBytes(sourceBuffer.length)} -> ${formatBytes(optimizedBuffer.length)} (-${reductionPercent.toFixed(1)}%)`,
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        console.error(
          `[${position}] FAILED: ${message}`,
        );

        if (databaseWasUpdated) {
          try {
            await db
              .update(productImages)
              .set({
                url: candidate.url,
                storagePath:
                  candidate.storagePath,
              })
              .where(
                eq(
                  productImages.id,
                  candidate.id,
                ),
              );

            console.error(
              `[${position}] Database row rolled back.`,
            );
          } catch (rollbackError) {
            console.error(
              `[${position}] WARNING: database rollback failed: ${
                rollbackError instanceof Error
                  ? rollbackError.message
                  : String(rollbackError)
              }`,
            );
          }
        }

        if (newStoragePath) {
          try {
            const removal =
              await supabase.storage
                .from(bucket)
                .remove([newStoragePath]);

            if (removal.error) {
              console.error(
                `[${position}] WARNING: unable to remove orphaned WebP "${newStoragePath}": ${removal.error.message}`,
              );
            } else {
              console.error(
                `[${position}] New orphaned WebP removed.`,
              );
            }
          } catch (cleanupError) {
            console.error(
              `[${position}] WARNING: cleanup failed: ${
                cleanupError instanceof Error
                  ? cleanupError.message
                  : String(cleanupError)
              }`,
            );
          }
        }

        results.push({
          imageId: candidate.id,
          productId: candidate.productId,
          oldUrl: candidate.url,
          oldStoragePath:
            candidate.storagePath,
          newStoragePath:
            newStoragePath ?? undefined,
          status: 'failed',
          error: message,
        });
      }
    }

    const successful = results.filter(
      (result) => result.status === 'migrated',
    );
    const failed = results.filter(
      (result) => result.status === 'failed',
    );

    const originalTotal =
      successful.reduce(
        (sum, result) =>
          sum + (result.originalBytes ?? 0),
        0,
      );

    const optimizedTotal =
      successful.reduce(
        (sum, result) =>
          sum + (result.optimizedBytes ?? 0),
        0,
      );

    const reportDir = join(
      process.cwd(),
      'migration-reports',
    );

    await mkdir(reportDir, { recursive: true });

    const reportPath = join(
      reportDir,
      `product-images-${timestampForFile()}.json`,
    );

    await writeFile(
      reportPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          mode: 'apply',
          requestedLimit: migrateAll
            ? 'all'
            : limit,
          candidatesProcessed:
            candidates.length,
          successful:
            successful.length,
          failed: failed.length,
          originalTotalBytes:
            originalTotal,
          optimizedTotalBytes:
            optimizedTotal,
          results,
        },
        null,
        2,
      ),
      'utf8',
    );

    console.log('');
    console.log('Batch complete');
    console.log('==============');
    console.log(
      `Successful: ${successful.length}`,
    );
    console.log(`Failed:     ${failed.length}`);

    if (successful.length > 0) {
      const totalReduction =
        originalTotal > 0
          ? (1 -
              optimizedTotal / originalTotal) *
            100
          : 0;

      console.log(
        `Total:      ${formatBytes(originalTotal)} -> ${formatBytes(optimizedTotal)} (-${totalReduction.toFixed(1)}%)`,
      );
    }

    console.log(`Report:     ${reportPath}`);
    console.log('');
    console.log(
      'IMPORTANT: old Supabase objects were NOT deleted.',
    );
    console.log(
      'Verify the storefront before running any cleanup script.',
    );

    if (failed.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

void main();
