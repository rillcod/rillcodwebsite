import { StudentRegistration } from "@/features/registration";
import { PUBLIC_PAGE_ROOT } from "@/components/mobile/public-styles";

export default function StudentRegistrationPage() {
  return (
    <div className={`${PUBLIC_PAGE_ROOT} relative transition-colors duration-300`}>
      {/* Atmosphere — brand dark plane + soft primary wash */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, color-mix(in oklab, var(--primary) 18%, transparent), transparent 55%), radial-gradient(ellipse 60% 40% at 100% 80%, color-mix(in oklab, #ef4444 8%, transparent), transparent 50%), radial-gradient(ellipse 50% 35% at 0% 60%, color-mix(in oklab, var(--primary) 10%, transparent), transparent 45%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035] dark:opacity-[0.06]"
        aria-hidden
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.85%27 numOctaves=%274%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27/%3E%3C/svg%3E")',
        }}
      />

      <div className="relative z-10 container mx-auto flex min-h-dvh max-w-5xl items-start justify-center pl-[max(1rem,var(--safe-area-left))] pr-[max(1rem,var(--safe-area-right))] pt-[max(0.5rem,var(--safe-area-top))] pb-[max(4rem,var(--safe-area-bottom))] sm:items-center sm:py-14">
        <StudentRegistration />
      </div>
    </div>
  );
}
