import {describe,expect,it} from 'vitest';
import {hasLeadEmailMarketingConsent} from './consent';

describe('lead email marketing consent',()=>{
  it('requires an explicit marketing-email choice',()=>{
    expect(hasLeadEmailMarketingConsent({parent_email:'parent@example.com'})).toBe(false);
    expect(hasLeadEmailMarketingConsent({email_opt_in:'yes'})).toBe(true);
    expect(hasLeadEmailMarketingConsent({marketing_email_consent:true})).toBe(true);
    expect(hasLeadEmailMarketingConsent({marketing_email_consent:'no'})).toBe(false);
  });
});
