"use client";
import StudentRegistration from "@/components/StudentRegistration";

export default function StudentRegistrationPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
      <div className="container mx-auto">
        {/* Student Registration Form */}
        <StudentRegistration />
      </div>
    </div>
  );
} 