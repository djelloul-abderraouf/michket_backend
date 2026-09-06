import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';

/**
 * In-memory rate limiter for development.
 * Production: use @fastify/rate-limit or Upstash Rate Limit.
 */
const requestCounts = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMITS = {
  public: { max: 100, windowMs: 60_000 },
  auth: { max: 300, windowMs: 60_000 },
  admin: { max: 500, windowMs: 60_000 },
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const ip =
      (request.headers['x-forwarded-for'] as string) ||
      request.ip ||
      'unknown';
    const now = Date.now();
    const key = ip;

    const entry = requestCounts.get(key);
    if (!entry || now > entry.resetAt) {
      requestCounts.set(key, {
        count: 1,
        resetAt: now + RATE_LIMITS.public.windowMs,
      });
      return true;
    }

    entry.count++;
    if (entry.count > RATE_LIMITS.public.max) {
      throw new HttpException(
        'Too many requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
