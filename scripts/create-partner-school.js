const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const partnerSchool = {
  name: 'Partner School',
  contact_person: 'Partner School Admin',
  email: 'partner.school@rillcod.com',
  phone: '+2348000000000',
  city: 'Lagos',
  state: 'Lagos',
  status: 'approved',
  school_type: 'partner',
  program_interest: ['STEM', 'Programming'],
  enrollment_types: ['school'],
};

const partnerAccount = {
  email: 'partner.school@rillcod.com',
  password: 'PartnerSchool2026!',
  full_name: 'Partner School Admin',
  role: 'school',
};

async function createPartnerSchoolAccount() {
  try {
    // Check for existing school
    const { data: existingSchool, error: schoolCheckError } = await supabase
      .from('schools')
      .select('id, name')
      .eq('email', partnerSchool.email)
      .maybeSingle();

    if (schoolCheckError) {
      console.error('Error checking school:', schoolCheckError.message);
      return;
    }

    let schoolId = existingSchool?.id;

    if (!schoolId) {
      const { data: schoolInsert, error: schoolInsertError } = await supabase
        .from('schools')
        .insert({
          name: partnerSchool.name,
          contact_person: partnerSchool.contact_person,
          email: partnerSchool.email,
          phone: partnerSchool.phone,
          city: partnerSchool.city,
          state: partnerSchool.state,
          status: partnerSchool.status,
          school_type: partnerSchool.school_type,
          program_interest: partnerSchool.program_interest,
          enrollment_types: partnerSchool.enrollment_types,
          is_active: true,
          is_deleted: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (schoolInsertError) {
        console.error('Error creating school:', schoolInsertError.message);
        return;
      }

      schoolId = schoolInsert.id;
      console.log('Created school:', schoolId);
    } else {
      console.log('School already exists:', schoolId);
    }

    // Check for existing auth user
    const { data: usersList, error: listError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listError) {
      console.error('Error listing users:', listError.message);
      return;
    }

    const existingUser = usersList?.users?.find((user) => user.email === partnerAccount.email);

    let userId = existingUser?.id;

    if (!userId) {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: partnerAccount.email,
        password: partnerAccount.password,
        email_confirm: true,
        user_metadata: {
          full_name: partnerAccount.full_name,
          role: partnerAccount.role,
          school_id: schoolId,
        },
      });

      if (authError) {
        console.error('Error creating auth user:', authError.message);
        return;
      }

      userId = authData.user?.id;
      console.log('Created auth user:', userId);
    } else {
      console.log('Auth user already exists:', userId);
      const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
        password: partnerAccount.password,
        user_metadata: {
          full_name: partnerAccount.full_name,
          role: partnerAccount.role,
          school_id: schoolId,
        },
      });

      if (updateError) {
        console.error('Error updating auth user:', updateError.message);
        return;
      }
    }

    // Upsert portal_users record
    const { error: portalError } = await supabase.from('portal_users').upsert({
      id: userId,
      email: partnerAccount.email,
      full_name: partnerAccount.full_name,
      role: partnerAccount.role,
      school_id: schoolId,
      school_name: partnerSchool.name,
      enrollment_type: 'school',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (portalError) {
      console.error('Error creating portal user:', portalError.message);
      return;
    }

    console.log('\nPartner school account ready:');
    console.log(`School: ${partnerSchool.name}`);
    console.log(`Email: ${partnerAccount.email}`);
    console.log(`Password: ${partnerAccount.password}`);
  } catch (err) {
    console.error('Unexpected error:', err.message);
  }
}

createPartnerSchoolAccount();
