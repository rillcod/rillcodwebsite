import {
  mayHardDeleteIssuedOperationalRecord,
  mayHardDeleteRebuildableContent,
  parseCleanupPolicy,
} from './cleanup-policy';

describe('cleanup policy', () => {
  it('defaults to flexible while the product is being built', () => {
    expect(parseCleanupPolicy(undefined)).toBe('flexible');
    expect(parseCleanupPolicy('unknown')).toBe('flexible');
  });

  it('uses strict only when an administrator explicitly selected it', () => {
    expect(mayHardDeleteRebuildableContent(parseCleanupPolicy('flexible'))).toBe(true);
    expect(mayHardDeleteRebuildableContent(parseCleanupPolicy('standard'))).toBe(true);
    expect(mayHardDeleteRebuildableContent(parseCleanupPolicy('strict'))).toBe(false);
  });

  it('retains issued records outside explicitly flexible build mode', () => {
    expect(mayHardDeleteIssuedOperationalRecord('flexible')).toBe(true);
    expect(mayHardDeleteIssuedOperationalRecord('standard')).toBe(false);
    expect(mayHardDeleteIssuedOperationalRecord('strict')).toBe(false);
  });
});
