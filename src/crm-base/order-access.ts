import { ForbiddenException } from '@nestjs/common';

const TRANSITION_ROLES: Record<string, string[]> = {
  'pas_confirme:confirme': ['admin', 'confirmation', 'commercial'],
  'pas_confirme:annulee': ['admin', 'confirmation', 'commercial'],
  'confirme:en_fabrication': ['admin', 'fabrication', 'commercial'],
  'confirme:annulee': ['admin', 'confirmation', 'commercial'],
  'en_fabrication:en_preparation': ['admin', 'fabrication', 'commercial'],
  'en_fabrication:annulee': ['admin', 'fabrication', 'commercial'],
  'en_preparation:en_livraison': ['admin', 'preparation', 'commercial'],
  'en_preparation:annulee': ['admin', 'preparation', 'commercial'],
  'en_livraison:livre': ['admin', 'livraison', 'commercial'],
  'en_livraison:retour_echec': ['admin', 'livraison', 'commercial'],
  'en_livraison:annulee': ['admin', 'livraison', 'commercial'],
};

export function assertCanChangeOrderStatus(
  roles: string[] | undefined,
  from: string,
  to: string,
) {
  if (from === to) {
    return;
  }

  const userRoles = roles || [];
  if (userRoles.includes('admin')) {
    return;
  }

  const allowed = TRANSITION_ROLES[`${from}:${to}`] || [];
  if (!userRoles.some((role) => allowed.includes(role))) {
    throw new ForbiddenException(
      'Action refusee pour ce changement de statut.',
    );
  }
}
