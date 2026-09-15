export const CRM_STAFF_ROLES = [
  'admin',
  'super_admin',
  'commercial',
  'fabrication',
  'preparation',
  'livraison',
  'confirmation',
] as const;

export type CrmStaffRole = (typeof CRM_STAFF_ROLES)[number];

const ROLE_MAPPING: Record<string, string[]> = {
  admin: [
    'admin',
    'commercial',
    'confirmation',
    'atelier_design',
    'fabrication',
    'preparation',
    'livraison',
  ],
  super_admin: [
    'admin',
    'commercial',
    'confirmation',
    'atelier_design',
    'fabrication',
    'preparation',
    'livraison',
  ],
  commercial: ['commercial'],
  fabrication: ['fabrication'],
  preparation: ['preparation'],
  livraison: ['livraison'],
  confirmation: ['confirmation'],
};

export type AuthUserRecord = {
  id: string;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
  isActive: boolean;
};

export function hasCrmAccess(role: string, isActive = true): boolean {
  return isActive && CRM_STAFF_ROLES.includes(role as CrmStaffRole);
}

export function toCrmRequestUser(user: AuthUserRecord) {
  if (!hasCrmAccess(user.role, user.isActive)) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    roles: ROLE_MAPPING[user.role] || [],
  };
}
