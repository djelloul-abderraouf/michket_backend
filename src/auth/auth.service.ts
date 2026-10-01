import {
  Injectable,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
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
    role: string;
    firstName?: string;
    lastName?: string;
  }> {
    const readProfile = async () => {
      const found = await this.db.execute(sql`
        select
          id::text as id,
          email,
          role::text as role,
          is_active,
          first_name,
          last_name
        from users
        where id = ${supabaseUser.id}::uuid
        limit 1
      `);

      const rows = (
        Array.isArray(found) ? found : found.rows
      ) as Array<{
        id: string;
        email: string;
        role: string;
        is_active: boolean;
        first_name: string | null;
        last_name: string | null;
      }>;

      return rows[0];
    };

    let user = await readProfile();

    if (!user) {
      await this.db.insert(users).values({
        id: supabaseUser.id,
        email: supabaseUser.email,
        role: 'customer',
        isActive: true,
      });
      user = await readProfile();
    } else if (user.email !== supabaseUser.email) {
      await this.db
        .update(users)
        .set({
          email: supabaseUser.email,
          updatedAt: new Date(),
        })
        .where(eq(users.id, supabaseUser.id));

      user = { ...user, email: supabaseUser.email };
    }

    if (!user || !user.is_active) {
      throw new UnauthorizedException('User account is disabled');
    }

    return {
      id: user.id,
      email: user.email,
      role: String(user.role).trim().toLowerCase(),
      firstName: user.first_name ?? undefined,
      lastName: user.last_name ?? undefined,
    };
  }
}
