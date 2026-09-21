import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';

const TARGET_PATH =
  'products/2026/09/42779a9d-ee65-4fd9-85f2-42b1cb1c8835.png';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is missing.`);
  }

  return value;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const pool = new Pool({
    connectionString: requireEnv('DATABASE_URL'),
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
  });

  const supabase = createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SECRET_KEY'),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const bucket =
    process.env.SUPABASE_STORAGE_BUCKET?.trim() ||
    'product-images';

  try {
    await pool.query('SELECT 1');

    const metadata = await pool.query<{
      table_name: string;
      column_name: string;
    }>(
      `
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND column_name IN (
            'storage_path',
            'image_storage_path',
            'mobile_storage_path'
          )
        ORDER BY table_name, column_name
      `,
    );

    const references: string[] = [];

    for (const column of metadata.rows) {
      const result = await pool.query(
        `
          SELECT 1
          FROM ${quoteIdentifier(column.table_name)}
          WHERE ${quoteIdentifier(column.column_name)} = $1
          LIMIT 1
        `,
        [TARGET_PATH],
      );

      if (result.rowCount && result.rowCount > 0) {
        references.push(
          `${column.table_name}.${column.column_name}`,
        );
      }
    }

    console.log('');
    console.log(`Target: ${TARGET_PATH}`);
    console.log(
      `Database references: ${references.length}`,
    );

    if (references.length > 0) {
      console.log(
        `BLOCKED: ${references.join(', ')}`,
      );
      process.exitCode = 1;
      return;
    }

    const filename = TARGET_PATH.split('/').pop()!;
    const folder = TARGET_PATH.split('/')
      .slice(0, -1)
      .join('/');

    const before = await supabase.storage
      .from(bucket)
      .list(folder, {
        search: filename,
        limit: 100,
      });

    if (before.error) {
      throw new Error(
        `Unable to check Supabase Storage: ${before.error.message}`,
      );
    }

    const existsBefore = before.data.some(
      (item) => item.name === filename,
    );

    console.log(
      `Exists in Supabase before retry: ${existsBefore ? 'yes' : 'no'}`,
    );

    if (!existsBefore) {
      console.log(
        'Nothing to delete: the object is already absent.',
      );
      return;
    }

    if (!apply) {
      console.log(
        'DRY RUN ONLY: nothing was deleted.',
      );
      console.log(
        'Run again with --apply to retry this single object.',
      );
      return;
    }

    const removal = await supabase.storage
      .from(bucket)
      .remove([TARGET_PATH]);

    if (removal.error) {
      throw new Error(
        `Delete failed: ${removal.error.message}`,
      );
    }

    const after = await supabase.storage
      .from(bucket)
      .list(folder, {
        search: filename,
        limit: 100,
      });

    if (after.error) {
      throw new Error(
        `Delete was sent but verification failed: ${after.error.message}`,
      );
    }

    const existsAfter = after.data.some(
      (item) => item.name === filename,
    );

    if (existsAfter) {
      throw new Error(
        'Delete request returned successfully, but the object is still present.',
      );
    }

    console.log('DELETED AND VERIFIED.');
  } finally {
    await pool.end();
  }
}

void main();
