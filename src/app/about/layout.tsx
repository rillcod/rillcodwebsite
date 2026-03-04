import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Us — Rillcod Academy | STEM Education in Benin City, Nigeria",
  description:
    "Learn about Rillcod Academy, Nigeria's leading STEM and coding academy. Founded in Benin City, Edo State, we deliver hands-on technology education to children across Nigeria through partner schools.",
  keywords: [
    "about Rillcod Academy",
    "STEM academy Nigeria",
    "coding school Benin City",
    "technology education Edo State",
    "about us coding academy",
  ],
  alternates: {
    canonical: "https://rillcod.com/about",
  },
  openGraph: {
    title: "About Rillcod Academy — STEM Education in Benin City, Nigeria",
    description:
      "Founded in Benin City, Edo State, Rillcod Academy delivers hands-on coding, robotics, and STEM education to Nigerian children through partner schools.",
    url: "https://rillcod.com/about",
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
