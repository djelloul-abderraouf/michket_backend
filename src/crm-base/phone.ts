import { BadRequestException } from '@nestjs/common';

export function phoneKey(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.slice(-9);
}

export function normalizePhone(phone: string): string {
  return String(phone || '').replace(/[\s.-]/g, '');
}

export function assertClientPhone(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) {
    throw new BadRequestException('Le numero est obligatoire.');
  }
  if (!digits.startsWith('0')) {
    throw new BadRequestException('Le numero doit commencer par 0.');
  }
  if (digits.length > 10) {
    throw new BadRequestException('Le numero ne doit pas depasser 10 chiffres.');
  }
  if (digits.length < 10) {
    throw new BadRequestException('Le numero doit contenir 10 chiffres.');
  }
  return digits;
}
