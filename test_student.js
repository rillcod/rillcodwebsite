import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://akaorqukdoawacvxsdij.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrYW9ycXVrZG9hd2FjdnhzZGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMDg2MzgsImV4cCI6MjA4NzU4NDYzOH0.60US0KpUqtur_5YqPSX3qxPex1wkzAG7WX-WBmoMi-s';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSignIn() {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: 'student@rillcodacademy.com',
        password: 'password123',
    });

    if (authError) {
        console.error("Auth Error:", authError);
        return;
    }

    console.log("Logged in:", authData.user.id);

    const { data, error } = await supabase
        .from('portal_users')
        .select('*')
        .eq('id', authData.user.id)
        .single();

    console.log("Portal User Query Data:", data);
    console.log("Portal User Query Error:", error);
}

testSignIn();
