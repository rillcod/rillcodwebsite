import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Partner Your School — Bring STEM & Coding to Your Students | Rillcod Academy",
  description:
    "Register your school as a Rillcod Academy partner. We bring hands-on coding, robotics, and STEM education directly into schools across Benin City, Ekpoma, Uromi, Auchi, and all of Edo State, Nigeria.",
  keywords: [
    "partner school coding Nigeria",
    "school registration STEM program",
    "bring coding to school Benin City",
    "STEM partnership Edo State",
    "school coding program Ekpoma",
    "technology education partnership Uromi",
    "coding in schools Auchi",
    "school STEM program Nigeria",
  ],
  alternates: {
    canonical: "https://rillcod.com/school-registration",
  },
  openGraph: {
    title: "Partner Your School with Rillcod Academy — STEM Education",
    description:
      "Bring hands-on coding, robotics & STEM education to your school. Available across Benin City, Ekpoma, Uromi, Auchi, and Edo State.",
    url: "https://rillcod.com/school-registration",
  },
};

export default function SchoolRegistrationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
