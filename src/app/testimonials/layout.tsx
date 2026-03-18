import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Testimonials — What Parents & Schools Say | Rillcod Technologies",
  description:
    "Read testimonials from parents, students, and partner schools about Rillcod Technologies's STEM and coding programs in Benin City, Edo State, and across Nigeria.",
  keywords: [
    "Rillcod Technologies reviews",
    "coding academy testimonials Nigeria",
    "STEM education reviews Benin City",
    "parent reviews coding school",
    "school partnership testimonials",
    "student coding success stories",
  ],
  alternates: {
    canonical: "https://rillcod.com/testimonials",
  },
  openGraph: {
    title: "Testimonials — Rillcod Technologies Reviews & Success Stories",
    description:
      "Hear from parents, students, and partner schools about their experience with Rillcod Technologies's STEM programs.",
    url: "https://rillcod.com/testimonials",
  },
};

export default function TestimonialsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
