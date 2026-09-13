import { SetMetadata } from '@nestjs/common';

export type UserRole = 'customer' | 'admin' | 'super_admin';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

// CRM-specific roles
export type CrmRole = 'admin' | 'commercial' | 'atelier_design' | 'fabrication' | 'preparation' | 'livraison' | 'confirmation';

export const CRM_ROLES_KEY = 'crmRoles';
export const CrmRoles = (...roles: CrmRole[]) => SetMetadata(CRM_ROLES_KEY, roles);
