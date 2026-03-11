
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const courses = [
  'AI and Robotics',
  'Data Analysis',
  'Animation',
  'AI and Automation'
];

async function seed() {
  for (const title of courses) {
    const { data: existing } = await supabase.from('courses').select('id').eq('title', title).maybeSingle();
    if (!existing) {
      console.log(`Adding ${title}...`);
      const { error } = await supabase.from('courses').insert({
        title,
        description: `Deep dive into ${title}.`,
        is_active: true
      });
      if (error) console.error(error);
    } else {
      console.log(`${title} already exists.`);
    }
  }
}

seed()
  .then(() => {
    console.log('Seeding complete.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Seeding failed:', err);
    process.exit(1);
  });
