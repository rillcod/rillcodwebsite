import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Register a Learner — Kids, Teens, Adults & Individuals | Rillcod Technologies",
  description:
    "Enrol a learner at Rillcod — partner school, online, or in-person term classes. Seasonal programmes like AI Summer School stay available from the same page when live.",
  keywords: [
    "enroll coding Nigeria",
    "student registration STEM",
    "adult coding classes Nigeria",
    "individual learner programming",
    "coding classes for kids Benin City",
    "online school registration Nigeria",
    "special programme Rillcod",
    "AI summer school enrollment",
    "Python classes Nigeria",
  ],
  alternates: {
    canonical: "https://www.rillcod.com/student-registration",
  },
  openGraph: {
    title: "Register a Learner at Rillcod — Kids, Teens, Adults & Individuals",
    description:
      "Term paths for partner school, online, and centre — plus live seasonal programmes when available.",
    url: "https://www.rillcod.com/student-registration",
  },
};

export default function StudentRegistrationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
