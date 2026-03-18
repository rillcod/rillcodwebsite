import { StudentRegistration } from "@/features/registration";

export default function StudentRegistrationPage() {
  return (
    <div className="min-h-screen bg-[#121212] py-12 px-4 flex items-center justify-center relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-[40%] h-[40%] bg-blue-600/5 blur-[120px] rounded-none pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[30%] h-[30%] bg-orange-500/5 blur-[100px] rounded-none pointer-events-none" />
      
      <div className="container mx-auto max-w-3xl relative z-10">
        <StudentRegistration />
      </div>
    </div>
  );
}