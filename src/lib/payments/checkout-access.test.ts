import { canRoleInitiateCheckout, CHECKOUT_ALLOWED_ROLES } from './checkout-access';

describe('canRoleInitiateCheckout', () => {
    it.each(CHECKOUT_ALLOWED_ROLES)('allows %s', (role) => {
        expect(canRoleInitiateCheckout(role)).toBe(true);
    });

    it('denies teacher and unknown', () => {
        expect(canRoleInitiateCheckout('teacher')).toBe(false);
        expect(canRoleInitiateCheckout(undefined)).toBe(false);
        expect(canRoleInitiateCheckout('')).toBe(false);
    });
});
