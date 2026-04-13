/** Paystack on this project is only wired for NGN and USD. */
export function assertPaystackSupportedCurrency(currency: string | null | undefined): 'NGN' | 'USD' {
    const c = (currency || 'NGN').toUpperCase();
    if (c !== 'NGN' && c !== 'USD') {
        throw new Error(`Unsupported Paystack currency: ${c}. Use NGN or USD.`);
    }
    return c;
}

/**
 * Builds Paystack `transaction/initialize` amount (minor units) from a target net (major units).
 * NGN uses the provided gross-up (fees) function; USD uses pass-through × 100 (cents).
 */
export function paystackInitializeMinorUnits(
    targetNetMajor: number,
    currencyInput: string | null | undefined,
    grossUpNgnFromNet: (net: number) => number,
): { amountMinor: number; currency: 'NGN' | 'USD' } {
    const c = assertPaystackSupportedCurrency(currencyInput);
    if (c === 'NGN') {
        const gross = grossUpNgnFromNet(targetNetMajor);
        return { amountMinor: Math.round(gross * 100), currency: 'NGN' };
    }
    const major = Math.round(targetNetMajor * 100) / 100;
    return { amountMinor: Math.round(major * 100), currency: 'USD' };
}
