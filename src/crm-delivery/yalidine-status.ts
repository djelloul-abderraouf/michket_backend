import type { DbOrderStatus } from '../crm-base/crm-status';

export function normalizeYalidineText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function extractYalidineStatus(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const value = record.last_status ?? record.lastStatus;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function mapYalidineLastStatus(lastStatus: string): DbOrderStatus | null {
  const value = normalizeYalidineText(lastStatus);
  if (!value) {
    return null;
  }

  if (value.includes('retour')) {
    return 'refunded';
  }

  if (
    (value.includes('echec') || value.includes('echou')) &&
    !value.includes('tentative')
  ) {
    return 'refunded';
  }

  if (value.includes('livr') && !value.includes('sorti')) {
    return 'delivered';
  }

  if (
    value.includes('transit') ||
    value.includes('expedi') ||
    value.includes('achemin') ||
    value.includes('sorti') ||
    value.includes('wilaya') ||
    value.includes('localisation') ||
    value.includes('en cours') ||
    value.includes('centre')
  ) {
    return 'shipped';
  }

  return null;
}

export function canApplyYalidineStatus(
  current: DbOrderStatus,
  next: DbOrderStatus,
): boolean {
  if (current === next) {
    return false;
  }
  if (current === 'pending' || current === 'cancelled' || current === 'refunded') {
    return false;
  }
  if (current === 'delivered' && next !== 'refunded') {
    return false;
  }
  return true;
}
