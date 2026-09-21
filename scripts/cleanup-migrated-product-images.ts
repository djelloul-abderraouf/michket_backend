import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';

type MigrationReportEntry = {
  oldStoragePath?: unknown;
  newStoragePath?: unknown;
  status?: unknown;
};

type MigrationReport = {
  results?: unknown;
};

type DbReference = {
  table: string;
  column: string;
  path: string;
};

type CleanupCandidate = {
  path: string;
  source: string;
  referencedBy: DbReference[];
};

const REPORT_PREFIX = 'product-images-';
const REPORT_SUFFIX = '.json';

const EXTRA_KNOWN_MIGRATED_PATHS = [
  // This was the first individually migrated image, before the batch
  // migration reports were introduced.
  'products/2026/09/48e61a7d-32ec-4b53-a293-b6e409e4bcf3.png',
] as const;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is missing. Run this script from the backend folder with Node --env-file=.env.`,
    );
  }

  return value;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function isSafeLegacyProductPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').trim();

  if (!normalized.startsWith('products/')) {
    return false;
  }

  if (normalized.toLowerCase().endsWith('.webp')) {
    return false;
  }

  return /\.(png|jpe?g|avif)$/i.test(normalized);
}

function timestampForFile(): string {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, '-');
}

async function loadCandidatesFromReports(
  reportDirectory: string,
): Promise<Map<string, string>> {
  const candidates = new Map<string, string>();

  let files: string[] = [];

  try {
    files = await readdir(reportDirectory);
  } catch (error) {
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error
        ? String((error as { code?: unknown }).code)
        : '';

    if (code === 'ENOENT') {
      throw new Error(
        `Migration report directory does not exist: ${reportDirectory}`,
      );
    }

    throw error;
  }

  const reportFiles = files
    .filter(
      (file) =>
        file.startsWith(REPORT_PREFIX) &&
        file.endsWith(REPORT_SUFFIX),
    )
    .sort();

  if (reportFiles.length === 0) {
    throw new Error(
      `No product image migration reports were found in ${reportDirectory}.`,
    );
  }

  for (const file of reportFiles) {
    const fullPath = join(reportDirectory, file);
    const raw = await readFile(fullPath, 'utf8');

    let parsed: MigrationReport;

    try {
      parsed = JSON.parse(raw) as MigrationReport;
    } catch {
      throw new Error(
        `Invalid JSON migration report: ${fullPath}`,
      );
    }

    if (!Array.isArray(parsed.results)) {
      throw new Error(
        `Migration report has no results array: ${fullPath}`,
      );
    }

    for (const rawEntry of parsed.results) {
      if (
        typeof rawEntry !== 'object' ||
        rawEntry === null
      ) {
        continue;
      }

      const entry = rawEntry as MigrationReportEntry;

      if (entry.status !== 'migrated') {
        continue;
      }

      if (
        typeof entry.oldStoragePath !== 'string' ||
        typeof entry.newStoragePath !== 'string'
      ) {
        throw new Error(
          `A migrated entry in ${fullPath} is missing oldStoragePath/newStoragePath.`,
        );
      }

      const oldPath = entry.oldStoragePath
        .replace(/\\/g, '/')
        .trim();

      const newPath = entry.newStoragePath
        .replace(/\\/g, '/')
        .trim();

      if (!isSafeLegacyProductPath(oldPath)) {
        throw new Error(
          `Safety stop: unexpected old product path "${oldPath}" in ${fullPath}.`,
        );
      }

      if (!newPath.toLowerCase().endsWith('.webp')) {
        throw new Error(
          `Safety stop: expected migrated WebP path but got "${newPath}" in ${fullPath}.`,
        );
      }

      if (oldPath === newPath) {
        throw new Error(
          `Safety stop: old and new storage paths are identical in ${fullPath}.`,
        );
      }

      candidates.set(oldPath, file);
    }
  }

  for (const path of EXTRA_KNOWN_MIGRATED_PATHS) {
    if (!isSafeLegacyProductPath(path)) {
      throw new Error(
        `Safety stop: invalid hard-coded migrated path "${path}".`,
      );
    }

    if (!candidates.has(path)) {
      candidates.set(
        path,
        'first individually validated migration',
      );
    }
  }

  return candidates;
}

async function findDatabaseReferences(
  pool: Pool,
  paths: string[],
): Promise<Map<string, DbReference[]>> {
  const references = new Map<
    string,
    DbReference[]
  >();

  for (const path of paths) {
    references.set(path, []);
  }

  if (paths.length === 0) {
    return references;
  }

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

  for (const column of metadata.rows) {
    const tableName = column.table_name;
    const columnName = column.column_name;

    const sql = `
      SELECT ${quoteIdentifier(columnName)} AS path
      FROM ${quoteIdentifier(tableName)}
      WHERE ${quoteIdentifier(columnName)} = ANY($1::text[])
    `;

    const matches = await pool.query<{
      path: string | null;
    }>(sql, [paths]);

    for (const match of matches.rows) {
      if (!match.path) {
        continue;
      }

      const list = references.get(match.path);

      if (!list) {
        continue;
      }

      list.push({
        table: tableName,
        column: columnName,
        path: match.path,
      });
    }
  }

  return references;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const databaseUrl = requireEnv('DATABASE_URL');
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseSecretKey = requireEnv(
    'SUPABASE_SECRET_KEY',
  );

  const bucket =
    process.env.SUPABASE_STORAGE_BUCKET?.trim() ||
    'product-images';

  const reportDirectory = join(
    process.cwd(),
    'migration-reports',
  );

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
  });

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

  try {
    await pool.query('SELECT 1');

    const candidateSources =
      await loadCandidatesFromReports(
        reportDirectory,
      );

    const paths = Array.from(
      candidateSources.keys(),
    ).sort();

    if (paths.length === 0) {
      console.log(
        'No validated legacy product image paths were found.',
      );
      return;
    }

    const dbReferences =
      await findDatabaseReferences(pool, paths);

    const candidates: CleanupCandidate[] =
      paths.map((path) => ({
        path,
        source:
          candidateSources.get(path) ??
          'unknown',
        referencedBy:
          dbReferences.get(path) ?? [],
      }));

    const safeToDelete = candidates.filter(
      (candidate) =>
        candidate.referencedBy.length === 0,
    );

    const blocked = candidates.filter(
      (candidate) =>
        candidate.referencedBy.length > 0,
    );

    console.log('');
    console.log('Legacy product image cleanup');
    console.log('============================');
    console.log(
      `Mode: ${apply ? 'APPLY' : 'DRY RUN'}`,
    );
    console.log(
      `Validated legacy paths found: ${candidates.length}`,
    );
    console.log(
      `Unreferenced and eligible:     ${safeToDelete.length}`,
    );
    console.log(
      `Still referenced (blocked):    ${blocked.length}`,
    );
    console.log('');

    if (blocked.length > 0) {
      console.log(
        'BLOCKED PATHS - these will NEVER be deleted by this run:',
      );

      for (const candidate of blocked) {
        const where = candidate.referencedBy
          .map(
            (reference) =>
              `${reference.table}.${reference.column}`,
          )
          .join(', ');

        console.log(
          `- ${candidate.path} -> ${where}`,
        );
      }

      console.log('');
    }

    console.log(
      `${apply ? 'Eligible for deletion' : 'Would delete'}:`,
    );

    for (const candidate of safeToDelete) {
      console.log(`- ${candidate.path}`);
    }

    console.log('');

    if (!apply) {
      console.log(
        'DRY RUN ONLY: no Supabase object was deleted.',
      );
      console.log(
        'If the counts are correct, run again with --apply.',
      );
      return;
    }

    const deleted: string[] = [];
    const failed: Array<{
      path: string;
      error: string;
    }> = [];

    for (
      let index = 0;
      index < safeToDelete.length;
      index += 1
    ) {
      const candidate = safeToDelete[index];
      const position = `${index + 1}/${safeToDelete.length}`;

      // Re-check immediately before deletion so that a path that became
      // referenced after the initial scan is protected.
      const freshReferences =
        await findDatabaseReferences(
          pool,
          [candidate.path],
        );

      const fresh =
        freshReferences.get(candidate.path) ??
        [];

      if (fresh.length > 0) {
        const where = fresh
          .map(
            (reference) =>
              `${reference.table}.${reference.column}`,
          )
          .join(', ');

        failed.push({
          path: candidate.path,
          error: `Deletion blocked because the path became referenced by ${where}.`,
        });

        console.error(
          `[${position}] SKIPPED ${candidate.path}: now referenced by ${where}`,
        );

        continue;
      }

      const removal = await supabase.storage
        .from(bucket)
        .remove([candidate.path]);

      if (removal.error) {
        failed.push({
          path: candidate.path,
          error: removal.error.message,
        });

        console.error(
          `[${position}] FAILED ${candidate.path}: ${removal.error.message}`,
        );

        continue;
      }

      deleted.push(candidate.path);

      console.log(
        `[${position}] DELETED ${candidate.path}`,
      );
    }

    const cleanupReportDirectory = join(
      process.cwd(),
      'migration-reports',
    );

    await mkdir(cleanupReportDirectory, {
      recursive: true,
    });

    const cleanupReportPath = join(
      cleanupReportDirectory,
      `product-images-cleanup-${timestampForFile()}.json`,
    );

    await writeFile(
      cleanupReportPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          mode: 'apply',
          validatedLegacyPaths:
            candidates.length,
          initiallyEligible:
            safeToDelete.length,
          initiallyBlocked: blocked.map(
            (candidate) => ({
              path: candidate.path,
              referencedBy:
                candidate.referencedBy,
            }),
          ),
          deleted,
          failed,
        },
        null,
        2,
      ),
      'utf8',
    );

    console.log('');
    console.log('Cleanup complete');
    console.log('================');
    console.log(`Deleted: ${deleted.length}`);
    console.log(`Failed/skipped: ${failed.length}`);
    console.log(
      `Report: ${cleanupReportPath}`,
    );

    if (failed.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

void main();
