/**
 * Validates instalment choice against programme settings (call after price resolution).
 * Throws Error with user-facing message on violation.
 */
export function assertRegistrationInstalmentAllowed(params: {
    payment_plan: unknown;
    resolvedProgramId: string | null;
    instalmentsEnabled: boolean | null | undefined;
}): void {
    if (params.payment_plan !== 'instalment') return;
    if (!params.resolvedProgramId) {
        throw new Error(
            'Instalment plan requires a programme price (program_id or default_registration_program_id in app_settings)',
        );
    }
    if (!params.instalmentsEnabled) {
        throw new Error('This programme does not support instalment payments');
    }
}
