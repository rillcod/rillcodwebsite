import type { SupabaseClient } from '@supabase/supabase-js';

const YES = new Set(['true','yes','1','on','opted_in','opted-in','allow','allowed']);

/** A submitted service/registration form is not automatically marketing permission. */
export function hasLeadEmailMarketingConsent(record: Record<string,unknown>|null|undefined): boolean {
  if (!record) return false;
  for (const key of ['marketing_email_consent','email_marketing_consent','marketing_emails','email_opt_in','consent_marketing_email']) {
    const value=record[key];
    if(value===true||value===1)return true;
    if(typeof value==='string'&&YES.has(value.trim().toLowerCase()))return true;
  }
  return false;
}

export async function isLeadMarketingEmailAllowed(
  db:SupabaseClient<any>, email:string, record:Record<string,unknown>|null|undefined,
):Promise<boolean>{
  if(!hasLeadEmailMarketingConsent(record))return false;
  const normalized=email.trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))return false;
  const {data,error}=await db.from('marketing_suppressions')
    .select('expires_at')
    .eq('identity_type','email')
    .eq('identity_value',normalized)
    .in('channel',['all','email']);
  if(error) return false; // Marketing fails closed when preference records cannot be checked.
  return !(data??[]).some((row:any)=>!row.expires_at||new Date(row.expires_at).getTime()>Date.now());
}
