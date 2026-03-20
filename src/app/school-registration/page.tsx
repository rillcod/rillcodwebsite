import { SchoolRegistration } from "@/features/registration";

export default function SchoolRegistrationPage() {
  return (
    <div className="min-h-screen bg-background py-12 px-4 flex items-center justify-center">
      <div className="container mx-auto max-w-2xl">
        <SchoolRegistration />
      </div>
    </div>
  );
}