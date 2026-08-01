import { SchoolRegistration } from "@/features/registration";
import { PUBLIC_PAGE_ROOT } from "@/components/mobile/public-styles";

export default function PartnershipPage() {
  return (
    <div className={`${PUBLIC_PAGE_ROOT} py-12 px-4 flex items-center justify-center`}>
      <div className="container mx-auto max-w-2xl">
        <SchoolRegistration />
      </div>
    </div>
  );
}
