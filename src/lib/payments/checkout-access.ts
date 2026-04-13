/** Roles permitted to call POST /api/payments/checkout (invoice or course Paystack). */
export const CHECKOUT_ALLOWED_ROLES = ['student', 'school', 'parent', 'admin'] as const;

export type CheckoutAllowedRole = (typeof CHECKOUT_ALLOWED_ROLES)[number];

export function canRoleInitiateCheckout(role: string | undefined | null): role is CheckoutAllowedRole {
    return CHECKOUT_ALLOWED_ROLES.includes(role as CheckoutAllowedRole);
}
