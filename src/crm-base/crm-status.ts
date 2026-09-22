export type DbOrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export type CrmOrderStatus =
  | 'pas_confirme'
  | 'confirme'
  | 'en_fabrication'
  | 'en_preparation'
  | 'en_livraison'
  | 'livre'
  | 'retour_echec'
  | 'annulee';

const CRM_TO_DB: Record<CrmOrderStatus, DbOrderStatus> = {
  pas_confirme: 'pending',
  confirme: 'confirmed',
  en_fabrication: 'processing',
  en_preparation: 'processing',
  en_livraison: 'shipped',
  livre: 'delivered',
  retour_echec: 'refunded',
  annulee: 'cancelled',
};

export function isCrmOrderStatus(value: string): value is CrmOrderStatus {
  return value in CRM_TO_DB;
}

export function toDbOrderStatus(status: string): DbOrderStatus {
  if (isCrmOrderStatus(status)) {
    return CRM_TO_DB[status];
  }

  return status as DbOrderStatus;
}

export function toCrmOrderStatus(
  status: string,
  productionComplete = false,
): CrmOrderStatus {
  switch (status) {
    case 'pending':
      return 'pas_confirme';
    case 'confirmed':
      return 'confirme';
    case 'processing':
      return productionComplete ? 'en_preparation' : 'en_fabrication';
    case 'shipped':
      return 'en_livraison';
    case 'delivered':
      return 'livre';
    case 'cancelled':
      return 'annulee';
    case 'refunded':
      return 'retour_echec';
    default:
      if (isCrmOrderStatus(status)) {
        return status;
      }
      return 'pas_confirme';
  }
}

export function centsToDzd(cents: number | null | undefined): number {
  return Math.round((cents ?? 0) / 100);
}

export function newCrmId(): string {
  return crypto.randomUUID();
}
