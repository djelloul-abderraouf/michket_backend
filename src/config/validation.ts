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

const urlWithDefault = (defaultValue: string) =>
  z.preprocess(
    emptyToUndefined,
    z.string().url().default(defaultValue),
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

  /**
   * Yalidine still identifies courier destinations with its 1..58 wilaya
   * catalogue. Keep the shipping origin in that same identifier space.
   *
   * Do not replace this with the new administrative 1..69 numbering until
   * Yalidine itself exposes/supports those new courier IDs.
   */
  DELIVERY_FROM_WILAYA: z.coerce
    .number()
    .int()
    .min(1)
    .max(58)
    .default(16),

  /**
   * Legacy/manual rates are kept temporarily for backward compatibility.
   * The Yalidine integration will stop using this as the authoritative
   * checkout price once the carrier service is enabled.
   */
  DELIVERY_RATES_JSON: optionalString,

  // Server-only secret used to derive guest order access tokens.
  // Keep it private and stable across deployments.
  ORDER_ACCESS_SECRET: z.string().min(32),

  /**
   * Yalidine credentials must stay server-side only.
   * They remain optional at environment-validation level so local builds and
   * maintenance commands can still start without carrier access; the delivery
   * service itself will return a controlled 503 when credentials are absent.
   */
  YALIDINE_API_ID: optionalString,
  YALIDINE_API_TOKEN: optionalString,

  /**
   * Keeping the base URL configurable lets us adapt if Yalidine changes the
   * API host/version without touching application code.
   */
  YALIDINE_BASE_URL: urlWithDefault(
    'https://api.yalidine.app/v1',
  ),

  YALIDINE_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(30000)
    .default(10000),

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
