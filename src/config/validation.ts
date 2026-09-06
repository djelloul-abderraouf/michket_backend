import { z } from 'zod';

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalString = z.preprocess(
  emptyToUndefined,
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  emptyToUndefined,
  z.string().url().optional(),
);

const booleanFromEnv = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  return value;
}, z.boolean().optional());

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_PREFIX: z.string().min(1).default('api/v1'),
  CORS_ORIGINS: z.string().min(1).default('http://localhost:3001'),
  SWAGGER_ENABLED: booleanFromEnv.default(true),

  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  SUPABASE_JWKS_URL: z.string().url(),
  SUPABASE_STORAGE_BUCKET: optionalString,

  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),

  UPSTASH_REDIS_REST_URL: optionalUrl,
  UPSTASH_REDIS_REST_TOKEN: optionalString,
  REDIS_URL: optionalString,

  DELIVERY_FROM_WILAYA: z.coerce.number().int().min(1).max(58).default(16),
  DELIVERY_RATES_JSON: optionalString,

  // Server-only secret used to derive guest order access tokens.
  // Keep it private and stable across deployments.
  ORDER_ACCESS_SECRET: z.string().min(32),

  YALIDINE_API_ID: optionalString,
  YALIDINE_API_TOKEN: optionalString,

  ORDER_WEBHOOK_URL: optionalUrl,
  SENTRY_DSN: optionalString,
  NEXT_PUBLIC_API_URL: optionalUrl,
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    console.error(
      '❌ Invalid environment variables:',
      result.error.flatten().fieldErrors,
    );

    throw new Error('Invalid environment variables');
  }

  return result.data;
}
