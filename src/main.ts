import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger, ValidationPipe } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import IORedis from 'ioredis';

import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const GLOBAL_RATE_LIMIT_MAX = 120;

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const isProduction =
    process.env.NODE_ENV === 'production';

  const apiPrefix =
    process.env.API_PREFIX || 'api/v1';

  const redisUrl = process.env.REDIS_URL;

  const app =
    await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter({
        trustProxy: isProduction,

        // Slightly above the 10 MB image limit so multipart requests
        // are not rejected before @fastify/multipart handles them.
        bodyLimit: 12 * 1024 * 1024,
      }),
      {
        logger: ['error', 'warn', 'log'],
      },
    );

  const corsOrigins = (
    process.env.CORS_ORIGINS ||
    'http://localhost:3000,http://localhost:3001'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!isProduction) {
    for (const origin of [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
    ]) {
      if (!corsOrigins.includes(origin)) {
        corsOrigins.push(origin);
      }
    }
  }

  // CORS must be registered before Helmet so OPTIONS preflight
  // gets Access-Control-Allow-Origin instead of a blocked response.
  await app.register(cors, {
    origin: corsOrigins,
    credentials: true,
    methods: [
      'GET',
      'POST',
      'PUT',
      'DELETE',
      'PATCH',
      'OPTIONS',
      'HEAD',
    ],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'X-Session-Id',
      'X-Order-Access-Token',
    ],
    exposedHeaders: [
      'X-Session-Id',
      'X-Request-Id',
    ],
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: {
      policy: 'cross-origin',
    },
  });

  // Temporarily disable rate-limit Redis to allow server to start
  const rateLimitRedis = undefined;

  // const rateLimitRedis = redisUrl
  //   ? new IORedis(redisUrl, {
  //       maxRetriesPerRequest: 2,
  //       enableReadyCheck: true,
  //       lazyConnect: true,
  //     })
  //   : undefined;

  // if (rateLimitRedis) {
  //   rateLimitRedis.on('error', (error) => {
  //     logger.error(
  //       `Rate-limit Redis error: ${error.message}`,
  //     );
  //   });

  //   await rateLimitRedis.connect();
  //   await rateLimitRedis.ping();

  //   logger.log(
  //     'Rate limiting backend: Redis',
  //   );
  // } else {
  //   logger.warn(
  //     'REDIS_URL is missing: rate limiting uses local memory only',
  //   );
  // }

  await app.register(rateLimit, {
    global: true,

    // Baseline protection for every public API route.
    // Sensitive routes will receive stricter limits separately.
    max: GLOBAL_RATE_LIMIT_MAX,
    timeWindow: '1 minute',

    redis: rateLimitRedis,

    // Do not provide a custom keyGenerator here.
    // @fastify/rate-limit >= 11.2.0 securely normalizes IPv4/IPv6
    // addresses with its built-in key generator.
    ipv6Subnet: 64,

    // Health checks must remain usable by hosting/monitoring systems.
    // OPTIONS preflight must not consume the rate-limit budget.
    // Authenticated CRM staff burst-load several resources per page;
    // keep the public storefront limit, but do not throttle /crm.
    allowList: (request) => {
      const url = request.url || '';
      return (
        request.method === 'OPTIONS' ||
        url.includes('/health') ||
        url.includes('/crm/') ||
        url.includes('/auth/me')
      );
    },
  });

  // Temporarily disabled
  // if (rateLimitRedis) {
  //   app
  //     .getHttpAdapter()
  //     .getInstance()
  //     .addHook('onClose', async () => {
  //       if (rateLimitRedis.status === 'ready') {
  //         await rateLimitRedis.quit();
  //         return;
  //       }

  //       rateLimitRedis.disconnect();
  //     });
  // }

  await app.register(multipart, {
    limits: {
      fileSize: MAX_UPLOAD_SIZE_BYTES,
      files: 1,
      fields: 10,
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(
    new GlobalExceptionFilter(),
  );

  app.useGlobalInterceptors(
    new RequestIdInterceptor(),
  );

  app.setGlobalPrefix(apiPrefix);

  const swaggerEnabled =
    !isProduction ||
    process.env.SWAGGER_ENABLED === 'true';

  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Michket API')
      .setDescription(
        'Backend API for Michket e-commerce store',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document =
      SwaggerModule.createDocument(app, config);

    SwaggerModule.setup(
      'api/docs',
      app,
      document,
    );
  }

  app.enableShutdownHooks();

  const port = Number(
    process.env.PORT || 3000,
  );

  await app.listen(
    port,
    process.env.LISTEN_HOST || '0.0.0.0',
  );

  logger.log(
    `🚀 Server running on port ${port}`,
  );

  if (swaggerEnabled) {
    logger.log(
      '📚 Swagger docs available at /api/docs',
    );
  }
}

void bootstrap();
