import 'dotenv/config';
import { createAdminClient } from '../src/lib/supabase/admin';
import { instantiatePlansFromAdoptions } from '../src/lib/academic/plan-from-release';


async function main() {
  console.log('Starting write-path plan instantiation from curriculum adoptions...');
  const db = createAdminClient();
  const report = await instantiatePlansFromAdoptions(db);
  console.log('--- Plan Instantiation Report ---');
  console.log(`Scanned Classes: ${report.scanned}`);
  console.log(`Plans Created/Updated: ${report.created}`);
  console.log(`Skipped: ${report.skipped}`);
  if (report.errors.length > 0) {
    console.log('Issues/Errors encountered:', report.errors);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error during plan instantiation:', err);
  process.exit(1);
});
