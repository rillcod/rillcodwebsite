import { StudentRegistration } from "@/features/registration";

export default function StudentRegistrationPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0B] py-12 px-4 flex items-center justify-center">
      <div className="container mx-auto max-w-2xl">
        <StudentRegistration />
      </div>
    </div>
  );
}