/**
 * Summer / special in-person class venue — NOT the company HQ.
 * Brand postal address stays on brandContact.address (Ogiesoba Avenue).
 */
export const SUMMER_CENTRE = {
  name: 'Idia Renaissance',
  address: 'Idia Renaissance, 2 Ihama Road, GRA, Benin City, Edo State',
  addressShort: 'Idia Renaissance · 2 Ihama Road, GRA, Benin City',
  landmark: 'Adjacent to Royal Marble Hotel',
} as const;

export function summerCentreLine(sep = ' · '): string {
  return [SUMMER_CENTRE.address, SUMMER_CENTRE.landmark].join(sep);
}
