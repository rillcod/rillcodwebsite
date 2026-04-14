import { assertRegistrationInstalmentAllowed } from './instalment-guard';

describe('assertRegistrationInstalmentAllowed', () => {
    it('no-ops for full payment', () => {
        expect(() =>
            assertRegistrationInstalmentAllowed({
                payment_plan: 'full',
                resolvedProgramId: null,
                instalmentsEnabled: false,
            }),
        ).not.toThrow();
    });

    it('requires programme when instalment', () => {
        expect(() =>
            assertRegistrationInstalmentAllowed({
                payment_plan: 'instalment',
                resolvedProgramId: null,
                instalmentsEnabled: true,
            }),
        ).toThrow(/programme price/);
    });

    it('requires instalments_enabled on programme', () => {
        expect(() =>
            assertRegistrationInstalmentAllowed({
                payment_plan: 'instalment',
                resolvedProgramId: '00000000-0000-4000-8000-000000000001',
                instalmentsEnabled: false,
            }),
        ).toThrow(/does not support instalment/);
    });

    it('allows instalment when programme supports it', () => {
        expect(() =>
            assertRegistrationInstalmentAllowed({
                payment_plan: 'instalment',
                resolvedProgramId: '00000000-0000-4000-8000-000000000001',
                instalmentsEnabled: true,
            }),
        ).not.toThrow();
    });
});
