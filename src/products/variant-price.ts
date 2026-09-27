/** Extra charged when the customer picks the multicolor option. */
export const MULTICOLOR_SURCHARGE_CENTS = 50_000;

export function unitPriceCents(
  productPriceCents: number,
  variant?: { isMulticolor: boolean } | null,
): number {
  if (variant?.isMulticolor) {
    return productPriceCents + MULTICOLOR_SURCHARGE_CENTS;
  }

  return productPriceCents;
}
