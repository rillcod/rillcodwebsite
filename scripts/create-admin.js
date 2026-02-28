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

async function createAdmin() {
  try {
    console.log('Checking for existing superadmin user...');

    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabase.auth.admin.listUsers();
    if (checkError) {
      console.error('Error checking existing users:', checkError.message);
      return;
    }

    const adminExists = existingUser?.users?.some(user => user.email === 'superadmin@rillcod.com');
    if (adminExists) {
      console.log('Admin user already exists. Updating password...');

      // Update password for existing user
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        existingUser.users.find(u => u.email === 'superadmin@rillcod.com').id,
        { password: 'admin123' }
      );

      if (updateError) {
        console.error('Error updating admin password:', updateError.message);
        return;
      }

      console.log('Admin password updated successfully');
      return;
    }

    console.log('Creating new admin user...');

    // Create auth user
    const { data: user, error: authError } = await supabase.auth.admin.createUser({
      email: 'superadmin@rillcod.com',
      password: 'admin123',
      email_confirm: true,
      user_metadata: { userrole: 'admin' }
    });

    if (authError) {
      console.error('Auth error:', authError.message);
      return;
    }

    console.log('Created auth user:', user.user.id);

    // Create portal_users record
    const { error: dbError } = await supabase.from('portal_users').insert({
      id: user.user.id,
      email: 'superadmin@rillcod.com',
      full_name: 'Ultimate Super Admin',
      role: 'admin',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    if (dbError) {
      console.error('Database error:', dbError.message);
      return;
    }

    console.log('Created portal_users record');

    console.log('\nAdmin created successfully!');
    console.log('Email: superadmin@rillcod.com');
    console.log('Password: admin123');
  } catch (err) {
    console.error('Unexpected error:', err.message);
  }
}

createAdmin(); 