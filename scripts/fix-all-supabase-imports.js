const fs = require('fs');
const path = require('path');

// List of files that need to be updated
const filesToUpdate = [
  'src/components/SchoolRegistration.tsx',
  'src/components/StudentRegistration.tsx',
  'src/components/DashboardLayout.tsx',
  'src/components/auth/PortalAccess.tsx',
  'src/components/AddStudentModal.tsx',
  'src/components/admin/TeacherManagement.tsx',
  'src/components/admin/StudentApproval.tsx',
  'src/app/teacher/page.tsx',
  'src/app/teacher/dashboard/page.tsx',
  'src/app/student/page.tsx',
  'src/app/student/dashboard/page.tsx',
  'src/app/signup/page.tsx',
  'src/app/reset-password/page.tsx',
  'src/app/auth/teacher/page.tsx',
  'src/app/auth/register/page.tsx',
  'src/app/auth/callback/page.tsx',
  'src/app/admin/applications/page.tsx',
  'src/app/admin/settings/page.tsx',
  'src/app/admin/users/page.tsx',
  'src/app/admin/teachers/page.tsx',
  'src/app/admin/teacher-approvals/page.tsx',
  'src/app/admin/students/page.tsx',
  'src/app/admin/materials/[id]/page.tsx',
  'src/app/admin/schools/page.tsx',
  'src/app/admin/materials/page.tsx',
  'src/app/admin/reports/page.tsx',
  'src/app/admin/programs/page.tsx',
  'src/app/admin/page.tsx',
  'src/app/admin/classes/[id]/page.tsx',
  'src/app/admin/messages/page.tsx',
  'src/app/admin/dashboard/page.tsx',
  'src/app/admin/enrollments/page.tsx',
  'src/app/admin/enrollments/[id]/page.tsx',
  'src/app/admin/classes/page.tsx',
  'src/app/admin/create/page.tsx',
  'src/app/admin/courses/page.tsx',
  'src/app/admin/communications/page.tsx',
  'src/app/admin/cbt/page.tsx',
  'src/app/admin/calendar/page.tsx',
  'src/app/admin/assignments/page.tsx',
  'src/app/admin/announcements/page.tsx',
  'src/app/admin/analytics/page.tsx',
  'src/app/admin/approvals/page.tsx'
];

function updateFile(filePath) {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    
    if (!fs.existsSync(fullPath)) {
      console.log(`File not found: ${filePath}`);
      return;
    }

    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Replace the import path
    const oldImport = "import { createClient } from '@/utils/supabase/client';";
    const newImport = "import { createClient } from '@/lib/supabase/client';";
    
    if (content.includes(oldImport)) {
      content = content.replace(oldImport, newImport);
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`✅ Updated: ${filePath}`);
    } else {
      console.log(`⚠️  No update needed: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ Error updating ${filePath}:`, error.message);
  }
}

console.log('🔧 Fixing Supabase imports...\n');

filesToUpdate.forEach(updateFile);

console.log('\n✨ Supabase import fix completed!');
