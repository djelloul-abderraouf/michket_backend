import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import {
  and,
  desc,
  eq,
  ne,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../database/schema';
import {
  addresses,
  users,
} from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import { DeliveryService } from '../delivery/delivery.service';
import { AuthService } from '../auth/auth.service';
import { CRM_STAFF_ROLES } from '../auth/crm-role-map';

type ProfileUpdate = {
  firstName?: string;
  lastName?: string;
  phone?: string;
};

type AddressInput = {
  label?: string;
  firstName: string;
  lastName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  wilayaCode: number;
  commune: string;
  isDefault?: boolean;
};

type AddressUpdate = Partial<AddressInput>;

@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly deliveryService: DeliveryService,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {}

  async findById(id: string) {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return user ?? null;
  }

  async findAllForCrm() {
    return this.db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));
  }

  async updateCrmUser(
    id: string,
    data: {
      role?: typeof users.$inferSelect['role'];
      isActive?: boolean;
      firstName?: string;
      lastName?: string;
      phone?: string;
    },
  ) {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const [updated] = await this.db
      .update(users)
      .set({
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    this.authService.invalidateUserCache(id);
    return updated;
  }

  async createCrmStaff(data: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    role: typeof users.$inferSelect['role'];
  }) {
    if (!CRM_STAFF_ROLES.includes(data.role as (typeof CRM_STAFF_ROLES)[number])) {
      throw new BadRequestException('Role CRM invalide');
    }

    const email = data.email.trim().toLowerCase();
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new ConflictException('Un utilisateur avec cet email existe deja');
    }

    const supabase = createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_SECRET_KEY'),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { data: created, error } = await supabase.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        first_name: data.firstName ?? '',
        last_name: data.lastName ?? '',
      },
    });

    if (error || !created.user) {
      throw new BadRequestException(
        error?.message || 'Impossible de creer le compte Auth',
      );
    }

    const [user] = await this.db
      .insert(users)
      .values({
        id: created.user.id,
        email,
        firstName: data.firstName?.trim() || null,
        lastName: data.lastName?.trim() || null,
        phone: data.phone?.trim() || null,
        role: data.role,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email,
          firstName: data.firstName?.trim() || null,
          lastName: data.lastName?.trim() || null,
          phone: data.phone?.trim() || null,
          role: data.role,
          isActive: true,
          updatedAt: new Date(),
        },
      })
      .returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    this.authService.invalidateUserCache(user.id);
    return user;
  }

  async findByEmail(email: string) {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return user ?? null;
  }

  /**
   * Create a local Michket profile for a Supabase Auth user.
   * The business role is always forced to "customer" here.
   */
  async create(data: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  }) {
    const [user] = await this.db
      .insert(users)
      .values({
        id: data.id,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        role: 'customer',
        isActive: true,
      })
      .returning();

    return user;
  }

  /**
   * Ensure the Supabase user has a local profile.
   * Public request bodies must never control role or isActive.
   */
  async upsert(supabaseUser: {
    id: string;
    email: string;
  }) {
    const existing =
      await this.findById(supabaseUser.id);

    if (!existing) {
      return this.create({
        id: supabaseUser.id,
        email: supabaseUser.email,
      });
    }

    if (
      existing.email !== supabaseUser.email
    ) {
      await this.db
        .update(users)
        .set({
          email: supabaseUser.email,
          updatedAt: new Date(),
        })
        .where(
          eq(users.id, supabaseUser.id),
        );
    }

    return this.findById(supabaseUser.id);
  }

  /**
   * Update only fields a normal customer is allowed to change.
   */
  async updateProfile(
    userId: string,
    data: ProfileUpdate,
  ) {
    const existing =
      await this.findById(userId);

    if (!existing) {
      throw new NotFoundException(
        'User not found',
      );
    }

    const updateData: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (data.firstName !== undefined) {
      updateData.firstName = data.firstName;
    }

    if (data.lastName !== undefined) {
      updateData.lastName = data.lastName;
    }

    if (data.phone !== undefined) {
      updateData.phone = data.phone;
    }

    await this.db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId));

    return this.findById(userId);
  }

  async getAddresses(userId: string) {
    return this.db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, userId));
  }

  async addAddress(
    userId: string,
    data: AddressInput,
  ) {
    return this.db.transaction(
      async (tx) => {
        // Serialize address changes for this user.
        const [existingUser] = await tx
          .select({
            id: users.id,
          })
          .from(users)
          .where(eq(users.id, userId))
          .for('update')
          .limit(1);

        if (!existingUser) {
          throw new NotFoundException(
            'User not found',
          );
        }

        const [existingAddress] = await tx
          .select({
            id: addresses.id,
          })
          .from(addresses)
          .where(
            eq(
              addresses.userId,
              userId,
            ),
          )
          .limit(1);

        // The first address automatically becomes the default.
        const shouldBeDefault =
          data.isDefault === true ||
          !existingAddress;

        if (shouldBeDefault) {
          await tx
            .update(addresses)
            .set({
              isDefault: false,
            })
            .where(
              and(
                eq(
                  addresses.userId,
                  userId,
                ),
                eq(
                  addresses.isDefault,
                  true,
                ),
              ),
            );
        }

        const wilayaName =
          this.deliveryService.getWilayaName(
            data.wilayaCode,
          );

        const [address] = await tx
          .insert(addresses)
          .values({
            userId,
            label: data.label,
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
            addressLine1:
              data.addressLine1,
            addressLine2:
              data.addressLine2,
            wilayaCode:
              data.wilayaCode,
            wilayaName,
            commune: data.commune,
            isDefault:
              shouldBeDefault,
          })
          .returning();

        return address;
      },
    );
  }

  async updateAddress(
    userId: string,
    addressId: string,
    data: AddressUpdate,
  ) {
    return this.db.transaction(
      async (tx) => {
        const [existingUser] = await tx
          .select({
            id: users.id,
          })
          .from(users)
          .where(eq(users.id, userId))
          .for('update')
          .limit(1);

        if (!existingUser) {
          throw new NotFoundException(
            'User not found',
          );
        }

        const [existingAddress] = await tx
          .select()
          .from(addresses)
          .where(
            and(
              eq(
                addresses.id,
                addressId,
              ),
              eq(
                addresses.userId,
                userId,
              ),
            ),
          )
          .for('update')
          .limit(1);

        if (!existingAddress) {
          throw new NotFoundException(
            'Address not found',
          );
        }

        if (data.isDefault === true) {
          await tx
            .update(addresses)
            .set({
              isDefault: false,
            })
            .where(
              and(
                eq(
                  addresses.userId,
                  userId,
                ),
                eq(
                  addresses.isDefault,
                  true,
                ),
              ),
            );
        }

        let finalIsDefault =
          data.isDefault;

        // Do not leave the user with addresses but no default address.
        if (
          data.isDefault === false &&
          existingAddress.isDefault
        ) {
          const [replacement] = await tx
            .select({
              id: addresses.id,
            })
            .from(addresses)
            .where(
              and(
                eq(
                  addresses.userId,
                  userId,
                ),
                ne(
                  addresses.id,
                  addressId,
                ),
              ),
            )
            .limit(1);

          if (replacement) {
            await tx
              .update(addresses)
              .set({
                isDefault: true,
              })
              .where(
                eq(
                  addresses.id,
                  replacement.id,
                ),
              );
          } else {
            finalIsDefault = true;
          }
        }

        const updateData: {
          label?: string;
          firstName?: string;
          lastName?: string;
          phone?: string;
          addressLine1?: string;
          addressLine2?: string;
          wilayaCode?: number;
          wilayaName?: string;
          commune?: string;
          isDefault?: boolean;
        } = {};

        if (data.label !== undefined) {
          updateData.label = data.label;
        }

        if (data.firstName !== undefined) {
          updateData.firstName =
            data.firstName;
        }

        if (data.lastName !== undefined) {
          updateData.lastName =
            data.lastName;
        }

        if (data.phone !== undefined) {
          updateData.phone = data.phone;
        }

        if (
          data.addressLine1 !== undefined
        ) {
          updateData.addressLine1 =
            data.addressLine1;
        }

        if (
          data.addressLine2 !== undefined
        ) {
          updateData.addressLine2 =
            data.addressLine2;
        }

        if (
          data.wilayaCode !== undefined
        ) {
          updateData.wilayaCode =
            data.wilayaCode;

          updateData.wilayaName =
            this.deliveryService.getWilayaName(
              data.wilayaCode,
            );
        }

        if (data.commune !== undefined) {
          updateData.commune =
            data.commune;
        }

        if (
          finalIsDefault !== undefined
        ) {
          updateData.isDefault =
            finalIsDefault;
        }

        const [updated] = await tx
          .update(addresses)
          .set(updateData)
          .where(
            and(
              eq(
                addresses.id,
                addressId,
              ),
              eq(
                addresses.userId,
                userId,
              ),
            ),
          )
          .returning();

        if (!updated) {
          throw new NotFoundException(
            'Address not found',
          );
        }

        return updated;
      },
    );
  }

  async deleteAddress(
    userId: string,
    addressId: string,
  ): Promise<void> {
    await this.db.transaction(
      async (tx) => {
        const [existingUser] = await tx
          .select({
            id: users.id,
          })
          .from(users)
          .where(eq(users.id, userId))
          .for('update')
          .limit(1);

        if (!existingUser) {
          throw new NotFoundException(
            'User not found',
          );
        }

        const [address] = await tx
          .select()
          .from(addresses)
          .where(
            and(
              eq(
                addresses.id,
                addressId,
              ),
              eq(
                addresses.userId,
                userId,
              ),
            ),
          )
          .for('update')
          .limit(1);

        if (!address) {
          throw new NotFoundException(
            'Address not found',
          );
        }

        await tx
          .delete(addresses)
          .where(
            and(
              eq(
                addresses.id,
                addressId,
              ),
              eq(
                addresses.userId,
                userId,
              ),
            ),
          );

        if (address.isDefault) {
          const [replacement] = await tx
            .select({
              id: addresses.id,
            })
            .from(addresses)
            .where(
              eq(
                addresses.userId,
                userId,
              ),
            )
            .limit(1);

          if (replacement) {
            await tx
              .update(addresses)
              .set({
                isDefault: true,
              })
              .where(
                eq(
                  addresses.id,
                  replacement.id,
                ),
              );
          }
        }
      },
    );
  }
}
