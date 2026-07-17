import { SchoolRegistration } from "@/features/registration";

export default function SchoolRegistrationPage() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background pl-[max(1rem,var(--safe-area-left))] pr-[max(1rem,var(--safe-area-right))] pt-[max(1rem,var(--safe-area-top))] pb-[max(1rem,var(--safe-area-bottom))] sm:py-12">
      {/* Background decor */}
      <div className="absolute top-0 right-0 w-[40%] h-[40%] bg-blue-600/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[30%] h-[30%] bg-primary/5 blur-[100px] pointer-events-none" />

      <div className="container mx-auto max-w-4xl relative z-10">
        <SchoolRegistration />
      </div>
    </div>
  );
}