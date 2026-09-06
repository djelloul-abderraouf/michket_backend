export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: process.env.API_PREFIX || 'api/v1',

  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    jwtSecret: process.env.SUPABASE_JWT_SECRET,
  },

  database: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    url: process.env.REDIS_URL,
    upstashUrl: process.env.UPSTASH_REDIS_REST_URL,
    upstashToken: process.env.UPSTASH_REDIS_REST_TOKEN,
  },

  delivery: {
    fromWilaya: parseInt(process.env.DELIVERY_FROM_WILAYA || '16', 10),
    yalidineId: process.env.YALIDINE_API_ID,
    yalidineToken: process.env.YALIDINE_API_TOKEN,
  },

  webhooks: {
    orderUrl: process.env.ORDER_WEBHOOK_URL,
  },

  sentry: {
    dsn: process.env.SENTRY_DSN,
  },
});
