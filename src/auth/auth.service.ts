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

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

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
  }): Promise<{
    id: string;
    email: string;
    role: 'customer' | 'admin' | 'super_admin';
    firstName?: string;
    lastName?: string;
  }> {
    let [user] = await this.db
      .select()
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
        .returning();
    } else if (user.email !== supabaseUser.email) {
      [user] = await this.db
        .update(users)
        .set({
          email: supabaseUser.email,
          updatedAt: new Date(),
        })
        .where(eq(users.id, supabaseUser.id))
        .returning();
    }

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account is disabled');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
    };
  }
}
