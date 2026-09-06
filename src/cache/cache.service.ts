import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis as UpstashRedis } from '@upstash/redis';
import IORedis from 'ioredis';

type MemoryEntry = {
  value: string;
  expiresAt: number;
};

type CacheBackend = 'upstash' | 'redis' | 'memory';

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);

  private readonly memoryCache = new Map<string, MemoryEntry>();

  private readonly backend: CacheBackend;
  private readonly upstash?: UpstashRedis;
  private readonly redis?: IORedis;

  constructor(private readonly configService: ConfigService) {
    const upstashUrl = this.configService.get<string>(
      'UPSTASH_REDIS_REST_URL',
    );
    const upstashToken = this.configService.get<string>(
      'UPSTASH_REDIS_REST_TOKEN',
    );
    const redisUrl = this.configService.get<string>('REDIS_URL');

    if (upstashUrl && upstashToken) {
      this.upstash = new UpstashRedis({
        url: upstashUrl,
        token: upstashToken,
      });
      this.backend = 'upstash';
      this.logger.log('Cache backend: Upstash Redis');
      return;
    }

    if (redisUrl) {
      this.redis = new IORedis(redisUrl, {
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
        lazyConnect: true,
      });

      this.redis.on('error', (error) => {
        this.logger.error('Redis error', error);
      });

      this.backend = 'redis';
      this.logger.log('Cache backend: Redis');
      return;
    }

    this.backend = 'memory';

    if (
      this.configService.get<string>('NODE_ENV', 'development') ===
      'production'
    ) {
      this.logger.warn(
        'No Redis configured: using in-memory cache in production. Configure Upstash/Redis before scaling to multiple backend instances.',
      );
    } else {
      this.logger.log('Cache backend: in-memory (development fallback)');
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.getRaw(key);

    if (raw === null) {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      this.logger.warn(`Invalid cached JSON for key "${key}"`);
      await this.del(key);
      return null;
    }
  }

  async set<T>(
    key: string,
    value: T,
    ttlSeconds = 300,
  ): Promise<void> {
    const serialized = JSON.stringify(value);

    if (this.backend === 'upstash' && this.upstash) {
      await this.upstash.set(key, serialized, { ex: ttlSeconds });
      return;
    }

    if (this.backend === 'redis' && this.redis) {
      await this.ensureRedisConnected();
      await this.redis.set(key, serialized, 'EX', ttlSeconds);
      return;
    }

    this.memoryCache.set(key, {
      value: serialized,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async del(key: string): Promise<void> {
    if (this.backend === 'upstash' && this.upstash) {
      await this.upstash.del(key);
      return;
    }

    if (this.backend === 'redis' && this.redis) {
      await this.ensureRedisConnected();
      await this.redis.del(key);
      return;
    }

    this.memoryCache.delete(key);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    if (this.backend === 'upstash' && this.upstash) {
      let cursor = 0;

      do {
        const [nextCursor, keys] = await this.upstash.scan(cursor, {
          match: pattern,
          count: 100,
        });

        if (keys.length > 0) {
          await this.upstash.del(...keys);
        }

        cursor = Number(nextCursor);
      } while (cursor !== 0);

      return;
    }

    if (this.backend === 'redis' && this.redis) {
      await this.ensureRedisConnected();

      let cursor = '0';

      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );

        if (keys.length > 0) {
          await this.redis.del(...keys);
        }

        cursor = nextCursor;
      } while (cursor !== '0');

      return;
    }

    const regex = this.globToRegex(pattern);

    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        this.memoryCache.delete(key);
      }
    }
  }

  async getOrSet<T>(
    key: string,
    compute: () => Promise<T>,
    ttlSeconds = 300,
  ): Promise<T> {
    const cached = await this.get<T>(key);

    if (cached !== null) {
      return cached;
    }

    const value = await compute();
    await this.set(key, value, ttlSeconds);

    return value;
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.redis) {
      return;
    }

    if (this.redis.status === 'ready') {
      await this.redis.quit();
      return;
    }

    this.redis.disconnect();
  }

  private async getRaw(key: string): Promise<string | null> {
    if (this.backend === 'upstash' && this.upstash) {
      const value = await this.upstash.get<string>(key);
      return value ?? null;
    }

    if (this.backend === 'redis' && this.redis) {
      await this.ensureRedisConnected();
      return this.redis.get(key);
    }

    const entry = this.memoryCache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() >= entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }

    return entry.value;
  }

  private async ensureRedisConnected(): Promise<void> {
    if (!this.redis) {
      return;
    }

    if (
      this.redis.status === 'wait' ||
      this.redis.status === 'end'
    ) {
      await this.redis.connect();
    }
  }

  private globToRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regexPattern = escaped
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    return new RegExp(`^${regexPattern}$`);
  }
}
