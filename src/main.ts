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
        bodyLimit: 12 * 1024 * 1024,
      }),
      {
        logger: ['error', 'warn', 'log'],
      },
    );

  await app.register(helmet);

  let rateLimitRedis: IORedis | undefined;

  if (redisUrl) {
    const redisCandidate = new IORedis(
      redisUrl,
      {
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        lazyConnect: true,
        connectTimeout: 10000,
        retryStrategy: (times) =>
          Math.min(times * 1000, 10000),
      },
    );

    redisCandidate.on('error', (error) => {
      logger.error(
        `Rate-limit Redis error: ${error.message}`,
      );
    });

    redisCandidate.on('reconnecting', (delay: number) => {
      logger.warn(
        `Rate-limit Redis reconnecting in ${delay} ms`,
      );
    });

    redisCandidate.on('ready', () => {
      logger.log(
        'Rate-limit Redis connection ready',
      );
    });

    try {
      await redisCandidate.connect();
      await redisCandidate.ping();

      rateLimitRedis = redisCandidate;

      logger.log(
        'Rate limiting backend: Redis',
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown Redis error';

      logger.warn(
        `Rate-limit Redis unavailable during startup: ${message}. Falling back to local memory for this process.`,
      );

      redisCandidate.disconnect();
    }
  } else {
    logger.warn(
      'REDIS_URL is missing: rate limiting uses local memory only',
    );
  }

  await app.register(rateLimit, {
    global: true,
    max: GLOBAL_RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    redis: rateLimitRedis,

    // If Redis becomes unavailable after startup, do not fail API requests.
    skipOnError: true,

    ipv6Subnet: 64,

    allowList: (request) =>
      request.url.startsWith(
        `/${apiPrefix}/health`,
      ),
  });

  if (rateLimitRedis) {
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onClose', async () => {
        if (
          rateLimitRedis?.status === 'ready'
        ) {
          await rateLimitRedis.quit();
          return;
        }

        rateLimitRedis?.disconnect();
      });
  }

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

  const corsOrigins = (
    process.env.CORS_ORIGINS ||
    'http://localhost:3001'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: [
      'GET',
      'POST',
      'PUT',
      'DELETE',
      'PATCH',
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
    '0.0.0.0',
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
