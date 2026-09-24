export function phoneKey(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.slice(-9);
}

export function normalizePhone(phone: string): string {
  return String(phone || '').replace(/[\s.-]/g, '');
}
