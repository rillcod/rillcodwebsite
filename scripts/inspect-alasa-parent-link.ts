import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const envPaths = ['.env.local', '.env'];
  for (const envPath of envPaths) {
    const full = path.join(process.cwd(), envPath);
    if (fs.existsSync(full)) {
      const content = fs.readFileSync(full, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing Supabase URL or key');
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  console.log('=== INSPECTING ALASA PARENT DETAILS AND PARENT-STUDENT LINK ===\n');

  // 1. Student Baheerah
  const { data: studentUser } = await supabase
    .from('portal_users')
    .select('*')
    .eq('email', 'baheerah138@rillcod.com')
    .single();

  const { data: studentRow } = await supabase
    .from('students')
    .select('*')
    .eq('student_email', 'baheerah138@rillcod.com')
    .maybeSingle();

  console.log('--- Student Baheerah Portal User ---');
  console.log('ID:', studentUser?.id);
  console.log('Name:', studentUser?.full_name);
  console.log('Class ID:', studentUser?.class_id);

  console.log('\n--- Student Baheerah Table Row ---');
  console.log('ID:', studentRow?.id);
  console.log('Parent Name Captured:', studentRow?.parent_name);
  console.log('Parent Email Captured:', studentRow?.parent_email);
  console.log('Parent Phone Captured:', studentRow?.parent_phone);

  // 2. Parent Account
  const { data: parentUser } = await supabase
    .from('portal_users')
    .select('*')
    .eq('email', 'bilkisharun@gmail.com')
    .maybeSingle();

  console.log('\n--- Parent Account (bilkisharun@gmail.com) ---');
  console.log('ID:', parentUser?.id);
  console.log('Full Name:', parentUser?.full_name);
  console.log('Role:', parentUser?.role);
  console.log('Phone:', parentUser?.phone);

  // 3. Relational Link in parent_student_links / parent_students table
  const { data: pslByPortal } = await supabase
    .from('parent_student_links')
    .select('*')
    .or(`parent_id.eq.${parentUser?.id},parent_portal_user_id.eq.${parentUser?.id}`);

  console.log('\n--- parent_student_links Table Query ---');
  console.log(pslByPortal);
}

run();
