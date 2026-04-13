import { describe, it, expect } from 'vitest';
import { assertPaystackSupportedCurrency, paystackInitializeMinorUnits } from './paystack-amounts';

describe('assertPaystackSupportedCurrency', () => {
    it('accepts NGN and USD', () => {
        expect(assertPaystackSupportedCurrency('ngn')).toBe('NGN');
        expect(assertPaystackSupportedCurrency('USD')).toBe('USD');
    });

    it('rejects other currencies', () => {
        expect(() => assertPaystackSupportedCurrency('EUR')).toThrow('Unsupported Paystack currency');
    });
});

describe('paystackInitializeMinorUnits', () => {
    it('applies NGN gross-up then kobo', () => {
        const grossUp = (n: number) => n + 100;
        const { amountMinor, currency } = paystackInitializeMinorUnits(1000, 'NGN', grossUp);
        expect(currency).toBe('NGN');
        expect(amountMinor).toBe(Math.round(1100 * 100));
    });

    it('uses pass-through cents for USD', () => {
        const { amountMinor, currency } = paystackInitializeMinorUnits(49.99, 'USD', () => 0);
        expect(currency).toBe('USD');
        expect(amountMinor).toBe(4999);
    });
});
