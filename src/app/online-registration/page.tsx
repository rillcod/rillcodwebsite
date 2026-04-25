import { StudentRegistration } from "@/features/registration";

export default function OnlineRegistrationPage() {
  return (
    <div className="min-h-screen bg-background py-12 px-4 flex items-center justify-center relative overflow-hidden">
      {/* Background decor */}
      <div className="absolute top-0 right-0 w-[40%] h-[40%] bg-emerald-600/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[30%] h-[30%] bg-primary/5 blur-[100px] pointer-events-none" />

      <div className="container mx-auto max-w-4xl relative z-10">
        <StudentRegistration defaultEnrollmentType="online" />
      </div>
    </div>
  );
}
