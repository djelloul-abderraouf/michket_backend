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
  staffRoles?: string[] | null;
  firstName?: string;
  lastName?: string;
  isActive: boolean;
};

export function assignedStaffRoles(user: {
  role: string;
  staffRoles?: string[] | null;
}): string[] {
  const stored = (user.staffRoles || []).filter((role) =>
    CRM_STAFF_ROLES.includes(role as CrmStaffRole),
  );
  if (stored.length > 0) {
    return [...new Set(stored)];
  }
  if (CRM_STAFF_ROLES.includes(user.role as CrmStaffRole)) {
    return [user.role];
  }
  return [];
}

export function expandCrmRoles(assigned: string[]): string[] {
  const expanded = new Set<string>();
  for (const role of assigned) {
    for (const mapped of ROLE_MAPPING[role] || []) {
      expanded.add(mapped);
    }
  }
  return [...expanded];
}

export function primaryStaffRole(roles: string[]): CrmStaffRole {
  if (roles.includes('super_admin')) {
    return 'super_admin';
  }
  if (roles.includes('admin')) {
    return 'admin';
  }
  const first = roles.find((role) =>
    CRM_STAFF_ROLES.includes(role as CrmStaffRole),
  );
  return (first || 'commercial') as CrmStaffRole;
}

export function hasCrmAccess(
  role: string,
  isActive = true,
  staffRoles?: string[] | null,
): boolean {
  return isActive && assignedStaffRoles({ role, staffRoles }).length > 0;
}

export function toCrmRequestUser(user: AuthUserRecord) {
  const assigned = assignedStaffRoles(user);
  if (!hasCrmAccess(user.role, user.isActive, assigned)) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    staffRoles: assigned,
    roles: expandCrmRoles(assigned),
  };
}
