const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Validate environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
  process.exit(1);
}

console.log('Using Supabase URL:', supabaseUrl);
console.log('Service key present:', !!supabaseServiceKey);

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// List of teachers to create
const teachers = [
  {
    email: 'teacher1@example.com',
    password: 'TeacherPass123!',
    full_name: 'Teacher One'
  },
  {
    email: 'teacher2@example.com',
    password: 'TeacherPass123!',
    full_name: 'Teacher Two'
  }
  // Add more teachers as needed
];

async function createTeacher(teacher) {
  try {
    console.log(`Creating auth user for ${teacher.email}...`);

    // Create auth user
    const { data: user, error: authError } = await supabase.auth.admin.createUser({
      email: teacher.email,
      password: teacher.password,
      email_confirm: true,
      user_metadata: { userrole: 'teacher', full_name: teacher.full_name }
    });

    if (authError) {
      console.error(`Auth error for ${teacher.email}:`, authError.message);
      return;
    }

    console.log(`Created auth user: ${user.user.id}`);

    // Create portal_users record
    const { error: dbError } = await supabase.from('portal_users').insert({
      id: user.user.id,
      email: teacher.email,
      full_name: teacher.full_name,
      role: 'teacher',
      is_active: true,
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    if (dbError) {
      console.error(`Database error for ${teacher.email}:`, dbError.message);
      return;
    }

    console.log(`Created portal_users record for ${teacher.email}`);

  } catch (err) {
    console.error(`Unexpected error for ${teacher.email}:`, err.message);
  }
}

async function main() {
  for (const teacher of teachers) {
    await createTeacher(teacher);
  }
  console.log('Teacher creation script completed.');
}

main();
