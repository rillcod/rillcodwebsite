import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Enroll Your Child — Coding & STEM Classes for Kids | Rillcod Technologies",
  description:
    "Register your child for Rillcod Technologies's coding and STEM programs. Learn Python, Scratch, Web Development, Robotics & AI. Available in partner schools across Benin City, Ekpoma, Uromi, Auchi, and Edo State.",
  keywords: [
    "enroll child coding Nigeria",
    "student registration STEM",
    "coding classes for kids Benin City",
    "register child programming Edo State",
    "kids coding enrollment Ekpoma",
    "children STEM registration Uromi",
    "coding for kids Auchi",
    "Python classes kids Nigeria",
  ],
  alternates: {
    canonical: "https://rillcod.com/student-registration",
  },
  openGraph: {
    title: "Enroll Your Child at Rillcod Technologies — Coding & STEM for Kids",
    description:
      "Register for Python, Scratch, Web Dev, Robotics & AI classes. Available in schools across Benin City, Ekpoma, Uromi, and Auchi.",
    url: "https://rillcod.com/student-registration",
  },
};

export default function StudentRegistrationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
