"use client";
import SchoolRegistration from "@/components/SchoolRegistration";

export default function SchoolRegistrationPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
      <div className="container mx-auto">
        {/* School Registration Form */}
        <SchoolRegistration />
      </div>
    </div>
  );
} 