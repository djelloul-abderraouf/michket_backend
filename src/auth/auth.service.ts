import {
  Injectable,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../database/schema';
import { users } from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import {
  toCrmRequestUser,
  type AuthUserRecord,
} from './crm-role-map';

const USER_CACHE_TTL_MS = 60_000;

@Injectable()
export class AuthService {
  private readonly userCache = new Map<
    string,
    { value: AuthUserRecord; expiresAt: number }
  >();
  private readonly inflight = new Map<string, Promise<AuthUserRecord>>();

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  invalidateUserCache(userId?: string) {
    if (userId) {
      this.userCache.delete(userId);
      this.inflight.delete(userId);
      return;
    }
    this.userCache.clear();
    this.inflight.clear();
  }

  /**
   * Validate the authenticated Supabase identity against the Michket database.
   *
   * - The Michket business role always comes from our database.
   * - New local profiles are always created as "customer".
   * - Disabled users are rejected.
   */
  async validateUser(supabaseUser: {
    id: string;
    email: string;
  }): Promise<AuthUserRecord> {
    const cached = this.userCache.get(supabaseUser.id);
    if (cached && cached.expiresAt > Date.now()) {
      if (!cached.value.isActive) {
        throw new UnauthorizedException('User account is disabled');
      }
      return cached.value;
    }

    const pending = this.inflight.get(supabaseUser.id);
    if (pending) {
      const user = await pending;
      if (!user.isActive) {
        throw new UnauthorizedException('User account is disabled');
      }
      return user;
    }

    const loadPromise = this.loadOrCreateUser(supabaseUser);
    this.inflight.set(supabaseUser.id, loadPromise);

    try {
      const user = await loadPromise;
      if (!user.isActive) {
        throw new UnauthorizedException('User account is disabled');
      }
      return user;
    } finally {
      this.inflight.delete(supabaseUser.id);
    }
  }

  toCrmUser(user: AuthUserRecord) {
    return toCrmRequestUser(user);
  }

  /**
   * Validate CRM user for CRM-specific operations.
   * Uses the existing users table with role-based access control.
   */
  async validateCrmUser(supabaseUser: {
    id: string;
    email: string;
  }) {
    const user = await this.validateUser(supabaseUser);
    return this.toCrmUser(user);
  }

  private remember(user: AuthUserRecord) {
    this.userCache.set(user.id, {
      value: user,
      expiresAt: Date.now() + USER_CACHE_TTL_MS,
    });
    return user;
  }

  private async loadOrCreateUser(supabaseUser: {
    id: string;
    email: string;
  }): Promise<AuthUserRecord> {
    let [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        firstName: users.firstName,
        lastName: users.lastName,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, supabaseUser.id))
      .limit(1);

    if (!user) {
      [user] = await this.db
        .insert(users)
        .values({
          id: supabaseUser.id,
          email: supabaseUser.email,
          role: 'customer',
          isActive: true,
        })
        .returning({
          id: users.id,
          email: users.email,
          role: users.role,
          firstName: users.firstName,
          lastName: users.lastName,
          isActive: users.isActive,
        });
    } else if (user.email !== supabaseUser.email) {
      [user] = await this.db
        .update(users)
        .set({
          email: supabaseUser.email,
          updatedAt: new Date(),
        })
        .where(eq(users.id, supabaseUser.id))
        .returning({
          id: users.id,
          email: users.email,
          role: users.role,
          firstName: users.firstName,
          lastName: users.lastName,
          isActive: users.isActive,
        });
    }

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.remember({
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      isActive: user.isActive,
    });
  }
}
